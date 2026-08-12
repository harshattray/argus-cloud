import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";
import { grantCredits } from "./ledger.js";
import { recordSubscriptionPeriod, refundSubscriptionPeriod } from "./subscriptions.js";
import { verifyPaddleSignature, parseEvent, type BillingEvent, type SignatureFailure } from "./paddle.js";

/**
 * Merchant-of-record webhook handling — the only door customer money comes
 * through.
 *
 * FUTURENORMA §3 states the rule plainly: **grant credits only from an
 * idempotently verified payment webhook.** Everything here exists to make that
 * true under the conditions a payment processor actually delivers in — retries,
 * duplicates, out-of-order arrival, and events for things we have never heard
 * of.
 *
 * The order of operations is the security boundary:
 *
 *     verify signature  →  parse  →  claim the event id  →  apply
 *
 * Verification comes first because everything after it treats the body as
 * trustworthy. Claiming the event id comes before applying because that claim
 * is what makes a retry a no-op — and it is a database insert, not a check
 * followed by an insert, so two concurrent deliveries of the same event cannot
 * both pass.
 *
 * **What is not proven yet.** Paddle sandbox needs an account (FUTURENORMA §4
 * Step 7, Harsha's call), so no real delivery has ever reached this code. The
 * signature scheme, the replay window, the idempotency claim and the
 * out-of-order rules are all verified against the suite; the *field paths*
 * inside Paddle's `data` object are followed from the published shape and are
 * the part a sandbox run will correct. They live in `paddle.ts:parseEvent`,
 * alone, for exactly that reason.
 */

export const PACK_EXPIRY_MONTHS = 12;

/**
 * The legacy generic-HMAC helpers, kept because the C5 fixtures and any
 * non-Paddle processor use them. Paddle's own scheme is in `paddle.ts` and
 * signs `ts:body`, not `body` — do not reach for these to verify a Paddle
 * request.
 */
export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signBody(rawBody, secret);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What happened to one delivery.
 *
 * `ok: false` means *do not retry* — the signature was wrong, so the sender is
 * not the processor. Every other outcome is `ok: true` with an `outcome`
 * describing what we did, because a processor that gets a non-2xx retries, and
 * retrying an event we have correctly decided to ignore accomplishes nothing
 * but noise.
 */
export type WebhookOutcome =
  | "applied"
  | "duplicate"
  | "ignored"
  | "unknown_org"
  | "unknown_type"
  | "unknown_product"
  | "stale";

export type WebhookResult =
  | { ok: true; outcome: WebhookOutcome; detail: string; granted?: boolean; grantId?: string }
  | { ok: false; reason: SignatureFailure | "bad_payload"; message: string };

/** The explicit subscription states from PATHWAYS §"Payment failure safe state". */
export type SubscriptionStatus = "none" | "active" | "past_due" | "lapsed" | "refunded";

/**
 * Paddle's subscription statuses, mapped onto ours.
 *
 * `trialing` maps to `active` rather than a state of its own: FUTURENORMA §3
 * says there is no trial at launch, so if one ever appears it is because
 * someone configured it in Paddle, and the safe reading of "Paddle says this
 * subscription is live" is that it is live.
 */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  paused: "lapsed",
  canceled: "lapsed",
  cancelled: "lapsed",
};

export interface HandleOptions {
  /** Overridden by the suite; production passes nothing. */
  now?: Date;
}

/**
 * Verifies, records and applies one Paddle delivery.
 *
 * `rawBody` must be the exact bytes received. A parsed-then-restringified body
 * will not verify (see `paddle.ts`).
 */
