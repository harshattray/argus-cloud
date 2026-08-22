import { createApiKey, NotEntitled, revokeApiKey } from "argus-cloud/apiKeys.js";
import { revokeInvitation } from "argus-cloud/invitations.js";
import { normaliseAddress } from "argus-cloud/authCrypto.js";
import { createAlertChannel } from "argus-cloud/alertChannel.js";
import { recordAuthEvent } from "argus-cloud/authEvents.js";
import { sendInvitation } from "argus-cloud/loginService.js";
import {
  changeMembershipRole,
  membersOf,
  OwnershipError,
  removeMembership,
  ROLES,
  type Role,
} from "argus-cloud/users.js";
import type { OrgActionName } from "argus-cloud/consoleIA.js";
import { getDb } from "../../../../lib/db";
import { clientIp } from "../../../../lib/clientRate";
import { siteOrigin } from "../../../../lib/authRoutes";
import { backToOrganization, requireOrgAdmin, type OrgAdmin } from "../../../../lib/orgAdmin";
import { clearKeyReveal, setKeyReveal } from "../../../../lib/keyReveal";

/**
 * Every write the Organization area can make — one door, seven actions.
 *
 * **A dispatcher rather than seven route files.** They share a gate, a shape and
 * a way of answering, and the value of having them in one file is that the whole
 * set of things an admin can do to an organization is one screen long and can be
 * read in one go. `ACTIONS` is also the list the suite iterates, which is how
 * "every one of these refuses a member" is a check rather than six checks
 * somebody remembered to write.
 *
 * **Form posts and a 303, not JSON and not a server action.** The same reasoning
 * as `/api/org` and `/api/theme`: a 303 cannot be re-submitted by the back
 * button, and a plain `<form>` keeps the console free of client JavaScript,
 * which matters on pages served under a strict nonce policy. Progressive
 * enhancement is a side effect rather than the point — these controls work with
 * scripting off because nothing here needs scripting on.
 *
 * **Nothing the caller sends names an organization.** `requireOrgAdmin` resolves
 * it from the session; every query below is scoped to that value. An id in a
 * form field is a request, not a permission — so the two revokes pass the
 * organization down into their `UPDATE` rather than trusting the row id they
 * were handed.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = (input: { form: FormData; admin: OrgAdmin; request: Request }) => Promise<Response>;

function readRole(form: FormData): Role | null {
  const value = form.get("role");
  return typeof value === "string" && (ROLES as string[]).includes(value) ? (value as Role) : null;
}

/**
 * Refuses an address the mailer would not be able to use anyway.
 *
 * Deliberately shallow — one `@`, something either side, no spaces. Address
 * validation that tries to be clever rejects real addresses, and the real
 * gatekeeper is that an invitation is only useful to somebody who receives the
 * mail sent to it.
 */
function usableAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/**
 * Typed by the shared name list, so the compiler holds the map complete.
 *
 * A handler that is deleted, renamed, or never written is a build failure here
 * rather than a form that posts into a 404 — which is the way this kind of gap
 * is normally found, by a customer.
 */
