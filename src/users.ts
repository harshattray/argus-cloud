import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { normaliseAddress } from "./authCrypto.js";

/**
 * People, the ways they prove who they are, and the organizations they belong
 * to — FUTURENORMA §4 Step 6, §5 ("the model already in the schema").
 *
 * **Nothing here creates an organization.** With no trial and no free accounts,
 * an organization comes into existence exactly one way: the purchase webhook
 * (§5, step 1). Sign-in resolves an existing person; it never provisions one.
 * That single rule is what makes the sign-in surface cheap to defend — there is
 * no state an anonymous caller can create.
 */

export type Role = "admin" | "member" | "designer";

/**
 * `admin` is the owner-equivalent role. PATHWAYS' deletion section says
 * "owner/admin"; there is one level, not two, and it is this one. If a distinct
 * owner is ever needed, it is a fourth role and a migration — not an implicit
 * "the first admin".
 */
export const ROLES: Role[] = ["admin", "member", "designer"];

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
}

export interface Membership {
  orgId: string;
  orgName: string;
  plan: string;
  role: Role;
}

export type Provider = "github" | "email";

export async function findUserByEmail(db: Db, email: string): Promise<UserRecord | null> {
  const rows = await db.query<UserRecord>(
    "SELECT id, email, display_name, created_at, last_login_at FROM users WHERE email = $1",
    [normaliseAddress(email)]
  );
  return rows.rows[0] ?? null;
}

export async function findUserById(db: Db, id: string): Promise<UserRecord | null> {
  const rows = await db.query<UserRecord>(
    "SELECT id, email, display_name, created_at, last_login_at FROM users WHERE id = $1",
    [id]
  );
  return rows.rows[0] ?? null;
}

/** The user an external account is linked to, or null if it is unknown here. */
export async function findUserByIdentity(db: Db, provider: Provider, subject: string): Promise<UserRecord | null> {
  const rows = await db.query<UserRecord>(
    `SELECT u.id, u.email, u.display_name, u.created_at, u.last_login_at
       FROM login_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.subject = $2`,
    [provider, subject]
  );
  return rows.rows[0] ?? null;
}

/**
 * Creates a person. Called by provisioning and by invitation acceptance —
 * never by a sign-in attempt.
 */
export async function createUser(db: Db, input: { email: string; displayName?: string }): Promise<UserRecord> {
  const id = randomUUID();
  const email = normaliseAddress(input.email);
  // The display name defaults to the local part rather than the whole address,
  // because it ends up on a run report that can be shared outside the
  // organization and the settled policy is display name only, never an email
  // (PATHWAYS Pathway 5). A default of `email` would have published addresses
  // through the byline the first time anyone shared a report.
  const displayName = (input.displayName ?? email.split("@")[0]).slice(0, 80);
  await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)", [id, email, displayName]);
  return (await findUserById(db, id)) as UserRecord;
}

/**
 * Records that this external account is this person.
 *
 * Idempotent, and it refuses to move an identity between users: the primary key
 * on `(provider, subject)` means a second user cannot claim a GitHub account
 * that already belongs to someone. That refusal is the point — silently
 * re-pointing an identity is account takeover with extra steps.
 */
export async function linkIdentity(
  db: Db,
  input: { provider: Provider; subject: string; userId: string }
): Promise<{ linked: boolean; conflict: boolean }> {
  const existing = await db.query<{ user_id: string }>(
    "SELECT user_id FROM login_identities WHERE provider = $1 AND subject = $2",
    [input.provider, input.subject]
  );
  if (existing.rows.length > 0) {
    return { linked: false, conflict: existing.rows[0].user_id !== input.userId };
  }
  await db.query("INSERT INTO login_identities (provider, subject, user_id) VALUES ($1, $2, $3)", [
    input.provider,
    input.subject,
    input.userId,
  ]);
  return { linked: true, conflict: false };
}

export async function recordLogin(
  db: Db,
  input: { userId: string; provider: Provider; subject: string },
  now: Date = new Date()
): Promise<void> {
  await db.query("UPDATE users SET last_login_at = $2 WHERE id = $1", [input.userId, now.toISOString()]);
  await db.query(
    "UPDATE login_identities SET last_used_at = $3 WHERE provider = $1 AND subject = $2",
    [input.provider, input.subject, now.toISOString()]
  );
}

/**
 * The organizations this person belongs to, with their role in each.
 *
 * **This is the authorization root.** Every page and route derives `orgId` from
 * this list and never from anything the caller sent (PATHWAYS §10.7 5A: "a
 * caller-provided org ID is never authorization").
 */
export async function membershipsFor(db: Db, userId: string): Promise<Membership[]> {
  const rows = await db.query<{ org_id: string; name: string; plan: string; role: Role }>(
    `SELECT m.org_id, o.name, o.plan, m.role
       FROM memberships m JOIN orgs o ON o.id = m.org_id
      WHERE m.user_id = $1
      ORDER BY o.name`,
    [userId]
  );
  return rows.rows.map((r) => ({ orgId: r.org_id, orgName: r.name, plan: r.plan, role: r.role }));
}

