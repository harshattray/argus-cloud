import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";
import { ALERT_RETRY_AFTER_SECONDS } from "./budgetAlerts.js";
import {
  BACKUP_MAX_AGE_HOURS,
  REHEARSAL_MAX_AGE_DAYS,
  recoveryHealth,
  type RecoveryHealth,
} from "./backup.js";

/**
 * Operational alerts (PATHWAYS.md Pathway 1 item 10; §3 "Operations and
 * recovery": "alert on… provider failures, queue growth, storage growth, and
 * data deletion failures").
 *
 * **What was missing.** Every alert in the product was about money.
 * `budgetAlerts.ts` pages a human when spend crosses a threshold, and nothing
 * else did — a backup that never ran, a deletion job that failed halfway
 * through an erasure, a breaker left tripped over a weekend, and a broken alert
 * channel were all silent. Each of those is a state where the product looks
 * healthy from the outside and is not.
 *
 * **Every signal here reads a table something else already writes.** Nothing is
 * estimated and nothing is sampled: a failed deletion job is a `deletion_jobs`
 * row in state `failed`, a stale backup is the absence of a recent `backups`
 * row. That matters because an operational alert that fires on a derived guess
 * teaches an operator to ignore the channel, which is worse than not having it.
 *
 * **Why a second table rather than reusing `budget_alerts`.** The claim-once
 * mechanism is the same and deliberately so — see `migrations/014_backups.sql`.
 * But `budget_alerts` rows carry a threshold, a limit and a percentage, all
 * `NOT NULL`, and none of them mean anything for "last night's backup did not
 * run". Sharing the table would have made four columns optional so that each
 * kind of alert could ignore the other's, which is a worse trade than one
 * repeated `INSERT … ON CONFLICT`. The retry window *is* shared, imported
 * rather than re-declared: one fact, one place.
 */

// ---------------------------------------------------------------------------
// What counts as a problem
// ---------------------------------------------------------------------------

export interface OpsThresholds {
  /** Hours a tripped breaker may sit unreset before it is an incident of its own. */
  breakerUnresetHours: number;
  /**
   * Expired-but-unswept provider reservations tolerated before alerting.
   *
   * Not zero. A reservation expires exactly when a worker is slow, and the
   * sweeper runs on a schedule — a handful in flight is ordinary. A pile of
   * them means workers are dying after reserving, which quietly shrinks the
   * budget everyone else is authorized against.
   */
  leakedReservations: number;
  backupMaxAgeHours: number;
  rehearsalMaxAgeDays: number;
}

export const DEFAULT_OPS_THRESHOLDS: OpsThresholds = {
  breakerUnresetHours: 12,
  leakedReservations: 25,
  backupMaxAgeHours: BACKUP_MAX_AGE_HOURS,
  rehearsalMaxAgeDays: REHEARSAL_MAX_AGE_DAYS,
};

export type OpsAlertKind =
  | "backup-missing"
  | "backup-failed"
  | "rehearsal-stale"
  | "rehearsal-failed"
  | "deletion-failed"
  | "breaker-unreset"
  | "alert-channel-broken"
  | "reservation-leak"
  // Raised by `authThrottle.ts`, not by `collectOpsSignals`. The daily sign-in
  // email budget is consumed on the request path, so the crossing is noticed
  // where it happens rather than by a scheduled sweep — by the time the next
  // sweep ran, the day's budget could be gone.
  | "email-budget";

export type OpsSeverity = "warning" | "critical";

export interface OpsSignal {
  kind: OpsAlertKind;
  subjectId: string;
  /**
   * What re-arms the alert. A UTC day for a condition that persists (a stale
   * backup should say so again tomorrow); the id of the failed thing for a
   * discrete failure (a second failed deletion alerts, re-checking the first
   * does not).
   */
  period: string;
  severity: OpsSeverity;
  /** One sentence an operator can act on, with the numbers in it. */
  detail: string;
}

