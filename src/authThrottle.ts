import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";
import { keyedHash, subnetOf } from "./authCrypto.js";
import { deliverOpsSignal } from "./opsAlerts.js";

/**
 * Every ceiling that applies **before** anyone is authenticated — FUTURENORMA
 * §4 Step 6 ("Magic links are an outbound-email budget"), PATHWAYS Pathway 5.
 *
 * **The thing being defended.** A magic link means anyone on the internet can
 * make us send mail to an address they chose. Three separate harms, and only
 * one of them is money:
 *
 * 1. **Someone else's inbox.** An attacker who wants to bombard a real person
 *    does not need an account, a payment method, or a vulnerability. They need
 *    a form and a loop.
 * 2. **Our sending reputation.** Mail nobody asked for, sent at volume, is how
 *    a domain gets classified as a spam source — and after that our *own*
 *    customers' links stop arriving. This is the expensive one, and it is
 *    expensive whether or not the sends were free.
 * 3. **The bill.** Least of the three at launch: Resend's free plan caps a day
 *    at 100 and a month at 3,000 with **no overage billing**, so excess sends
 *    are rejected rather than charged. A paid plan changes that — Resend allows
 *    overage up to 5× the monthly quota by default — so the day this moves to a
 *    paid plan, the ceiling below is the only thing between an attacker and an
 *    invoice.
 *
 * **The launch ceiling is deliberately half the provider's free day.** 50, not
 * 100. The provider limit is a backstop that fails by rejecting our sends; ours
 * is a control that fails by telling us. Wanting the first sign of an attack to
 * be our own alert rather than a support ticket is the whole argument.
 *
 * **In the database, not in memory.** Same reason as `rateLimit.ts`: the
 * deployment is serverless, so a counter in module scope caps one instance and
 * the platform decides how many exist. A global daily budget held in process
 * memory is not a global anything. `test/authAbuse.test.mjs` runs 20 real
 * processes at one budget, and runs the in-memory version through the same
 * harness so the check is known to have teeth.
 *
 * **Attempts are counted, not deliveries.** A send that throws still consumed
 * its slot, and nothing is released. The reason is that we cannot know what
 * actually happened: a provider can accept a message and fail on the response,
 * so "the send errored" does not mean "no mail was sent". Releasing the slot
 * would risk sending twice what the budget says. The cost of this choice is
 * real and worth stating — a broken provider burns the day's allowance and
 * blocks legitimate sign-ins — which is why a send failure is itself an
 * operational alert, not a logged line.
 */

// ---------------------------------------------------------------------------
// The ceilings
// ---------------------------------------------------------------------------

export type EmailScope =
  | "global_day"
  | "subnet_hour"
  | "ip_hour"
  | "address_day"
  | "address_cooldown"
  // Invitation sends. PATHWAYS §10.7 5A.13 asks for "a per-invitation and
  // per-organization invitation budget **in addition to** the global
  // magic-link budget" — an admin with a compromised session must not be able
  // to turn the invite form into a mailer, and the global budget alone would
  // let them do it by spending everyone else's day.
  | "invite_org_day"
  | "invite_address_day"
  // OAuth starts. Cheap for us and not free for GitHub; an unbounded start
  // endpoint is a redirect amplifier pointed at somebody else's service.
  | "oauth_start_ip_hour";

export interface Ceiling {
  scope: EmailScope;
  windowSeconds: number;
  limit: number;
  /** What a refusal is about, for an operator reading the table or the alert. */
  label: string;
}

const HOUR = 3600;
const DAY = 86400;

