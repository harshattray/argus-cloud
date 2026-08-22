import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { normaliseAddress, randomToken, tokenHash } from "./authCrypto.js";
import { button, emailShell, EMAIL_COLORS, note, paragraph } from "./emailLayout.js";
import type { Role } from "./users.js";

/**
 * Invitations — PATHWAYS §10.7 5A.6.
 *
 * **The only way a person joins an organization.** Not a matching email domain,
 * not "they signed in and their address looks like ours", not an admin typing
 * someone into a list and hoping. An invitation is a row, it is scoped to one
 * organization, it expires, and it is consumed once.
 *
 * The state machine is the column:
 *
 *     pending → accepted | revoked | expired
 *
 * **One live invitation per address per organization**, enforced by a partial
 * unique index rather than by this code. Resending revokes the previous row and
 * creates a replacement inside one transaction, so "revoke that invite" cannot
 * leave an older link quietly working — which is the failure that makes an
 * invitation system unsafe rather than merely untidy.
 */

/** How long an invitation link lives. Long enough for a holiday, not a job change. */
export const INVITE_TTL_DAYS = 14;

export interface Invitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  role: Role;
  state: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
}

export interface CreatedInvitation {
  invitation: Invitation;
  /** Goes in the emailed link. Only its hash is stored. */
  token: string;
}

/**
 * Invites someone, replacing any live invitation for the same address.
 *
 * `role` is `admin | member | designer` and never `owner`: ownership is
 * transferred between two consenting people, never handed out in an email
 * (§10.7 5A.5). The database refuses the value too.
 */
