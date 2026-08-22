import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { keyedHash, randomToken, tokenHash } from "./authCrypto.js";
import { membershipsFor, type Membership, type Provider, type UserRecord } from "./users.js";

/**
 * Browser sessions — FUTURENORMA §4 Step 6, PATHWAYS §10.7 5A.
 *
 * **A row, not a JWT.** A self-contained signed token cannot be withdrawn
 * before it expires, so revoking a stolen session, removing someone from an
 * organization, or deleting an account would each leave a working credential in
 * a browser until its clock ran out. Every request reads the row, exactly as
 * `findApiKey` does, and revocation takes effect on the next request rather than
 * eventually. The cost is one indexed read per request, which is the same cost
 * the API surface already pays.
 *
 * **The cookie holds a random token; the database holds its hash.** A database
 * dump does not hand over live sessions, matching `api_keys.key_hash` and
 * `share_links.token_hash`.
 */

/** Cookie name. `__Host-` is a browser-enforced promise, not decoration:
 *
 *  - it may only be set with `Secure`, from HTTPS;
 *  - it may not carry a `Domain`, so a subdomain cannot set or read it;
 *  - its `Path` must be `/`.
 *
 * The subdomain rule is the valuable one. Without it, anything ever hosted on a
 * `*.normascope.com` name — a docs site, a status page, a marketing experiment —
 * could set a session cookie the main app would then read.
 *
 * The prefix is dropped in development, because `__Host-` requires HTTPS and
 * `localhost` is not. `sessionCookieName()` is the one place that decides.
 */
export function sessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production" ? "__Host-norma_session" : "norma_session";
}

/**
 * How long a session lasts — the launch defaults in PATHWAYS §10.7 5A.8.
 *
 * Ninety days absolute, thirty days idle. The absolute limit bounds a stolen
 * cookie and is **never extended by renewal**; the idle limit means an
 * abandoned laptop stops being a key within a month. Both are enforced on read,
 * so shortening either takes effect for existing sessions immediately rather
 * than at the next sign-in.
 */
export const SESSION_TTL_DAYS = 90;
export const SESSION_IDLE_DAYS = 30;

/**
 * How fresh a sign-in must be to authorise something destructive — deleting an
 * organization, changing billing, minting or revoking a key (§10.7 5A.8:
 * "fresh proof within 15 minutes").
 *
 * Measured from `reauthenticated_at`, which moves only when someone actually
 * proves who they are again. Ordinary page views must not refresh it, or a
 * person who left a tab open would permanently satisfy a check whose entire
 * purpose is that they should not.
 */
export const RECENT_AUTH_MINUTES = 15;

/**
 * How stale `last_seen_at` may get before a read writes it back.
 *
 * Without this every page view would write a row, which on a report page with a
 * dozen requests behind it is a dozen writes for one visit. Fifteen minutes
 * keeps the idle cutoff accurate to well within its seven days at a fraction of
 * the cost.
 */
const TOUCH_AFTER_SECONDS = 900;

export interface SessionRecord {
  id: string;
  user_id: string;
  method: Provider;
  created_at: string;
  last_seen_at: string;
  reauthenticated_at: string;
  expires_at: string;
}

