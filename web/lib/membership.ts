import type { Membership, Role } from "argus-cloud/users.js";
import type { ResolvedSession } from "argus-cloud/sessions.js";

/**
 * Turning a claim about an organization into a membership, or into nothing.
 *
 * **These three functions are the whole of "a caller-provided org ID is never
 * authorization"** (PATHWAYS §10.7 5A). Every page, route and server action asks
 * for an organization by id, and every one of them comes through here. A URL
 * segment, a cookie, a form field and a JSON body are the same thing at this
 * boundary: a request, not a permission.
 *
 * **They are in their own file so a test can run them.** `session.ts` imports
 * `next/headers` and `argus-cloud/sessions.js`, so it cannot be loaded outside
 * a Next request; this file's only imports are types, which compile to nothing.
 * `previewGate.ts` is split from `gate.ts` for exactly this reason and says so.
 * The alternative was checking an authorization rule with a regex over its
 * source, which is not the same as watching it answer.
 *
 * `session.ts` re-exports all three, so nothing imports this file directly.
 */

/**
 * The membership matching an id, or null.
 *
 * The lookup is a filter over what the session actually holds, so a stranger
 * asking for someone else's organization gets null and, above this, a 404 — the
 * same response as an organization that does not exist, because telling the two
 * apart would confirm that it does.
 */
export function membershipFor(session: ResolvedSession | null, orgId: string): Membership | null {
  if (!session) {
    return null;
  }
  return session.memberships.find((m) => m.orgId === orgId) ?? null;
}

/**
 * Which organization the console is looking at.
 *
 * **The cookie is a preference, and this is where that is true.** §10.7 5A.2:
 * *"the selected organization is UI state only"*. A cookie naming an
 * organization the person does not belong to is **ignored, not obeyed** — it
 * falls through to the first membership rather than returning nothing, because
 * a stale cookie from a membership that was removed must not lock somebody out
 * of the organizations they still have.
 */
export function activeMembership(
  session: ResolvedSession | null,
  preferred?: string | null
): Membership | null {
  if (!session || session.memberships.length === 0) {
    return null;
  }
  if (preferred) {
    const chosen = session.memberships.find((m) => m.orgId === preferred);
    if (chosen) {
      return chosen;
    }
  }
  return session.memberships[0];
}

/** Roles allowed to perform an action, as a set the caller states explicitly. */
export function hasRole(membership: Membership | null, allowed: Role[]): boolean {
  return membership !== null && allowed.includes(membership.role);
}
