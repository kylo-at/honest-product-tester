"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { Persona } from "@/lib/personas";
import styles from "./page.module.css";

type HomeClientProps = {
  personas: Persona[];
};

function getPersonaSummary(persona: Persona) {
  const firstLine = persona.prompt.split("\n")[0]?.trim() ?? "";
  const prefix = `You are ${persona.name}, `;

  if (firstLine.startsWith(prefix)) {
    return firstLine.slice(prefix.length).replace(/\.$/, "");
  }

  return `${persona.voice.toLowerCase()} persona focused on clear feedback`;
}

export function HomeClient({ personas }: HomeClientProps) {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  useEffect(() => {
    if (!selectedPersona) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPersona(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedPersona]);

  return (
    <>
      <div className={styles.testerSection}>
        <div className={styles.testerHeadingWrap}>
          <p className={styles.testerHeading}>Our Testers:</p>
          <span className={styles.testerTooltip} role="note">
            Click a tester to view their profile.
          </span>
        </div>
        <div className={styles.testerGrid}>
          {personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              className={styles.testerButton}
              onClick={() => setSelectedPersona(persona)}
            >
              <figure className={styles.testerCard}>
                <div className={styles.testerImageFrame}>
                  <Image
                    src={persona.avatar}
                    alt={persona.name}
                    width={220}
                    height={220}
                    className={styles.testerImage}
                  />
                </div>
                <figcaption className={styles.testerName}>{persona.name}</figcaption>
              </figure>
            </button>
          ))}
        </div>
      </div>

      {selectedPersona ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setSelectedPersona(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="persona-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setSelectedPersona(null)}
              aria-label="Close persona profile"
            >
              Close
            </button>

            <div className={styles.modalHeader}>
              <div className={styles.modalImageFrame}>
                <Image
                  src={selectedPersona.avatar}
                  alt={selectedPersona.name}
                  width={220}
                  height={220}
                  className={styles.testerImage}
                />
              </div>

              <div className={styles.modalIntro}>
                <p className={styles.modalTag}>
                  Inspired by {selectedPersona.inspiredBy}
                </p>
                <h2 id="persona-modal-title" className={styles.modalTitle}>
                  {selectedPersona.name}
                </h2>
                <p className={styles.modalSummary}>
                  {getPersonaSummary(selectedPersona)}.
                </p>
                <div className={styles.modalMeta}>
                  <span className={styles.metaPill}>
                    Voice: {selectedPersona.voice}
                  </span>
                  <span className={styles.metaPill}>
                    Experience: {selectedPersona.experienceLevel}
                  </span>
                  <span className={styles.metaPill}>
                    Patience: {selectedPersona.patience}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.modalGrid}>
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Focus and Needs</h3>
                <ul className={styles.modalList}>
                  {selectedPersona.goals.map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              </section>

              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Interests</h3>
                <ul className={styles.modalList}>
                  {selectedPersona.interests.map((interest) => (
                    <li key={interest}>{interest}</li>
                  ))}
                </ul>
              </section>

              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Struggles</h3>
                <ul className={styles.modalList}>
                  {selectedPersona.dislikes.map((dislike) => (
                    <li key={dislike}>{dislike}</li>
                  ))}
                </ul>
              </section>

              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Testing Style</h3>
                <ul className={styles.modalList}>
                  {selectedPersona.browseStyle.map((style) => (
                    <li key={style}>{style}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
