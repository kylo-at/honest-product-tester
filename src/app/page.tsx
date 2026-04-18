import Image from "next/image";
import { startRunAction } from "@/app/actions";
import styles from "./page.module.css";
import { getPersonas } from "@/lib/personas";

const mockRun = {
  url: "https://example-product.com",
  status: "Ready to build",
  persistence: "Filesystem runs in data/runs/<run-id>/",
  orchestration: "Sequential persona runs with Pi deciding each next action",
};

export default async function Home() {
  const personas = await getPersonas();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.kicker}>OpenAI Codex Hackathon Vienna</div>
          <h1>Honest Product Tester</h1>
          <p className={styles.lead}>
            A persona-driven website critique lab where each agent browses live
            according to its own instincts, priorities, and tolerance for bad
            product decisions.
          </p>
          <form className={styles.formMock} action={startRunAction}>
            <label className={styles.label} htmlFor="url">
              Public website URL
            </label>
            <div className={styles.inputRow}>
              <input
                id="url"
                name="url"
                className={styles.input}
                defaultValue={mockRun.url}
                placeholder="https://your-product.com"
                required
              />
              <button className={styles.primaryButton} type="submit">
                Start Run
              </button>
            </div>
            <p className={styles.helper}>
              Clicking start currently creates a queued run on disk and opens a
              run detail page. V1 stays sequential, uses `agent-browser` for
              live browsing, and keeps persona reports separate.
            </p>
          </form>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Execution</span>
            <strong>{mockRun.orchestration}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Persistence</span>
            <strong>{mockRun.persistence}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Current State</span>
            <strong>{mockRun.status}</strong>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Persona Drafts</h2>
            <p>
              Loaded from editable Markdown files in <code>personas/</code>.
            </p>
          </div>
          <div className={styles.personaGrid}>
            {personas.map((persona) => (
              <article className={styles.personaCard} key={persona.id}>
                <div className={styles.personaTop}>
                  <Image
                    src={persona.avatar}
                    alt={`${persona.name} avatar`}
                    width={72}
                    height={72}
                    className={styles.avatar}
                  />
                  <div>
                    <h3>{persona.name}</h3>
                    <p className={styles.inspiration}>
                      Inspired by {persona.inspiredBy}
                    </p>
                  </div>
                </div>
                <p className={styles.voice}>{persona.voice}</p>
                <div className={styles.metaRow}>
                  <span>{persona.experienceLevel}</span>
                  <span>{persona.patience} patience</span>
                </div>
                <div className={styles.tagBlock}>
                  {persona.goals.map((goal) => (
                    <span className={styles.tag} key={goal}>
                      {goal}
                    </span>
                  ))}
                </div>
                <div className={styles.listBlock}>
                  <h4>Browse style</h4>
                  <ul>
                    {persona.browseStyle.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.listBlock}>
                  <h4>Report sections</h4>
                  <ul>
                    {persona.reportSections.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>MVP Architecture</h2>
            <p>
              Pi decides the next action. The app executes it through{" "}
              <code>agent-browser</code> and stores evidence on disk.
            </p>
          </div>
          <div className={styles.architectureGrid}>
            <article className={styles.archCard}>
              <h3>1. Input</h3>
              <p>Submit a public URL and create a run folder on disk.</p>
            </article>
            <article className={styles.archCard}>
              <h3>2. Load Persona</h3>
              <p>Read Markdown config, avatar path, prompt body, and report schema.</p>
            </article>
            <article className={styles.archCard}>
              <h3>3. Browse Live</h3>
              <p>Each persona browses in its own style through sequential live sessions.</p>
            </article>
            <article className={styles.archCard}>
              <h3>4. Save Evidence</h3>
              <p>Store actions, screenshots, observations, and final report per persona.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
