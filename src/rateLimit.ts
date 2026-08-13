import type { Db } from "./db.js";

/**
 * Request rate limiting (PATHWAYS.md Pathway 1 item 3 / §10.3 "1C").
 *
 * `api_keys.rate_per_minute` has been stored since migration 001 and enforced
 * by nothing. This module enforces it, in the database.
 *
 * **Why not an in-process counter.** The deployment target is serverless. A
 * counter in module scope caps one instance; the platform decides how many
 * instances exist, so the real ceiling is unbounded. The waitlist route's
 * per-IP bucket says as much in its own comment. Anything protecting spend or
 * a tenant boundary has to count somewhere all instances can see.
 *
 * **Two ceilings, not one.** A per-key limit alone is not a limit: an org that
 * can mint keys can mint its way past it. Every request is counted against the
 * key *and* the organization.
 *
 * **Fixed window, stated plainly.** Counting is per calendar minute, not a
 * sliding window. The known consequence is a boundary burst: a caller can
 * spend the tail of one minute and the head of the next, so the worst case over
 * any 60-second span is 2× the limit. That is acceptable for a ceiling whose
 * job is to stop runaway agents and abuse — it is not a throughput guarantee,
 * and it must not be described as one. A sliding window costs a lot more work
 * per request to remove a factor of two from an abuse ceiling.
 *
 * **A rejected request costs no budget.** The counter only advances when the
 * request is let through (`ON CONFLICT ... WHERE allowed < limit`). If refused
 * requests counted, a client retrying hard would push its own recovery past the
 * end of the window it is already inside, and a limiter that punishes retries
 * turns a slow minute into an outage. Rejections are counted separately, for
 * the operator view.
 */

/** Window length. Fixed at a minute because the stored limit is per minute. */
export const WINDOW_SECONDS = 60;

/**
 * Ceilings for keys that do not carry their own `rate_per_minute`.
 *
 * These are abuse ceilings, not product promises, and nothing in pricing
 * depends on them. The sizing argument: a CI job uploads one run per push and
 * explains a bounded handful of frames per run, so legitimate traffic on one
 * key is single digits per minute. 60 leaves two orders of magnitude of
 * headroom for a busy monorepo and still stops a loop. The org ceiling is set
 * above the key ceiling so several honest keys working at once are not
 * throttled by each other, while a fleet of them is still bounded.
 *
 * Both are env-overridable so an incident can be narrowed without a deploy.
 */
export const DEFAULT_KEY_PER_MINUTE = 60;
export const DEFAULT_ORG_PER_MINUTE = 300;

function envLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  // A malformed override must not silently disable the limiter.
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/** How long counter rows are kept, for the operator view. */
export const RETENTION_MINUTES = 7 * 24 * 60;

export interface RateLimitSubject {
  orgId: string;
  apiKeyId: string;
  /** `api_keys.rate_per_minute`; null takes the default. */
  ratePerMinute: number | null;
}

export interface RateLimitOptions {
  /** Test/ops overrides. Omitted, these come from env then the constants. */
  keyLimit?: number;
  orgLimit?: number;
  now?: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Which ceiling refused. Absent when the request was allowed. */
  scope?: "organization" | "key";
  /** The ceiling that applied, so the caller can say something useful. */
  limit: number;
  /** Whole seconds until the current window ends; always >= 1. */
  retryAfterSeconds: number;
}

export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / (WINDOW_SECONDS * 1000)) * WINDOW_SECONDS * 1000);
}

function retryAfterSeconds(windowStart: Date, now: Date): number {
  const endsAt = windowStart.getTime() + WINDOW_SECONDS * 1000;
  return Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000));
}

/** Thrown inside the transaction to roll it back; never escapes this module. */
class LimitReached extends Error {
  constructor(
    readonly scope: "organization" | "key",
    readonly limit: number
  ) {
    super("rate limit reached");
  }
}

