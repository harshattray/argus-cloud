import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";

/**
 * Monthly reconciliation — what we earned, what it cost, and which pot the
 * cost came out of.
 *
 * **What this used to do, and why it was wrong.** It summed every provider
 * dollar spent in the month and divided by *pack* revenue alone. Subscription
 * revenue was invisible because nothing recorded it, and a charge funded by
 * the monthly allowance or a goodwill credit was counted against packs it had
 * nothing to do with. Both errors push the same way — margin reads far worse
 * than it is — so the alert that exists to stop us selling a pack below cost
 * would have fired on healthy months until someone learned to ignore it. An
 * alert nobody believes is worse than no alert.
 *
 * **Four pots, kept apart** (FUTURENORMA §3, PATHWAYS §10.3 1B):
 *
 * | Funded by | Revenue against it |
 * |---|---|
 * | Monthly allowance (`plan_allotment`) | the subscription period that granted it |
 * | Purchased pack (`pack_purchase`) | that pack's price |
 * | Goodwill grant | none — it is a cost we chose |
 * | Nothing recorded | none — reported separately, never hidden in a total |
 *
 * That last row matters. Usage written before migration 011, or by any path
 * that bypasses `economicPath.ts`, has no funding record. Folding it into one
 * of the other three would be a guess; leaving it out of the total would
 * understate cost. It is reported on its own line so an unexplained number
 * looks like an unexplained number.
 *
 * The whole report is derived from append-only records — subscription periods,
 * grants, usage events and their attribution rows. Running it twice on the
 * same month gives the same answer, and it never writes.
 */

export const MARGIN_ALERT_THRESHOLD = 0.5;

/** One revenue stream, gross to net. */
export interface RevenueLine {
  grossMicrodollars: number;
  refundedMicrodollars: number;
  /** What the merchant of record kept. Zero when nothing has been recorded. */
  feeMicrodollars: number;
  /** gross − refunded − fees. */
  netMicrodollars: number;
  /** Rows in this line whose processor fee has not been reported yet. */
  recordsMissingFees: number;
  count: number;
}

export interface ReconciliationReport {
  month: string;

  subscription: RevenueLine;
  packs: RevenueLine;

  /** Credits given away. No revenue; the provider cost below is the whole story. */
  goodwillGrants: number;
  goodwillCreditsGranted: number;

  /** Provider spend, split by what funded the credits that bought it. */
  cogs: {
    allotmentFundedMicrodollars: number;
    packFundedMicrodollars: number;
    goodwillFundedMicrodollars: number;
    /** Charged spend with no funding record. Investigate, do not average away. */
    unattributedMicrodollars: number;
    totalMicrodollars: number;
  };

  /**
   * Storage, database and serving cost for the month. Not measured by this
   * system — supply it, or it stays zero and `storageMeasured` says so.
   */
  storageMicrodollars: number;
  storageMeasured: boolean;

  /** Meter counts, for reading the month at a glance. */
  chargedAnalyses: number;
  cacheHits: number;
  failedNoCharge: number;
  blockedNoCharge: number;

  contribution: {
    subscriptionMicrodollars: number;
    packMicrodollars: number;
    /** Everything, including goodwill, unattributed spend and storage. */
    totalMicrodollars: number;
  };

  netRevenueMicrodollars: number;
  /** contribution.total ÷ net revenue. Null when the month earned nothing. */
  grossMargin: number | null;
  /**
   * False when any revenue record is still missing its processor fee, which
   * makes every margin above optimistic by that amount.
   */
  feesComplete: boolean;
  alerted: boolean;
}

export interface ReconcileOptions {
  /** Measured infrastructure cost for the month, if you have it. */
  storageMicrodollars?: number;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();
  const end = new Date(Date.UTC(m === 12 ? y! + 1 : y!, m === 12 ? 0 : m!, 1)).toISOString();
  return { start, end };
}

interface RevenueRow {
  gross: string | number | null;
  refunded: string | number | null;
  fees: string | number | null;
  missing_fees: string | number;
  n: string | number;
}

function toLine(row: RevenueRow | undefined): RevenueLine {
  const gross = Number(row?.gross ?? 0);
  const refunded = Number(row?.refunded ?? 0);
  const fees = Number(row?.fees ?? 0);
  return {
    grossMicrodollars: gross,
    refundedMicrodollars: refunded,
    feeMicrodollars: fees,
    netMicrodollars: gross - refunded - fees,
    recordsMissingFees: Number(row?.missing_fees ?? 0),
    count: Number(row?.n ?? 0),
  };
}

function dollars(microdollars: number): string {
  return `$${(microdollars / 1e6).toFixed(2)}`;
}