/** Adds someone to an organization. Provisioning and invitations only. */
export async function addMembership(
  db: Db,
  input: { orgId: string; userId: string; role: Role }
): Promise<void> {
  await db.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [input.orgId, input.userId, input.role]
  );
}

export async function roleIn(db: Db, orgId: string, userId: string): Promise<Role | null> {
  const rows = await db.query<{ role: Role }>(
    "SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2",
    [orgId, userId]
  );
  return rows.rows[0]?.role ?? null;
}

// ---------------------------------------------------------------------------
// Ownership — the invariant, kept apart from the role
// ---------------------------------------------------------------------------

/**
 * PATHWAYS §10.7 5A.5: "There must always be one owner while an organization is
 * active." Ownership is a column on `orgs`, not a fourth role, because a role
 * cannot express "exactly one" — see `migrations/021`.
 */
export async function ownerOf(db: Db, orgId: string): Promise<string | null> {
  const rows = await db.query<{ owner_user_id: string | null }>(
    "SELECT owner_user_id FROM orgs WHERE id = $1",
    [orgId]
  );
  return rows.rows[0]?.owner_user_id ?? null;
}

export class OwnershipError extends Error {
  constructor(
    readonly reason: string,
    message: string
  ) {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * Installs the first owner of an unclaimed organization.
 *
 * Conditional on `owner_user_id IS NULL`, inside a transaction with the
 * membership write, so two devices completing a claim at the same moment
 * produce one owner and one membership rather than two of each (§10.7 5A.5:
 * "Two tabs, two devices, or a retried callback must not create two owner users
 * or two memberships"). The loser gets `false` and can be told the organization
 * is already claimed.
 */
export async function claimOwnership(db: Db, orgId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx.query<{ id: string }>(
      "UPDATE orgs SET owner_user_id = $2 WHERE id = $1 AND owner_user_id IS NULL RETURNING id",
      [orgId, userId]
    );
    if (claimed.rows.length === 0) {
      return false;
    }
    // The owner is always also an admin (§10.7 5A.5). Written here rather than
    // by the caller so the two facts cannot get out of step.
    await tx.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin'`,
      [orgId, userId]
    );
    return true;
  });
}

/**
 * Moves ownership to someone who has accepted it.
 *
 * Everything happens in one transaction, and the current owner is named in the
 * `WHERE` clause — so a stale page belonging to a previous owner cannot transfer
 * an organization that has already moved on.
 *
 * Acceptance by the new owner is the caller's to obtain (it is a two-party act,
 * §10.7 5A.5); what this guarantees is that the change is atomic and that the
 * new owner ends up an admin.
 */
export async function transferOwnership(
  db: Db,
  input: { orgId: string; fromUserId: string; toUserId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const member = await tx.query<{ role: Role }>(
      "SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2",
      [input.orgId, input.toUserId]
    );
    if (member.rows.length === 0) {
      throw new OwnershipError("not-a-member", "the new owner must already be a member of the organization");
    }
    const moved = await tx.query<{ id: string }>(
      "UPDATE orgs SET owner_user_id = $3 WHERE id = $1 AND owner_user_id = $2 RETURNING id",
      [input.orgId, input.fromUserId, input.toUserId]
    );
    if (moved.rows.length === 0) {
      throw new OwnershipError("not-the-owner", "only the current owner can transfer ownership");
    }
    await tx.query("UPDATE memberships SET role = 'admin' WHERE org_id = $1 AND user_id = $2", [
      input.orgId,
      input.toUserId,
    ]);
  });
}

/**
 * Removes someone from an organization.
 *
 * Two refusals, both from §10.7 5A.5 ("Removing the last admin or owner is
 * refused; transfer ownership first"):
 *
 * - the owner cannot be removed — ownership is transferred, or the organization
 *   is deleted through its own re-authenticated flow;
 * - the last admin cannot be removed, or the organization would have nobody who
 *   could invite, revoke a key, or fix it.
 *
 * Both are checked inside the transaction that does the delete, so two admins
 * removing each other simultaneously cannot both succeed.
 */
export async function removeMembership(
  db: Db,
  input: { orgId: string; userId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const org = await tx.query<{ owner_user_id: string | null }>(
      "SELECT owner_user_id FROM orgs WHERE id = $1 FOR UPDATE",
      [input.orgId]
    );
    if (org.rows.length === 0) {
      throw new OwnershipError("no-org", "no such organization");
    }
    if (org.rows[0].owner_user_id === input.userId) {
      throw new OwnershipError("is-owner", "the owner cannot be removed — transfer ownership first");
    }
    const current = await tx.query<{ role: Role }>(
      "SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2",
      [input.orgId, input.userId]
    );
    if (current.rows.length === 0) {
      return; // already gone; removing twice is not an error
    }
    if (current.rows[0].role === "admin") {
      const admins = await tx.query<{ total: string | number }>(
        "SELECT COUNT(*) AS total FROM memberships WHERE org_id = $1 AND role = 'admin'",
        [input.orgId]
      );
      if (Number(admins.rows[0]?.total ?? 0) <= 1) {
        throw new OwnershipError("last-admin", "an organization must keep at least one admin");
      }
    }
    await tx.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [input.orgId, input.userId]);
  });
}