export interface OpsAlertDelivery {
  kind: OpsAlertKind;
  subjectId: string;
  period: string;
  severity: OpsSeverity;
  delivered: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Collecting the signals
// ---------------------------------------------------------------------------

function hours(n: number): string {
  return n >= 48 ? `${(n / 24).toFixed(1)} days` : `${n.toFixed(1)} hours`;
}

/**
 * Everything currently wrong, in severity-then-kind order. Returns an empty
 * array on a healthy system, which is the common case and costs a handful of
 * indexed reads.
 *
 * Pure observation — it writes nothing and delivers nothing, so it is also what
 * an operator page can call to show the same list without sending anybody a
 * message.
 */
export async function collectOpsSignals(
  db: Db,
  now: Date = new Date(),
  thresholds: OpsThresholds = DEFAULT_OPS_THRESHOLDS
): Promise<OpsSignal[]> {
  const signals: OpsSignal[] = [];
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const health: RecoveryHealth = await recoveryHealth(db, now);

  // --- backups -------------------------------------------------------------
  if (health.backupAgeHours === null || health.backupAgeHours > thresholds.backupMaxAgeHours) {
    signals.push({
      kind: "backup-missing",
      subjectId: "database",
      period: day,
      severity: "critical",
      detail:
        health.lastGoodBackup === null
          ? "no database backup has ever completed. Nothing can be restored."
          : `the newest successful backup finished ${hours(health.backupAgeHours as number)} ago ` +
            `(${health.lastGoodBackup.finishedAt}), past the ${thresholds.backupMaxAgeHours}-hour limit.`,
    });
  }
  if (health.lastBackup?.state === "failed") {
    signals.push({
      kind: "backup-failed",
      subjectId: "database",
      period: health.lastBackup.id,
      severity: "critical",
      detail: `backup ${health.lastBackup.id} failed: ${health.lastBackup.lastError || "no error recorded"}.`,
    });
  }

  // --- restore rehearsal ---------------------------------------------------
  if (health.rehearsalAgeDays === null || health.rehearsalAgeDays > thresholds.rehearsalMaxAgeDays) {
    signals.push({
      kind: "rehearsal-stale",
      subjectId: "database",
      period: month,
      severity: "warning",
      detail:
        health.lastPassedRehearsal === null
          ? "no backup has ever been restored. An unrehearsed backup is a belief, not a backup."
          : `the last passed restore rehearsal was ${(health.rehearsalAgeDays as number).toFixed(0)} days ago, ` +
            `past the ${thresholds.rehearsalMaxAgeDays}-day limit.`,
    });
  }
  if (health.lastRehearsal?.state === "failed") {
    const mismatches = health.lastRehearsal.mismatches ?? [];
    signals.push({
      kind: "rehearsal-failed",
      subjectId: "database",
      period: health.lastRehearsal.id,
      severity: "critical",
      detail:
        `restore rehearsal ${health.lastRehearsal.id} of backup ${health.lastRehearsal.backupId} failed` +
        (mismatches.length > 0
          ? `: ${mismatches.length} table(s) disagreed with the manifest, first ${mismatches[0].table} ` +
            `(expected ${mismatches[0].expected}, restored ${mismatches[0].actual}).`
          : `: ${health.lastRehearsal.lastError || "no error recorded"}.`),
    });
  }

  // --- deletion ------------------------------------------------------------
  //
  // One alert per failed job rather than a count: a failed erasure has a
  // customer behind it and someone has to go and finish it.
  const failedJobs = await db.query<{ id: string; scope: string; target_id: string | null; last_error: string }>(
    "SELECT id, scope, target_id, last_error FROM deletion_jobs WHERE state = 'failed' ORDER BY created_at DESC LIMIT 20"
  );
  for (const job of failedJobs.rows) {
    signals.push({
      kind: "deletion-failed",
      subjectId: job.id,
      period: job.id,
      severity: "critical",
      detail:
        `deletion job ${job.id} (${job.scope}${job.target_id ? ` ${job.target_id}` : ""}) failed: ` +
        `${job.last_error || "no error recorded"}. Rows or objects may still exist.`,
    });
  }

  // --- breaker -------------------------------------------------------------
  //
  // The trip itself already alerted (`breaker.ts`). This is the second alert,
  // for the trip nobody came back to: explain has been paused since, and every
  // hour of that is paid-product downtime.
  const breaker = (
    await db.query<{ tripped_at: string | Date | null; reason: string }>(
      "SELECT tripped_at, reason FROM breaker_state WHERE id = 1"
    )
  ).rows[0];
  if (breaker?.tripped_at) {
    const trippedAt = new Date(breaker.tripped_at);
    const age = (now.getTime() - trippedAt.getTime()) / 3_600_000;
    if (age > thresholds.breakerUnresetHours) {
      signals.push({
        kind: "breaker-unreset",
        subjectId: "global",
        period: trippedAt.toISOString(),
        severity: "critical",
        detail:
          `the explain breaker has been tripped for ${hours(age)} (${breaker.reason || "no reason recorded"}). ` +
          "Hosted AI is paused for every organization until a human resets it.",
      });
    }
  }

  // --- the alert channel itself -------------------------------------------
  //
  // Circular on purpose, and it still helps: a budget alert claimed but never
  // delivered means the transport failed at least once, and this alert goes out
  // through the *same* transport. If it also fails, the ops-check exit code and
  // the operator page still carry it — which is why neither of those is
  // optional. What this catches is an intermittent channel, and that is the
  // failure most likely to go unnoticed.
  const undelivered = Number(
    (
      await db.query<{ total: string | number }>(
        "SELECT COUNT(*) AS total FROM budget_alerts WHERE delivered_at IS NULL"
      )
    ).rows[0]?.total ?? 0
  );
  if (undelivered > 0) {
    signals.push({
      kind: "alert-channel-broken",
      subjectId: "budget-alerts",
      period: day,
      severity: "critical",
      detail: `${undelivered} budget alert(s) were claimed but never delivered. Spend warnings are not reaching anyone.`,
    });
  }

  // --- leaked reservations -------------------------------------------------
  const leaked = Number(
    (
      await db.query<{ total: string | number }>(
        "SELECT COUNT(*) AS total FROM provider_reservations WHERE state = 'reserved' AND expires_at <= $1",
        [now.toISOString()]
      )
    ).rows[0]?.total ?? 0
  );
  if (leaked > thresholds.leakedReservations) {
    signals.push({
      kind: "reservation-leak",
      subjectId: "provider",
      period: day,
      severity: "warning",
      detail:
        `${leaked} provider reservations are past their expiry and unswept (limit ${thresholds.leakedReservations}). ` +
        "Workers are probably dying after reserving; run the sweeper and look at why.",
    });
  }

  const rank: Record<OpsSeverity, number> = { critical: 0, warning: 1 };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity] || a.kind.localeCompare(b.kind));
}

