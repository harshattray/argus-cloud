import { readTheme } from "../../../lib/theme";
import styles from "../trends.module.css";

/**
 * The refusal for a repository that is not here, or not yours.
 *
 * Same words as before and a real 404 now — FUTURENORMA §4 Open decision 5,
 * decided 2026-08-23. `app/r/[runId]/not-found.tsx` carries the reasoning; the
 * short version is that a refusal answering 200 is a refusal every counter in
 * the stack records as a success.
 *
 * **A boundary per route family, not one for the console.** The three families
 * already said three different things — a report, a repository, a frame — and
 * the sentence is the useful part of each. What has to be identical is the body
 * *within* a family, whatever tenant asked, and that is now structural: this
 * component takes no props.
 */
export default async function RepositoryNotFound() {
  const theme = await readTheme();
  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.notFound}>
        <h1>Not found</h1>
        <p>This repository doesn&apos;t exist or you don&apos;t have access to it.</p>
      </main>
    </div>
  );
}
