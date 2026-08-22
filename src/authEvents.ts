import type { Db } from "./db.js";
import { keyedHash } from "./authCrypto.js";

/**
 * The authentication audit log — PATHWAYS "Security and abuse-resistance
 * baseline" item 7 ("redacted structured audit logs for authentication…"),
 * which the security release gate still records as outstanding.
 *
 * **Redacted by construction, not by discipline.** The caller passes the real
 * address and the real IP; this module hashes both before anything is written.
 * There is no code path that stores either, so no future caller can accidentally
 * introduce one, and the table cannot become a list of who tried to sign in and
 * from where.
 *
 * **Never throws.** An audit write that fails must not turn a sign-in into an
 * error — that would make the log a single point of failure for the product.
 * A failure is logged and swallowed, and the loud version of that problem is
 * the operational alert on an empty log, not a 500 for a customer.
 */

export type AuthEventKind =
  | "magic-link-requested"
  | "magic-link-sent"
  | "magic-link-refused"
  | "magic-link-consumed"
  | "magic-link-invalid"
  | "challenge-issued"
  | "challenge-failed"
  | "github-started"
  | "github-callback"
  | "github-refused"
  | "signed-out"
  /**
   * One browser ended from the account page, which is not the same event as
   * signing out: the request came from a *different* session than the one that
   * died. After a lost laptop, "which browser ended this, and when" is the
   * question, and one kind covering both cannot answer it.
   */
  | "session-revoked"
  | "session-rejected"
  /**
   * A session minted by the local development door, which skips proving the
   * address. Its own kind rather than `magic-link-consumed`, because a log that
   * cannot tell "clicked a link we emailed" from "pressed a button on a laptop"
   * is a log that cannot answer the one question it exists for. The door itself
   * cannot open on a deployment — `web/lib/devSignIn.ts`.
   */
  | "dev-signin"
  // Organization-shaped events. Here rather than in a second log because they
  // answer the same question — "who got access to what, and how" — and
  // splitting them would mean reading two tables to reconstruct one incident.
  | "owner-claimed"
  | "owner-transferred"
  | "invitation-created"
  | "invitation-accepted"
  | "invitation-revoked"
  | "member-removed"
  | "role-changed";

export interface AuthEventInput {
  kind: AuthEventKind;
  outcome: "allowed" | "refused" | "failed";
  /** One short machine-readable reason: `ip_hour`, `expired`, `no-membership`. */
  reason?: string;
  /** Raw address — hashed here, never stored. */
  email?: string;
  /** Raw IP — hashed here, never stored. */
  ip?: string;
  /** The person the event is about. */
  userId?: string;
  /** The person who did it, when that is somebody else — an admin, an operator. */
  actorUserId?: string;
  orgId?: string;
  sessionId?: string;
}

export async function recordAuthEvent(
  db: Db,
  input: AuthEventInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO auth_events (kind, outcome, reason, subject_hash, ip_hash, user_id, actor_user_id, org_id, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.kind,
        input.outcome,
        (input.reason ?? "").slice(0, 100),
        input.email ? keyedHash("audit-address", input.email, env) : "",
        input.ip ? keyedHash("audit-ip", input.ip, env) : "",
        input.userId ?? null,
        input.actorUserId ?? null,
        input.orgId ?? null,
        input.sessionId ?? null,
      ]
    );
  } catch (err) {
    console.error("auth event write failed:", err instanceof Error ? err.message : String(err));
  }
}

export interface AuthEventRow {
  at: string;
  kind: string;
  outcome: string;
  reason: string;
  subjectHash: string;
  ipHash: string;
  userId: string | null;
}

/** Newest first, for the operator console's security view. */
export async function recentAuthEvents(db: Db, limit = 50): Promise<AuthEventRow[]> {
  const rows = await db.query<{
    at: string | Date;
    kind: string;
    outcome: string;
    reason: string;
    subject_hash: string;
    ip_hash: string;
    user_id: string | null;
  }>(
    `SELECT at, kind, outcome, reason, subject_hash, ip_hash, user_id
       FROM auth_events ORDER BY at DESC, id DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return rows.rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    kind: r.kind,
    outcome: r.outcome,
    reason: r.reason,
    // Twelve characters is enough to say "the same one again" and useless for
    // anything else.
    subjectHash: r.subject_hash.slice(0, 12),
    ipHash: r.ip_hash.slice(0, 12),
    userId: r.user_id,
  }));
}

export interface AccountEvent {
  at: string;
  kind: string;
  outcome: string;
}

/**
 * What has happened to one person's account, for that person to read.
 *
 * **Three columns, and the omissions are the design.** No hashes: they are
 * meaningless to a customer and they are the only part of this table that is
 * derived from a secret, so a page that renders them is a page that leaks
 * keyspace for nothing. No `reason`: the reasons are machine strings written for
 * an operator (`ip_hour`, `no-linked-account`, `all:3`), and showing them turns
 * an account page into a support ticket. The page turns `kind` and `outcome`
 * into a sentence.
 *
 * **Scoped by `user_id`, and `actor_user_id` is deliberately not included.**
 * The two differ where an admin acted *on* somebody — a role change, a removal —
 * and those belong on the organization's audit, not on the actor's own account
 * page. What this answers is "what happened to me".
 */
export async function accountEvents(db: Db, userId: string, limit = 10): Promise<AccountEvent[]> {
  const rows = await db.query<{ at: string | Date; kind: string; outcome: string }>(
    `SELECT at, kind, outcome FROM auth_events
      WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT $2`,
    [userId, Math.max(1, Math.min(100, limit))]
  );
  return rows.rows.map((r) => ({ at: new Date(r.at).toISOString(), kind: r.kind, outcome: r.outcome }));
}
