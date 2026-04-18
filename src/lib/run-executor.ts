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
import {
  REPORT_INSIGHT_DEFINITIONS,
  type PersonaReportInsight,
} from "@/lib/report-insights";

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
  const runPersonas = manifest.personas
    .map((personaId) => personas.find((item) => item.id === personaId))
    .filter((persona): persona is Persona => Boolean(persona));

  await updateRunManifest(runId, (current) => ({
    ...current,
    status: "running",
    startedAt: current.startedAt ?? new Date().toISOString(),
  }));

  try {
    const results = await Promise.allSettled(
      runPersonas.map((persona) => runPersona(runId, manifest.url, persona)),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    await updateRunManifest(runId, (current) => ({
      ...current,
      status: failures.length > 0 ? "failed" : "completed",
      completedAt: new Date().toISOString(),
      currentPersonaId: undefined,
      error:
        failures.length > 0
          ? failures
              .map((failure) =>
                failure.reason instanceof Error
                  ? failure.reason.message
                  : "Unknown persona failure",
              )
              .join("\n")
          : undefined,
    }));
  } finally {
    await Promise.allSettled(
      runPersonas.map((persona) => closeBrowserSession(runId, persona.id)),
    );
  }
}

async function runPersona(runId: string, url: string, persona: Persona) {
  const browserSession = getBrowserSessionName(runId, persona.id);

  await updatePersonaRecord(runId, persona.id, (current) => ({
    ...current,
    status: "running",
    startedAt: current.startedAt ?? new Date().toISOString(),
    summary: "Launching Pi session and browser tools.",
  }));
  await appendPersonaObservation(runId, persona.id, "Persona run started.");

  const screenshotDir = getScreenshotDir(runId);
  let reportText = "";

  const tools = createBrowserTools({
    browserSession,
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
      reportText += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(buildPersonaPrompt(persona, url));

    const structuredSummary = parseStructuredSummary(reportText);
    const finalReport = buildSummaryMarkdown(persona.name, structuredSummary);

    await updatePersonaRecord(runId, persona.id, (current) => ({
      ...current,
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: "Finished browsing and captured structured feedback.",
      structuredSummary,
      finalReport,
    }));
    await writePersonaReport(runId, persona.id, finalReport);
    await appendPersonaObservation(
      runId,
      persona.id,
      "Structured persona report written to disk.",
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
    await closeBrowserSession(runId, persona.id).catch(() => undefined);
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
  browserSession,
  persona,
  runId,
  screenshotDir,
}: {
  browserSession: string;
  persona: Persona;
  runId: string;
  screenshotDir: string;
}) {
  const runTool = async (name: string, args: string[]) => {
    const input = args.join(" ");

    try {
      const result = await execFileAsync(
        AGENT_BROWSER_BIN,
        ["--session", browserSession, ...args],
        {
          maxBuffer: 1024 * 1024 * 8,
        },
      );
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
        const screenshotTakenAt = new Date().toISOString();

        await updatePersonaRecord(runId, persona.id, (current) => ({
          ...current,
          latestScreenshotFileName: fileName,
          latestScreenshotTakenAt: screenshotTakenAt,
          summary: `Captured screenshot: ${params.label}`,
        }));

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
  const outputSchema = REPORT_INSIGHT_DEFINITIONS.map(
    ({ id, question }) => `  "${id}": "${question}"`,
  ).join("\n");

  return `
${persona.prompt}

You are testing this public website live: ${url}

Use the browser tools to inspect the product in the way this persona naturally would. Do not follow a generic script. Let your priorities, interests, impatience, and curiosity determine what to do next.

Constraints:
- You may use only the browser tools.
- Keep the run concise. Aim for 6 to 10 browser actions total.
- You have the same fixed time budget as every other persona.
- No destructive actions, purchases, or final form submissions.
- Use browser_snapshot whenever you need to decide what to click next.
- Use browser_screenshot when something is notably good, bad, or confusing.
- If a page is slow or broken, mention that in the relevant answer.

When you are done, return only valid JSON in this exact shape:

{
${outputSchema}
}

Rules for the answers:
- Each value must be a short answer in this persona's voice.
- Aim for roughly 8 to 10 words per answer.
- Do not repeat the question inside the answer.
- Be concrete about what you clicked, what happened, and what this persona wanted but did not get.
- Do not include markdown, commentary, code fences, or extra keys.
`.trim();
}

function parseStructuredSummary(rawText: string): PersonaReportInsight[] {
  const candidate = rawText.trim();

  if (!candidate) {
    throw new Error("Persona returned no structured summary.");
  }

  const jsonText = extractJsonObject(candidate);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  return REPORT_INSIGHT_DEFINITIONS.map(({ id }) => {
    const answer = parsed[id];

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error(`Persona summary is missing "${id}".`);
    }

    return {
      id,
      answer: answer.trim(),
    };
  });
}

function extractJsonObject(rawText: string) {
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Persona output was not valid JSON.");
  }

  return rawText.slice(firstBrace, lastBrace + 1);
}

function buildSummaryMarkdown(
  personaName: string,
  structuredSummary: PersonaReportInsight[],
) {
  const bullets = REPORT_INSIGHT_DEFINITIONS.map(({ id, title }) => {
    const insight = structuredSummary.find((item) => item.id === id);

    if (!insight) {
      throw new Error(`Missing structured insight for "${id}".`);
    }

    return `- **${title}:** ${insight.answer}`;
  }).join("\n");

  return `# ${personaName}\n\n${bullets}\n`;
}

function getBrowserSessionName(runId: string, personaId: string) {
  return `${runId}-${personaId}`;
}

async function closeBrowserSession(runId: string, personaId: string) {
  await execFileAsync(
    AGENT_BROWSER_BIN,
    ["--session", getBrowserSessionName(runId, personaId), "close"],
    {
      maxBuffer: 1024 * 1024,
    },
  );
}