/**
 * The ladder is climbed in **two phases**, and which ceiling sits in which
 * phase is a security decision rather than an implementation detail.
 *
 * - **Request phase** — per-IP and per-subnet. Taken for every request that
 *   asks for a link, whatever address it names and whether or not that address
 *   can sign in. This is what bounds *enumeration*: asking for a link is the
 *   only way to probe addresses, and an unbounded prober would otherwise cost
 *   nothing to run.
 * - **Send phase** — the global daily budget and the two per-recipient
 *   ceilings. Taken only once we know an email is actually going out.
 *
 * **The order matters and this is the bug it avoids.** With one combined
 * reservation, a script naming ten thousand addresses that have no account
 * would consume the global daily budget for mail that was never sent — and the
 * day's real sign-ins would fail. The ceiling meant to stop abuse would be the
 * mechanism of the outage. Splitting it means junk requests are paid for out of
 * the attacker's own IP allowance, and the send budget only ever counts sends.
 */
export const DEFAULT_CEILINGS: Ceiling[] = [
  // Ordered as they are taken, request phase first. The order within each phase
  // must stay fixed — see `takeAll`.
  {
    // A subnet is the smallest unit that costs real money to acquire in bulk.
    // Set above the per-IP ceiling so an office behind one NAT is not throttled
    // by a colleague, while a rented /24 still hits a wall.
    scope: "subnet_hour",
    windowSeconds: HOUR,
    limit: 20,
    label: "sign-in requests from one network",
  },
  {
    scope: "ip_hour",
    windowSeconds: HOUR,
    limit: 10,
    label: "sign-in requests from one address",
  },
  {
    // The whole internet, per UTC day. Half of Resend's free-plan day.
    scope: "global_day",
    windowSeconds: DAY,
    limit: 50,
    label: "the daily sign-in email budget",
  },
  {
    // Per recipient, per day. Five is more than anyone needs and far below
    // "bombardment": a person who genuinely loses five links in a day can ask
    // an admin, and the alternative is an inbox someone else controls.
    scope: "address_day",
    windowSeconds: DAY,
    limit: 5,
    label: "sign-in emails to one address today",
  },
  {
    // The cooldown. One link per ten minutes to a given address, which is the
    // control that actually protects a person's inbox — the daily cap bounds
    // the volume, this bounds the *rate* a single inbox can be made to receive.
    scope: "address_cooldown",
    windowSeconds: 600,
    limit: 1,
    label: "sign-in emails to one address",
  },
  {
    // Invitations, per organization per day. Generous for onboarding a team,
    // bounded for a compromised admin session.
    scope: "invite_org_day",
    windowSeconds: DAY,
    limit: 30,
    label: "invitations from one organization today",
  },
  {
    // The same person may not be invited repeatedly, whoever is inviting them.
    scope: "invite_address_day",
    windowSeconds: DAY,
    limit: 3,
    label: "invitations to one address today",
  },
  {
    scope: "oauth_start_ip_hour",
    windowSeconds: HOUR,
    limit: 30,
    label: "GitHub sign-in attempts from one address",
  },
];

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  // A malformed override must never silently disable a ceiling.
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const ENV_VAR: Record<EmailScope, string> = {
  global_day: "AUTH_EMAIL_DAILY_BUDGET",
  subnet_hour: "AUTH_EMAIL_SUBNET_HOURLY",
  ip_hour: "AUTH_EMAIL_IP_HOURLY",
  address_day: "AUTH_EMAIL_ADDRESS_DAILY",
  address_cooldown: "AUTH_EMAIL_ADDRESS_PER_WINDOW",
  invite_org_day: "AUTH_INVITE_ORG_DAILY",
  invite_address_day: "AUTH_INVITE_ADDRESS_DAILY",
  oauth_start_ip_hour: "AUTH_OAUTH_START_IP_HOURLY",
};

export function emailCeilings(env: NodeJS.ProcessEnv = process.env): Ceiling[] {
  return DEFAULT_CEILINGS.map((ceiling) => ({
    ...ceiling,
    limit: envInt(env, ENV_VAR[ceiling.scope], ceiling.limit),
  }));
}

/**
 * How many failures from one network before a challenge is demanded.
 *
 * "Failure" is a refused or invalid attempt — a dead link, an expired one, a
 * throttled request. Not a wrong password, because there is no password.
 *
 * Set well above human fumbling. Someone clicking an old link three times is
 * ordinary; twenty in an hour from one address is a script.
 */
