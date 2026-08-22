import type { ReactNode } from "react";
import Link from "next/link";
import {
  deploymentEnvironment,
  navFor,
  outstanding,
  type ConsoleArea,
  type DeploymentEnvironment,
  type Surface,
} from "argus-cloud/consoleIA.js";
import { orgPlanState } from "argus-cloud/plans.js";
import type { Membership } from "argus-cloud/users.js";
import type { ResolvedSession } from "argus-cloud/sessions.js";
import type { ConsoleContext, ConsoleDenied, ConsoleNoOrg } from "../../../lib/console";
import { getDb } from "../../../lib/db";
import { CloudFooter, CloudMasthead, type Crumb } from "./cloud-shell";
import { AccountMenu } from "./account-menu";
import { OrgSwitcher } from "./org-switcher";
import { CloudTwin } from "./empty-state";
import styles from "./console-shell.module.css";

/**
 * The chrome shared by every page of the organization console.
 *
 * **Built before the pages, deliberately.** PATHWAYS §5: *"Implement the shared
 * shell, navigation, role matrix, and page ownership map before adding
 * individual workflows"*, and the reason is visible in what this repo already
 * had — `/repos` and `/r/` each assembled their own masthead, decided their own
 * title, and neither could say which organization you were in, what plan it was
 * on, or what else there was to look at. A seventh page written the same way is
 * a seventh place for those answers to differ.
 *
 * What the shell owns, and what it therefore cannot be inconsistent about:
 *
 *   - **which organization** — named on every page, switchable where there is
 *     more than one, and re-resolved from the session on every request;
 *   - **which environment** — §5 requires it visible, because "which of these
 *     five tabs is production" has a wrong answer and the wrong answer gets
 *     acted on;
 *   - **the plan and its lifecycle**, so a lapsed subscription is not something
 *     you discover when an upload is refused;
 *   - **your role**, next to a menu whose contents depend on it;
 *   - **the seven areas**, rendered from `CONSOLE_AREAS` rather than listed
 *     here — a hand-written `<nav>` is how an area gains a page nobody can find.
 *
 * **The navigation is not the boundary.** It renders `context.nav`, which the
 * server computed from the role; `consoleContext` makes the same decision again
 * for the page itself. Hiding a link is a courtesy. Refusing the request is the
 * control.
 */

function EnvironmentChip({ environment }: { environment: ConsoleContext["environment"] }) {
  if (environment === "production") {
    // Named, but quiet: on the deployment where everything is real, the label
    // is reassurance rather than a warning, and a loud chip on every page is a
    // chip nobody reads by the second week.
    return <span className={styles.envProd}>Production</span>;
  }
  return (
    <span className={environment === "preview" ? styles.envPreview : styles.envDev}>
      {environment === "preview" ? "Preview" : "Development"}
    </span>
  );
}

/**
 * The lifecycle, in the customer's words rather than the column's.
 *
 * `active` says nothing worth a chip, so it does not get one — the absence is
 * the good state. Everything else is something the reader needs to know before
 * they find out from a refusal.
 */
function SubscriptionChip({ status }: { status: string }) {
  if (status === "active") {
    return null;
  }
  const words: Record<string, string> = {
    past_due: "Payment failed",
    lapsed: "Subscription ended",
    refunded: "Refunded",
    none: "No subscription",
  };
  const bad = status === "lapsed" || status === "refunded";
  return (
    <span className={bad ? styles.planBad : styles.planWarn}>{words[status] ?? status}</span>
  );
}

/**
 * Roles as a phrase somebody would say.
 *
 * `roles.join(" or ") + "s"` produced *"admin or member or designers"*, which a
 * browser showed and no static check could have. One plural per role, and the
 * last separator is "and" — "admins, members and designers".
 */
function roleList(roles: readonly string[]): string {
  const plural = roles.map((r) => `${r}s`);
  if (plural.length === 1) {
    return plural[0];
  }
  return `${plural.slice(0, -1).join(", ")} and ${plural[plural.length - 1]}`;
}

/**
 * `current` is null on the account page, which is inside the product and inside
 * none of the seven areas. Nothing is marked, which is the truth — marking an
 * area the reader is not in would be worse than marking nothing.
 */
