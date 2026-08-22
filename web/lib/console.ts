import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  areaById,
  deploymentEnvironment,
  navFor,
  type ConsoleArea,
  type ConsoleAreaId,
  type DeploymentEnvironment,
} from "argus-cloud/consoleIA.js";
import { orgPlanState } from "argus-cloud/plans.js";
import type { Membership } from "argus-cloud/users.js";
import type { ResolvedSession } from "argus-cloud/sessions.js";
import { getDb } from "./db";
import { readTheme } from "./theme";
import { activeMembership, currentSession, ACTIVE_ORG_COOKIE } from "./session";
import type { Theme } from "./theme";

/**
 * The one door into the organization console.
 *
 * **Every console page calls this before it renders anything**, and that is the
 * point rather than a convenience. PATHWAYS §5: *"direct route/API calls
 * receive the same role decision as navigation"*. The navigation is built from
 * `CONSOLE_AREAS`; so is the answer here; a page that skipped this and trusted
 * the menu would be reachable by typing its URL, which is the failure the rule
 * is written against.
 *
 * It returns a state rather than throwing, because three of the four states are
 * ordinary and only one of them is a page:
 *
 * | State | What happened | What the reader sees |
 * |---|---|---|
 * | redirect | no session | `/login`, with a `next` back to here |
 * | `no-org` | signed in, in no organization | the shell, and an explanation |
 * | `denied` | in the organization, wrong role | the shell, and what to do about it |
 * | `ok` | — | the page |
 *
 * **`denied` is not a 404.** Hiding the billing page from a designer who is a
 * member of the organization protects nothing — they know the organization
 * exists, they can see the plan chip — and a 404 would send them to support to
 * report a broken link. Cross-*tenant* requests are a different question and are
 * still answered with a 404 by `membershipFor`, because there the existence of
 * the thing is the secret.
 */

export interface ConsoleShellData {
  theme: Theme | null;
  /** The path this page answers on — the theme switch and `next=` need it. */
  path: string;
  session: ResolvedSession;
  environment: DeploymentEnvironment;
}

export interface ConsoleOk extends ConsoleShellData {
  kind: "ok";
  area: ConsoleArea;
  membership: Membership;
  plan: string;
  subscriptionStatus: string;
  /** The areas this role may reach — what the navigation renders. */
  nav: ConsoleArea[];
}

export interface ConsoleDenied extends ConsoleShellData {
  kind: "denied";
  area: ConsoleArea;
  membership: Membership;
  plan: string;
  subscriptionStatus: string;
  nav: ConsoleArea[];
}

export interface ConsoleNoOrg extends ConsoleShellData {
  kind: "no-org";
}

/**
 * A signed-in page that is not one of the seven areas.
 *
 * The account page is scoped to a person, so there is no area to highlight and
 * no role to refuse — but the reader is still inside the product, and taking the
 * organization row away from them for the length of one page would mean losing
 * the switcher, the plan state and the environment on the one page most likely
 * to be reached while something is wrong. So the chrome stays and the navigation
 * marks nothing current.
 *
 * `membership` is null for somebody in no organization, and then there is no
 * context row at all — the same shape as `no-org`, arrived at differently.
 */
export interface ConsoleAccount extends ConsoleShellData {
  kind: "account";
  membership: Membership | null;
  subscriptionStatus: string;
  nav: ConsoleArea[];
}

/**
 * What an *area* page can be handed — the three states `consoleContext` returns.
 *
 * Kept separate from {@link ConsoleContext} so that `if (ctx.kind !== "ok")
 * return <ConsoleGate context={ctx} />` still typechecks in all seven pages: the
 * account state cannot reach them, and the compiler knowing that is what keeps
 * `ConsoleGate` from having to handle a case it has no words for.
 */
export type ConsoleAreaContext = ConsoleOk | ConsoleDenied | ConsoleNoOrg;

/** Anything the shell can draw chrome around. */
export type ConsoleContext = ConsoleAreaContext | ConsoleAccount;

export async function consoleContext(
  areaId: ConsoleAreaId,
  path: string
): Promise<ConsoleAreaContext> {
  const theme = await readTheme();
  const session = await currentSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const environment = deploymentEnvironment(process.env);
  const shell: ConsoleShellData = { theme, path, session, environment };

  const jar = await cookies();
  const membership = activeMembership(session, jar.get(ACTIVE_ORG_COOKIE)?.value);
  if (!membership) {
    return { kind: "no-org", ...shell };
  }

  // The plan and lifecycle for the context bar. `orgPlanState` reads two
  // columns off `orgs` rather than the full limits lookup, which throws on a
  // provisioning gap — see the note on it. Chrome must not be able to 500 a
  // page over a label.
  const { plan, subscriptionStatus } = await orgPlanState(await getDb(), membership.orgId);

  const area = areaById(areaId);
  const nav = navFor(membership.role);
  const common = { ...shell, area, membership, plan, subscriptionStatus, nav };

  return area.roles.includes(membership.role)
    ? { kind: "ok", ...common }
    : { kind: "denied", ...common };
}

/**
 * The same door, for the account page.
 *
 * **It cannot go through `consoleContext`**, because that function's first act
 * is to look up an area and its last act is to compare a role against it, and
 * neither exists here. What it does share is the part that must not differ: no
 * session means the sign-in page with a `next` back to here, and the shell data
 * is assembled the same way, so the two surfaces cannot end up disagreeing about
 * the theme, the environment or who is signed in.
 */
export async function accountContext(path: string): Promise<ConsoleAccount> {
  const theme = await readTheme();
  const session = await currentSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const environment = deploymentEnvironment(process.env);
  const jar = await cookies();
  const membership = activeMembership(session, jar.get(ACTIVE_ORG_COOKIE)?.value);
  const subscriptionStatus = membership
    ? (await orgPlanState(await getDb(), membership.orgId)).subscriptionStatus
    : "none";

  return {
    kind: "account",
    theme,
    path,
    session,
    environment,
    membership,
    subscriptionStatus,
    nav: membership ? navFor(membership.role) : [],
  };
}