// ---------------------------------------------------------------------------
// Delivering them once
// ---------------------------------------------------------------------------

/**
 * Claims the signal and, if this caller won the claim, sends it.
 *
 * Same protocol as `evaluateBudgetAlerts` and for the same reason: the
 * deployment is serverless, so "have we already told someone?" cannot live in
 * process memory. The row is marked delivered as part of the claim, so a second
 * instance finds nothing to claim and stays quiet; a send that throws re-arms
 * the row immediately, and a claimer that dies mid-send leaves a row another
 * caller may take after {@link ALERT_RETRY_AFTER_SECONDS}.
 *
 * Returns null when the alert has already reached a human this period.
 */
export async function deliverOpsSignal(
  db: Db,
  signal: OpsSignal,
  alert: Alert,
  now: Date = new Date()
): Promise<OpsAlertDelivery | null> {
  const stale = new Date(now.getTime() - ALERT_RETRY_AFTER_SECONDS * 1000).toISOString();
  const claimed = await db.query<{ kind: string }>(
    `INSERT INTO ops_alerts
       (kind, subject_id, period, severity, detail, attempts, first_seen_at, claimed_at, delivered_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $6)
     ON CONFLICT (kind, subject_id, period) DO UPDATE
       SET attempts = ops_alerts.attempts + 1,
           severity = EXCLUDED.severity,
           detail = EXCLUDED.detail,
           claimed_at = EXCLUDED.claimed_at,
           delivered_at = EXCLUDED.delivered_at
       WHERE ops_alerts.delivered_at IS NULL AND ops_alerts.claimed_at <= $7
     RETURNING kind`,
    [signal.kind, signal.subjectId, signal.period, signal.severity, signal.detail, now.toISOString(), stale]
  );
  if (claimed.rows.length === 0) {
    return null;
  }

  const message =
    `Normascope operations alert [${signal.severity}] ${signal.kind} — ${signal.detail}` +
    (signal.severity === "critical" ? " This needs a person." : "");

  const mark = async (assignments: string[], values: unknown[]) =>
    db.query(
      `UPDATE ops_alerts SET ${assignments.join(", ")} WHERE kind = $1 AND subject_id = $2 AND period = $3`,
      [signal.kind, signal.subjectId, signal.period, ...values]
    );

  try {
    alert(message);
  } catch (err) {
    await mark(
      ["delivered_at = NULL", "claimed_at = $4", "last_error = $5"],
      [new Date(0).toISOString(), String((err as Error)?.message ?? err).slice(0, 500)]
    );
    return { ...key(signal), delivered: false, error: String(err) };
  }
  await mark(["last_error = ''"], []);
  return { ...key(signal), delivered: true };
}

