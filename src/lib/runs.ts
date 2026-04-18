import { promises as fs } from "node:fs";
import path from "node:path";

import { comparePersonaIds, Persona } from "@/lib/personas";
import type { PersonaReportInsight } from "@/lib/report-insights";

type OrchestrationMode = "sequential" | "parallel";

export type RunStatus = "queued" | "running" | "completed" | "failed";
export type PersonaRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type RunManifest = {
  id: string;
  url: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  status: RunStatus;
  orchestration: OrchestrationMode;
  personas: string[];
  currentPersonaId?: string;
  error?: string;
};

export type PersonaAction = {
  at: string;
  tool: string;
  input: string;
  outcome: "success" | "error";
};

export type PersonaRunRecord = {
  personaId: string;
  personaName: string;
  personaAvatar: string;
  status: PersonaRunStatus;
  summary: string;
  reportPath: string;
  observations: string[];
  actions: PersonaAction[];
  latestScreenshotFileName?: string;
  latestScreenshotTakenAt?: string;
  structuredSummary?: PersonaReportInsight[];
  finalReport?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

const runsDir = path.join(process.cwd(), "data", "runs");
const writeQueues =
  globalThis.__honestProductTesterWriteQueues ?? new Map<string, Promise<unknown>>();

globalThis.__honestProductTesterWriteQueues = writeQueues;

declare global {
  var __honestProductTesterWriteQueues: Map<string, Promise<unknown>> | undefined;
}

export async function createRun(url: string, personas: Persona[]) {
  const trimmedUrl = url.trim();
  const parsedUrl = validatePublicUrl(trimmedUrl);
  const runId = createRunId();
  const runDir = path.join(runsDir, runId);
  const personaDir = path.join(runDir, "personas");
  const screenshotDir = path.join(runDir, "screenshots");

  const manifest: RunManifest = {
    id: runId,
    url: parsedUrl.href,
    createdAt: new Date().toISOString(),
    status: "queued",
    orchestration: "parallel",
    personas: personas.map((persona) => persona.id),
  };

  await fs.mkdir(personaDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  await writeManifest(runId, manifest);

  await Promise.all(
    personas.map(async (persona) => {
      const reportPath = path.join("personas", `${persona.id}.md`);
      const record: PersonaRunRecord = {
        personaId: persona.id,
        personaName: persona.name,
        personaAvatar: persona.avatar,
        status: "queued",
        summary: "Run created. Waiting for live execution.",
        reportPath,
        observations: [
          "Persona loaded from Markdown draft.",
          "Parallel execution is enabled for this run.",
          "Live browser session has not started yet.",
        ],
        actions: [],
      };

      const report = `# ${persona.name}\n\nStatus: queued\n\nThis run was initialized and is waiting to start.\n`;

      await writePersonaRecord(runId, persona.id, record);
      await writePersonaReport(runId, persona.id, report);
    }),
  );

  return manifest;
}

export async function getRun(runId: string) {
  const runDir = path.join(runsDir, runId);
  const manifestPath = path.join(runDir, "manifest.json");
  const personaDir = path.join(runDir, "personas");

  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as RunManifest;

  const personaFiles = (await fs.readdir(personaDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  const personaRuns = await Promise.all(
    personaFiles.map(async (file) => {
      const fullPath = path.join(personaDir, file);
      return JSON.parse(await fs.readFile(fullPath, "utf8")) as PersonaRunRecord;
    }),
  );

  personaRuns.sort((left, right) => {
    const indexDelta = comparePersonaIds(left.personaId, right.personaId);

    if (indexDelta !== 0) {
      return indexDelta;
    }

    return left.personaName.localeCompare(right.personaName);
  });

  return {
    manifest,
    personaRuns,
  };
}

export async function updateRunManifest(
  runId: string,
  updater: (current: RunManifest) => RunManifest,
) {
  return queueWrite(getManifestQueueKey(runId), async () => {
    const current = await readManifest(runId);
    const next = updater(current);
    await writeManifest(runId, next);
    return next;
  });
}

export async function updatePersonaRecord(
  runId: string,
  personaId: string,
  updater: (current: PersonaRunRecord) => PersonaRunRecord,
) {
  return queueWrite(getPersonaQueueKey(runId, personaId), async () => {
    const current = await readPersonaRecord(runId, personaId);
    const next = updater(current);
    await writePersonaRecord(runId, personaId, next);
    return next;
  });
}

export async function appendPersonaObservation(
  runId: string,
  personaId: string,
  observation: string,
) {
  return updatePersonaRecord(runId, personaId, (current) => ({
    ...current,
    observations: [observation, ...current.observations].slice(0, 12),
  }));
}

export async function appendPersonaAction(
  runId: string,
  personaId: string,
  action: PersonaAction,
) {
  return updatePersonaRecord(runId, personaId, (current) => ({
    ...current,
    actions: [action, ...current.actions].slice(0, 20),
  }));
}

export async function writePersonaReport(
  runId: string,
  personaId: string,
  markdown: string,
) {
  const reportPath = path.join(runsDir, runId, "personas", `${personaId}.md`);
  await fs.writeFile(reportPath, markdown, "utf8");
}

export function getScreenshotDir(runId: string) {
  return path.join(runsDir, runId, "screenshots");
}

async function readManifest(runId: string) {
  const manifestPath = path.join(runsDir, runId, "manifest.json");
  return JSON.parse(await fs.readFile(manifestPath, "utf8")) as RunManifest;
}

async function writeManifest(runId: string, manifest: RunManifest) {
  const manifestPath = path.join(runsDir, runId, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function readPersonaRecord(runId: string, personaId: string) {
  const recordPath = path.join(runsDir, runId, "personas", `${personaId}.json`);
  return JSON.parse(await fs.readFile(recordPath, "utf8")) as PersonaRunRecord;
}

async function writePersonaRecord(
  runId: string,
  personaId: string,
  record: PersonaRunRecord,
) {
  const recordPath = path.join(runsDir, runId, "personas", `${personaId}.json`);
  await fs.writeFile(
    recordPath,
    JSON.stringify(
      {
        ...record,
        updatedAt: new Date().toISOString(),
      } satisfies PersonaRunRecord,
      null,
      2,
    ),
    "utf8",
  );
}

function getManifestQueueKey(runId: string) {
  return `manifest:${runId}`;
}

function getPersonaQueueKey(runId: string, personaId: string) {
  return `persona:${runId}:${personaId}`;
}

async function queueWrite<T>(key: string, task: () => Promise<T>) {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);

  writeQueues.set(key, next);

  try {
    return await next;
  } finally {
    if (writeQueues.get(key) === next) {
      writeQueues.delete(key);
    }
  }
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `run-${timestamp}-${suffix}`;
}

function validatePublicUrl(rawUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("Please enter a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (!parsedUrl.hostname) {
    throw new Error("Please enter a valid public website URL.");
  }

  return parsedUrl;
}