export const CHALLENGE_AFTER_IP_FAILURES = 5;
export const CHALLENGE_AFTER_SUBNET_FAILURES = 20;

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export function windowStartFor(now: Date, windowSeconds: number): Date {
  return new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
}

function retryAfter(windowStart: Date, windowSeconds: number, now: Date): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
}

/** Thrown inside the transaction to roll it back; never escapes this module. */
class CeilingReached extends Error {
  constructor(
    readonly ceiling: Ceiling,
    readonly retryAfterSeconds: number
  ) {
    super("ceiling reached");
  }
}

export interface EmailSubject {
  /** The recipient. Hashed here; never stored raw by this module. */
  email: string;
  /** The caller's IP as `clientIp()` derived it. */
  ip: string;
  /** The sending organization. Only invitations have one. */
  orgId?: string;
}

export interface EmailReservation {
  allowed: boolean;
  /** Which ceiling refused. Absent when allowed. */
  refusedBy?: EmailScope;
  /** Seconds until that ceiling's window rolls over. */
  retryAfterSeconds: number;
  /** Global-day usage after this call, for the alert and the operator view. */
  globalUsed: number;
  globalLimit: number;
}

/** The ceilings paid by any request, before we know if mail is going out. */
export const REQUEST_SCOPES: EmailScope[] = ["subnet_hour", "ip_hour"];
/** The ceilings paid only when an email is actually being sent. */
export const SEND_SCOPES: EmailScope[] = ["global_day", "address_day", "address_cooldown"];
/**
 * An invitation. It pays the **global** budget like every other outbound
 * message — that is what makes the daily number mean "mail we sent" rather than
 * "mail of one kind we sent" — plus its own two ceilings.
 */
export const INVITE_SCOPES: EmailScope[] = ["global_day", "invite_org_day", "invite_address_day"];
export const OAUTH_START_SCOPES: EmailScope[] = ["oauth_start_ip_hour"];

/**
 * Phase one: this caller is allowed to ask.
 *
 * Paid by every request naming any address, real or not, so probing for valid
 * addresses is bounded by the prober's own allowance.
 */
export async function reserveRequest(
  db: Db,
  subject: EmailSubject,
  options: { now?: Date; ceilings?: Ceiling[]; env?: NodeJS.ProcessEnv } = {}
): Promise<EmailReservation> {
  return takeAll(db, subject, REQUEST_SCOPES, options);
}

/**
 * Phase two: an email is going out, and the budget must allow it.
 *
 * Called only once the recipient is known to be someone who can sign in, so
 * every slot this consumes corresponds to a message actually handed to the
 * provider.
 */
export async function reserveSend(
  db: Db,
  subject: EmailSubject,
  options: { now?: Date; ceilings?: Ceiling[]; env?: NodeJS.ProcessEnv } = {}
): Promise<EmailReservation> {
  return takeAll(db, subject, SEND_SCOPES, options);
}

/** An invitation about to be emailed. Requires `orgId`. */
export async function reserveInvite(
  db: Db,
  subject: EmailSubject & { orgId: string },
  options: { now?: Date; ceilings?: Ceiling[]; env?: NodeJS.ProcessEnv } = {}
): Promise<EmailReservation> {
  return takeAll(db, subject, INVITE_SCOPES, options);
}

/** One redirect to GitHub. Sends no mail, so it takes no send-phase slot. */
export async function reserveOauthStart(
  db: Db,
  ip: string,
  options: { now?: Date; ceilings?: Ceiling[]; env?: NodeJS.ProcessEnv } = {}
): Promise<EmailReservation> {
  return takeAll(db, { email: "", ip }, OAUTH_START_SCOPES, options);
}

