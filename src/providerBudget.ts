import type { Db } from "./db.js";
import { computeCostMicrodollars, type TokenUsage } from "./usage.js";
import { addSpend } from "./breaker.js";

/**
 * Provider-dollar reservations (PATHWAYS.md §10.3 "1B.1"–"1B.3"; FUTURENORMA
 * Doctrine 11).
 *
 * **What was wrong.** `breaker.ts` adds a call's cost to the day's total after
 * the call returns, and trips when the total passes the budget. That is
 * detection, not a cap: ten concurrent requests all read the same pre-call
 * total, all see room, and all call the provider. The eleventh is stopped; the
 * ten already in flight are not.
 *
 * **The fix.** Set money aside before the call, sized to the worst that call
 * could cost, and refuse if it does not fit. Settle with the real cost
 * afterwards and release the difference. A reservation is visible to the next
 * request as soon as it is written, so arrival order stops mattering.
 *
 * **Two ledgers, still separate.** Customer credits (`ledger.ts`) are what the
 * customer bought. Provider dollars are what we owe Anthropic. Both are
 * reserved before a call and both are released on failure, but they are not the
 * same money and never net against each other (FUTURENORMA §3, "Customer
 * credits versus AI-provider billing").
 */

// ---------------------------------------------------------------------------
// Hard caps — where the maximum possible cost of one call comes from
// ---------------------------------------------------------------------------

/**
 * A reservation is only as honest as the caps it is derived from. The measured
 * blended cost in `calibration.md` is a *forecast*; it says nothing about the
 * worst case, and authorizing spend against an average is how an average gets
 * exceeded. These are the caps the hosted request path actually enforces.
 *
 * `web/lib/provider.ts` imports them rather than declaring its own, so the
 * number reserved and the number enforced cannot drift apart.
 */
export const HARD_CAPS = {
  /** `max_tokens` on every hosted request. The provider cannot exceed it. */
  maxOutputTokens: 4096,
  /** Ceiling on the assembled user content; `buildUserContent` truncates to it. */
  maxUserContentChars: 12_000,
  /** Ceiling on the system prompt. Asserted against the real prompt in tests. */
  maxSystemPromptChars: 4_000,
  /**
   * Characters per token, deliberately below the real average. Fewer characters
   * per token means more tokens for the same text, so this over-states the bill.
   * Anthropic's English average is nearer 3.5–4; JSON with short keys and
   * punctuation is denser, so 3.0 stays conservative without being alarmist.
   *
   * It is worth not over-doing this. An inflated maximum does not make us
   * safer — it reserves money we were never going to spend, refuses calls that
   * would have been fine, and (since credits are derived from it) charges the
   * customer for headroom that does not exist.
   */
  charsPerToken: 3.0,
} as const;

export function maxInputTokens(): { system: number; user: number } {
  return {
    system: Math.ceil(HARD_CAPS.maxSystemPromptChars / HARD_CAPS.charsPerToken),
    user: Math.ceil(HARD_CAPS.maxUserContentChars / HARD_CAPS.charsPerToken),
  };
}

/**
 * The most one call can cost us, in microdollars. Null for an unpriced model —
 * callers must fail closed on null rather than defaulting to zero (Doctrine 11:
 * "unknown models ... fail closed").
 *
 * The system prompt is priced as a *cache write* (1.25×), the most expensive way
 * it can be billed — it is the cached block, and the write is its worst case.
 * User content is priced as ordinary input, which is what it is. Output is
 * priced at the full `max_tokens`, because the provider is entitled to use all
 * of it.
 */
export function hardMaxCostMicrodollars(model: string, options: { batch?: boolean } = {}): number | null {
  const { system, user } = maxInputTokens();
  const worstCase: TokenUsage = {
    inputTokens: user,
    cacheCreationInputTokens: system,
    cacheReadInputTokens: 0,
    outputTokens: HARD_CAPS.maxOutputTokens,
  };
  return computeCostMicrodollars(model, worstCase, options);
}

// ---------------------------------------------------------------------------
// Credits are derived from cost, never chosen
// ---------------------------------------------------------------------------

