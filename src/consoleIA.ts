/**
 * The organization console's information architecture, and who may reach each
 * part of it.
 *
 * **One list, three readers.** The navigation renders from it, every console
 * page guards from it, and `test/cloudShell.test.mjs` evaluates it. That is
 * CLAUDE.md rule 1 applied to authorization: a role matrix written once in a
 * `<nav>` and again in a page guard is a matrix that drifts, and the direction
 * it drifts is a page still reachable by URL after it stopped appearing in the
 * menu. PATHWAYS §5 says the same thing in the negative — *"a route is not a UI
 * boundary"* — so the hiding and the deciding have to come from one place, and
 * that place is this file.
 *
 * **It lives in the server package on purpose.** `web/` imports it, so it
 * compiles to `dist/` and the suite can import and *run* it rather than
 * regex-matching a `.tsx` file. A matrix checked by regex is a matrix nobody
 * has actually evaluated.
 *
 * The seven areas and their contents are `FUTURENORMA.md` §4 Step 6's
 * control-plane UI contract and `PATHWAYS.md` §5's "Organization console".
 * Neither is invented here. What *is* decided here is the route each area
 * answers on and the role each one requires; both are recorded below.
 */

import type { Role } from "./users.js";

export type ConsoleAreaId =
  | "overview"
  | "runs"
  | "trends"
  | "explain"
  | "organization"
  | "billing"
  | "data";

export interface ConsoleArea {
  id: ConsoleAreaId;
  /** What the navigation calls it. */
  label: string;
  /** Where the navigation sends you — the area's own front door. */
  href: string;
  /**
   * The path prefixes this area owns.
   *
   * **Exactly one area owns any console path**, which is what makes "do not add
   * a one-off page when an existing area can own the workflow" (PATHWAYS §5)
   * checkable rather than advisory. A new page either extends one of these
   * prefixes or the person adding it has to say which area it belongs to.
   */
  owns: string[];
  /** Roles that may reach it. Checked on the server, on every request. */
  roles: Role[];
  /** The question the area exists to answer, in one line. */
  purpose: string;
  /**
   * The workflows this area owns — the page-ownership map itself.
   *
   * Not documentation: the areas that are not built yet render this list, so
   * the placeholder and the map cannot say different things.
   */
  holds: string[];
  /**
   * Which of {@link holds} actually exist, verbatim.
   *
   * **Added when the first area stopped being empty.** Until Organization got
   * its workflows, every area was all-or-nothing and `AreaOutline` could say
   * *"does not hold anything yet"* about any of them. A half-built area breaks
   * that sentence in the worst direction: the page would keep promising things
   * that are already on it, a paragraph above where they are.
   *
   * Entries must be exact strings from `holds` — the suite fails otherwise —
   * so this cannot quietly become a second list of workflows. It is a set of
   * pointers into the first one, and *"what is still to come"* is the
   * difference between them, computed rather than written down anywhere.
   */
  built: string[];
}

/**
 * Every role there is. `owner` is deliberately not here — it is an ownership
 * invariant over an organization (§10.7 5A.9), not a membership role, and the
 * owner reaches the console as an `admin` like anybody else. The two actions
 * that are the owner's alone, transfer and delete-organization, are guarded by
 * `ownerOf` where they are built, not by this list.
 */
const ALL: Role[] = ["admin", "member", "designer"];
const ADMIN_ONLY: Role[] = ["admin"];

