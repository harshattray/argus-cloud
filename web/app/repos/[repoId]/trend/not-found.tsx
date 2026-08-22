import Link from "next/link";
import { readTheme } from "../../../../lib/theme";
import { CloudTwin } from "../../../_components/cloud/empty-state";
import styles from "../../trends.module.css";

/**
 * The refusal for a frame with no history here.
 *
 * Same words as before and a real 404 now — FUTURENORMA §4 Open decision 5,
 * decided 2026-08-23. `app/r/[runId]/not-found.tsx` carries the reasoning.
 *
 * **The one thing that changed with it, and it is a downgrade worth naming.**
 * The page used to pass `back={repoHref}` on the one refusal reachable by
 * somebody who *is* a member — a frame label with no history in a repository
 * that is genuinely theirs — and the link read *"Back to the repository"*. A
 * `not-found` boundary takes no props, so it cannot know which repository was
 * asked for. Rather than drop the way out, which is the mistake the site's own
 * 404 exists to avoid, the link goes one level further up to the repository
 * list. One extra click for a member; correct for everybody else, including
 * somebody who reached this by typing an id, since `/repos` shows them only
 * their own and sends a stranger to sign in.
 *
 * The alternative was leaving that one case rendering in-page at 200 so it could
 * keep its exact link. That would mean this surface answers two different status
 * codes for the same sentence, decided by whether the reader happens to be a
 * member — which is both a worse contract and a difference an outsider could
 * measure.
 */
export default async function FrameTrendNotFound() {
  const theme = await readTheme();
  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.notFound}>
        <CloudTwin pose="lantern" className={styles.notFoundTwin} />
        <h1>Not found</h1>
        <p>This frame has no history here, or you don&apos;t have access to it.</p>
        <Link className={styles.notFoundBack} href="/repos">
          ← All repositories
        </Link>
      </main>
    </div>
  );
}