/**
 * Takes one slot from each of the named ceilings, or none.
 *
 * The counters move inside one transaction in a **fixed order**, for the two
 * reasons `rateLimit.ts` gives and which apply identically here:
 *
 * 1. **Atomicity.** A request refused by the third ceiling must not have spent
 *    the first two. Otherwise an attacker who is guaranteed to be refused can
 *    still exhaust the global budget for everyone else — the denial of service
 *    that a limiter is supposed to prevent, caused by the limiter.
 * 2. **Deadlock.** Concurrent callers take the same row locks; a fixed order
 *    makes them queue instead of deadlocking. The order must never become
 *    conditional on the subject.
 *
 * The conditional upsert (`… DO UPDATE … WHERE used < limit`) is what makes the
 * ceiling hold across processes: the database decides, not a value this process
 * read a moment ago.
 */
async function takeAll(
  db: Db,
  subject: EmailSubject,
  scopes: EmailScope[],
  options: { now?: Date; ceilings?: Ceiling[]; env?: NodeJS.ProcessEnv } = {}
): Promise<EmailReservation> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const all = options.ceilings ?? emailCeilings(env);
  // Filtered from the canonical list rather than passed in, so the order is the
  // declaration order whatever the caller wrote.
  const ceilings = all.filter((c) => scopes.includes(c.scope));
  const globalCeiling = all.find((c) => c.scope === "global_day");
  const subjects = throttleSubjects(subject, env);

  let globalUsed = -1;

  try {
    await db.transaction(async (tx) => {
      for (const ceiling of ceilings) {
        const windowStart = windowStartFor(now, ceiling.windowSeconds);
        if (ceiling.limit < 1) {
          // A configured zero means "send nothing", and the upsert below cannot
          // express it: the INSERT arm would still let the first request of
          // every window through. This is the operator kill switch — setting
          // the budget to 0 pauses sign-in email entirely.
          throw new CeilingReached(ceiling, retryAfter(windowStart, ceiling.windowSeconds, now));
        }
        const result = await tx.query<{ used: number }>(
          `INSERT INTO auth_throttle (scope, subject, window_start, window_seconds, used)
           VALUES ($1, $2, $3, $4, 1)
           ON CONFLICT (scope, subject, window_start) DO UPDATE
             SET used = auth_throttle.used + 1
             WHERE auth_throttle.used < $5
           RETURNING used`,
          [ceiling.scope, subjects[ceiling.scope], windowStart.toISOString(), ceiling.windowSeconds, ceiling.limit]
        );
        if (result.rows.length === 0) {
          throw new CeilingReached(ceiling, retryAfter(windowStart, ceiling.windowSeconds, now));
        }
        if (ceiling.scope === "global_day") {
          globalUsed = Number(result.rows[0].used);
        }
      }
    });
  } catch (err) {
    if (!(err instanceof CeilingReached)) {
      throw err;
    }
    // Recorded after the rollback and on its own, so the operator view still
    // shows pressure the transaction above deliberately erased.
    const windowStart = windowStartFor(now, err.ceiling.windowSeconds);
    await db.query(
      `INSERT INTO auth_throttle (scope, subject, window_start, window_seconds, used, rejected)
       VALUES ($1, $2, $3, $4, 0, 1)
       ON CONFLICT (scope, subject, window_start) DO UPDATE
         SET rejected = auth_throttle.rejected + 1`,
      [err.ceiling.scope, subjects[err.ceiling.scope], windowStart.toISOString(), err.ceiling.windowSeconds]
    );
    return {
      allowed: false,
      refusedBy: err.ceiling.scope,
      retryAfterSeconds: err.retryAfterSeconds,
      globalUsed: await globalDayUsed(db, subjects.global_day, now),
      globalLimit: globalCeiling?.limit ?? 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    globalUsed: globalUsed >= 0 ? globalUsed : await globalDayUsed(db, subjects.global_day, now),
    globalLimit: globalCeiling?.limit ?? 0,
  };
}