export const CONSOLE_AREAS: ConsoleArea[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/overview",
    owns: ["/overview"],
    roles: ALL,
    purpose: "What is happening in this organization right now, and what needs attention.",
    holds: [
      "current status and recent activity",
      "unresolved findings and attention items",
      "credits remaining and storage used",
      "failed, paused and skipped work",
    ],
    built: [],
  },
  {
    id: "runs",
    label: "Runs and reports",
    href: "/repos",
    owns: ["/repos"],
    roles: ALL,
    purpose: "Every repository, run, frame and finding this organization has uploaded.",
    holds: [
      "the repository list and each repository's runs",
      "run reports, frames and findings",
      "run history and comparisons",
      "share links and their expiry",
    ],
    built: [
      "the repository list and each repository's runs",
      "run reports, frames and findings",
      "run history and comparisons",
      "share links and their expiry",
    ],
  },
  {
    id: "trends",
    label: "Trends",
    href: "/trends",
    // A repository's trend view lives under the repository, and belongs to this
    // area rather than to Runs and reports. Whoever is reading it came to look
    // at movement over time, and the navigation should agree with them.
    owns: ["/trends", "/repos/*/trend"],
    roles: ALL,
    purpose: "How quality moved over time, across one repository or the whole organization.",
    holds: [
      "organization and per-repository quality trends",
      "recurrence and first drift",
      "quality debt",
      "the selected time window and the retention boundary",
    ],
    built: [
      "organization and per-repository quality trends",
      "recurrence and first drift",
      "the selected time window and the retention boundary",
    ],
  },
  {
    id: "explain",
    label: "Explain and automation",
    href: "/explain",
    owns: ["/explain"],
    roles: ALL,
    purpose: "What the hosted explanations did, what they cost, and what stopped them.",
    holds: [
      "hosted explain activity and CI explain activity",
      "automatic-explain policy and its caps",
      "skipped work and why it was skipped",
      "credits-exhausted state and provider pauses",
    ],
    built: [],
  },
  {
    id: "organization",
    label: "Organization",
    href: "/organization",
    owns: ["/organization"],
    roles: ADMIN_ONLY,
    purpose: "Who is in this organization, what they may do, and which keys act on its behalf.",
    holds: [
      "members, roles and removal",
      "invitations and their state",
      "upload and agent keys, shown once and revocable",
      "notification routing and upload policy",
    ],
    built: [
      "members, roles and removal",
      "invitations and their state",
      "upload and agent keys, shown once and revocable",
    ],
  },
  {
    id: "billing",
    label: "Billing and usage",
    href: "/billing",
    owns: ["/billing"],
    roles: ADMIN_ONLY,
    purpose: "What is being paid, what is left, and where it went.",
    holds: [
      "subscription, renewal date and invoices",
      "this month's allowance and its expiry, separately from purchased packs",
      "the usage ledger, with cache hits shown as free",
      "storage used against the plan's limit",
    ],
    built: [],
  },
  {
    id: "data",
    label: "Privacy and data",
    href: "/data",
    owns: ["/data"],
    roles: ADMIN_ONLY,
    purpose: "What we hold for this organization, and how to get it out or delete it.",
    holds: [
      "upload mode and pre-upload disclosure",
      "exclusions and retention",
      "exports and deletion, with completion receipts",
      "object access and how long a signed URL lives",
    ],
    built: [],
  },
];

/**
 * Two route decisions worth stating, because neither is obvious from the list.
 *
 * **`Privacy and data` answers on `/data`, not `/privacy`.** `/legal/privacy`
 * is the public privacy policy. A customer looking for the policy who lands on
 * a signed-in control plane has been sent to the wrong document by a route
 * name, and renaming it later means breaking a link somebody bookmarked.
 *
 * **`Runs and reports` keeps `/repos`.** It is the URL the repository list has
 * always answered on, it is what the trend and report pages link back to, and
 * an area label is not a reason to break a working path.
 */

/**
 * What an area still owes, as the difference between its two lists.
 *
 * Nowhere writes this down. An entry stops appearing here the moment it is added
 * to `built`, which is the same edit that makes the claim — so a page cannot
 * promise a workflow that is already on it, and cannot quietly stop mentioning
 * one that is not.
 */
export function outstanding(area: ConsoleArea): string[] {
  return area.holds.filter((item) => !area.built.includes(item));
}

/**
 * Every `built` entry has to be a `holds` entry, exactly.
 *
 * Exported for the suite rather than run at import time: a typo here should be a
 * red check with a name on it, not a module that throws while a page is
 * rendering. Returns the offending strings, so the failure says which one.
 */
