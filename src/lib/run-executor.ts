import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import {
  createAgentSession,
  defineTool,
  SessionManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

import { getPersonas, type Persona } from "@/lib/personas";
import {
  appendPersonaAction,
  appendPersonaObservation,
  getRun,
  getScreenshotDir,
  updatePersonaRecord,
  updateRunManifest,
  writePersonaReport,
} from "@/lib/runs";

const execFileAsync = promisify(execFile);
const AGENT_BROWSER_BIN = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  "agent-browser",
);
const activeRuns = globalThis.__honestProductTesterRuns ?? new Map<string, Promise<void>>();

globalThis.__honestProductTesterRuns = activeRuns;

declare global {
  var __honestProductTesterRuns: Map<string, Promise<void>> | undefined;
}

export function ensureRunStarted(runId: string) {
  if (activeRuns.has(runId)) {
    return;
  }

  const job = executeRun(runId).finally(() => {
    activeRuns.delete(runId);
  });

  activeRuns.set(runId, job);
}

async function executeRun(runId: string) {
  const { manifest } = await getRun(runId);
  const personas = await getPersonas();

  await updateRunManifest(runId, (current) => ({
    ...current,
    status: "running",
    startedAt: current.startedAt ?? new Date().toISOString(),
  }));

  try {
    for (const personaId of manifest.personas) {
      const persona = personas.find((item) => item.id === personaId);

      if (!persona) {
        continue;
      }

      await updateRunManifest(runId, (current) => ({
        ...current,
        currentPersonaId: persona.id,
      }));

      await runPersona(runId, manifest.url, persona);
    }

    await updateRunManifest(runId, (current) => ({
      ...current,
      status: "completed",
      completedAt: new Date().toISOString(),
      currentPersonaId: undefined,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run failure";

    await updateRunManifest(runId, (current) => ({
      ...current,
      status: "failed",
      completedAt: new Date().toISOString(),
      currentPersonaId: undefined,
      error: message,
    }));
  } finally {
    await closeAllBrowsers().catch(() => undefined);
  }
}

async function runPersona(runId: string, url: string, persona: Persona) {
  await updatePersonaRecord(runId, persona.id, (current) => ({
    ...current,
    status: "running",
    startedAt: current.startedAt ?? new Date().toISOString(),
    summary: "Launching Pi session and browser tools.",
  }));
  await appendPersonaObservation(runId, persona.id, "Persona run started.");

  const screenshotDir = getScreenshotDir(runId);
  let reportMarkdown = "";

  const tools = createBrowserTools({
    persona,
    runId,
    screenshotDir,
  });

  const { session } = await createAgentSession({
    customTools: tools,
    tools: [],
    thinkingLevel: "low",
    sessionManager: SessionManager.inMemory(),
  });

  const unsubscribe = session.subscribe((event) => {
    void handleSessionEvent(runId, persona.id, event);

    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      reportMarkdown += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(buildPersonaPrompt(persona, url));

    const finalReport = reportMarkdown.trim() || fallbackReport(persona.name);

    await updatePersonaRecord(runId, persona.id, (current) => ({
      ...current,
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: "Finished browsing and wrote a persona report.",
      finalReport,
    }));
    await writePersonaReport(runId, persona.id, finalReport);
    await appendPersonaObservation(
      runId,
      persona.id,
      "Persona report written to disk.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persona failure";

    await updatePersonaRecord(runId, persona.id, (current) => ({
      ...current,
      status: "failed",
      completedAt: new Date().toISOString(),
      summary: "Persona run failed.",
      error: message,
    }));
    await writePersonaReport(
      runId,
      persona.id,
      `# ${persona.name}\n\nRun failed.\n\n${message}\n`,
    );

    throw error;
  } finally {
    unsubscribe();
    session.dispose();
    await closeAllBrowsers().catch(() => undefined);
  }
}

async function handleSessionEvent(
  runId: string,
  personaId: string,
  event: AgentSessionEvent,
) {
  if (event.type === "tool_execution_start") {
    await updatePersonaRecord(runId, personaId, (current) => ({
      ...current,
      summary: `Running ${event.toolName}...`,
    }));
  }

  if (event.type === "tool_execution_end") {
    await updatePersonaRecord(runId, personaId, (current) => ({
      ...current,
      summary: event.isError
        ? `${event.toolName} failed.`
        : `${event.toolName} completed.`,
    }));
  }
}

function createBrowserTools({
  persona,
  runId,
  screenshotDir,
}: {
  persona: Persona;
  runId: string;
  screenshotDir: string;
}) {
  const runTool = async (name: string, args: string[]) => {
    const input = args.join(" ");

    try {
      const result = await execFileAsync(AGENT_BROWSER_BIN, args, {
        maxBuffer: 1024 * 1024 * 8,
      });
      const stdout = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

      await appendPersonaAction(runId, persona.id, {
        at: new Date().toISOString(),
        tool: name,
        input,
        outcome: "success",
      });

      if (stdout) {
        await appendPersonaObservation(
          runId,
          persona.id,
          `${name}: ${stdout.slice(0, 280)}`,
        );
      }

      return stdout || "ok";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${name} failed unexpectedly`;

      await appendPersonaAction(runId, persona.id, {
        at: new Date().toISOString(),
        tool: name,
        input,
        outcome: "error",
      });
      await appendPersonaObservation(runId, persona.id, `${name} error: ${message}`);

      throw error;
    }
  };

  return [
    defineTool({
      name: "browser_open",
      label: "Browser Open",
      description: "Open a URL in agent-browser.",
      parameters: Type.Object({
        url: Type.String({ description: "Absolute URL to open" }),
      }),
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: await runTool("browser_open", ["open", params.url]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_snapshot",
      label: "Browser Snapshot",
      description: "Get the current accessibility tree snapshot with refs.",
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: "text", text: await runTool("browser_snapshot", ["snapshot"]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_click",
      label: "Browser Click",
      description: "Click an element by ref or selector.",
      parameters: Type.Object({
        target: Type.String({ description: "Ref like @e2 or selector" }),
      }),
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: await runTool("browser_click", ["click", params.target]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_type",
      label: "Browser Type",
      description: "Type into a field using a ref or selector.",
      parameters: Type.Object({
        target: Type.String({ description: "Ref like @e2 or selector" }),
        text: Type.String({ description: "Text to type" }),
      }),
      execute: async (_toolCallId, params) => ({
        content: [
          {
            type: "text",
            text: await runTool("browser_type", ["type", params.target, params.text]),
          },
        ],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_press",
      label: "Browser Press",
      description: "Press a keyboard key such as Enter or Tab.",
      parameters: Type.Object({
        key: Type.String({ description: "Keyboard key" }),
      }),
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: await runTool("browser_press", ["press", params.key]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_scroll",
      label: "Browser Scroll",
      description: "Scroll the page up or down.",
      parameters: Type.Object({
        direction: Type.Union([Type.Literal("up"), Type.Literal("down")]),
        pixels: Type.Optional(Type.Number({ description: "Number of pixels to scroll" })),
      }),
      execute: async (_toolCallId, params) => ({
        content: [
          {
            type: "text",
            text: await runTool("browser_scroll", [
              "scroll",
              params.direction,
              `${params.pixels ?? 700}`,
            ]),
          },
        ],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_wait",
      label: "Browser Wait",
      description: "Wait for a number of milliseconds.",
      parameters: Type.Object({
        ms: Type.Number({ description: "Milliseconds to wait" }),
      }),
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: await runTool("browser_wait", ["wait", `${params.ms}`]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_screenshot",
      label: "Browser Screenshot",
      description: "Capture a screenshot and save it into the run directory.",
      parameters: Type.Object({
        label: Type.String({ description: "Short screenshot label" }),
      }),
      execute: async (_toolCallId, params) => {
        const safeLabel = params.label.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
        const fileName = `${persona.id}-${Date.now()}-${safeLabel}.png`;
        const screenshotPath = path.join(screenshotDir, fileName);
        const output = await runTool("browser_screenshot", [
          "screenshot",
          screenshotPath,
        ]);

        return {
          content: [{ type: "text", text: `${output}\nSaved to ${screenshotPath}` }],
          details: {},
        };
      },
    }),
    defineTool({
      name: "browser_get_title",
      label: "Browser Get Title",
      description: "Read the current page title.",
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: "text", text: await runTool("browser_get_title", ["get", "title"]) }],
        details: {},
      }),
    }),
    defineTool({
      name: "browser_get_url",
      label: "Browser Get URL",
      description: "Read the current page URL.",
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: "text", text: await runTool("browser_get_url", ["get", "url"]) }],
        details: {},
      }),
    }),
  ];
}

function buildPersonaPrompt(persona: Persona, url: string) {
  const sections = persona.reportSections.map((section) => `## ${section}`).join("\n\n");

  return `
${persona.prompt}

You are testing this public website live: ${url}

Use the browser tools to inspect the product in the way this persona naturally would. Do not follow a generic script. Let your priorities, interests, impatience, and curiosity determine what to do next.

Constraints:
- You may use only the browser tools.
- Keep the run concise. Aim for 6 to 10 browser actions total.
- No destructive actions, purchases, or final form submissions.
- Use browser_snapshot whenever you need to decide what to click next.
- Use browser_screenshot when something is notably good, bad, or confusing.
- If a page is slow or broken, mention that.

When you are done, return only Markdown in this exact structure:

# ${persona.name}

${sections}

Be concrete. Mention what you clicked, what happened, and what this persona wanted but did not get.
`.trim();
}

function fallbackReport(personaName: string) {
  return `# ${personaName}

## what I noticed first
No report text was captured.

## what I tried to do
The run completed without a usable final markdown response.

## what helped
Unknown.

## what annoyed me
Unknown.

## what I needed but could not find
Unknown.

## would I keep using this
Unclear.

## final verdict
The execution path completed, but report generation needs another pass.
`;
}

async function closeAllBrowsers() {
  await execFileAsync(AGENT_BROWSER_BIN, ["close", "--all"], {
    maxBuffer: 1024 * 1024,
  });
}