/**
 * Counts one request against the organization and the key, and says whether it
 * may proceed. Call this *before* the expensive work, not after.
 *
 * Both counters move inside one transaction, in a fixed order — organization
 * first, then key. Two reasons, both load-bearing:
 *
 * 1. **Atomicity.** If the key is under its ceiling but the org is over, the
 *    rollback leaves neither counter advanced. A request that was refused must
 *    not have spent anything.
 * 2. **Deadlock.** Concurrent requests take the same row locks; taking them in
 *    a fixed order means they queue instead of deadlocking. The order must not
 *    be made conditional on anything.
 *
 * The row lock held between the two statements is what makes concurrent
 * requests count correctly rather than racing — this is the cost of a shared
 * counter, and it is two statements long.
 *
 * One bucket per key across all routes, deliberately: partitioning per route
 * would multiply the real ceiling by the number of routes.
 */
export async function checkRateLimit(
  db: Db,
  subject: RateLimitSubject,
  options: RateLimitOptions = {}
): Promise<RateLimitDecision> {
  const now = options.now ?? new Date();
  const windowStart = windowStartFor(now);
  const retryAfter = retryAfterSeconds(windowStart, now);

  const keyLimit = Math.max(
    0,
    Math.floor(subject.ratePerMinute ?? options.keyLimit ?? envLimit("RATE_LIMIT_KEY_PER_MINUTE", DEFAULT_KEY_PER_MINUTE))
  );
  const orgLimit = Math.max(
    0,
    Math.floor(options.orgLimit ?? envLimit("RATE_LIMIT_ORG_PER_MINUTE", DEFAULT_ORG_PER_MINUTE))
  );

  const buckets: { scope: "organization" | "key"; row: "org" | "key"; subjectId: string; limit: number }[] = [
    { scope: "organization", row: "org", subjectId: subject.orgId, limit: orgLimit },
    { scope: "key", row: "key", subjectId: subject.apiKeyId, limit: keyLimit },
  ];

  try {
    await db.transaction(async (tx) => {
      for (const bucket of buckets) {
        if (bucket.limit < 1) {
          // A configured zero means "no requests", and the conditional upsert
          // below cannot express that: its INSERT arm would still let the first
          // request of every window through.
          throw new LimitReached(bucket.scope, bucket.limit);
        }
        const result = await tx.query<{ allowed: number }>(
          `INSERT INTO rate_limit_windows (scope, subject_id, org_id, window_start, allowed)
           VALUES ($1, $2, $3, $4, 1)
           ON CONFLICT (scope, subject_id, window_start) DO UPDATE
             SET allowed = rate_limit_windows.allowed + 1
             WHERE rate_limit_windows.allowed < $5
           RETURNING allowed`,
          [bucket.row, bucket.subjectId, subject.orgId, windowStart.toISOString(), bucket.limit]
        );
        if (result.rows.length === 0) {
          throw new LimitReached(bucket.scope, bucket.limit);
        }
        if (Number(result.rows[0].allowed) === 1) {
          // First request of a new window for this subject: a natural, bounded
          // moment to drop its expired rows. Inside the transaction, so a
          // failure here fails the request rather than being swallowed —
          // there is no scheduler yet to notice a silent one.
          await tx.query(
            "DELETE FROM rate_limit_windows WHERE scope = $1 AND subject_id = $2 AND window_start < $3",
            [
              bucket.row,
              bucket.subjectId,
              new Date(windowStart.getTime() - RETENTION_MINUTES * 60_000).toISOString(),
            ]
          );
        }
      }
    });
  } catch (err) {
    if (!(err instanceof LimitReached)) {
      throw err;
    }
    // Recorded after the rollback, on its own, so the operator view still shows
    // pressure that the transaction above deliberately erased.
    await db.query(
      `INSERT INTO rate_limit_windows (scope, subject_id, org_id, window_start, allowed, rejected)
       VALUES ($1, $2, $3, $4, 0, 1)
       ON CONFLICT (scope, subject_id, window_start) DO UPDATE
         SET rejected = rate_limit_windows.rejected + 1`,
      [
        err.scope === "organization" ? "org" : "key",
        err.scope === "organization" ? subject.orgId : subject.apiKeyId,
        subject.orgId,
        windowStart.toISOString(),
      ]
    );
    return { allowed: false, scope: err.scope, limit: err.limit, retryAfterSeconds: retryAfter };
  }

  return { allowed: true, limit: keyLimit, retryAfterSeconds: retryAfter };
}