/**
 * Which model runs which pass. This lives beside the pricing because **the
 * model is a cost decision** — changing it changes what an operation must
 * charge, and the two must never be edited in different files on different
 * days. `web/lib/provider.ts` reads it rather than declaring its own.
 *
 * Changing a model is a controlled release, not an edit: PATHWAYS §"Provider
 * substitution" requires the calibration fixtures re-run against the candidate
 * and its quality, schema validity and refusal rate compared before cutover.
 * The cost half of that decision is computed here; the quality half is not, and
 * must not be assumed.
 */
export const OPERATIONS = {
  analysis: { model: "claude-sonnet-5" },
  deep: { model: "claude-opus-4-8" },
} as const;

export type Pass = keyof typeof OPERATIONS;

/**
 * Gross margin required at the **worst case**, after payment fees.
 *
 * The rule this encodes, decided 2026-08-10: *credits are relative to the cost
 * we incur, and no scenario may deny profit.* Not "profitable on average" —
 * average profitability is what the measured $0.0164 already gives us, and an
 * average says nothing about the call that costs the most.
 *
 * 0.5 is the conservative analogue of the packs' 64% margin on measured cost. It
 * is a single constant on purpose: raise it and every operation quietly costs
 * more credits, lower it and they cost fewer. Nothing else needs editing.
 */
export const MARGIN_FLOOR = 0.5;

/**
 * How many credits an operation must charge so that even its worst possible
 * call clears `MARGIN_FLOOR`.
 *
 * Rounded **up** to a whole credit, so rounding always favours us — a fraction
 * of a credit of headroom is margin, never a shortfall. Returns null for an
 * unpriced model: if we cannot cost it, we cannot price it, and it must not be
 * sold (Doctrine 11).
 *
 * Deliberately keyed on the pass and the model only — *not* on whether the call
 * runs as a batch. Batch calls cost half, so charging the interactive price
 * means CI traffic earns more margin rather than less. Pricing the discount
 * into the credit would hand the cheapest path the thinnest cushion.
 */
export function creditsRequired(model: string): number | null {
  const hardMax = hardMaxCostMicrodollars(model);
  if (hardMax === null) {
    return null;
  }
  const revenuePerCredit = CREDIT_REVENUE_FLOOR_MICRODOLLARS * (1 - MARGIN_FLOOR);
  return Math.max(1, Math.ceil(hardMax / revenuePerCredit));
}

/** Credits for a pass, using the model that pass actually runs on. */
export function creditsForPass(pass: Pass): number {
  const credits = creditsRequired(OPERATIONS[pass].model);
  if (credits === null) {
    // Unreachable unless someone points an operation at an unpriced model —
    // which the suite fails on, and which must never reach a customer.
    throw new Error(`operation ${pass} is configured with unpriced model ${OPERATIONS[pass].model}`);
  }
  return credits;
}

/**
 * Cheapest per-credit revenue we sell, net of payment fees: `pack_1000` is $55
 * for 1000 credits, and Paddle takes 5% + $0.50, leaving $35.35 — $0.03535 per
 * credit (migrations/007, FUTURENORMA §3). The subscription's included credits
 * are worth more per credit than this, so the cheapest pack is the binding
 * floor: an operation whose hard maximum fits here cannot lose money on any
 * sale we make.
 */
export const CREDIT_REVENUE_FLOOR_MICRODOLLARS = 35_350;

export interface MarginRow {
  pass: Pass;
  model: string;
  credits: number;
  hardMaxMicrodollars: number;
  /** What those credits earn at the cheapest pack, net of payment fees. */
  revenueMicrodollars: number;
  /** Gross margin at the worst case. Negative would mean a loss-making sale. */
  worstCaseMargin: number;
  /** True when the worst case clears MARGIN_FLOOR. Must be true for every row. */
  clearsFloor: boolean;
}

/**
 * Worst-case cost against revenue for every operation we sell (§10.3 "1B.2").
 *
 * Since credits are derived from cost, every row should clear the floor by
 * construction — this is the check that says so out loud, and the suite asserts
 * it. A false row means a model was changed without the price following it,
 * which is the exact failure the derivation exists to prevent.
 */