export async function handlePaddleWebhook(
  db: Db,
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  options: HandleOptions = {}
): Promise<WebhookResult> {
  const now = options.now ?? new Date();

  const signature = verifyPaddleSignature(rawBody, signatureHeader, secret, now);
  if (!signature.ok) {
    // Nothing is recorded. An unverified body is not evidence of anything, and
    // writing it would let anyone fill `billing_events`.
    return { ok: false, reason: signature.reason, message: "webhook signature verification failed" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "bad_payload", message: "webhook body is not JSON" };
  }

  const event = parseEvent(payload);
  if (!event) {
    return { ok: false, reason: "bad_payload", message: "webhook payload is missing event_id or event_type" };
  }

  // Claim the event id. `ON CONFLICT DO NOTHING` returning no row means this
  // delivery is a duplicate — including the case where a concurrent instance
  // is applying it right now. Claimed as `processing` and amended below, so a
  // crash mid-apply leaves a visible record rather than a silent gap.
  const claim = await db.query<{ event_id: string }>(
    `INSERT INTO billing_events (event_id, provider, event_type, claimed_org_id, occurred_at, outcome)
     VALUES ($1, 'paddle', $2, NULL, $3, 'processing')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event.eventId, event.eventType, event.occurredAt?.toISOString() ?? null]
  );
  if (claim.rows.length === 0) {
    return { ok: true, outcome: "duplicate", detail: "already processed" };
  }

  let result: WebhookResult;
  try {
    result = await applyEvent(db, event, now);
  } catch (err) {
    await finish(db, event.eventId, null, "error", (err as Error).message.slice(0, 500));
    throw err;
  }

  if (result.ok) {
    await finish(db, event.eventId, event.orgId, result.outcome, result.detail);
  }
  return result;
}

async function finish(
  db: Db,
  eventId: string,
  orgId: string | null,
  outcome: string,
  detail: string
): Promise<void> {
  await db.query(
    `UPDATE billing_events SET outcome = $1, detail = $2, claimed_org_id = $3 WHERE event_id = $4`,
    [outcome, detail, orgId, eventId]
  );
}

async function applyEvent(db: Db, event: BillingEvent, now: Date): Promise<WebhookResult> {
  switch (event.eventType) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.activated":
    case "subscription.resumed":
    case "subscription.canceled":
    case "subscription.cancelled":
    case "subscription.paused":
      return applySubscriptionState(db, event);

    case "transaction.completed":
      return applyCompletedTransaction(db, event, now);

    case "adjustment.created":
    case "adjustment.updated":
      return applyAdjustment(db, event);

    default:
      // Paddle sends far more event types than we act on. Recording and
      // ignoring is correct: a 4xx here would make the processor retry an
      // event we will never want.
      return { ok: true, outcome: "unknown_type", detail: `no handler for ${event.eventType}` };
  }
}

/**
 * Moves an organization between subscription states.
 *
 * **Out-of-order delivery is the whole difficulty.** Webhooks are not ordered,
 * so a `subscription.updated` stamped 10:00 can arrive after a
 * `subscription.canceled` stamped 10:05. Applying by arrival order would
 * silently revive a cancelled subscription. Every transition therefore compares
 * the *processor's* timestamp against the one that set the current status and
 * discards anything older.
 */
async function applySubscriptionState(db: Db, event: BillingEvent): Promise<WebhookResult> {
  if (!event.orgId) {
    return { ok: true, outcome: "unknown_org", detail: "event carries no custom_data.org_id" };
  }
  const org = (
    await db.query<{ id: string; subscription_status_at: string | null }>(
      "SELECT id, subscription_status_at FROM orgs WHERE id = $1",
      [event.orgId]
    )
  ).rows[0];
  if (!org) {
    return { ok: true, outcome: "unknown_org", detail: `no org ${event.orgId}` };
  }

  const status = event.status ? STATUS_MAP[event.status] : undefined;
  if (!status) {
    return { ok: true, outcome: "ignored", detail: `unmapped processor status ${event.status ?? "(none)"}` };
  }

  const stampedAt = event.occurredAt;
  if (stampedAt && org.subscription_status_at && new Date(org.subscription_status_at) > stampedAt) {
    return {
      ok: true,
      outcome: "stale",
      detail: `event stamped ${stampedAt.toISOString()} is older than the current status`,
    };
  }

  // One Paddle subscription belongs to one organization, enforced by a unique
  // index. An event binding it to a second org is a data-integrity problem —
  // a mis-set `custom_data`, or someone trying to attach a paid subscription
  // to an org they control. Either way it is a **decision, not a transient
  // failure**: letting the constraint throw would answer 5xx and have Paddle
  // redeliver it every few minutes for days.
  if (event.subscriptionId) {
    const boundTo = (
      await db.query<{ id: string }>("SELECT id FROM orgs WHERE mor_subscription_id = $1", [event.subscriptionId])
    ).rows[0];
    if (boundTo && boundTo.id !== event.orgId) {
      return {
        ok: true,
        outcome: "ignored",
        detail: `subscription ${event.subscriptionId} is already bound to another org — not reassigned`,
      };
    }
  }

  // The ordering guard is repeated in SQL, not merely checked above. Two
  // deliveries for the same org can be in flight at once, and a
  // check-then-write in the application is exactly the race that lets the
  // older one land last.
  let updated;
  try {
    updated = await db.query<{ id: string }>(
      `UPDATE orgs
          SET subscription_status = $1,
              subscription_status_at = $2,
              mor_subscription_id = COALESCE($3, mor_subscription_id),
              mor_customer_id = COALESCE($4, mor_customer_id)
        WHERE id = $5
          AND (subscription_status_at IS NULL OR $2::timestamptz IS NULL OR subscription_status_at <= $2)
        RETURNING id`,
      [
        status,
        stampedAt?.toISOString() ?? null,
        event.subscriptionId,
        event.customerId,
        event.orgId,
      ]
    );
  } catch (err) {
    // The backstop for the check above losing its race. `23505` is Postgres's
    // unique_violation; anything else is a real failure and must still surface.
    if ((err as { code?: string }).code === "23505") {
      return {
        ok: true,
        outcome: "ignored",
        detail: `subscription ${event.subscriptionId} is already bound to another org — not reassigned`,
      };
    }
    throw err;
  }
  if (updated.rows.length === 0) {
    return { ok: true, outcome: "stale", detail: "a later event already set this org's status" };
  }
  return { ok: true, outcome: "applied", detail: `subscription ${status}` };
}

/**
 * A completed payment: the moment entitlement is created, and the only one.
 *
 * A transaction carrying a subscription price records the billing period and
 * grants that period's allowance. One carrying a pack price grants the pack.
 * A price we do not sell grants nothing — FUTURENORMA §3, "reject unknown or
 * unpriced models", applied to the catalog rather than the model list.
 */
async function applyCompletedTransaction(db: Db, event: BillingEvent, now: Date): Promise<WebhookResult> {
  if (!event.orgId) {
    return { ok: true, outcome: "unknown_org", detail: "event carries no custom_data.org_id" };
  }
  const orgExists = (await db.query("SELECT 1 FROM orgs WHERE id = $1", [event.orgId])).rows.length > 0;
  if (!orgExists) {
    return { ok: true, outcome: "unknown_org", detail: `no org ${event.orgId}` };
  }
  if (!event.priceId) {
    return { ok: true, outcome: "ignored", detail: "transaction carries no price id" };
  }

  const subscriptionProduct = (
    await db.query<{ monthly_credits: number; price_microdollars: string | number }>(
      "SELECT monthly_credits, price_microdollars FROM subscription_products WHERE id = $1 AND active = true",
      [event.priceId]
    )
  ).rows[0];

  if (subscriptionProduct) {
    // Both the revenue record and the allowance are keyed on this event id, so
    // a redelivery that somehow got past the claim above still cannot create a
    // second month of either.
    const periodStart = event.periodStart ?? now;
    const periodEnd = event.periodEnd ?? monthAfter(periodStart);
    await recordSubscriptionPeriod(db, {
      orgId: event.orgId,
      periodStart,
      periodEnd,
      // The transaction's own total, when it carries one. The catalog price is
      // the fallback, never the preference: a proration, a coupon or a tax
      // difference means what we charged is not what the catalog says, and
      // reconciliation must reflect what was actually collected.
      priceMicrodollars: event.amountMicrodollars ?? Number(subscriptionProduct.price_microdollars),
      ...(event.feeMicrodollars !== null ? { feeMicrodollars: event.feeMicrodollars } : {}),
      sourceRef: event.eventId,
    });
    // The allowance expires with the period so it cannot be hoarded
    // (FUTURENORMA §3). `ledger.ts` consumes soonest-to-expire first, so it
    // always burns before anything the customer paid extra for.
    const grantId = await grantCredits(db, {
      orgId: event.orgId,
      kind: "plan_allotment",
      credits: subscriptionProduct.monthly_credits,
      expiresAt: periodEnd,
      sourceRef: `${event.eventId}:allotment`,
    });
    return {
      ok: true,
      outcome: "applied",
      detail: `subscription period + ${subscriptionProduct.monthly_credits} credits`,
      granted: grantId !== null,
      ...(grantId ? { grantId } : {}),
    };
  }

  const pack = (
    await db.query<{ credits: number; price_microdollars: string | number }>(
      "SELECT credits, price_microdollars FROM products WHERE id = $1 AND active = true",
      [event.priceId]
    )
  ).rows[0];
  if (!pack) {
    return { ok: true, outcome: "unknown_product", detail: `price ${event.priceId} is not in the catalog` };
  }

  // **Packs require a live subscription** (FUTURENORMA §3: "buying a $55 pack
  // instead of subscribing is not a path that exists"). Checkout is meant to
  // prevent this, but checkout is a client of ours and this is the server.
  const status = (
    await db.query<{ subscription_status: string }>("SELECT subscription_status FROM orgs WHERE id = $1", [
      event.orgId,
    ])
  ).rows[0]?.subscription_status;
  if (status !== "active" && status !== "past_due") {
    return {
      ok: true,
      outcome: "ignored",
      detail: `pack purchased by an org with no live subscription (${status ?? "unknown"}) — refund required`,
    };
  }

  const expires = new Date(now);
  expires.setUTCMonth(expires.getUTCMonth() + PACK_EXPIRY_MONTHS);
  const grantId = await grantCredits(db, {
    orgId: event.orgId,
    kind: "pack_purchase",
    credits: Number(pack.credits),
    expiresAt: expires,
    sourceRef: event.eventId,
    priceMicrodollars: event.amountMicrodollars ?? Number(pack.price_microdollars),
  });
  return {
    ok: true,
    outcome: "applied",
    detail: `${pack.credits} pack credits`,
    granted: grantId !== null,
    ...(grantId ? { grantId } : {}),
  };
}

/**
 * A refund or chargeback.
 *
 * Revenue is reduced in place and the period stays on the record — it still
 * cost us the provider dollars its credits bought, and a report where the
 * revenue vanished but the cost remained would show an unexplained loss.
 *
 * **Credits already spent are not clawed back.** They were consumed against
 * provider calls that really happened; reversing the ledger would create a
 * negative balance the schema forbids, for money we have already spent. The
 * entitlement change is the subscription status, applied by the accompanying
 * `subscription.*` event.
 */
async function applyAdjustment(db: Db, event: BillingEvent): Promise<WebhookResult> {
  if (!event.orgId) {
    return { ok: true, outcome: "unknown_org", detail: "event carries no custom_data.org_id" };
  }
  if (event.amountMicrodollars === null || event.amountMicrodollars === 0) {
    return { ok: true, outcome: "ignored", detail: "adjustment carries no amount" };
  }
  const amount = Math.abs(event.amountMicrodollars);

  // Refund the most recent period for this org. Paddle's adjustment names a
  // transaction, and transactions are not yet linked to periods — that link
  // arrives with the sandbox work, and until then the newest period is the one
  // a refund almost always concerns.
  const period = (
    await db.query<{ id: string }>(
      "SELECT id FROM subscription_periods WHERE org_id = $1 ORDER BY period_start DESC LIMIT 1",
      [event.orgId]
    )
  ).rows[0];
  if (!period) {
    return { ok: true, outcome: "ignored", detail: "no subscription period to adjust" };
  }
  await refundSubscriptionPeriod(db, period.id, amount);
  return { ok: true, outcome: "applied", detail: `refunded $${(amount / 1e6).toFixed(2)}` };
}

function monthAfter(from: Date): Date {
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return to;
}

/**
 * The pre-Paddle fixture handler (C5), kept so the Phase C suite keeps proving
 * what it proved: HMAC over the raw body, and grants idempotent on the event
 * id. Its `pack.purchased` event type is ours, not Paddle's.
 */
export type LegacyWebhookResult =
  | { ok: true; granted: boolean; grantId?: string }
  | { ok: false; code: "bad_signature" | "bad_payload" | "unknown_product"; message: string };

export async function handleMorWebhook(
  db: Db,
  rawBody: string,
  signature: string,
  secret: string,
  now: Date = new Date()
): Promise<LegacyWebhookResult> {
  if (!verifySignature(rawBody, signature, secret)) {
    return { ok: false, code: "bad_signature", message: "webhook signature verification failed" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "bad_payload", message: "webhook body is not JSON" };
  }
  const eventId = payload.event_id;
  const eventType = payload.event_type;
  const orgId = payload.org_id;
  const productId = payload.product_id;
  if (
    typeof eventId !== "string" ||
    typeof orgId !== "string" ||
    typeof productId !== "string" ||
    eventType !== "pack.purchased"
  ) {
    return { ok: false, code: "bad_payload", message: "webhook payload missing required fields" };
  }

  const product = (
    await db.query<{ credits: number; price_microdollars: string | number }>(
      "SELECT credits, price_microdollars FROM products WHERE id = $1 AND active = true",
      [productId]
    )
  ).rows[0];
  if (!product) {
    return { ok: false, code: "unknown_product", message: `unknown product ${productId}` };
  }

  const expires = new Date(now);
  expires.setUTCMonth(expires.getUTCMonth() + PACK_EXPIRY_MONTHS);
  const grantId = await grantCredits(db, {
    orgId,
    kind: "pack_purchase",
    credits: Number(product.credits),
    expiresAt: expires,
    sourceRef: eventId,
    priceMicrodollars: Number(product.price_microdollars),
  });
  return { ok: true, granted: grantId !== null, ...(grantId ? { grantId } : {}) };
}