function ConsoleNav({ nav, current }: { nav: ConsoleArea[]; current: ConsoleArea | null }) {
  return (
    <nav className={styles.nav} aria-label="Organization console">
      <ul>
        {nav.map((area) => (
          <li key={area.id}>
            <Link
              href={area.href}
              className={area.id === current?.id ? styles.navOn : styles.navItem}
              aria-current={area.id === current?.id ? "page" : undefined}
            >
              {area.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The organization context row: who you are looking at, on what, in what state,
 * as what — and under it, where else you can go.
 *
 * Takes values rather than a `ConsoleContext` so that the two pages nested
 * inside a repository can render it too. They resolve their organization from
 * the repository row rather than from the active-organization cookie, and they
 * have a development door with no session at all, so they cannot go through
 * `consoleContext`. What they must not do is draw a second, slightly different
 * version of this row — so they call {@link ConsoleChrome}, which fills these
 * props in and renders exactly this.
 */
function ContextRow({
  session,
  membership,
  area,
  path,
  subscriptionStatus,
  environment,
}: {
  session: ResolvedSession;
  membership: Membership;
  area: ConsoleArea | null;
  path: string;
  subscriptionStatus: string;
  environment: DeploymentEnvironment;
}) {
  return (
    <>
      <div className={styles.context}>
        <OrgSwitcher current={membership} memberships={session.memberships} path={path} />
        <span className={styles.role}>{membership.role}</span>
        <SubscriptionChip status={subscriptionStatus} />
        <EnvironmentChip environment={environment} />
      </div>
      <ConsoleNav nav={navFor(membership.role)} current={area} />
    </>
  );
}

/**
 * The context row for a page that resolved its own organization.
 *
 * `/repos/{id}` and its trend view read the organization off the repository —
 * a repository id in the URL is a request, and `membershipFor` turns it into a
 * membership or a 404 — so the active-organization cookie is not what they are
 * showing. They pass the membership they proved, and this loads the rest.
 *
 * Returns `null` when there is no membership, which is the development door:
 * no session, nobody to name, no organization to switch, and no navigation
 * that would work if it were drawn.
 */
export async function ConsoleChrome({
  session,
  membership,
  area,
  path,
}: {
  session: ResolvedSession | null;
  membership: Membership | null;
  area: ConsoleArea;
  path: string;
}) {
  if (!session || !membership) {
    return null;
  }
  const { subscriptionStatus } = await orgPlanState(await getDb(), membership.orgId);
  return (
    <ContextRow
      session={session}
      membership={membership}
      area={area}
      path={path}
      subscriptionStatus={subscriptionStatus}
      environment={deploymentEnvironment(process.env)}
    />
  );
}

export function ConsoleShell({
  context,
  title,
  meta,
  crumbs,
  children,
}: {
  context: ConsoleContext;
  title: string;
  meta?: ReactNode;
  crumbs?: Crumb[];
  children: ReactNode;
}) {
  return (
    <div className={styles.page} data-theme={context.theme ?? undefined}>
      <main className={styles.sheet}>
        <CloudMasthead
          title={title}
          crumbs={crumbs}
          meta={meta}
          theme={context.theme}
          path={context.path}
          account={<AccountMenu signedInAs={context.session.user.display_name} />}
          context={
            // No organization, no row — whether that is a person with no
            // membership at all or the account page reached by one.
            context.kind === "no-org" || context.membership === null ? undefined : (
              <ContextRow
                session={context.session}
                membership={context.membership}
                area={context.kind === "account" ? null : context.area}
                path={context.path}
                subscriptionStatus={context.subscriptionStatus}
                environment={context.environment}
              />
            )
          }
        />
        {children}
        <CloudFooter />
      </main>
    </div>
  );
}

/**
 * Signed in, and in no organization.
 *
 * **Not an error, and the page has to say so twice** — once by not looking like
 * one, and once in words. §10.7 5A.4 makes this a legitimate state: a session
 * resolves to a person, and a person is not required to have a membership. The
 * two ways in are an invitation that was emailed and a subscription that was
 * bought; the copy names both because we cannot tell from here which applies,
 * and guessing would send half the readers to the wrong place.
 *
 * `envelope` is this placement's pose (`normascopeWeb.md` §5), and it moved
 * here from `/repos` when the state stopped belonging to one page: every area
 * of the console can be reached by a person with no membership, and each of
 * them used to have to draw this itself.
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

/**
 * In the organization, wrong role for this area.
 *
 * **It says who can, not just that you cannot.** A permission message that ends
 * at "you do not have access" sends the reader to support to ask a question the
 * page could have answered. It names the role that does, so the next move is a
 * message to a colleague rather than a ticket.
 *
 * No figure. The blank states are drawn because an empty page reads as broken;
 * this page is not empty and not broken, and a drawing beside a refusal makes
 * it look like a bigger event than it is.
 */
function NotYourArea({ denied }: { denied: ConsoleDenied }) {
  const allowed = roleList(denied.area.roles);
  return (
    <section className={styles.denied}>
      <p className={styles.deniedTitle}>{denied.area.label} is for {allowed}.</p>
      <p className={styles.deniedBody}>
        You are a <strong>{denied.membership.role}</strong> in {denied.membership.orgName}, and this
        area is limited to {allowed}. Someone with that role in your organization can open it, or
        change yours if you should have it.
      </p>
      <p className={styles.deniedBody}>{denied.area.purpose}</p>
    </section>
  );
}

/**
 * The two non-`ok` states, rendered in the shell so they arrive as a page
 * rather than as a bare sentence on a white background.
 *
 * Pages call it in one line: `if (ctx.kind !== "ok") return <ConsoleGate context={ctx} />`.
 * Keeping it here rather than in each page is not tidiness — it is what stops
 * seven areas from each inventing their own words for the same refusal.
 */
export function ConsoleGate({ context }: { context: ConsoleNoOrg | ConsoleDenied }) {
  if (context.kind === "no-org") {
    return (
      <ConsoleShell context={context} title="No organization yet">
        <NoOrganization signedInAs={context.session.user.display_name} />
      </ConsoleShell>
    );
  }
  return (
    <ConsoleShell context={context} title={context.area.label}>
      <NotYourArea denied={context} />
    </ConsoleShell>
  );
}

/**
 * What an area does not hold yet.
 *
 * **It renders the map rather than restating it.** The page-ownership map is
 * `CONSOLE_AREAS`; a placeholder that listed its own contents in prose would be
 * a second copy of the map, and the copy that goes stale is always the one
 * nobody is testing. So the list below is the map, read at render time — and
 * when a workflow moves between areas, this page changes with it.
 *
 * **It stopped being all-or-nothing when Organization got its workflows.** It
 * used to say *"does not hold anything yet"* about any area it appeared on,
 * which was true of all seven. On a half-built area that sentence is worse than
 * vague — it promises, in a paragraph above the working controls, the things
 * those controls already do. So the list is `outstanding(area)`: `holds` minus
 * `built`, computed, and the wording follows which case it is. An area with
 * nothing outstanding renders nothing at all.
 *
 * The honesty matters more than the drawing: this says what is not here yet and
 * does not imply it is coming on a date nobody has picked.
 *
 * **It takes a `Surface`, not a `ConsoleArea`**, so the account page — which is
 * not one of the seven — renders its own unfinished list through exactly this
 * component rather than through a second one that would word it differently.
 */
export function AreaOutline({ area }: { area: Surface }) {
  const todo = outstanding(area);
  if (todo.length === 0) {
    return null;
  }
  const empty = area.built.length === 0;
  return (
    <section className={styles.outline}>
      {empty ? <p className={styles.outlinePurpose}>{area.purpose}</p> : null}
      {/* "This page", not "this area": the account surface renders the same
          outline and is deliberately not one of the seven. Every surface that
          reaches here is a page, which is the word that stays true for both. */}
      <p className={styles.outlineNote}>
        {empty
          ? "This page is part of the console's structure and does not hold anything yet. When it does, this is what will be here:"
          : "Also part of this page, and not built yet:"}
      </p>
      <ul className={styles.outlineList}>
        {todo.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