/** The five counter keys for one caller. Personal values are hashed. */
function throttleSubjects(subject: EmailSubject, env: NodeJS.ProcessEnv): Record<EmailScope, string> {
  const address = keyedHash("throttle-address", subject.email, env);
  const ip = keyedHash("throttle-ip", subject.ip, env);
  const subnet = keyedHash("throttle-subnet", subnetOf(subject.ip), env);
  return {
    // One shared row for everyone, so the name is a constant rather than a hash.
    global_day: "global",
    subnet_hour: subnet,
    ip_hour: ip,
    address_day: address,
    address_cooldown: address,
    // An organization id is ours, not personal data, so it is not hashed —
    // an operator investigating an invitation flood needs to know which tenant.
    invite_org_day: subject.orgId ?? "unknown",
    invite_address_day: address,
    oauth_start_ip_hour: ip,
  };
}

async function globalDayUsed(db: Db, globalSubject: string, now: Date): Promise<number> {
  const windowStart = windowStartFor(now, DAY);
  const row = await db.query<{ used: number }>(
    "SELECT used FROM auth_throttle WHERE scope = 'global_day' AND subject = $1 AND window_start = $2",
    [globalSubject, windowStart.toISOString()]
  );
  return Number(row.rows[0]?.used ?? 0);
}

