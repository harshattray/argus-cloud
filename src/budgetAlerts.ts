import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";
import {
  ALERT_THRESHOLDS,
  globalDayStatus,
  orgMonthStatus,
  keyMonthStatus,
  type BudgetStatus,
  type BudgetLimits,
} from "./providerBudget.js";

/**
 * Budget alerts (PATHWAYS.md Pathway 1 item 6 / §10.3 "1C" second half;
 * FUTURENORMA §3: "alert at 50%, 75%, 90%, and 100%").
 *
 * **What was missing.** Spend protection existed at exactly one point — the
 * refusal at 100% — and the operator's first news of a budget was explain
 * pausing. Nothing said the day was half gone while there was still a decision
 * worth making: raise the cap, find the runaway key, or let it stop.
 *
 * **Once per threshold, per period, per subject.** The deployment is
 * serverless, so "have we already sent this?" cannot live in process memory:
 * two instances crossing 75% in the same second would page a human twice. The
 * primary key of `budget_alerts` is the whole of the guarantee. `period` — a UTC
 * day, a billing month, or a funding record — is what re-arms the alerts, so
 * yesterday's 90% never silences today's.
 *
 * **Claim, then deliver.** The claim marks the row delivered before the message
 * is sent, so a second instance evaluating the same threshold finds nothing to
 * claim and stays quiet. Marking it only *after* a successful send would let
 * every concurrent evaluation claim the same row — which is exactly what
 * happens, and what B4 catches.
 *
 * **A failed delivery is retried, not dropped.** A send that throws records the
 * error and re-arms the row immediately; a claim that never resolves at all — a
 * crashed instance — is re-armed after `ALERT_RETRY_AFTER_SECONDS`. The bounded
 * risk is a duplicate alert; the alternative is a lost one, and this module
 * exists to prevent lost ones.
 *
 * **Alerts never fail the customer's call.** Evaluation returns what happened
 * and callers on the request path ignore it. Spend is already bounded by the
 * reservation that ran before this; an alert channel being down must not turn a
 * paid analysis into an error.
 */

export type AlertScope = "global-day" | "org-month" | "key-month" | "provider-balance";

export interface AlertSubject {
  scope: AlertScope;
  /** 'global', an org id, a key id, or the funding id for the balance. */
  subjectId: string;
  /** 'YYYY-MM-DD', 'YYYY-MM', or the funding id. What re-arms the thresholds. */
  period: string;
  /** Human-readable name for the message: "today's provider budget", etc. */
  label: string;
  status: BudgetStatus;
}

export interface AlertDelivery {
  scope: AlertScope;
  subjectId: string;
  period: string;
  /** The threshold named in the message — the highest newly crossed. */
  threshold: number;
  /** Every threshold claimed by this evaluation, lowest first. */
  claimed: number[];
  delivered: boolean;
  error?: string;
}

/**
 * How long a claimed-but-undelivered alert waits before another instance may
 * claim it. It only covers the case where the claimer died mid-send — a send
 * that throws re-arms its row immediately. Two minutes is comfortably longer
 * than any alert transport should take and short enough that a lost alert is
 * still timely.
 */
export const ALERT_RETRY_AFTER_SECONDS = 120;

/** Every threshold at or below the current usage. Lowest first. */
export function thresholdsCrossed(usedPercent: number | null): number[] {
  if (usedPercent === null) {
    return [];
  }
  return ALERT_THRESHOLDS.filter((threshold) => usedPercent >= threshold);
}

function dollars(microdollars: number): string {
  return `$${(microdollars / 1e6).toFixed(2)}`;
}

/**
 * Announces any threshold this subject has newly crossed. Returns null when
 * there is nothing new — the common case, and no rows are written for it.
 *
 * A jump straight from 40% to 95% claims 50, 75 and 90 but sends **one**
 * message, naming 90 and saying which marks it passed on the way. Three pages
 * for one event trains an operator to ignore the channel.
 */