export function marginReport(passes: Pass[] = ["analysis", "deep"]): MarginRow[] {
  return passes.map((pass) => {
    const model = OPERATIONS[pass].model;
    const hardMax = hardMaxCostMicrodollars(model) ?? Number.POSITIVE_INFINITY;
    const credits = creditsForPass(pass);
    const revenue = credits * CREDIT_REVENUE_FLOOR_MICRODOLLARS;
    return {
      pass,
      model,
      credits,
      hardMaxMicrodollars: hardMax,
      revenueMicrodollars: revenue,
      worstCaseMargin: (revenue - hardMax) / revenue,
      clearsFloor: hardMax <= revenue * (1 - MARGIN_FLOOR),
    };
  });
}

/**
 * What a candidate model would cost and charge, without adopting it. Used to
 * put a model swap in front of a human as numbers rather than a hunch — the
 * cost half of the substitution decision in PATHWAYS §"Provider substitution".
 * It says nothing about quality, which needs the calibration fixtures re-run.
 */
export function quoteModel(model: string): { model: string; hardMaxMicrodollars: number; credits: number } | null {
  const hardMax = hardMaxCostMicrodollars(model);
  const credits = creditsRequired(model);
  return hardMax === null || credits === null ? null : { model, hardMaxMicrodollars: hardMax, credits };
}

// ---------------------------------------------------------------------------
// Reservation, settlement, release
// ---------------------------------------------------------------------------

/** Default life of a reservation. Long enough for a slow call, short enough
 *  that an abandoned worker does not hold capacity for the rest of the day. */
export const RESERVATION_TTL_SECONDS = 15 * 60;

export type BudgetScope = "global-day" | "org-month" | "key-month";

export interface BudgetLimits {
  /**
   * The same daily provider budget the breaker trips on. Always enforced.
   */
  globalDailyMicrodollars: number;
  /**
   * Optional dollar ceilings. Left null, the scope is not enforced — an
   * organization is already bounded by its prepaid credits, and inventing a
   * second number here would be a figure with nothing behind it (Doctrine 2).
   * The scope exists so an operator can narrow one org or one runaway agent
   * key without touching anyone else.
   */
  orgMonthlyMicrodollars?: number | null;
  keyMonthlyMicrodollars?: number | null;
}

export interface ReserveRequest {
  /** Caller-supplied and unique per provider attempt. The idempotency key. */
  reservationId: string;
  orgId: string;
  apiKeyId?: string | null;
  model: string;
  pass: "analysis" | "deep";
  batch?: boolean;
  limits: BudgetLimits;
  now?: Date;
  ttlSeconds?: number;
}

export type ReserveOutcome =
  | { ok: true; reservationId: string; maxMicrodollars: number; expiresAt: Date }
  | {
      ok: false;
      code: "model_not_priced";
      message: string;
    }
  | {
      ok: false;
      code: "budget_exhausted";
      scope: BudgetScope;
      limitMicrodollars: number;
      committedMicrodollars: number;
      outstandingMicrodollars: number;
      requestedMicrodollars: number;
      message: string;
    };

/** Fixed class id for this module's advisory locks; arbitrary, never changed. */
const LOCK_CLASS = 8_314_208;

/** Deterministic 31-bit key for a scope string. Same string, same lock. */
function lockKey(scope: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < scope.length; i++) {
    hash ^= scope.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash & 0x7fff_ffff;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
function utcMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}
function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  return [`${month}-01T00:00:00.000Z`, new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString()];
}

class BudgetExhausted extends Error {
  constructor(
    readonly scope: BudgetScope,
    readonly limit: number,
    readonly committed: number,
    readonly outstanding: number
  ) {
    super("budget exhausted");
  }
}

/**
 * Sets aside the maximum this call could cost, against every configured budget.
 * Returns `ok: false` rather than throwing — a refused reservation is an
 * ordinary outcome that must leave CI green, not an exception.
 *
 * All scopes are checked and the row is written inside one transaction, with an
 * advisory lock per scope taken in a fixed order (global → org → key). The lock
 * is what makes "sum, then decide, then write" atomic across connections; the
 * fixed order is what keeps concurrent requests queueing instead of
 * deadlocking. Both are load-bearing — without the lock this is the same
 * read-then-write race it exists to close, one level up.
 *
 * Committed spend is read from the existing ledgers — `provider_spend_days` for
 * the day, `usage_events` for the month — so there is no second source of truth
 * for what has been spent. This table holds only what is *in flight*.
 */
