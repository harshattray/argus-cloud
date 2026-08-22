import Link from "next/link";
import { redirect } from "next/navigation";
import { orgRepos, type RepoListEntry } from "argus-cloud/trendData.js";
import { getDb } from "../../lib/db";
import { readTheme } from "../../lib/theme";
import { activeMembership, currentSession, ACTIVE_ORG_COOKIE } from "../../lib/session";
import { CloudFooter, CloudMasthead } from "../_components/cloud/cloud-shell";
import { CloudTwin } from "../_components/cloud/empty-state";
import { AccountMenu } from "../_components/cloud/account-menu";
import { cookies } from "next/headers";
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

/**
 * Signed in, and in no organization.
 *
 * **Not an error, and the page has to say so twice** — once by not looking like
 * one, and once in words. §10.7 5A.4 makes this a legitimate state: a session
 * resolves to a person, and a person is not required to have a membership. The
 * two ways in are an invitation that was emailed, and a subscription that was
 * bought; the copy names both because we cannot tell from here which one
 * applies, and guessing would send half the readers to the wrong place.
 *
 * **It shares `.blankSlate` with the state next door**, which is the point of
 * the class. Both are a signed-in page with nothing to list, and giving each
 * its own height and its own row would let the two drift.
 *
 * **`envelope` is a new pose, which is the rule** (`normascopeWeb.md` §5). The
 * four already on this surface each mean one thing — `parcel` is *nothing has
 * arrived*, `hourglass` is *no runs in this range*, `lantern` is *we looked and
 * it is not there*, `key` is the sign-in door — and none of them is *the thing
 * you need was emailed to you*. An empty state names the next action, so the
 * drawing is the object the reader has to go and find.
 */
function NoOrganization({ signedInAs }: { signedInAs: string }) {
  return (
    <section className={styles.blankSlate}>
      <div className={styles.blankWords}>
        <p className={styles.blankTitle}>
          You&apos;re signed in as {signedInAs}, but not in an organization yet.
        </p>
        <p className={styles.blankBody}>
          Everything on Cloud belongs to an organization. If you were invited, the invitation link that
          was emailed to you is what puts you in one — it may still be in your inbox. If you bought a
          subscription and this is unexpected, reply to your receipt and we&apos;ll sort it out.
        </p>
      </div>
      <CloudTwin pose="envelope" className={styles.blankTwin} />
    </section>
  );
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
          <CloudMasthead
            title="No organization yet"
            theme={theme}
            path="/repos"
            account={<AccountMenu signedInAs={session.user.display_name} />}
          />
          <NoOrganization signedInAs={session.user.display_name} />
          <CloudFooter />
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
          account={<AccountMenu signedInAs={session.user.display_name} />}
          meta={
            <>
              {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
            </>
          }
        />

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

        <CloudFooter />
      </main>
    </div>
  );
}
