import Image from "next/image";

import { startRunAction } from "@/app/actions";
import { getPersonas } from "@/lib/personas";
import styles from "./page.module.css";

export default async function Home() {
  const personas = await getPersonas();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Codex Community Hackathon - Vienna</p>
          <h1 className={styles.title}>Honest Product Tester</h1>
          <p className={styles.lead}>
            Run a fast UX test against any public website. We launch personas,
            capture friction, and turn the first impression into usable feedback.
          </p>
        </section>

        <section id="ux-test-form" className={styles.formSection}>
          <form className={styles.form} action={startRunAction}>
            <label className={styles.label} htmlFor="url">
              Website URL
            </label>
            <div className={styles.inputRow}>
              <input
                id="url"
                name="url"
                type="url"
                className={styles.input}
                placeholder="https://your-site.com"
                required
              />
              <button className={styles.submitButton} type="submit">
                UX Test
              </button>
            </div>
          </form>

          <div className={styles.testerSection}>
            <p className={styles.testerHeading}>Our Testers:</p>
            <div className={styles.testerGrid}>
              {personas.map((persona) => (
                <figure key={persona.id} className={styles.testerCard}>
                  <div className={styles.testerImageFrame}>
                    <Image
                      src={persona.avatar}
                      alt={persona.name}
                      width={180}
                      height={180}
                      className={styles.testerImage}
                    />
                  </div>
                  <figcaption className={styles.testerName}>{persona.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