export async function evaluateBudgetAlerts(
  db: Db,
  subject: AlertSubject,
  alert: Alert,
  now: Date = new Date()
): Promise<AlertDelivery | null> {
  const { status } = subject;
  const limit = status.limitMicrodollars;
  if (limit === null || limit <= 0 || status.usedPercent === null) {
    return null; // an unlimited scope has no percentage to cross
  }
  const crossed = thresholdsCrossed(status.usedPercent);
  if (crossed.length === 0) {
    return null;
  }

  const used = status.committedMicrodollars + status.outstandingMicrodollars;
  const stale = new Date(now.getTime() - ALERT_RETRY_AFTER_SECONDS * 1000).toISOString();
  const claimed: number[] = [];
  for (const threshold of crossed) {
    const row = await db.query<{ threshold: number }>(
      `INSERT INTO budget_alerts
         (scope, subject_id, period, threshold, used_percent, limit_microdollars, used_microdollars,
          attempts, first_seen_at, claimed_at, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8, $8)
       ON CONFLICT (scope, subject_id, period, threshold) DO UPDATE
         SET attempts = budget_alerts.attempts + 1,
             used_percent = EXCLUDED.used_percent,
             used_microdollars = EXCLUDED.used_microdollars,
             claimed_at = EXCLUDED.claimed_at,
             delivered_at = EXCLUDED.delivered_at
         WHERE budget_alerts.delivered_at IS NULL AND budget_alerts.claimed_at <= $9
       RETURNING threshold`,
      [
        subject.scope,
        subject.subjectId,
        subject.period,
        threshold,
        status.usedPercent.toFixed(2),
        limit,
        used,
        now.toISOString(),
        stale,
      ]
    );
    if (row.rows.length > 0) {
      claimed.push(threshold);
    }
  }
  if (claimed.length === 0) {
    return null; // every crossed threshold has already reached a human
  }

  const highest = claimed[claimed.length - 1];
  const passed = claimed.slice(0, -1);
  const message =
    `Normascope budget alert — ${subject.label} is at ${status.usedPercent.toFixed(1)}% ` +
    `(${dollars(used)} of ${dollars(limit)}: ${dollars(status.committedMicrodollars)} spent, ` +
    `${dollars(status.outstandingMicrodollars)} reserved for calls in flight). ` +
    `Crossed the ${highest}% mark` +
    (passed.length > 0 ? `, having passed ${passed.map((t) => `${t}%`).join(" and ")} since the last alert` : "") +
    `. ` +
    (highest >= 100
      ? "At 100% no further provider call is authorized; explain pauses until a human clears it, and reports, diffs, uploads, and CI continue."
      : "Reports, diffs, uploads, and CI are unaffected.");

  // Placeholders are generated rather than using `= ANY($n)`: array binding
  // differs between the pg driver and PGlite, and this statement runs on both.
  const mark = async (assignments: string[], values: unknown[]) => {
    const base = [subject.scope, subject.subjectId, subject.period, ...values];
    const slots = claimed.map((_, i) => `$${base.length + i + 1}`).join(", ");
    await db.query(
      `UPDATE budget_alerts SET ${assignments.join(", ")}
       WHERE scope = $1 AND subject_id = $2 AND period = $3 AND threshold IN (${slots})`,
      [...base, ...claimed]
    );
  };

  try {
    alert(message);
  } catch (err) {
    // A send we *know* failed does not wait out the staleness window: the row is
    // re-armed at once and the next evaluation tries again. `claimed_at` is
    // pushed to the epoch rather than cleared so the column stays NOT NULL and
    // the retry condition needs no special case.
    await mark(
      ["delivered_at = NULL", "claimed_at = $4", "last_error = $5"],
      [new Date(0).toISOString(), String((err as Error)?.message ?? err).slice(0, 500)]
    );
    return { ...subjectKey(subject), threshold: highest, claimed, delivered: false, error: String(err) };
  }
  await mark(["last_error = ''"], []);
  return { ...subjectKey(subject), threshold: highest, claimed, delivered: true };
}