/** Today's outbound sign-in email usage, for the operator console. */
export async function emailBudgetStatus(
  db: Db,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<{ used: number; limit: number; usedPercent: number; day: string }> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const limit = emailCeilings(env).find((c) => c.scope === "global_day")?.limit ?? 0;
  const used = await globalDayUsed(db, "global", now);
  return {
    used,
    limit,
    usedPercent: limit > 0 ? (used / limit) * 100 : 0,
    day: now.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Failures, and the challenge they earn
// ---------------------------------------------------------------------------

export type FailureScope = "fail_ip_hour" | "fail_subnet_hour";

/**
 * Records one failed or refused authentication attempt from this caller.
 *
 * Kept apart from the email counters on purpose: a failure costs us nothing to
 * serve, so it must not consume the send budget — otherwise an attacker could
 * exhaust the day's legitimate sign-ins with requests that never sent anything.
 * What failures buy an attacker is a challenge.
 */
export async function recordAuthFailure(
  db: Db,
  ip: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<void> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const windowStart = windowStartFor(now, HOUR).toISOString();
  for (const [scope, value] of [
    ["fail_ip_hour", keyedHash("throttle-ip", ip, env)],
    ["fail_subnet_hour", keyedHash("throttle-subnet", subnetOf(ip), env)],
  ] as const) {
    await db.query(
      `INSERT INTO auth_throttle (scope, subject, window_start, window_seconds, used)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (scope, subject, window_start) DO UPDATE
         SET used = auth_throttle.used + 1`,
      [scope, value, windowStart, HOUR]
    );
  }
}

/**
 * Whether this caller must solve a challenge before we will send anything.
 *
 * Checked *before* the ceilings, so a caller in challenge state cannot consume
 * budget by ignoring it.
 */
export async function challengeRequired(
  db: Db,
  ip: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<boolean> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const windowStart = windowStartFor(now, HOUR).toISOString();
  const rows = await db.query<{ scope: FailureScope; used: number }>(
    `SELECT scope, used FROM auth_throttle
      WHERE window_start = $1 AND ((scope = 'fail_ip_hour' AND subject = $2)
                                OR (scope = 'fail_subnet_hour' AND subject = $3))`,
    [windowStart, keyedHash("throttle-ip", ip, env), keyedHash("throttle-subnet", subnetOf(ip), env)]
  );
  for (const row of rows.rows) {
    const threshold =
      row.scope === "fail_ip_hour" ? CHALLENGE_AFTER_IP_FAILURES : CHALLENGE_AFTER_SUBNET_FAILURES;
    if (Number(row.used) >= threshold) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Telling a human before it matters
// ---------------------------------------------------------------------------

/** The same marks the provider budget uses, for the same reason (§3). */
export const EMAIL_BUDGET_THRESHOLDS = [50, 75, 90, 100];

/**
 * Announces the daily email budget crossing a mark, at most once per mark per
 * day, through the existing operational alert channel.
 *
 * Riding `ops_alerts` rather than `budget_alerts` is deliberate: that table's
 * columns are microdollars, and putting a count of emails into a column named
 * for money is exactly how a fabricated cost figure gets born (Doctrine 2).
 * `ops_alerts` has no such columns and its once-per-period claim is the part
 * worth reusing.
 *
 * Never throws — an alert channel being down must not turn a sign-in into an
 * error.
 */
export async function alertOnEmailBudget(
  db: Db,
  reservation: EmailReservation,
  alert: Alert,
  now: Date = new Date()
): Promise<number | null> {
  if (reservation.globalLimit <= 0) {
    return null;
  }
  const percent = (reservation.globalUsed / reservation.globalLimit) * 100;
  const crossed = EMAIL_BUDGET_THRESHOLDS.filter((t) => percent >= t);
  if (crossed.length === 0) {
    return null;
  }
  const highest = crossed[crossed.length - 1];
  const day = now.toISOString().slice(0, 10);
  const delivery = await deliverOpsSignal(
    db,
    {
      kind: "email-budget",
      subjectId: "global",
      // Day *and* threshold: a new day re-arms every mark, and 90% must not be
      // silenced by 75% having already been sent this morning.
      period: `${day}:${highest}`,
      severity: highest >= 100 ? "critical" : "warning",
      detail:
        `${reservation.globalUsed} of ${reservation.globalLimit} sign-in emails sent today ` +
        `(${percent.toFixed(0)}%). ` +
        (highest >= 100
          ? "No further sign-in email will be sent until the UTC day rolls over. GitHub sign-in, " +
            "existing sessions, reports and CI are unaffected. If this is an attack, look at " +
            "/admin/limits; if it is real demand, raise AUTH_EMAIL_DAILY_BUDGET."
          : "Existing sessions and GitHub sign-in are unaffected."),
    },
    alert,
    now
  );
  return delivery ? highest : null;
}

// ---------------------------------------------------------------------------
// Operator visibility
// ---------------------------------------------------------------------------

export interface ThrottleRow {
  scope: string;
  subject: string;
  windowStart: string;
  used: number;
  rejected: number;
}

/**
 * The busiest and most-refused subjects recently, worst first.
 *
 * `subject` is a keyed hash and stays one here. It is enough to tell "the same
 * address again" from "a hundred different ones", which is the question an
 * operator is actually asking, and it means the operator page cannot leak a
 * list of who tried to sign in.
 */
export async function recentThrottleActivity(db: Db, sinceHours = 24, limit = 50): Promise<ThrottleRow[]> {
  const since = new Date(Date.now() - sinceHours * HOUR * 1000).toISOString();
  const rows = await db.query<{
    scope: string;
    subject: string;
    window_start: string | Date;
    used: number;
    rejected: number;
  }>(
    `SELECT scope, subject, window_start, used, rejected
       FROM auth_throttle WHERE window_start >= $1
      ORDER BY rejected DESC, used DESC, window_start DESC
      LIMIT $2`,
    [since, Math.max(1, Math.min(200, limit))]
  );
  return rows.rows.map((r) => ({
    scope: r.scope,
    subject: r.subject.slice(0, 12),
    windowStart: new Date(r.window_start).toISOString(),
    used: Number(r.used),
    rejected: Number(r.rejected),
  }));
}

/** How long counter rows are kept. Long enough to investigate, not to profile. */
export const THROTTLE_RETENTION_DAYS = 7;

export async function sweepThrottle(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - THROTTLE_RETENTION_DAYS * DAY * 1000).toISOString();
  const rows = await db.query<{ scope: string }>(
    "DELETE FROM auth_throttle WHERE window_start < $1 RETURNING scope",
    [cutoff]
  );
  return rows.rows.length;
}