function key(signal: OpsSignal): Omit<OpsAlertDelivery, "delivered" | "error"> {
  return { kind: signal.kind, subjectId: signal.subjectId, period: signal.period, severity: signal.severity };
}

export interface OpsCheckResult {
  signals: OpsSignal[];
  deliveries: OpsAlertDelivery[];
  /** True when nothing is wrong. What a scheduled check exits on. */
  healthy: boolean;
}

/**
 * The whole check: collect, then announce anything not already announced.
 *
 * `healthy` reflects the *signals*, not the deliveries. A system with one failed
 * deletion job is unhealthy whether or not this run was the one that sent the
 * message — otherwise a scheduled check would report green on the second run of
 * an unfixed problem.
 */
export async function checkOperationalHealth(
  db: Db,
  alert: Alert,
  now: Date = new Date(),
  thresholds: OpsThresholds = DEFAULT_OPS_THRESHOLDS
): Promise<OpsCheckResult> {
  const signals = await collectOpsSignals(db, now, thresholds);
  const deliveries: OpsAlertDelivery[] = [];
  for (const signal of signals) {
    const delivery = await deliverOpsSignal(db, signal, alert, now);
    if (delivery) {
      deliveries.push(delivery);
    }
  }
  return { signals, deliveries, healthy: signals.length === 0 };
}

// ---------------------------------------------------------------------------
// Operator visibility
// ---------------------------------------------------------------------------

export interface OpsAlertRow {
  kind: OpsAlertKind;
  subjectId: string;
  period: string;
  severity: OpsSeverity;
  detail: string;
  attempts: number;
  lastError: string;
  firstSeenAt: string;
  deliveredAt: string | null;
}

export async function recentOpsAlerts(db: Db, limit = 20): Promise<OpsAlertRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT kind, subject_id, period, severity, detail, attempts, last_error, first_seen_at, delivered_at
     FROM ops_alerts ORDER BY first_seen_at DESC, kind LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return rows.rows.map((r) => ({
    kind: String(r.kind) as OpsAlertKind,
    subjectId: String(r.subject_id),
    period: String(r.period),
    severity: String(r.severity) as OpsSeverity,
    detail: String(r.detail ?? ""),
    attempts: Number(r.attempts ?? 0),
    lastError: String(r.last_error ?? ""),
    firstSeenAt: new Date(r.first_seen_at as string).toISOString(),
    deliveredAt: r.delivered_at ? new Date(r.delivered_at as string).toISOString() : null,
  }));
}

/** Ops alerts claimed but never put in front of a human — the channel is broken. */
export async function undeliveredOpsAlertCount(db: Db): Promise<number> {
  return Number(
    (await db.query<{ total: string | number }>("SELECT COUNT(*) AS total FROM ops_alerts WHERE delivered_at IS NULL"))
      .rows[0]?.total ?? 0
  );
}