function subjectKey(subject: AlertSubject): { scope: AlertScope; subjectId: string; period: string } {
  return { scope: subject.scope, subjectId: subject.subjectId, period: subject.period };
}

// ---------------------------------------------------------------------------
// Provider account balance
// ---------------------------------------------------------------------------

export interface ProviderBalance {
  fundingId: string;
  balanceMicrodollars: number;
  recordedAt: string;
  /** Spend recorded since the funding was entered. */
  usedMicrodollars: number;
  remainingMicrodollars: number;
  usedPercent: number;
}

/**
 * Records what the provider account was funded with. Launch policy is a small
 * preloaded balance with auto-reload off (FUTURENORMA §3), which only works if
 * someone is warned before it empties — otherwise the external balance becomes
 * the limiting failure and the first sign of it is a customer's failed
 * analysis.
 */
export async function recordProviderFunding(
  db: Db,
  funding: { id: string; balanceMicrodollars: number; actor: string; note?: string; now?: Date }
): Promise<void> {
  if (funding.actor.trim().length === 0) {
    throw new Error("a provider funding record must name who entered it");
  }
  await db.query(
    "INSERT INTO provider_fundings (id, balance_microdollars, recorded_at, actor, note) VALUES ($1, $2, $3, $4, $5)",
    [
      funding.id,
      Math.round(funding.balanceMicrodollars),
      (funding.now ?? new Date()).toISOString(),
      funding.actor.trim(),
      funding.note ?? "",
    ]
  );
}

/**
 * How much of the funded balance is gone. Null when no funding has ever been
 * recorded — there is no balance to report, and inventing one would be a figure
 * with nothing behind it (Doctrine 2).
 *
 * Consumption is `provider_spend_days` from the funding date onward, so this
 * reads the same ledger everything else does. It is our record of spend, not the
 * provider's: a discrepancy between the two is exactly what a human should be
 * looking at, and hiding it behind a second estimate would not help.
 */