export async function reserveProviderBudget(db: Db, req: ReserveRequest): Promise<ReserveOutcome> {
  const now = req.now ?? new Date();
  const batch = req.batch ?? false;
  const maxCost = hardMaxCostMicrodollars(req.model, { batch });
  if (maxCost === null) {
    return {
      ok: false,
      code: "model_not_priced",
      message: `model ${req.model} has no verified price — no reservation can be made, so no call is allowed`,
    };
  }

  const day = utcDay(now);
  const month = utcMonth(now);
  const [monthStart, monthEnd] = monthBounds(month);
  const expiresAt = new Date(now.getTime() + (req.ttlSeconds ?? RESERVATION_TTL_SECONDS) * 1000);

  try {
    await db.transaction(async (tx) => {
      const check = async (
        scope: BudgetScope,
        lockScope: string,
        limit: number | null | undefined,
        committedSql: () => Promise<number>,
        outstandingSql: () => Promise<number>
      ) => {
        if (limit === null || limit === undefined) {
          return; // scope not configured — see BudgetLimits
        }
        await tx.query("SELECT pg_advisory_xact_lock($1, $2)", [LOCK_CLASS, lockKey(lockScope)]);
        const committed = await committedSql();
        const outstanding = await outstandingSql();
        if (committed + outstanding + maxCost > limit) {
          throw new BudgetExhausted(scope, limit, committed, outstanding);
        }
      };

      const num = async (sql: string, params: unknown[]): Promise<number> =>
        Number((await tx.query<{ total: string | number | null }>(sql, params)).rows[0]?.total ?? 0);

      await check(
        "global-day",
        `global:${day}`,
        req.limits.globalDailyMicrodollars,
        () => num("SELECT COALESCE(spend_microdollars, 0) AS total FROM provider_spend_days WHERE day = $1", [day]),
        () =>
          num(
            `SELECT COALESCE(SUM(max_microdollars), 0) AS total FROM provider_reservations
             WHERE state = 'reserved' AND day = $1 AND expires_at > $2`,
            [day, now.toISOString()]
          )
      );

      await check(
        "org-month",
        `org:${req.orgId}:${month}`,
        req.limits.orgMonthlyMicrodollars,
        () =>
          num(
            `SELECT COALESCE(SUM(cost_microdollars), 0) AS total FROM usage_events
             WHERE org_id = $1 AND created_at >= $2 AND created_at < $3`,
            [req.orgId, monthStart, monthEnd]
          ),
        () =>
          num(
            `SELECT COALESCE(SUM(max_microdollars), 0) AS total FROM provider_reservations
             WHERE state = 'reserved' AND org_id = $1 AND month = $2 AND expires_at > $3`,
            [req.orgId, month, now.toISOString()]
          )
      );

      if (req.apiKeyId) {
        await check(
          "key-month",
          `key:${req.apiKeyId}:${month}`,
          req.limits.keyMonthlyMicrodollars,
          () =>
            num(
              `SELECT COALESCE(SUM(cost_microdollars), 0) AS total FROM usage_events
               WHERE api_key_id = $1 AND created_at >= $2 AND created_at < $3`,
              [req.apiKeyId, monthStart, monthEnd]
            ),
          () =>
            num(
              `SELECT COALESCE(SUM(max_microdollars), 0) AS total FROM provider_reservations
               WHERE state = 'reserved' AND api_key_id = $1 AND month = $2 AND expires_at > $3`,
              [req.apiKeyId, month, now.toISOString()]
            )
        );
      }

      await tx.query(
        `INSERT INTO provider_reservations
           (id, org_id, api_key_id, model, pass, batch, max_microdollars, state, day, month, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$10)`,
        [
          req.reservationId,
          req.orgId,
          req.apiKeyId ?? null,
          req.model,
          req.pass,
          batch,
          maxCost,
          day,
          month,
          expiresAt.toISOString(),
        ]
      );
    });
  } catch (err) {
    if (err instanceof BudgetExhausted) {
      return {
        ok: false,
        code: "budget_exhausted",
        scope: err.scope,
        limitMicrodollars: err.limit,
        committedMicrodollars: err.committed,
        outstandingMicrodollars: err.outstanding,
        requestedMicrodollars: maxCost,
        message:
          "hosted explain is paused while provider spend is reviewed. Reports, diffs, uploads, and CI are unaffected, and no credits were used.",
      };
    }
    throw err;
  }

  return { ok: true, reservationId: req.reservationId, maxMicrodollars: maxCost, expiresAt };
}

