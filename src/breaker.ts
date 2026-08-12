import type { Db } from "./db.js";

/**
 * Global circuit breaker (Economics Doctrine rule 3): a daily provider
 * budget accumulates in the database; breaching it pauses explain
 * everywhere, fires a human alert once, and leaves the rest of the product
 * (uploads, reports, diffs) untouched. The user-facing message is honest.
 */

export const EXPLAIN_PAUSED_MESSAGE =
  "Explain is temporarily paused while we review provider spend. Your reports, diffs, and uploads are unaffected, and no credits were used.";

export type Alert = (message: string) => void;

export async function isTripped(db: Db): Promise<boolean> {
  const result = await db.query<{ tripped_at: string | null }>(
    "SELECT tripped_at FROM breaker_state WHERE id = 1"
  );
  return result.rows[0]?.tripped_at != null;
}

/** Adds measured provider spend for the UTC day; returns the day's total. */
export async function addSpend(db: Db, microdollars: number, now: Date = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const result = await db.query<{ spend_microdollars: string | number }>(
    `INSERT INTO provider_spend_days (day, spend_microdollars) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET spend_microdollars = provider_spend_days.spend_microdollars + $2
     RETURNING spend_microdollars`,
    [day, microdollars]
  );
  return Number(result.rows[0]?.spend_microdollars ?? 0);
}

/**
 * Trips the breaker if the day's spend has reached the budget. Alerts a
 * human exactly once per trip. Returns true when tripped (before or now).
 */
export async function checkAndTrip(
  db: Db,
  dailyBudgetMicrodollars: number,
  alert: Alert,
  now: Date = new Date()
): Promise<boolean> {
  if (await isTripped(db)) {
    return true;
  }
  const day = now.toISOString().slice(0, 10);
  const result = await db.query<{ spend_microdollars: string | number }>(
    "SELECT spend_microdollars FROM provider_spend_days WHERE day = $1",
    [day]
  );
  const spend = Number(result.rows[0]?.spend_microdollars ?? 0);
  if (spend < dailyBudgetMicrodollars) {
    return false;
  }
  const reason = `daily provider budget reached ($${(spend / 1e6).toFixed(2)} of $${(dailyBudgetMicrodollars / 1e6).toFixed(2)})`;
  const tripped = await recordTrip(db, reason, now);
  if (tripped) {
    alert(
      `Normascope explain circuit breaker TRIPPED: daily provider spend $${(spend / 1e6).toFixed(2)} reached the $${(dailyBudgetMicrodollars / 1e6).toFixed(2)} budget. Explain is paused; the product is unaffected. Manual reset required.`
    );
  }
  return true;
}

/**
 * Trips the breaker for a reason other than recorded spend, alerting once.
 *
 * The reason this exists: since provider dollars are reserved *before* a call
 * (`providerBudget.ts`), the day's ceiling is now reached by a **refused
 * reservation**, not by spend arriving after the fact. `checkAndTrip` would
 * never fire in that case — the spend it watches for is exactly the spend the
 * reservation prevented. Hitting the global ceiling must still be sticky and
 * still require a human to clear it (FUTURENORMA §3: a 100% trip stops new
 * provider calls and needs a manual reset), so the refusal trips it directly.
 *
 * Only the global scope may call this. An organization or key hitting its own
 * ceiling is that tenant's problem and must not pause explain for everyone.
 */
export async function tripBreaker(db: Db, reason: string, alert: Alert, now: Date = new Date()): Promise<boolean> {
  if (!(await recordTrip(db, reason, now))) {
    return false; // already tripped — one alert per trip, not per attempt
  }
  alert(
    `Normascope explain circuit breaker TRIPPED: ${reason}. Explain is paused; the product is unaffected. Manual reset required.`
  );
  return true;
}

/**
 * The single writer of a trip: flips `breaker_state` and appends the audit row
 * in one transaction. Returns false when the breaker was already tripped, which
 * is what keeps one incident to one alert and one audit entry.
 *
 * Both halves must land together. A trip with no audit row is an incident with
 * no record of when spending stopped, and an audit row with no trip claims a
 * pause that never happened.
 */
async function recordTrip(db: Db, reason: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx.query<{ id: number }>(
      "UPDATE breaker_state SET tripped_at = $1, reason = $2 WHERE id = 1 AND tripped_at IS NULL RETURNING id",
      [now.toISOString(), reason]
    );
    if (updated.rows.length === 0) {
      return false;
    }
    await tx.query("INSERT INTO breaker_events (action, actor, reason, created_at) VALUES ('tripped', $1, $2, $3)", [
      "system",
      reason,
      now.toISOString(),
    ]);
    return true;
  });
}

/**
 * Manual reset — a human decision, never automatic, and never anonymous
 * (PATHWAYS §10.3 1C: "an audited manual reset").
 *
 * **Why the signature demands a name.** The breaker exists because spend got
 * away from us; clearing it says a person looked and decided it was safe to
 * spend again. A reset with nobody's name on it records that the decision was
 * made but not who made it, which is the one fact anyone reviewing an incident
 * needs. Both fields are required here *and* checked by the database, so there
 * is no path — route, script, or console — that produces an unattributed reset.
 *
 * The audit row is written whether or not the breaker was actually tripped: an
 * operator clearing a breaker that had already been cleared is itself worth
 * seeing, and silently doing nothing would hide a second person acting on the
 * same incident.
 */
export async function resetBreaker(db: Db, audit: { actor: string; reason: string }): Promise<void> {
  const actor = audit?.actor?.trim() ?? "";
  const reason = audit?.reason?.trim() ?? "";
  if (actor.length === 0 || reason.length === 0) {
    throw new Error("resetting the breaker requires an actor and a reason — an unattributed reset is not a control");
  }
  await db.transaction(async (tx) => {
    await tx.query("UPDATE breaker_state SET tripped_at = NULL, reason = '' WHERE id = 1");
    await tx.query("INSERT INTO breaker_events (action, actor, reason) VALUES ('reset', $1, $2)", [actor, reason]);
  });
}

export interface BreakerEvent {
  id: number;
  action: "tripped" | "reset";
  actor: string;
  reason: string;
  createdAt: string;
}

/**
 * The trip-and-reset history, newest first. What the operator page reads.
 *
 * Ordered by `id`, not `created_at`. The identity column is the true sequence;
 * a timestamp can be supplied by the caller, and an incident where the clock
 * disagrees with the order of events is exactly when the log has to be read
 * correctly. The timestamp is still shown — it is just not what sorts.
 */
export async function breakerHistory(db: Db, limit = 50): Promise<BreakerEvent[]> {
  const rows = await db.query<{
    id: string | number;
    action: string;
    actor: string;
    reason: string;
    created_at: string | Date;
  }>("SELECT id, action, actor, reason, created_at FROM breaker_events ORDER BY id DESC LIMIT $1", [
    Math.max(1, Math.min(200, limit)),
  ]);
  return rows.rows.map((r) => ({
    id: Number(r.id),
    action: r.action as "tripped" | "reset",
    actor: r.actor,
    reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