/**
 * The message a refused caller sees. Says what happened, what to do, and
 * nothing about other tenants or internal capacity.
 */
export function rateLimitMessage(decision: RateLimitDecision): string {
  const subject = decision.scope === "organization" ? "This organization" : "This API key";
  return `${subject} has reached its limit of ${decision.limit} requests per minute. Retry in ${decision.retryAfterSeconds}s. No credits were used.`;
}

// ---------------------------------------------------------------------------
// Operator visibility (§10.3 1C item 5). Read-only, aggregate, no key material.
// ---------------------------------------------------------------------------

export interface RateLimitTotals {
  allowed: number;
  rejected: number;
  /** Distinct subjects that were refused at least once in the window. */
  rejectedSubjects: number;
}

export async function rateLimitTotals(db: Db, sinceMinutes = 60, now: Date = new Date()): Promise<RateLimitTotals> {
  const since = new Date(windowStartFor(now).getTime() - sinceMinutes * 60_000).toISOString();
  const row = (
    await db.query<{ allowed: string; rejected: string; subjects: string }>(
      `SELECT COALESCE(SUM(allowed), 0) AS allowed,
              COALESCE(SUM(rejected), 0) AS rejected,
              COUNT(DISTINCT CASE WHEN rejected > 0 THEN scope || ':' || subject_id END) AS subjects
       FROM rate_limit_windows WHERE window_start >= $1`,
      [since]
    )
  ).rows[0];
  return {
    allowed: Number(row?.allowed ?? 0),
    rejected: Number(row?.rejected ?? 0),
    rejectedSubjects: Number(row?.subjects ?? 0),
  };
}

export interface RateLimitSubjectActivity {
  scope: "org" | "key";
  subjectId: string;
  orgId: string;
  allowed: number;
  rejected: number;
  lastSeen: string;
}

export const MAX_SUBJECT_ROWS = 100;

/**
 * Busiest subjects in the recent past, worst first — the "unusual upload
 * volume" surface. Ordered by rejections then by volume, so a runaway agent
 * sorts to the top whether or not it has hit the ceiling yet.
 */
export async function rateLimitBySubject(
  db: Db,
  sinceMinutes = 60,
  now: Date = new Date()
): Promise<RateLimitSubjectActivity[]> {
  const since = new Date(windowStartFor(now).getTime() - sinceMinutes * 60_000).toISOString();
  const result = await db.query<{
    scope: "org" | "key";
    subject_id: string;
    org_id: string;
    allowed: string;
    rejected: string;
    last_seen: string;
  }>(
    `SELECT scope, subject_id, org_id,
            SUM(allowed) AS allowed, SUM(rejected) AS rejected, MAX(window_start) AS last_seen
     FROM rate_limit_windows
     WHERE window_start >= $1
     GROUP BY scope, subject_id, org_id
     ORDER BY SUM(rejected) DESC, SUM(allowed) DESC
     LIMIT ${MAX_SUBJECT_ROWS}`,
    [since]
  );
  return result.rows.map((r) => ({
    scope: r.scope,
    subjectId: r.subject_id,
    orgId: r.org_id,
    allowed: Number(r.allowed),
    rejected: Number(r.rejected),
    lastSeen: new Date(r.last_seen).toISOString(),
  }));
}