const ACTIONS: Record<OrgActionName, Action> = {
  /**
   * Invite somebody, and send them the link.
   *
   * **Both halves, or neither.** `sendInvitation` reserves the outbound-email
   * budget before it creates the row, so a refused send leaves no live link
   * behind that nobody was told about — and the notice this returns is the
   * difference between "sent" and "created but the provider refused it".
   */
  async invite({ form, admin, request }) {
    const raw = String(form.get("email") ?? "").trim();
    const role = readRole(form);
    if (!role) {
      return backToOrganization("bad-role");
    }
    if (!usableAddress(raw)) {
      return backToOrganization("bad-email");
    }
    const db = await getDb();
    const email = normaliseAddress(raw);

    // Somebody already in the organization does not need an invitation, and
    // sending one would be a live link to an account that already has access —
    // a second credential for no gain. The admin wanted a role change; say so
    // rather than doing something adjacent to what they asked for.
    const members = await membersOf(db, admin.membership.orgId);
    if (members.some((m) => m.email === email)) {
      return backToOrganization("already-member");
    }

    const alerts = createAlertChannel();
    const outcome = await sendInvitation(
      { db, baseUrl: siteOrigin(request), alert: alerts.alert },
      {
        orgId: admin.membership.orgId,
        orgName: admin.membership.orgName,
        email,
        role,
        invitedBy: admin.session.user,
        ip: clientIp(request),
      }
    );
    if (outcome.ok) {
      return backToOrganization("invited");
    }
    // Two honest failures, told apart because the admin's next move differs:
    // a ceiling means wait, a refused provider means the row exists and
    // resending is what supersedes its token.
    return backToOrganization(outcome.reason === "budget" ? "invite-budget" : "invite-unsent");
  },

  async "invite-revoke"({ form, admin, request }) {
    const id = String(form.get("id") ?? "").trim();
    if (!id) {
      return backToOrganization("invite-gone");
    }
    const db = await getDb();
    const revoked = await revokeInvitation(db, id, { orgId: admin.membership.orgId });
    if (revoked) {
      await recordAuthEvent(db, {
        kind: "invitation-revoked",
        outcome: "allowed",
        orgId: admin.membership.orgId,
        actorUserId: admin.session.user.id,
        ip: clientIp(request),
      });
    }
    // Already revoked, already accepted, expired, or belonging to somebody else
    // — one answer for all four. The first three are the same event from the
    // reader's side, and the fourth must not be distinguishable from them.
    return backToOrganization(revoked ? "invite-revoked" : "invite-gone");
  },

  async "member-role"({ form, admin, request }) {
    const userId = String(form.get("userId") ?? "").trim();
    const role = readRole(form);
    if (!role) {
      return backToOrganization("bad-role");
    }
    const db = await getDb();
    try {
      const changed = await changeMembershipRole(db, { orgId: admin.membership.orgId, userId, role });
      if (changed) {
        await recordAuthEvent(db, {
          kind: "role-changed",
          outcome: "allowed",
          reason: role,
          orgId: admin.membership.orgId,
          userId,
          actorUserId: admin.session.user.id,
          ip: clientIp(request),
        });
      }
      return backToOrganization(changed ? "role-changed" : "member-gone");
    } catch (error) {
      return ownershipNotice(error);
    }
  },

  async "member-remove"({ form, admin, request }) {
    const userId = String(form.get("userId") ?? "").trim();
    const db = await getDb();
    try {
      await removeMembership(db, { orgId: admin.membership.orgId, userId });
      await recordAuthEvent(db, {
        kind: "member-removed",
        outcome: "allowed",
        orgId: admin.membership.orgId,
        userId,
        actorUserId: admin.session.user.id,
        ip: clientIp(request),
      });
      return backToOrganization("member-removed");
    } catch (error) {
      return ownershipNotice(error);
    }
  },

  /**
   * Mints a key and hands the plaintext to exactly one page render.
   *
   * The label is stored and shown; it is never echoed back through the query
   * string. `setKeyReveal` explains what carries the secret across the redirect
   * and what that costs.
   */
  async "key-create"({ form, admin }) {
    const label = String(form.get("label") ?? "").trim().slice(0, 80);
    const kind = form.get("kind") === "agent" ? "agent" : "upload";
    try {
      const created = await createApiKey(await getDb(), admin.membership.orgId, {
        kind,
        label,
        createdBy: admin.session.user.id,
      });
      const response = backToOrganization("key-created");
      setKeyReveal(response, created.id, created.plaintext);
      return response;
    } catch (error) {
      if (error instanceof NotEntitled) {
        // The plan cannot hold an upload key. `createApiKey` refuses so the
        // credential never exists to leak; the reader gets told which plan, not
        // a stack trace.
        return backToOrganization("not-entitled");
      }
      throw error;
    }
  },

  async "key-revoke"({ form, admin }) {
    const id = String(form.get("id") ?? "").trim();
    if (!id) {
      return backToOrganization("key-gone");
    }
    try {
      const outcome = await revokeApiKey(await getDb(), id, {
        // §10.7 5A.10 wants the revocation attributed. Migration 018 shipped
        // with a typed-in name because there was no session to read; there is
        // one now, and this is the call site that comment asked for.
        actor: admin.session.user.display_name,
        reason: "revoked from the organization console",
        orgId: admin.membership.orgId,
      });
      return backToOrganization(outcome.revoked ? "key-revoked" : "key-gone");
    } catch {
      // `revokeApiKey` throws for a key that does not exist *within this
      // organization*, which includes every key belonging to another one. Same
      // answer as already-revoked, for the same reason as the invitation above.
      return backToOrganization("key-gone");
    }
  },

  /**
   * Puts a revealed key away.
   *
   * No notice: the reader pressed "I've saved it" and knows what happened, and a
   * banner congratulating them on dismissing a banner is noise. The cookie
   * expires on its own in two minutes regardless — this is the control for
   * somebody who is finished before then, not the mechanism.
   */
  async "key-hide"() {
    const response = backToOrganization();
    clearKeyReveal(response);
    return response;
  },
};

/**
 * The two refusals that keep an organization operable, as sentences.
 *
 * `OwnershipError` carries a reason string precisely so a UI can say which rule
 * it hit. Anything else is a real failure and is re-thrown to the error boundary
 * — swallowing it would turn a broken write into a page that looks like it
 * worked.
 */
function ownershipNotice(error: unknown): Response {
  if (error instanceof OwnershipError) {
    if (error.reason === "last-admin") {
      return backToOrganization("last-admin");
    }
    if (error.reason === "is-owner") {
      return backToOrganization("is-owner");
    }
    if (error.reason === "bad-role") {
      return backToOrganization("bad-role");
    }
  }
  throw error;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
): Promise<Response> {
  const admin = await requireOrgAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }
  const { action } = await context.params;
  const handler = Object.prototype.hasOwnProperty.call(ACTIONS, action)
    ? ACTIONS[action as OrgActionName]
    : undefined;
  if (!handler) {
    return Response.json({ error: "no such action" }, { status: 404 });
  }
  return handler({ form: await request.formData(), admin, request });
}
