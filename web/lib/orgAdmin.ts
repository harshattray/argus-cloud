import { cookies } from "next/headers";
import { canReach } from "argus-cloud/consoleIA.js";
import type { Membership } from "argus-cloud/users.js";
import type { ResolvedSession } from "argus-cloud/sessions.js";
import { ACTIVE_ORG_COOKIE, activeMembership, currentSession, sameOrigin } from "./session";

/**
 * The one gate every write in the Organization area goes through.
 *
 * **Six routes, one decision.** Inviting somebody, revoking an invitation,
 * changing a role, removing a member, minting a key and revoking a key are six
 * different things that require exactly the same four answers: is this request
 * from our own origin, is there a session, which organization is it acting on,
 * and is this person an admin of *that* organization. Written six times, they
 * would be six chances for one of them to be written slightly differently —
 * which is the shape of every authorization bug in this file's history.
 *
 * **The role comes from `CONSOLE_AREAS`, not from a literal here.** The
 * navigation renders from that list, the page guards from it, and now so do the
 * routes. `consoleIA.ts` says why: a matrix written in one place and re-stated
 * in another is a matrix that drifts, and the direction it drifts is a route
 * still answering after the menu stopped offering it. If Organization ever
 * admits another role, that is one edit and all seven readers move together.
 *
 * **The organization comes from the session, never from the form.** There is
 * deliberately no `orgId` field on any of these forms. The active-organization
 * cookie selects *which membership of this session* to act as, and
 * `activeMembership` ignores it when it names something the session does not
 * hold — so the worst a forged cookie achieves is acting on your own first
 * organization.
 */

export interface OrgAdmin {
  session: ResolvedSession;
  membership: Membership;
}

/**
 * A refusal, or the two things every handler needs.
 *
 * Returns the `Response` rather than throwing so each route reads as a straight
 * line: `if (gate instanceof Response) return gate;`.
 *
 * **The status codes are chosen, not defaults.** 403 for a signed-in person in
 * the wrong role, because they know the organization exists — they can see its
 * name in the masthead — and a 404 there would send them to support to report a
 * broken link. 401 for no session at all. Cross-*tenant* questions never reach
 * here: the organization is taken from the session, so there is nothing to
 * probe and nothing whose existence needs protecting.
 */
export async function requireOrgAdmin(request: Request): Promise<OrgAdmin | Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }
  const jar = await cookies();
  const membership = activeMembership(session, jar.get(ACTIVE_ORG_COOKIE)?.value);
  if (!membership) {
    return Response.json({ error: "no organization" }, { status: 403 });
  }
  if (!canReach("organization", membership.role)) {
    return Response.json({ error: "the Organization area is for admins" }, { status: 403 });
  }
  return { session, membership };
}

/**
 * What the reader is told after a write, as a code rather than as a sentence.
 *
 * **Nothing the caller typed is ever echoed back.** The notice travels in the
 * query string and the page maps a fixed code to a fixed sentence; an
 * unrecognised code renders nothing at all. This is not theoretical tidiness —
 * the tenant-gate check was green for the wrong reason once because a page was
 * reflecting the requester's own query string back at them, and a refusal that
 * repeats your input is a refusal you can put words into.
 */
export type OrgNotice =
  | "invited"
  | "invite-budget"
  | "invite-unsent"
  | "invite-revoked"
  | "invite-gone"
  | "role-changed"
  | "member-removed"
  | "member-gone"
  | "last-admin"
  | "is-owner"
  | "key-created"
  | "key-revoked"
  | "key-gone"
  | "not-entitled"
  | "bad-email"
  | "bad-role"
  | "already-member";

/** A 303 back to the Organization area, carrying one notice code. */
export function backToOrganization(notice?: OrgNotice): Response {
  const location = notice ? `/organization?notice=${notice}` : "/organization";
  return new Response(null, { status: 303, headers: { Location: location } });
}