export type SettleOutcome =
  | { ok: true; actualMicrodollars: number; alreadySettled: boolean }
  | { ok: false; code: "unknown_reservation" | "not_reservable"; state?: string };

/**
 * Records what the call really cost and frees the unused part of the
 * reservation. The single writer of provider spend on the settled path —
 * callers must not also call `addSpend`, or the day's total double-counts.
 *
 * Idempotent by construction. The state transition and the spend are one
 * transaction, and the transition is guarded on `state = 'reserved'`, so a
 * retried worker updates nothing and adds nothing; it gets back the amount
 * already settled. This is the "only one terminal transition is valid" rule in
 * §10.3 1B.3, enforced by the database rather than by remembering to check.
 *
 * A reservation that expired while the call was in flight still settles: the
 * money was genuinely spent, and refusing to record it would hide real cost.
 * Expiry stops a reservation being *permission*, not evidence.
 */
export async function settleProviderBudget(
  db: Db,
  reservationId: string,
  actualMicrodollars: number,
  now: Date = new Date()
): Promise<SettleOutcome> {
  return db.transaction(async (tx) => {
    const updated = await tx.query<{ id: string }>(
      `UPDATE provider_reservations
         SET state = 'settled', actual_microdollars = $2, settled_at = $3
       WHERE id = $1 AND state IN ('reserved', 'expired')
       RETURNING id`,
      [reservationId, Math.max(0, Math.round(actualMicrodollars)), now.toISOString()]
    );
    if (updated.rows.length > 0) {
      await addSpend(tx, actualMicrodollars, now);
      return { ok: true, actualMicrodollars, alreadySettled: false };
    }
    const existing = (
      await tx.query<{ state: string; actual_microdollars: string | number | null }>(
        "SELECT state, actual_microdollars FROM provider_reservations WHERE id = $1",
        [reservationId]
      )
    ).rows[0];
    if (!existing) {
      return { ok: false, code: "unknown_reservation" as const };
    }
    if (existing.state === "settled") {
      return { ok: true, actualMicrodollars: Number(existing.actual_microdollars ?? 0), alreadySettled: true };
    }
    return { ok: false, code: "not_reservable" as const, state: existing.state };
  });
}

/**
 * Gives the whole reservation back — the call did not happen, failed, was
 * refused, or returned something we would not accept. Nothing is spent and
 * nothing is recorded as spend. Idempotent for the same reason settle is.
 */
export async function releaseProviderBudget(db: Db, reservationId: string): Promise<{ released: boolean }> {
  const updated = await db.query<{ id: string }>(
    "UPDATE provider_reservations SET state = 'released' WHERE id = $1 AND state = 'reserved' RETURNING id",
    [reservationId]
  );
  return { released: updated.rows.length > 0 };
}

/**
 * Marks abandoned reservations expired so they stop holding capacity. The
 * authorization query already ignores anything past `expires_at`, so this is
 * tidiness and operator visibility rather than correctness — an expired
 * reservation is never permission to spend whether or not the sweeper has run.
 */
export async function sweepExpiredReservations(db: Db, now: Date = new Date()): Promise<number> {
  const swept = await db.query<{ id: string }>(
    "UPDATE provider_reservations SET state = 'expired' WHERE state = 'reserved' AND expires_at <= $1 RETURNING id",
    [now.toISOString()]
  );
  return swept.rows.length;
}

// ---------------------------------------------------------------------------
// Operator visibility
// ---------------------------------------------------------------------------

export interface BudgetStatus {
  scope: BudgetScope;
  limitMicrodollars: number | null;
  committedMicrodollars: number;
  outstandingMicrodollars: number;
  /** Percent of the limit used, committed + outstanding. Null when unlimited. */
  usedPercent: number | null;
}

/**
 * Where the global day budget stands right now — the number the 50/75/90/100%
 * alerts are read from, and what the operator console shows.
 */