export function unknownBuiltEntries(): { area: ConsoleAreaId; entry: string }[] {
  const bad: { area: ConsoleAreaId; entry: string }[] = [];
  for (const area of CONSOLE_AREAS) {
    for (const entry of area.built) {
      if (!area.holds.includes(entry)) {
        bad.push({ area: area.id, entry });
      }
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// The writes an area offers
// ---------------------------------------------------------------------------

/**
 * Every state-changing thing the Organization area can do, named once.
 *
 * **Here for the same reason `CONSOLE_AREAS` is here**, and with the same four
 * readers. The route handler types its dispatch table as
 * `Record<OrgActionName, …>`, so a missing or misspelt handler is a build
 * failure rather than a 404 found by a customer. The page builds every form's
 * `action` through {@link orgActionPath}, so a form cannot post at a route that
 * does not exist. `test/cloudShell.test.mjs` checks those two agree.
 * `scripts/tenant-gate-check.mjs` iterates it over HTTP, which is what makes
 * *"every write refuses a member"* one check rather than six somebody
 * remembered to write — and the list it iterates has to be **this** list, or
 * an action added tomorrow is an action nobody probes.
 *
 * It lives in the server package rather than in `web/` precisely so the suite
 * and the gate script can import it instead of regex-matching TypeScript.
 */
export const ORG_ACTIONS = [
  "invite",
  "invite-revoke",
  "member-role",
  "member-remove",
  "key-create",
  "key-revoke",
  "key-hide",
] as const;

export type OrgActionName = (typeof ORG_ACTIONS)[number];

export function orgActionPath(action: OrgActionName): string {
  return `/api/organization/${action}`;
}

/** The areas a role may reach, in navigation order. */
export function navFor(role: Role): ConsoleArea[] {
  return CONSOLE_AREAS.filter((area) => area.roles.includes(role));
}

export function canReach(area: ConsoleAreaId, role: Role): boolean {
  const found = CONSOLE_AREAS.find((a) => a.id === area);
  return found !== undefined && found.roles.includes(role);
}

/**
 * How well a pattern fits a path, or null if it does not fit at all.
 *
 * Patterns match whole segments and may use `*` for exactly one of them, which
 * is what lets an area own something nested inside another area's tree:
 * `/repos/*​/trend` is a repository's trend view, and it belongs to **Trends**
 * even though it lives under a repository. Without the wildcard the ownership
 * map would have to lie about that page — and the visible cost of the lie is
 * the wrong navigation item lighting up while you read it.
 *
 * More matched segments wins, and a literal segment beats a wildcard at the
 * same depth. So `/repos` owns `/repos/abc` and `/repos/*​/trend` owns
 * `/repos/abc/trend`, with no ordering dependency between the two entries.
 */
function fit(pattern: string, pathname: string): number | null {
  const wanted = pattern.split("/").filter(Boolean);
  const got = pathname.split("/").filter(Boolean);
  if (got.length < wanted.length) {
    return null;
  }
  let wildcards = 0;
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i] === "*") {
      wildcards++;
      continue;
    }
    if (wanted[i] !== got[i]) {
      return null;
    }
  }
  return wanted.length * 10 - wildcards;
}

/**
 * Which area owns a path, or null for a path outside the console.
 *
 * Segment matching, not string prefixes: `/data` owns `/data` and
 * `/data/exports`, and does not own `/database`.
 */
export function areaForPath(pathname: string): ConsoleArea | null {
  let best: ConsoleArea | null = null;
  let bestScore = -1;
  for (const area of CONSOLE_AREAS) {
    for (const pattern of area.owns) {
      const score = fit(pattern, pathname);
      if (score !== null && score > bestScore) {
        best = area;
        bestScore = score;
      }
    }
  }
  return best;
}

export function areaById(id: ConsoleAreaId): ConsoleArea {
  const found = CONSOLE_AREAS.find((a) => a.id === id);
  if (!found) {
    throw new Error(`no console area '${id}'`);
  }
  return found;
}

/**
 * What the shell says about the deployment it is running on.
 *
 * PATHWAYS §5 requires the environment to be visible on every console page,
 * next to the organization. The reason is support rather than decoration: the
 * question "which of these five tabs is production" has a wrong answer, and the
 * wrong answer gets acted on.
 */
export type DeploymentEnvironment = "production" | "preview" | "development";

export function deploymentEnvironment(
  env: Record<string, string | undefined>
): DeploymentEnvironment {
  if (env.VERCEL_ENV === "production") {
    return "production";
  }
  if (env.VERCEL_ENV) {
    return "preview";
  }
  return "development";
}