export interface CreatedSession {
  id: string;
  /** Shown once, to the browser. Only the hash is stored. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  input: { userId: string; method: Provider; ip?: string; userAgent?: string },
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<CreatedSession> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const id = randomUUID();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, method, created_at, last_seen_at, reauthenticated_at,
                           expires_at, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $7, $8)`,
    [
      id,
      input.userId,
      tokenHash(token),
      input.method,
      now.toISOString(),
      expiresAt.toISOString(),
      input.ip ? keyedHash("session-ip", input.ip, env) : "",
      (input.userAgent ?? "").slice(0, 300),
    ]
  );
  return { id, token, expiresAt };
}

export interface ResolvedSession {
  session: SessionRecord;
  user: UserRecord;
  memberships: Membership[];
}

/**
 * The person behind a cookie, or null.
 *
 * Null covers every failure identically — no cookie, unknown token, revoked,
 * expired, idle too long, deleted user. The caller gets one answer and cannot
 * accidentally treat "revoked" as "probably fine".
 *
 * **A session with no memberships still resolves.** PATHWAYS §10.7 5A.4 requires
 * that "a signed-in user with no membership sees no organization data" — which
 * is a different statement from "cannot sign in". Someone who has been invited
 * but has not accepted, or whose last membership was removed, needs a session in
 * order to see the invitation or the empty state. `memberships` comes back empty
 * and every org-scoped query is derived from it, so there is nothing for them to
 * read. Authorization is the membership list, never the existence of a session.
 */
export async function resolveSession(
  db: Db,
  token: string | undefined | null,
  options: { now?: Date } = {}
): Promise<ResolvedSession | null> {
  if (!token) {
    return null;
  }
  const now = options.now ?? new Date();
  const rows = await db.query<
    SessionRecord & {
      revoked_at: string | null;
      email: string;
      display_name: string;
      user_created_at: string;
      last_login_at: string | null;
    }
  >(
    `SELECT s.id, s.user_id, s.method, s.created_at, s.last_seen_at, s.reauthenticated_at,
            s.expires_at, s.revoked_at,
            u.email, u.display_name, u.created_at AS user_created_at, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [tokenHash(token)]
  );
  const row = rows.rows[0];
  if (!row || row.revoked_at) {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return null;
  }
  const idleSeconds = (now.getTime() - new Date(row.last_seen_at).getTime()) / 1000;
  if (idleSeconds > SESSION_IDLE_DAYS * 86_400) {
    return null;
  }

  const memberships = await membershipsFor(db, row.user_id);

  if (idleSeconds > TOUCH_AFTER_SECONDS) {
    await db.query("UPDATE sessions SET last_seen_at = $2 WHERE id = $1", [row.id, now.toISOString()]);
  }

  return {
    session: {
      id: row.id,
      user_id: row.user_id,
      method: row.method,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      reauthenticated_at: row.reauthenticated_at,
      expires_at: row.expires_at,
    },
    user: {
      id: row.user_id,
      email: row.email,
      display_name: row.display_name,
      created_at: row.user_created_at,
      last_login_at: row.last_login_at,
    },
    memberships,
  };
}

/**
 * Replaces the bearer value in the browser without ending the session —
 * §10.7 5A.8: "Rotate the token during renewal; never extend past absolute
 * expiry."
 *
 * **The absolute expiry is not touched, and that is the whole discipline.**
 * Rotation exists so a token that leaked from a log, a proxy, or a shared
 * machine stops working sooner than the session does. If rotation also pushed
 * `expires_at` out, a browser in daily use would hold a credential forever and
 * the ninety-day limit would describe nothing.
 *
 * The session keeps its id, so the account's session list does not sprout a new
 * device every time someone signs in again on the same one.
 *
 * Returns null when the session is gone, revoked or expired — a caller must not
 * be able to resurrect one by rotating it.
 */
export async function rotateSession(
  db: Db,
  sessionId: string,
  options: { now?: Date; reauthenticated?: boolean } = {}
): Promise<{ token: string } | null> {
  const now = options.now ?? new Date();
  const token = randomToken();
  const rows = await db.query<{ id: string }>(
    `UPDATE sessions
        SET token_hash = $2, rotated_at = $3, last_seen_at = $3
            ${options.reauthenticated ? ", reauthenticated_at = $3" : ""}
      WHERE id = $1 AND revoked_at IS NULL AND expires_at > $3
      RETURNING id`,
    [sessionId, tokenHash(token), now.toISOString()]
  );
  return rows.rows.length > 0 ? { token } : null;
}

/**
 * Whether this session proved who it belongs to recently enough for something
 * destructive.
 *
 * Read from `reauthenticated_at`, never from `last_seen_at`. Using the latter
 * would mean "has this tab been open" rather than "is this person here", which
 * is the difference between a control and a formality.
 */
export function hasRecentAuth(session: SessionRecord, now: Date = new Date()): boolean {
  const age = (now.getTime() - new Date(session.reauthenticated_at).getTime()) / 60_000;
  return age <= RECENT_AUTH_MINUTES;
}

/**
 * Ends one session. Idempotent: the first reason recorded is the one kept.
 *
 * **The scope is required, and `null` is what "any session" looks like.** A
 * session id is a UUID somebody hands us, and the account page hands us one out
 * of a form in a browser. Scoped to the signed-in user, the worst a forged id
 * achieves is nothing; unscoped, it ends a stranger's session — the same defect
 * the two Organization revokes had while `/admin` was their only caller, found
 * there before it shipped and not worth discovering twice. Writing `null` is a
 * decision somebody made; a missing argument is one nobody did, so there is no
 * default.
 */
export async function revokeSession(
  db: Db,
  id: string,
  reason: string,
  scope: { userId: string | null }
): Promise<boolean> {
  if (!scope || scope.userId === undefined) {
    // TypeScript already requires it; this catches the caller that is not
    // compiled — a test, a script, a REPL. `revokeApiKey` carries the same guard
    // for the same reason: without it the missing argument reads as "no such
    // session" and sends the reader looking for the wrong thing.
    throw new Error("revokeSession needs a userId — pass null to revoke regardless of owner");
  }
  const params: unknown[] = [id, reason.slice(0, 200)];
  let scoped = "";
  if (scope.userId !== null) {
    params.push(scope.userId);
    scoped = ` AND user_id = $${params.length}`;
  }
  const rows = await db.query<{ id: string }>(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL${scoped}
      RETURNING id`,
    params
  );
  return rows.rows.length > 0;
}

/**
 * Ends every session a person has.
 *
 * What "sign out everywhere" calls, and what an account deletion or a
 * suspected compromise calls. Returns how many were live.
 */
export async function revokeAllSessions(db: Db, userId: string, reason: string): Promise<number> {
  const rows = await db.query<{ id: string }>(
    "UPDATE sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL RETURNING id",
    [userId, reason.slice(0, 200)]
  );
  return rows.rows.length;
}

/**
 * A user-agent string, reduced to something a person recognises.
 *
 * **The list has to be recognisable or it is not a control.** §10.7 5A.8 asks
 * for a "device/browser label", and the reason is what the reader is being asked
 * to do with it: decide which row is the phone they lost. A 200-character
 * user-agent string in a table cell does not answer that, and rendering it
 * verbatim also puts an unbounded attacker-chosen string on the page — the
 * header comes from the client and nothing validates it.
 *
 * So this returns one of a **fixed set of phrases we wrote**, never a substring
 * of the input. Unrecognised is "Unknown browser", which is honest and cannot
 * carry anything through.
 *
 * The matching is deliberately shallow. Browser sniffing is a swamp — every
 * browser claims to be several others, in an order chosen for compatibility with
 * 1998 — so the order below is what makes it work: the impostors are checked
 * before the strings they impersonate. Edge says "Chrome", Chrome says "Safari",
 * and Safari says "Mozilla" like everything else.
 */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.length === 0) {
    return "Unknown browser";
  }

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("chrome") || ua.includes("chromium")
          ? "Chrome"
          : ua.includes("safari")
            ? "Safari"
            : null;

  // iOS before macOS: an iPhone's user agent says "like Mac OS X".
  const platform = ua.includes("iphone")
    ? "iPhone"
    : ua.includes("ipad")
      ? "iPad"
      : ua.includes("android")
        ? "Android"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("windows")
            ? "Windows"
            : ua.includes("linux")
              ? "Linux"
              : null;

  if (browser && platform) {
    return `${browser} on ${platform}`;
  }
  if (browser) {
    return browser;
  }
  if (platform) {
    return platform;
  }
  return "Unknown browser";
}

