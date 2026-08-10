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
  const updated = await db.query<{ id: number }>(
    "UPDATE breaker_state SET tripped_at = $1, reason = $2 WHERE id = 1 AND tripped_at IS NULL RETURNING id",
    [now.toISOString(), `daily provider budget reached ($${(spend / 1e6).toFixed(2)} of $${(dailyBudgetMicrodollars / 1e6).toFixed(2)})`]
  );
  if (updated.rows.length > 0) {
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
  const updated = await db.query<{ id: number }>(
    "UPDATE breaker_state SET tripped_at = $1, reason = $2 WHERE id = 1 AND tripped_at IS NULL RETURNING id",
    [now.toISOString(), reason]
  );
  if (updated.rows.length === 0) {
    return false; // already tripped — one alert per trip, not per attempt
  }
  alert(
    `Normascope explain circuit breaker TRIPPED: ${reason}. Explain is paused; the product is unaffected. Manual reset required.`
  );
  return true;
}

/** Manual reset — a human decision, never automatic. */
export async function resetBreaker(db: Db): Promise<void> {
  await db.query("UPDATE breaker_state SET tripped_at = NULL, reason = '' WHERE id = 1");
}