export async function globalDayStatus(
  db: Db,
  limitMicrodollars: number,
  now: Date = new Date()
): Promise<BudgetStatus> {
  const day = utcDay(now);
  const committed = Number(
    (
      await db.query<{ total: string | number | null }>(
        "SELECT COALESCE(spend_microdollars, 0) AS total FROM provider_spend_days WHERE day = $1",
        [day]
      )
    ).rows[0]?.total ?? 0
  );
  const outstanding = Number(
    (
      await db.query<{ total: string | number | null }>(
        `SELECT COALESCE(SUM(max_microdollars), 0) AS total FROM provider_reservations
         WHERE state = 'reserved' AND day = $1 AND expires_at > $2`,
        [day, now.toISOString()]
      )
    ).rows[0]?.total ?? 0
  );
  return {
    scope: "global-day",
    limitMicrodollars: limitMicrodollars,
    committedMicrodollars: committed,
    outstandingMicrodollars: outstanding,
    usedPercent: limitMicrodollars > 0 ? ((committed + outstanding) / limitMicrodollars) * 100 : null,
  };
}

/**
 * The same question for one organization's billing month. Read by the alerts in
 * `budgetAlerts.ts`: §10.3 1C requires the 50/75/90/100% warnings for "global
 * **and** organization budgets", and the global day says nothing about a single
 * tenant burning through the ceiling an operator set for it.
 *
 * Committed spend comes from `usage_events` and outstanding from live
 * reservations — the same two sources `reserveProviderBudget` authorizes
 * against, so the warning and the refusal can never disagree.
 */
export async function orgMonthStatus(
  db: Db,
  orgId: string,
  limitMicrodollars: number | null | undefined,
  now: Date = new Date()
): Promise<BudgetStatus> {
  return monthStatus(db, "org-month", "org_id", orgId, limitMicrodollars, now);
}

/** The same, for one API key — the scope that contains a runaway agent. */
export async function keyMonthStatus(
  db: Db,
  apiKeyId: string,
  limitMicrodollars: number | null | undefined,
  now: Date = new Date()
): Promise<BudgetStatus> {
  return monthStatus(db, "key-month", "api_key_id", apiKeyId, limitMicrodollars, now);
}

async function monthStatus(
  db: Db,
  scope: BudgetScope,
  column: "org_id" | "api_key_id",
  subjectId: string,
  limitMicrodollars: number | null | undefined,
  now: Date
): Promise<BudgetStatus> {
  const month = utcMonth(now);
  const [monthStart, monthEnd] = monthBounds(month);
  const num = async (sql: string, params: unknown[]): Promise<number> =>
    Number((await db.query<{ total: string | number | null }>(sql, params)).rows[0]?.total ?? 0);

  const committed = await num(
    `SELECT COALESCE(SUM(cost_microdollars), 0) AS total FROM usage_events
     WHERE ${column} = $1 AND created_at >= $2 AND created_at < $3`,
    [subjectId, monthStart, monthEnd]
  );
  const outstanding = await num(
    `SELECT COALESCE(SUM(max_microdollars), 0) AS total FROM provider_reservations
     WHERE state = 'reserved' AND ${column} = $1 AND month = $2 AND expires_at > $3`,
    [subjectId, month, now.toISOString()]
  );
  const limit = limitMicrodollars ?? null;
  return {
    scope,
    limitMicrodollars: limit,
    committedMicrodollars: committed,
    outstandingMicrodollars: outstanding,
    usedPercent: limit !== null && limit > 0 ? ((committed + outstanding) / limit) * 100 : null,
  };
}

/** Alert thresholds required by FUTURENORMA §3 and PATHWAYS §10.3 1C. */
export const ALERT_THRESHOLDS = [50, 75, 90, 100] as const;

/**
 * The highest threshold a budget has crossed, or null. Callers alert once per
 * threshold per day — this function only says which band the budget is in, it
 * does not decide whether an alert has already been sent.
 */
export function thresholdCrossed(usedPercent: number | null): number | null {
  if (usedPercent === null) {
    return null;
  }
  let crossed: number | null = null;
  for (const threshold of ALERT_THRESHOLDS) {
    if (usedPercent >= threshold) {
      crossed = threshold;
    }
  }
  return crossed;
}