export interface SessionSummary {
  id: string;
  method: Provider;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** {@link deviceLabel} of the stored user agent — one of our phrases, never theirs. */
  label: string;
  current: boolean;
}

/**
 * The "your sessions" list. Carries no token, no address and no raw user agent.
 *
 * §10.7 5A.8 forbids the address explicitly. The user agent is left out for a
 * quieter reason: it is a client-supplied string, and the only thing the page
 * needs from it is which device this is, which {@link deviceLabel} answers with
 * a phrase of ours.
 */
export async function listSessions(db: Db, userId: string, currentId?: string): Promise<SessionSummary[]> {
  const rows = await db.query<{
    id: string;
    method: Provider;
    created_at: string | Date;
    last_seen_at: string | Date;
    expires_at: string | Date;
    user_agent: string;
  }>(
    // **The three conditions are `resolveSession`'s three, deliberately.**
    // Revoked, past its absolute expiry, or idle too long: a row failing any of
    // them is already dead on the next request, and a list that showed it would
    // be telling somebody a browser is signed in when it is not — the one lie
    // this page exists to prevent. The idle cutoff is the one that is easy to
    // forget, because nothing about the row itself changes when it passes.
    `SELECT id, method, created_at, last_seen_at, expires_at, user_agent
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        AND last_seen_at > now() - ($2 || ' days')::interval
      ORDER BY last_seen_at DESC`,
    [userId, String(SESSION_IDLE_DAYS)]
  );
  return rows.rows.map((r) => ({
    id: r.id,
    method: r.method,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    label: deviceLabel(r.user_agent),
    current: r.id === currentId,
  }));
}

/**
 * Deletes sessions that expired long enough ago to be of no forensic use.
 *
 * Expiry already ends access; this is housekeeping, and it keeps the table from
 * being a growing record of everyone's devices. Thirty days past expiry, so an
 * incident review a month later still has something to read.
 */
export async function sweepSessions(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = await db.query<{ id: string }>("DELETE FROM sessions WHERE expires_at < $1 RETURNING id", [cutoff]);
  return rows.rows.length;
}
