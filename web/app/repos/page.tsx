import Link from "next/link";
import { orgRepos, type RepoListEntry } from "argus-cloud/trendData.js";
import { getDb } from "../../lib/db";
import { consoleContext } from "../../lib/console";
import { ConsoleGate, ConsoleShell } from "../_components/cloud/console-shell";
import { CloudTwin } from "../_components/cloud/empty-state";
import styles from "./trends.module.css";

/**
 * The organization's repositories — the page above `/repos/{repoId}`, and the
 * console's **Runs and reports** area.
 *
 * **This is the page a session made possible.** PATHWAYS Pathway 6 carried it
 * as open item 2: it has to answer "what does this organization have", and
 * until Step 6 nothing could say whose organization was asking. A share token
 * could not, by design — it names one run.
 *
 * **The organization comes from the membership list, never from the URL.** The
 * active-organization cookie is a *preference* consulted by `activeMembership`
 * and ignored when it names something the person does not belong to (§10.7
 * 5A.2: "The selected organization is UI state only").
 *
 * **Its chrome, its session handling and its no-organization state moved into
 * the console shell**, which is where the six other areas get them too. What is
 * left here is the thing only this page knows how to do: list repositories, and
 * say something useful when there are none.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repositories — Normascope Cloud",
  robots: { index: false, follow: false },
};

function relative(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * An organization with no repositories at all — the first thing every new
 * customer sees, and until now one grey sentence in an otherwise empty card.
 *
 * **What was wrong was not the footer.** Nothing was pushing it up: the sheet
 * is sized by its contents, the contents were two lines, so the card stopped a
 * third of the way down the window and took the Yutic line with it. The fix is
 * to give the state something to be — a figure, the reason the page is empty,
 * and the command that ends it — rather than to stretch the card around a
 * sentence.
 *
 * **`parcel` is a new pose, which is the rule.** A placement on this surface
 * takes a pose of its own (`normascopeWeb.md` §5), and the two already here
 * mean other things: `empty` is the site's 404 and says *this does not exist*,
 * `hourglass` is a range with no runs in it. An open carton with nothing in it
 * says the third thing — *nothing has arrived yet* — which is the only honest
 * reading of this page.
 *
 * It is a plain `CloudTwin`, so no `get cloud` sticker: whoever is reading this
 * has already bought it.
 */
function BlankSlate() {
  return (
    <section className={styles.blankSlate}>
      <div className={styles.blankWords}>
        <p className={styles.blankTitle}>Nothing has been uploaded yet.</p>
        <p className={styles.blankBody}>
          Repositories are not created by hand. The first upload from a project creates one and starts
          its history. Run this where the project lives, with an upload key set:
        </p>
        <code className={styles.emptyCommand}>npx norma-scope upload</code>
        <p className={styles.blankAside}>
          Every command and what it does is listed on <Link href="/commands">the commands page</Link>.
        </p>
      </div>
      <CloudTwin pose="parcel" className={styles.blankTwin} />
    </section>
  );
}

export default async function ReposPage() {
  const context = await consoleContext("runs", "/repos");
  if (context.kind !== "ok") {
    return <ConsoleGate context={context} />;
  }

  const repos = await orgRepos(await getDb(), context.membership.orgId);

  return (
    <ConsoleShell
      context={context}
      title={context.area.label}
      meta={
        <>
          {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
        </>
      }
    >
      {repos.length === 0 ? (
        <BlankSlate />
      ) : (
        <section className={styles.section}>
          <div className={styles.tableWrap}>
            <table className={styles.runs}>
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col" className={styles.num}>
                    Runs
                  </th>
                  <th scope="col" className={styles.num}>
                    Flagged in last run
                  </th>
                  <th scope="col">Last run</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((repo: RepoListEntry) => (
                  <tr key={repo.id}>
                    <td>
                      <Link href={`/repos/${repo.id}`}>{repo.name}</Link>
                    </td>
                    <td className={styles.num}>{repo.runCount}</td>
                    <td className={styles.num}>
                      {repo.flaggedInLastRun === null ? (
                        <span className={styles.muted}>—</span>
                      ) : repo.flaggedInLastRun > 0 ? (
                        <span className={styles.pillFlagged}>{repo.flaggedInLastRun}</span>
                      ) : (
                        <span className={styles.pillClean}>0</span>
                      )}
                    </td>
                    <td className={styles.muted}>{relative(repo.lastRunAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ConsoleShell>
  );
}
