"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { PersonaRunRecord, RunManifest } from "@/lib/runs";
import { formatTimestamp } from "@/lib/time";
import styles from "./page.module.css";

type RunPayload = {
  manifest: RunManifest;
  personaRuns: PersonaRunRecord[];
};

type RunDetailsProps = {
  initialRun: RunPayload;
};

export function RunDetails({ initialRun }: RunDetailsProps) {
  const [run, setRun] = useState(initialRun);

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

  const statusCopy = useMemo(() => {
    if (run.manifest.status === "running" && run.manifest.currentPersonaId) {
      const activePersona = run.personaRuns.find(
        (personaRun) => personaRun.personaId === run.manifest.currentPersonaId,
      );

      if (activePersona) {
        return `Running ${activePersona.personaName}`;
      }
    }

    return run.manifest.status;
  }, [run]);

  return (
    <>
      <div className={styles.topBar}>
        <Link href="/" className={styles.backLink}>
          Back to dashboard
        </Link>
        <span className={styles.status}>{statusCopy}</span>
      </div>

      <section className={styles.hero}>
        <p className={styles.kicker}>Codex Community Hackathon - Vienna</p>
        <h1>Run Overview</h1>
        <p className={styles.url}>{run.manifest.url}</p>
        <p className={styles.copy}>
          This page polls the local run record every two seconds. Pi uses the
          SDK, calls custom browser tools backed by <code>agent-browser</code>,
          and writes actions, observations, and final reports into the run
          folder on disk.
        </p>
      </section>

      <section className={styles.metaGrid}>
        <article className={styles.metaCard}>
          <span>Created</span>
          <strong>{formatTimestamp(run.manifest.createdAt)}</strong>
        </article>
        <article className={styles.metaCard}>
          <span>Execution</span>
          <strong>Sequential persona runs</strong>
        </article>
        <article className={styles.metaCard}>
          <span>Stored In</span>
          <strong>data/runs/{run.manifest.id}</strong>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Persona Runs</h2>
          <p>Status, observations, actions, and final markdown update live.</p>
        </div>
        <div className={styles.personaGrid}>
          {run.personaRuns.map((personaRun) => (
            <article key={personaRun.personaId} className={styles.personaCard}>
              <div className={styles.cardTop}>
                <h3>{personaRun.personaName}</h3>
                <span className={styles.queueBadge}>{personaRun.status}</span>
              </div>
              <p className={styles.summary}>{personaRun.summary}</p>

              <div className={styles.subsection}>
                <h4>Latest observations</h4>
                <ul className={styles.observations}>
                  {personaRun.observations.map((observation, index) => (
                    <li key={`${personaRun.personaId}-observation-${index}`}>
                      {observation}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.subsection}>
                <h4>Recent actions</h4>
                <ul className={styles.observations}>
                  {personaRun.actions.length === 0 ? (
                    <li>No browser actions yet.</li>
                  ) : (
                    personaRun.actions.map((action, index) => (
                      <li
                        key={`${personaRun.personaId}-action-${index}-${action.at}`}
                      >
                        {action.tool}: {action.input} ({action.outcome})
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {personaRun.finalReport ? (
                <div className={styles.reportBlock}>
                  <h4>Final report</h4>
                  <pre className={styles.reportText}>{personaRun.finalReport}</pre>
                </div>
              ) : null}

              {personaRun.error ? (
                <div className={styles.errorBox}>{personaRun.error}</div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
