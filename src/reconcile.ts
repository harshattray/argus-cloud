import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";

/**
 * Monthly reconciliation (Economics Doctrine rule 5): measured provider
 * spend (usage_events) vs credit revenue (pack grants), gross margin, and
 * an alert when margin drops below 50% — the trigger for the reprice
 * runbook before the next pack sells.
 */

export const MARGIN_ALERT_THRESHOLD = 0.5;

export interface ReconciliationReport {
  month: string;
  providerSpendMicrodollars: number;
  packRevenueMicrodollars: number;
  packsSold: number;
  chargedAnalyses: number;
  grossMargin: number | null; // null when there was no revenue
  alerted: boolean;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();
  return { start, end };
}

export async function reconcileMonth(db: Db, month: string, alert: Alert): Promise<ReconciliationReport> {
  const { start, end } = monthRange(month);

  const spendRow = (
    await db.query<{ total: string | number | null; analyses: string | number }>(
      `SELECT COALESCE(SUM(cost_microdollars), 0) AS total,
              COUNT(*) FILTER (WHERE status = 'charged' AND pass IN ('analysis', 'deep')) AS analyses
       FROM usage_events WHERE created_at >= $1 AND created_at < $2`,
      [start, end]
    )
  ).rows[0];

  const revenueRow = (
    await db.query<{ total: string | number | null; packs: string | number }>(
      `SELECT COALESCE(SUM(price_microdollars), 0) AS total, COUNT(*) AS packs
       FROM credit_grants WHERE kind = 'pack_purchase' AND created_at >= $1 AND created_at < $2`,
      [start, end]
    )
  ).rows[0];

  const spend = Number(spendRow?.total ?? 0);
  const revenue = Number(revenueRow?.total ?? 0);
  const margin = revenue > 0 ? (revenue - spend) / revenue : null;
  const alerted = margin !== null && margin < MARGIN_ALERT_THRESHOLD;
  if (alerted) {
    alert(
      `Normascope reconciliation ${month}: gross margin ${(margin! * 100).toFixed(1)}% is below ${MARGIN_ALERT_THRESHOLD * 100}% ` +
        `(revenue $${(revenue / 1e6).toFixed(2)}, provider spend $${(spend / 1e6).toFixed(2)}). ` +
        `Run the reprice runbook before the next pack sells.`
    );
  }
  return {
    month,
    providerSpendMicrodollars: spend,
    packRevenueMicrodollars: revenue,
    packsSold: Number(revenueRow?.packs ?? 0),
    chargedAnalyses: Number(spendRow?.analyses ?? 0),
    grossMargin: margin,
    alerted,
  };
}