export async function providerBalanceStatus(db: Db, now: Date = new Date()): Promise<ProviderBalance | null> {
  const funding = (
    await db.query<{ id: string; balance_microdollars: string | number; recorded_at: string | Date }>(
      "SELECT id, balance_microdollars, recorded_at FROM provider_fundings ORDER BY recorded_at DESC, id DESC LIMIT 1"
    )
  ).rows[0];
  if (!funding) {
    return null;
  }
  const recordedAt = new Date(funding.recorded_at).toISOString();
  const used = Number(
    (
      await db.query<{ total: string | number | null }>(
        "SELECT COALESCE(SUM(spend_microdollars), 0) AS total FROM provider_spend_days WHERE day >= $1",
        [recordedAt.slice(0, 10)]
      )
    ).rows[0]?.total ?? 0
  );
  const balance = Number(funding.balance_microdollars);
  return {
    fundingId: funding.id,
    balanceMicrodollars: balance,
    recordedAt,
    usedMicrodollars: used,
    remainingMicrodollars: Math.max(0, balance - used),
    usedPercent: balance > 0 ? (used / balance) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// One call from the request path
// ---------------------------------------------------------------------------

export interface EvaluateAllRequest {
  orgId: string;
  apiKeyId?: string | null;
  limits: BudgetLimits;
  now?: Date;
}

/**
 * Evaluates every budget this request touched, plus the provider balance.
 *
 * Called after a reservation succeeds, because that is the moment committed
 * capacity rises. Scopes with no configured ceiling are skipped rather than
 * given an invented one, so the usual case is two cheap indexed aggregates on a
 * path that already runs several.
 *
 * Never throws: alerting is observation, and a broken alert channel must not
 * fail a call whose spend is already bounded by the reservation.
 */
export async function evaluateAllBudgets(
  db: Db,
  req: EvaluateAllRequest,
  alert: Alert,
  now: Date = new Date()
): Promise<AlertDelivery[]> {
  const deliveries: AlertDelivery[] = [];
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const push = async (subject: AlertSubject) => {
    const delivery = await evaluateBudgetAlerts(db, subject, alert, now);
    if (delivery) {
      deliveries.push(delivery);
    }
  };

  try {
    await push({
      scope: "global-day",
      subjectId: "global",
      period: day,
      label: `today's provider budget (${day} UTC)`,
      status: await globalDayStatus(db, req.limits.globalDailyMicrodollars, now),
    });

    if (req.limits.orgMonthlyMicrodollars != null) {
      await push({
        scope: "org-month",
        subjectId: req.orgId,
        period: month,
        label: `organization ${req.orgId}'s ${month} provider budget`,
        status: await orgMonthStatus(db, req.orgId, req.limits.orgMonthlyMicrodollars, now),
      });
    }

    if (req.apiKeyId && req.limits.keyMonthlyMicrodollars != null) {
      await push({
        scope: "key-month",
        subjectId: req.apiKeyId,
        period: month,
        label: `API key ${req.apiKeyId}'s ${month} provider budget`,
        status: await keyMonthStatus(db, req.apiKeyId, req.limits.keyMonthlyMicrodollars, now),
      });
    }

    const balance = await providerBalanceStatus(db, now);
    if (balance) {
      await push({
        scope: "provider-balance",
        subjectId: "provider",
        period: balance.fundingId,
        label: "the funded provider account balance",
        status: {
          scope: "global-day", // the balance is not a reservation scope; only the numbers are used
          limitMicrodollars: balance.balanceMicrodollars,
          committedMicrodollars: balance.usedMicrodollars,
          outstandingMicrodollars: 0,
          usedPercent: balance.usedPercent,
        },
      });
    }
  } catch {
    // Observation must not break the request path. The reservation that ran
    // before this is what bounds spend; this only decides who gets told.
    return deliveries;
  }
  return deliveries;
}

// ---------------------------------------------------------------------------
// Operator visibility
// ---------------------------------------------------------------------------

export interface AlertRow {
  scope: AlertScope;
  subjectId: string;
  period: string;
  threshold: number;
  usedPercent: number;
  limitMicrodollars: number;
  usedMicrodollars: number;
  attempts: number;
  lastError: string;
  firstSeenAt: string;
  deliveredAt: string | null;
}

export const MAX_ALERT_ROWS = 50;

/** Recent budget alerts, newest first. Undelivered rows are the ones that matter. */
export async function recentAlerts(db: Db, limit: number = MAX_ALERT_ROWS): Promise<AlertRow[]> {
  const rows = await db.query<Record<string, string | number | null>>(
    `SELECT scope, subject_id, period, threshold, used_percent, limit_microdollars, used_microdollars,
            attempts, last_error, first_seen_at, delivered_at
     FROM budget_alerts ORDER BY first_seen_at DESC, threshold DESC LIMIT $1`,
    [Math.max(1, Math.min(MAX_ALERT_ROWS, limit))]
  );
  return rows.rows.map((r) => ({
    scope: String(r.scope) as AlertScope,
    subjectId: String(r.subject_id),
    period: String(r.period),
    threshold: Number(r.threshold),
    usedPercent: Number(r.used_percent),
    limitMicrodollars: Number(r.limit_microdollars),
    usedMicrodollars: Number(r.used_microdollars),
    attempts: Number(r.attempts),
    lastError: String(r.last_error ?? ""),
    firstSeenAt: new Date(r.first_seen_at as string).toISOString(),
    deliveredAt: r.delivered_at ? new Date(r.delivered_at as string).toISOString() : null,
  }));
}

/** Alerts claimed but never put in front of a human — a broken alert channel. */
export async function undeliveredAlertCount(db: Db): Promise<number> {
  return Number(
    (
      await db.query<{ total: string | number }>(
        "SELECT COUNT(*) AS total FROM budget_alerts WHERE delivered_at IS NULL"
      )
    ).rows[0]?.total ?? 0
  );
}
