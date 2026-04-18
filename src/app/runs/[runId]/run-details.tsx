"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  CircleCheckBig,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { REPORT_INSIGHT_DEFINITIONS } from "@/lib/report-insights";
import type { PersonaRunRecord, RunManifest } from "@/lib/runs";
import styles from "./page.module.css";

type RunPayload = {
  manifest: RunManifest;
  personaRuns: PersonaRunRecord[];
};

type RunDetailsProps = {
  initialRun: RunPayload;
};

const statusIcons = {
  queued: Clock3,
  running: CircleDashed,
  completed: CircleCheckBig,
  failed: AlertCircle,
} as const;

export function RunDetails({ initialRun }: RunDetailsProps) {
  const [run, setRun] = useState(initialRun);
  const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const runningCount = run.personaRuns.filter(
    (personaRun) => personaRun.status === "running",
  ).length;
  const finishedCount = run.personaRuns.filter(
    (personaRun) =>
      personaRun.status === "completed" || personaRun.status === "failed",
  ).length;

  useEffect(() => {
    if (run.manifest.status === "completed" || run.manifest.status === "failed") {
      return;
    }

    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${run.manifest.id}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const nextRun = (await response.json()) as RunPayload;

        if (!stopped) {
          setRun(nextRun);
        }
      } catch {
        return;
      }
    };

    poll();
    const interval = window.setInterval(poll, 2000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [run.manifest.id, run.manifest.status]);

  useEffect(() => {
    for (const personaRun of run.personaRuns) {
      const terminal = terminalRefs.current[personaRun.personaId];

      if (terminal) {
        terminal.scrollTop = terminal.scrollHeight;
      }
    }
  }, [run]);

  const statusCopy = useMemo(() => {
    if (run.manifest.status === "running") {
      return `Running ${runningCount} of ${run.personaRuns.length} personas`;
    }

    return run.manifest.status;
  }, [run.manifest.status, run.personaRuns.length, runningCount]);

  const showSummaries =
    run.manifest.status === "completed" || run.manifest.status === "failed";
  const fakeProgress = useMemo(() => {
    if (run.manifest.status !== "running") {
      return run.manifest.status === "completed" ? 100 : 0;
    }

    const completionProgress = (finishedCount / run.personaRuns.length) * 100;

    return Math.max(8, Math.min(94, Math.round(completionProgress)));
  }, [
    finishedCount,
    run.manifest.status,
    run.personaRuns.length,
  ]);

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href="/" className={styles.backLink}>
            Back
          </Link>
          <div className={styles.runMeta}>
            <span className={styles.runUrl}>{`UX Testing ${run.manifest.url}`}</span>
          </div>
        </div>
        <div className={styles.topBarRight}>
          {run.manifest.status === "running" ? (
            <div
              className={styles.progressStatus}
              aria-label={`Run progress ${fakeProgress}%`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fakeProgress}
            >
              <span className={styles.progressLabel}>Progress</span>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
              <span className={styles.progressValue}>{fakeProgress}%</span>
            </div>
          ) : (
            <span className={styles.status}>{statusCopy}</span>
          )}
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.personaGrid}>
          {run.personaRuns.map((personaRun) => (
            <article
              key={personaRun.personaId}
              className={styles.personaCard}
              data-status={personaRun.status}
            >
              <div className={styles.panelScroll}>
                <div className={styles.panelHeader}>
                  <div className={styles.avatarWrap}>
                    <Image
                      src={personaRun.personaAvatar}
                      alt={personaRun.personaName}
                      width={52}
                      height={52}
                      className={styles.avatar}
                    />
                  </div>
                  <div className={styles.panelMeta}>
                    <h3>{personaRun.personaName}</h3>
                    <StatusBadge status={personaRun.status} />
                  </div>
                </div>
                <div className={styles.panelBody}>
                  {showSummaries ? (
                    <StructuredSummary personaRun={personaRun} />
                  ) : (
                    <>
                      <div className={styles.screenFrame}>
                        {personaRun.latestScreenshotFileName ? (
                          <Image
                            src={`/api/runs/${run.manifest.id}/screenshots/${personaRun.latestScreenshotFileName}?v=${personaRun.latestScreenshotTakenAt ?? personaRun.updatedAt ?? ""}`}
                            alt={`${personaRun.personaName} live browser screenshot`}
                            fill
                            sizes="(max-width: 680px) 100vw, (max-width: 900px) 50vw, 33vw"
                            className={styles.screenImage}
                            unoptimized
                          />
                        ) : (
                          <div className={styles.screenPlaceholder}>
                            <span className={styles.placeholderLabel}>
                              {personaRun.status === "queued"
                                ? "Booting persona"
                                : "No screenshot yet"}
                            </span>
                            <p>{personaRun.summary}</p>
                          </div>
                        )}
                      </div>

                      <div className={styles.subsection}>
                        <h4>Live terminal</h4>
                        <div
                          ref={(node) => {
                            terminalRefs.current[personaRun.personaId] = node;
                          }}
                          className={styles.terminal}
                        >
                          {buildTerminalLines(personaRun).map((line, index) => (
                            <div
                              key={`${personaRun.personaId}-terminal-${index}-${line.label}`}
                              className={styles.terminalLine}
                              data-tone={line.tone}
                            >
                              <span className={styles.terminalTime}>{line.time}</span>
                              <span className={styles.terminalPrompt}>{line.prompt}</span>
                              <span className={styles.terminalText}>{line.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {personaRun.error ? (
                    <div className={styles.errorBox}>{personaRun.error}</div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function StatusBadge({ status }: { status: PersonaRunRecord["status"] }) {
  const StatusIcon = statusIcons[status];

  return (
    <span className={styles.queueBadge} aria-label={status} title={status}>
      <StatusIcon size={18} strokeWidth={2.2} />
    </span>
  );
}

type TerminalLine = {
  label: string;
  prompt: "$" | ">" | "*";
  time: string;
  tone: "neutral" | "success" | "error";
};

function buildTerminalLines(personaRun: PersonaRunRecord): TerminalLine[] {
  const lines: TerminalLine[] = [];

  lines.push({
    time: formatTerminalTime(personaRun.startedAt ?? personaRun.updatedAt),
    prompt: "$",
    label: `persona booted (${personaRun.status})`,
    tone: "neutral",
  });

  lines.push({
    time: formatTerminalTime(personaRun.updatedAt),
    prompt: ">",
    label: personaRun.summary,
    tone: personaRun.status === "failed" ? "error" : "neutral",
  });

  for (const action of [...personaRun.actions].reverse()) {
    lines.push({
      time: formatTerminalTime(action.at),
      prompt: "$",
      label: `${action.tool} ${summarizeActionInput(action.input)}`,
      tone: action.outcome === "error" ? "error" : "success",
    });
  }

  for (const observation of [...personaRun.observations.slice(0, 4)].reverse()) {
    lines.push({
      time: formatTerminalTime(personaRun.updatedAt),
      prompt: "*",
      label: summarizeObservation(observation),
      tone: "neutral",
    });
  }

  if (personaRun.error) {
    lines.push({
      time: formatTerminalTime(personaRun.updatedAt),
      prompt: ">",
      label: personaRun.error,
      tone: "error",
    });
  }

  return lines;
}

function summarizeActionInput(input: string) {
  const compact = input
    .replace(/\/Users\/[^ ]+/g, "[file]")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.length <= 56) {
    return compact;
  }

  return `${compact.slice(0, 53)}...`;
}

function summarizeObservation(observation: string) {
  const firstLine = observation.split("\n")[0]?.trim() ?? observation.trim();

  if (firstLine.length <= 68) {
    return firstLine;
  }

  return `${firstLine.slice(0, 65)}...`;
}

function formatTerminalTime(timestamp?: string) {
  if (!timestamp) {
    return "--:--:--";
  }

  return timestamp.slice(11, 19);
}

function StructuredSummary({ personaRun }: { personaRun: PersonaRunRecord }) {
  const [showAllInsights, setShowAllInsights] = useState(false);
  const ExpandIcon = showAllInsights ? ChevronUp : ChevronDown;

  if (!personaRun.structuredSummary?.length) {
    return (
      <div className={styles.reportBlock}>
        <p className={styles.emptySummary}>
          No structured summary was captured for this persona.
        </p>
      </div>
    );
  }

  const visibleInsightIds = showAllInsights
    ? REPORT_INSIGHT_DEFINITIONS.map((definition) => definition.id)
    : ["unexpectedElements", "magicWandFix"];
  const visibleInsights = REPORT_INSIGHT_DEFINITIONS.filter((definition) =>
    visibleInsightIds.includes(definition.id),
  );

  return (
    <div className={styles.reportBlock}>
      <div className={styles.insightList}>
        {visibleInsights.map((definition) => {
          const answer =
            personaRun.structuredSummary?.find((item) => item.id === definition.id)
              ?.answer ?? "Missing answer.";

          return (
            <section key={definition.id} className={styles.insightCard}>
              <div className={styles.insightHeader}>
                <div className={styles.insightTitleWrap}>
                  <div className={styles.tooltipWrap}>
                    <h4 className={styles.insightTitle} tabIndex={0}>
                      {definition.title}
                    </h4>
                    <span className={styles.tooltip}>{definition.info}</span>
                  </div>
                </div>
              </div>
              <p className={styles.insightAnswer}>{answer}</p>
            </section>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.expandInsightsButton}
        onClick={() => {
          setShowAllInsights((current) => !current);
        }}
      >
        <ExpandIcon size={15} strokeWidth={2.6} />
        {showAllInsights ? "Show fewer" : "Show all 4"}
      </button>
    </div>
  );
}
