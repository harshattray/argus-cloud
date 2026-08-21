import Link from "next/link";
import { redirect } from "next/navigation";
import { orgRepos, type RepoListEntry } from "argus-cloud/trendData.js";
import { getDb } from "../../lib/db";
import { readTheme } from "../../lib/theme";
import { activeMembership, currentSession, ACTIVE_ORG_COOKIE } from "../../lib/session";
import { CloudFooter, CloudMasthead } from "../_components/cloud/cloud-shell";
import { cookies } from "next/headers";
import { SessionControls } from "./session-controls";
import styles from "./trends.module.css";

/**
 * The organization's repositories — the page above `/repos/{repoId}`.
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
 * A signed-in person with no membership is not an error and not a redirect to
 * sign in again — they see an empty state. That is §10.7 5A.4's "a signed-in
 * user with no membership sees no organization data", and the empty state is
 * what stops it reading as a broken page.
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

export default async function ReposPage() {
  const theme = await readTheme();
  const session = await currentSession();
  if (!session) {
    redirect("/login?next=%2Frepos");
  }

  const jar = await cookies();
  const membership = activeMembership(session, jar.get(ACTIVE_ORG_COOKIE)?.value);

  if (!membership) {
    return (
      <div className={styles.page} data-theme={theme ?? undefined}>
        <main className={styles.sheet}>
          <CloudMasthead title="No organization yet" theme={theme} path="/repos" />
          <section className={styles.section}>
            <p className={styles.muted}>
              You&apos;re signed in as {session.user.display_name}, but you don&apos;t belong to an organization
              yet. If you were invited, open the invitation link that was emailed to you. If you bought a
              subscription and this is unexpected, reply to your receipt and we&apos;ll sort it out.
            </p>
          </section>
          <CloudFooter />
          <SessionControls signedInAs={session.user.display_name} />
        </main>
      </div>
    );
  }

  const repos = await orgRepos(await getDb(), membership.orgId);

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.sheet}>
        <CloudMasthead
          title={membership.orgName}
          crumbs={[{ label: membership.orgName }]}
          theme={theme}
          path="/repos"
          meta={
            <>
              {repos.length} repositor{repos.length === 1 ? "y" : "ies"} · signed in as{" "}
              {session.user.display_name}
            </>
          }
        />

        {repos.length === 0 ? (
          <section className={styles.section}>
            <p className={styles.muted}>
              Nothing uploaded yet. Run <code>npx norma-scope upload</code> in a project with an upload key and
              its first run will appear here.
            </p>
          </section>
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

        <CloudFooter />
        <SessionControls signedInAs={session.user.display_name} />
      </main>
    </div>
  );
}
