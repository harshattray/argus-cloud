import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Subscription revenue — the record reconciliation was missing.
 *
 * The $59/mo subscription is the larger half of the business and nothing in
 * the schema knew it existed. `plan_allotment` grants carry
 * `price_microdollars = 0`, correctly — the allowance is not sold, the
 * subscription is — so every dollar of provider cost funded by that allowance
 * had no revenue to sit against and was charged to pack margin instead.
 *
 * This module owns the write side. `reconcile.ts` reads it and never writes.
 *
 * **Step 7 populates this from Paddle.** Until then the only writer is the
 * test suite and, when the webhook route lands, `webhooks.ts` — never a manual
 * "looks paid" flag (PATHWAYS §3, payment failure safe state).
 */

export interface SubscriptionPeriodInput {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  priceMicrodollars: number;
  /** MoR event id — makes the record idempotent under webhook retries. */
  sourceRef?: string;
  /**
   * What the processor kept. Omit when it has not told us yet: an omitted fee
   * is reported as unrecorded, not as zero, because a margin figure that
   * quietly assumes free payment processing is exactly the fabricated
   * economics Doctrine 2 forbids.
   */
  feeMicrodollars?: number;
}

/** Records a paid period. Returns null when sourceRef was already recorded. */
export async function recordSubscriptionPeriod(
  db: Db,
  input: SubscriptionPeriodInput
): Promise<string | null> {
  const id = randomUUID();
  const result = await db.query<{ id: string }>(
    `INSERT INTO subscription_periods
       (id, org_id, period_start, period_end, price_microdollars, fee_microdollars, fee_recorded, source_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source_ref) DO NOTHING
     RETURNING id`,
    [
      id,
      input.orgId,
      input.periodStart.toISOString(),
      input.periodEnd.toISOString(),
      input.priceMicrodollars,
      input.feeMicrodollars ?? 0,
      input.feeMicrodollars !== undefined,
      input.sourceRef ?? null,
    ]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Reduces a period's revenue by a confirmed refund or chargeback.
 *
 * The row is amended rather than deleted. A refunded month still cost us the
 * provider dollars its credits bought, and a report that made the revenue
 * disappear while the cost stayed would show a loss with no explanation in it.
 * Clamped at the price so repeated processor events cannot drive revenue
 * negative.
 */
export async function refundSubscriptionPeriod(
  db: Db,
  periodId: string,
  refundMicrodollars: number
): Promise<void> {
  await db.query(
    `UPDATE subscription_periods
     SET refunded_microdollars = LEAST(price_microdollars, refunded_microdollars + $1)
     WHERE id = $2`,
    [refundMicrodollars, periodId]
  );
}
