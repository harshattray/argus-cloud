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

export type ConsoleContext = ConsoleOk | ConsoleDenied | ConsoleNoOrg;

export async function consoleContext(
  areaId: ConsoleAreaId,
  path: string
): Promise<ConsoleContext> {
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