export async function reconcileMonth(
  db: Db,
  month: string,
  alert: Alert,
  options: ReconcileOptions = {}
): Promise<ReconciliationReport> {
  const { start, end } = monthRange(month);

  // Subscription revenue belongs to the month its period *starts* in — see
  // migrations/011. A period spanning a month boundary is not split.
  const subscriptionRow = (
    await db.query<RevenueRow>(
      `SELECT COALESCE(SUM(price_microdollars), 0) AS gross,
              COALESCE(SUM(refunded_microdollars), 0) AS refunded,
              COALESCE(SUM(fee_microdollars), 0) AS fees,
              COUNT(*) FILTER (WHERE NOT fee_recorded) AS missing_fees,
              COUNT(*) AS n
       FROM subscription_periods
       WHERE period_start >= $1 AND period_start < $2`,
      [start, end]
    )
  ).rows[0];

  const packRow = (
    await db.query<RevenueRow>(
      `SELECT COALESCE(SUM(price_microdollars), 0) AS gross,
              COALESCE(SUM(refunded_microdollars), 0) AS refunded,
              COALESCE(SUM(fee_microdollars), 0) AS fees,
              COUNT(*) FILTER (WHERE NOT fee_recorded) AS missing_fees,
              COUNT(*) AS n
       FROM credit_grants
       WHERE kind = 'pack_purchase' AND created_at >= $1 AND created_at < $2`,
      [start, end]
    )
  ).rows[0];

  const goodwillRow = (
    await db.query<{ n: string | number; credits: string | number | null }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(credits), 0) AS credits
       FROM credit_grants
       WHERE kind = 'goodwill' AND created_at >= $1 AND created_at < $2`,
      [start, end]
    )
  ).rows[0];

  // Cost by funding source. Keyed on the *usage event's* time, not the
  // attribution row's, so a charge and its funding can never land in different
  // months and leave both looking wrong.
  const fundedRows = (
    await db.query<{ grant_kind: string; cost: string | number | null }>(
      `SELECT s.grant_kind, COALESCE(SUM(s.cost_microdollars), 0) AS cost
       FROM usage_credit_sources s
       JOIN usage_events e ON e.id = s.usage_event_id
       WHERE e.created_at >= $1 AND e.created_at < $2
       GROUP BY s.grant_kind`,
      [start, end]
    )
  ).rows;
  const funded = new Map(fundedRows.map((r) => [r.grant_kind, Number(r.cost ?? 0)]));

  const meterRow = (
    await db.query<{
      total: string | number | null;
      analyses: string | number;
      cache_hits: string | number;
      failed: string | number;
      blocked: string | number;
    }>(
      `SELECT COALESCE(SUM(cost_microdollars), 0) AS total,
              COUNT(*) FILTER (WHERE status = 'charged' AND pass IN ('analysis', 'deep')) AS analyses,
              COUNT(*) FILTER (WHERE status = 'cache_hit') AS cache_hits,
              COUNT(*) FILTER (WHERE status = 'failed_no_charge') AS failed,
              COUNT(*) FILTER (WHERE status = 'blocked_no_charge') AS blocked
       FROM usage_events
       WHERE created_at >= $1 AND created_at < $2`,
      [start, end]
    )
  ).rows[0];

  const subscription = toLine(subscriptionRow);
  const packs = toLine(packRow);

  const allotmentCogs = funded.get("plan_allotment") ?? 0;
  const packCogs = funded.get("pack_purchase") ?? 0;
  const goodwillCogs = funded.get("goodwill") ?? 0;
  const totalCogs = Number(meterRow?.total ?? 0);
  // Never negative: attribution rows sum to their event's cost exactly
  // (`attributeCost` gives the rounding remainder away rather than dropping
  // it), so the most this can be is the spend nobody attributed.
  const unattributedCogs = Math.max(0, totalCogs - allotmentCogs - packCogs - goodwillCogs);

  const storageMicrodollars = options.storageMicrodollars ?? 0;
  const storageMeasured = options.storageMicrodollars !== undefined;

  const subscriptionContribution = subscription.netMicrodollars - allotmentCogs;
  const packContribution = packs.netMicrodollars - packCogs;
  const totalContribution =
    subscriptionContribution - goodwillCogs - unattributedCogs - storageMicrodollars + packContribution;

  const netRevenue = subscription.netMicrodollars + packs.netMicrodollars;
  const grossMargin = netRevenue > 0 ? totalContribution / netRevenue : null;
  const feesComplete = subscription.recordsMissingFees === 0 && packs.recordsMissingFees === 0;
  const alerted = grossMargin !== null && grossMargin < MARGIN_ALERT_THRESHOLD;

  if (alerted) {
    alert(
      `Normascope reconciliation ${month}: gross margin ${(grossMargin! * 100).toFixed(1)}% is below ` +
        `${MARGIN_ALERT_THRESHOLD * 100}%. Net revenue ${dollars(netRevenue)} ` +
        `(subscription ${dollars(subscription.netMicrodollars)}, packs ${dollars(packs.netMicrodollars)}); ` +
        `provider cost ${dollars(totalCogs)} (allowance ${dollars(allotmentCogs)}, packs ${dollars(packCogs)}, ` +
        `goodwill ${dollars(goodwillCogs)}, unattributed ${dollars(unattributedCogs)})` +
        (storageMeasured ? `; storage ${dollars(storageMicrodollars)}` : "") +
        `. Run the reprice runbook before the next pack sells.` +
        (feesComplete ? "" : " Processor fees are not fully recorded, so the real margin is lower than this.")
    );
  }

  return {
    month,
    subscription,
    packs,
    goodwillGrants: Number(goodwillRow?.n ?? 0),
    goodwillCreditsGranted: Number(goodwillRow?.credits ?? 0),
    cogs: {
      allotmentFundedMicrodollars: allotmentCogs,
      packFundedMicrodollars: packCogs,
      goodwillFundedMicrodollars: goodwillCogs,
      unattributedMicrodollars: unattributedCogs,
      totalMicrodollars: totalCogs,
    },
    storageMicrodollars,
    storageMeasured,
    chargedAnalyses: Number(meterRow?.analyses ?? 0),
    cacheHits: Number(meterRow?.cache_hits ?? 0),
    failedNoCharge: Number(meterRow?.failed ?? 0),
    blockedNoCharge: Number(meterRow?.blocked ?? 0),
    contribution: {
      subscriptionMicrodollars: subscriptionContribution,
      packMicrodollars: packContribution,
      totalMicrodollars: totalContribution,
    },
    netRevenueMicrodollars: netRevenue,
    grossMargin,
    feesComplete,
    alerted,
  };
}