export async function createInvitation(
  db: Db,
  input: { orgId: string; email: string; role: Role; invitedBy?: string },
  options: { now?: Date } = {}
): Promise<CreatedInvitation> {
  const now = options.now ?? new Date();
  const email = normaliseAddress(input.email);
  const id = randomUUID();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);

  await db.transaction(async (tx) => {
    // Supersede rather than reuse: a resent invitation must invalidate the
    // previous link, or an address would accumulate working credentials.
    await tx.query(
      `UPDATE invitations SET state = 'revoked', resolved_at = $3
        WHERE org_id = $1 AND email = $2 AND state = 'pending'`,
      [input.orgId, email, now.toISOString()]
    );
    await tx.query(
      `INSERT INTO invitations (id, org_id, email, role, token_hash, invited_by, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, input.orgId, email, input.role, tokenHash(token), input.invitedBy ?? null, now.toISOString(), expiresAt.toISOString()],
    );
  });

  const invitation = await findInvitationById(db, id);
  return { invitation: invitation as Invitation, token };
}

const SELECT_INVITE = `SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.state, i.created_at, i.expires_at
                         FROM invitations i JOIN orgs o ON o.id = i.org_id`;

function toInvitation(row: Record<string, unknown>): Invitation {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    orgName: String(row.org_name),
    email: String(row.email),
    role: row.role as Role,
    state: row.state as Invitation["state"],
    createdAt: new Date(row.created_at as string).toISOString(),
    expiresAt: new Date(row.expires_at as string).toISOString(),
  };
}

export async function findInvitationById(db: Db, id: string): Promise<Invitation | null> {
  const rows = await db.query<Record<string, unknown>>(`${SELECT_INVITE} WHERE i.id = $1`, [id]);
  return rows.rows[0] ? toInvitation(rows.rows[0]) : null;
}

/**
 * The live invitations for an address, across every organization.
 *
 * Used by the sign-in path to decide whether an unknown address may be sent a
 * link at all. Expired rows are filtered by time rather than trusted to have
 * been swept, so a sweeper that has not run cannot widen the eligible set.
 */
export async function pendingInvitationsFor(db: Db, email: string, now: Date = new Date()): Promise<Invitation[]> {
  const rows = await db.query<Record<string, unknown>>(
    `${SELECT_INVITE} WHERE i.email = $1 AND i.state = 'pending' AND i.expires_at > $2 ORDER BY i.created_at DESC`,
    [normaliseAddress(email), now.toISOString()]
  );
  return rows.rows.map(toInvitation);
}

export async function findInvitationByToken(db: Db, token: string, now: Date = new Date()): Promise<Invitation | null> {
  const rows = await db.query<Record<string, unknown>>(
    `${SELECT_INVITE} WHERE i.token_hash = $1 AND i.state = 'pending' AND i.expires_at > $2`,
    [tokenHash(token), now.toISOString()]
  );
  return rows.rows[0] ? toInvitation(rows.rows[0]) : null;
}

export type AcceptFailure = "unknown" | "expired" | "already-resolved" | "wrong-identity";

/**
 * Consumes an invitation and creates the membership.
 *
 * **The caller must already have proved the invited identity** — by holding the
 * token that was emailed to it, or by presenting a provider identity whose
 * *verified* address matches. This function re-checks the address against the
 * user it is given, because the two proofs arrive by different routes and the
 * check is one comparison.
 *
 * Both writes happen in one transaction, and the state change is conditional on
 * `state = 'pending'` — so two clicks, or a click and a GitHub callback racing,
 * produce one membership and one accepted invitation.
 */
export async function acceptInvitation(
  db: Db,
  input: { invitationId: string; userId: string; userEmail: string },
  options: { now?: Date } = {}
): Promise<{ ok: true; orgId: string; role: Role } | { ok: false; failure: AcceptFailure }> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const rows = await tx.query<{ org_id: string; email: string; role: Role; state: string; expires_at: string }>(
      "SELECT org_id, email, role, state, expires_at FROM invitations WHERE id = $1",
      [input.invitationId]
    );
    const invite = rows.rows[0];
    if (!invite) {
      return { ok: false as const, failure: "unknown" as const };
    }
    if (invite.state !== "pending") {
      return { ok: false as const, failure: "already-resolved" as const };
    }
    if (new Date(invite.expires_at).getTime() <= now.getTime()) {
      return { ok: false as const, failure: "expired" as const };
    }
    if (invite.email !== normaliseAddress(input.userEmail)) {
      return { ok: false as const, failure: "wrong-identity" as const };
    }

    const claimed = await tx.query<{ id: string }>(
      `UPDATE invitations SET state = 'accepted', resolved_at = $2, accepted_user = $3
        WHERE id = $1 AND state = 'pending' RETURNING id`,
      [input.invitationId, now.toISOString(), input.userId]
    );
    if (claimed.rows.length === 0) {
      return { ok: false as const, failure: "already-resolved" as const };
    }
    await tx.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [invite.org_id, input.userId, invite.role]
    );
    return { ok: true as const, orgId: invite.org_id, role: invite.role };
  });
}

/**
 * Withdraws a live invitation, inside one organization.
 *
 * **`orgId` is required and it is not optional-with-a-default.** An invitation
 * id arrives from a form in an admin's browser, which means it arrives from
 * whoever is holding that browser — and the id of a row is not evidence of the
 * right to touch it. Scoping the `UPDATE` is what makes a guessed or copied id
 * useless, and making the parameter mandatory is what stops a future caller from
 * quietly leaving it off. Pass `null` only where the actor is an operator acting
 * across tenants, which nothing does today.
 *
 * A request for an invitation in another organization returns `false`, which is
 * the same answer as an invitation that was already revoked. There is no way to
 * tell the two apart from outside, which is deliberate: a distinguishable
 * refusal would turn this into a way to ask whether an id exists.
 */
export async function revokeInvitation(
  db: Db,
  id: string,
  scope: { orgId: string | null },
  now: Date = new Date()
): Promise<boolean> {
  if (!scope || scope.orgId === undefined) {
    // The compiled callers cannot get here; a test or a script can. See the
    // matching guard in `revokeApiKey` for why an explicit refusal beats a
    // query that silently matches nothing.
    throw new Error("revokeInvitation needs an orgId — pass null for an operator-wide revocation");
  }
  const params: unknown[] = [id, now.toISOString()];
  let scoped = "";
  if (scope.orgId !== null) {
    params.push(scope.orgId);
    scoped = ` AND org_id = $${params.length}`;
  }
  const rows = await db.query<{ id: string }>(
    `UPDATE invitations SET state = 'revoked', resolved_at = $2
      WHERE id = $1 AND state = 'pending'${scoped} RETURNING id`,
    params
  );
  return rows.rows.length > 0;
}

/**
 * One organization's invitations, newest first, for the admin's list.
 *
 * **A passed-expiry row reads as `expired` here even if the sweep has not run.**
 * Every authorization path above already filters on time, so this changes no
 * decision — what it changes is the page, which would otherwise call a dead link
 * "pending" until {@link expireInvitations} next ran. The alternative was to
 * have the page work that out from `expiresAt`, which is the same rule written
 * twice in two languages; this keeps it in the one place that already knows it.
 */
export async function listInvitations(db: Db, orgId: string, now: Date = new Date()): Promise<Invitation[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.created_at, i.expires_at,
            CASE WHEN i.state = 'pending' AND i.expires_at <= $2 THEN 'expired' ELSE i.state END AS state
       FROM invitations i JOIN orgs o ON o.id = i.org_id
      WHERE i.org_id = $1 ORDER BY i.created_at DESC LIMIT 200`,
    [orgId, now.toISOString()]
  );
  return rows.rows.map(toInvitation);
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

/**
 * Where an invitation link points.
 *
 * `/api/auth/invite/accept` redeems server-side and redirects, so the token is
 * never in the address bar of a rendered page — the same shape as the sign-in
 * callback, and for the same reason.
 */
export function inviteUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/auth/invite/accept", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function inviteSubject(orgName: string): string {
  return `You've been invited to ${orgName} on Normascope Cloud`;
}

/**
 * The invitation email.
 *
 * **Four things it has to say**, and §10.7 5A.6 names them: which organization,
 * who invited you, what role you are being given, and when the link dies. A
 * message missing any of those is one the recipient has to ask a colleague
 * about before clicking, which is the opposite of what an invitation is for.
 *
 * **What it must not say is who else is in the organization.** 5A.6 again: the
 * invitation surface names the organization and the inviter, and nothing about
 * the other members. Someone who never accepts should learn nothing from having
 * been asked.
 *
 * The inviter is a display name, never an address — the same rule the "generated
 * by" line follows, and the reason `createUser` defaults a display name to the
 * local part rather than the whole address.
 */
export function inviteEmailHtml(
  input: { link: string; orgName: string; inviterName: string; role: Role; siteUrl: string },
  env: NodeJS.ProcessEnv = process.env
): string {
  return emailShell({
    title: inviteSubject(input.orgName),
    preheader: `Works once, expires in ${INVITE_TTL_DAYS} days.`,
    heading: `Join ${input.orgName}`,
    siteUrl: input.siteUrl,
    env,
    body: [
      paragraph(
        `${escapeHtml(input.inviterName)} invited you to <strong>${escapeHtml(input.orgName)}</strong> on ` +
          `Normascope Cloud as a <strong>${input.role}</strong>.`
      ),
      paragraph(`This link works once and expires in ${INVITE_TTL_DAYS} days.`),
      button(input.link, "Accept the invitation"),
      note(
        `If the button does not work, paste this into your browser:<br>` +
          `<span style="word-break:break-all;color:${EMAIL_COLORS.CLAY}">${input.link}</span>`
      ),
      note(
        "If you were not expecting this, you can ignore it — nothing happens until you accept, " +
          "and the link stops working on its own."
      ),
    ].join("\n                "),
  });
}

export function inviteEmailText(input: {
  link: string;
  orgName: string;
  inviterName: string;
  role: Role;
}): string {
  return `Join ${input.orgName} on Normascope Cloud

${input.inviterName} invited you to ${input.orgName} as a ${input.role}.

This link works once and expires in ${INVITE_TTL_DAYS} days.

${input.link}

If you were not expecting this, you can ignore it — nothing happens until you accept, and the link stops working on its own.

Normascope is a product from Yutic.`;
}

/**
 * The organization name and the inviter's name go into HTML, and both are typed
 * by a customer. Escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Marks passed-expiry invitations as expired.
 *
 * Cosmetic for authorization — every read above already filters on time — and
 * not cosmetic for the admin's list, where "pending" against a dead link is a
 * lie the page tells.
 */
export async function expireInvitations(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db.query<{ id: string }>(
    "UPDATE invitations SET state = 'expired', resolved_at = $1 WHERE state = 'pending' AND expires_at <= $1 RETURNING id",
    [now.toISOString()]
  );
  return rows.rows.length;
}
