import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paddle Billing webhook signatures.
 *
 * Paddle sends a `Paddle-Signature` header of the form:
 *
 *     ts=1671552777;h1=eb4d0dc8853be92b7f063b9f3ba5233eb920a09459b6e6b2c26705b4364db151
 *
 * and the signed payload is **`${ts}:${rawBody}`**, HMAC-SHA256 with the
 * notification destination's secret key, hex-encoded.
 *
 * Three details are load-bearing, and each one is a way to get this wrong that
 * still passes a happy-path test:
 *
 * 1. **The raw body, byte for byte.** `JSON.parse` then `JSON.stringify` gives
 *    a different string — key order, number formatting, whitespace — and the
 *    HMAC will not match. The route must read `await req.text()` and hand that
 *    exact string here. Nothing in this file parses.
 *
 * 2. **The timestamp is inside the MAC.** It is not decoration: signing
 *    `ts:body` rather than `body` is what makes a captured request expire.
 *    Checking the signature without checking the timestamp leaves a valid
 *    request replayable forever, which is the difference between "we verify
 *    signatures" and "we are replay-safe".
 *
 * 3. **Timing-safe comparison, on equal-length buffers.** `timingSafeEqual`
 *    throws on a length mismatch, so the length is compared first and the
 *    result is combined — an attacker learning the digest length learns
 *    nothing, since it is fixed by SHA-256 anyway.
 *
 * The scheme itself is documented and stable. What is **not** yet verified
 * against a live Paddle account is the payload *shape* — see `parseEvent`.
 */

/** How far out of date a signature may be. Paddle's own guidance is 5 seconds
 * for strict setups; 5 minutes tolerates ordinary clock skew and a slow cold
 * start without leaving a useful replay window. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureFailure =
  | "missing_header"
  | "malformed_header"
  | "bad_signature"
  | "stale_timestamp"
  | "future_timestamp";

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/** Builds the header Paddle would send. Used by the suite, and by nothing else. */
export function signPaddle(rawBody: string, secret: string, timestampSeconds: number): string {
  const digest = createHmac("sha256", secret).update(`${timestampSeconds}:${rawBody}`).digest("hex");
  return `ts=${timestampSeconds};h1=${digest}`;
}

function equalHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf-8");
  const right = Buffer.from(b, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifies a `Paddle-Signature` header against the raw request body.
 *
 * Returns a reason rather than a boolean because the reasons are operationally
 * different: a stale timestamp is a retry or a clock problem, a bad signature
 * is a wrong secret or an attack, and a missing header is usually someone
 * pointing a health check at the endpoint. They belong in different alerts.
 * The *caller* must still answer all of them with the same opaque response.
 */
export function verifyPaddleSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  now: Date = new Date()
): SignatureResult {
  if (!header) {
    return { ok: false, reason: "missing_header" };
  }

  // `ts=...;h1=...`, order not guaranteed. Paddle may add further `hN=` key
  // versions later; an unknown one is ignored rather than fatal, which is what
  // lets them rotate the scheme without taking our endpoint down.
  const parts = new Map<string, string>();
  for (const segment of header.split(";")) {
    const index = segment.indexOf("=");
    if (index > 0) {
      parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
    }
  }
  const ts = parts.get("ts");
  const h1 = parts.get("h1");
  if (!ts || !h1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(h1)) {
    return { ok: false, reason: "malformed_header" };
  }

  // Signature before timestamp, deliberately. The timestamp is attacker-supplied
  // until the MAC says otherwise, so rejecting on it first would be answering a
  // question about a value we have not authenticated.
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  if (!equalHex(expected, h1.toLowerCase())) {
    return { ok: false, reason: "bad_signature" };
  }

  const ageSeconds = Math.floor(now.getTime() / 1000) - Number(ts);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }
  // A timestamp from the future is either a broken clock or someone trying to
  // mint a signature that stays valid for a long time. Same tolerance, mirrored.
  if (-ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "future_timestamp" };
  }

  return { ok: true };
}

/**
 * The normalised event the rest of the system handles.
 *
 * Deliberately provider-neutral: `webhooks.ts` decides what an event *means*
 * and never sees a Paddle field name. Adding Lemon Squeezy later is a second
 * parser, not a second handler.
 */
export interface BillingEvent {
  eventId: string;
  eventType: string;
  occurredAt: Date | null;
  orgId: string | null;
  /** Paddle subscription/customer ids, for reconciling against their dashboard. */
  subscriptionId: string | null;
  customerId: string | null;
  /** Price id — matched against `products` or `subscription_products`. */
  priceId: string | null;
  /** Processor's own status string for subscription events. */
  status: string | null;
  /** Billing period, present on subscription events. */
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Money, in microdollars, where the event carries it. */
  amountMicrodollars: number | null;
  feeMicrodollars: number | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function date(value: unknown): Date | null {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Paddle reports money as a **minor-unit string** — `"5900"` for $59.00 — so
 * the conversion is ×10,000 to reach microdollars, not ×1,000,000. Getting
 * this wrong by a factor of 100 would put every revenue figure in the
 * reconciliation report out by two orders of magnitude while every test that
 * used the same helper stayed green, which is why it is one function.
 */
export function minorUnitsToMicrodollars(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : str(value);
  if (text === null || !/^-?\d+$/.test(text)) return null;
  return Number(text) * 10_000;
}

/**
 * Maps Paddle's envelope onto `BillingEvent`.
 *
 * ⚠️ **The envelope is documented and stable; the field paths inside `data`
 * are not yet confirmed against a live account.** Paddle sandbox needs an
 * account, which is Harsha's to create (FUTURENORMA §4 Step 7), so the
 * extraction below follows the published shape and has not been exercised
 * against a real delivery. Everything that has to be right *before* an account
 * exists — signature, replay, idempotency, state ordering — is verified. This
 * function is the one place a sandbox run will need to correct, which is why
 * it is small, pure, and separate from the handler.
 *
 * `custom_data.org_id` is how an event finds its organization: we set it at
 * checkout, Paddle echoes it back on the transaction and the subscription.
 * There is no other reliable link — an email address is not an org.
 */
export function parseEvent(payload: unknown): BillingEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const top = payload as Record<string, unknown>;
  const eventId = str(top.event_id);
  const eventType = str(top.event_type);
  if (!eventId || !eventType) return null;

  const obj = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  const data = obj(top.data);
  const custom = obj(data.custom_data);
  const items = Array.isArray(data.items) ? (data.items as unknown[]) : [];
  // Single-item catalog at launch: one subscription price, one pack per
  // purchase. If a multi-line transaction ever arrives, the first line is the
  // one we price against and the rest is recorded but unhandled — better than
  // silently summing prices that mean different things.
  const firstPrice = str(obj(obj(items[0]).price).id);

  // Subscription events put the subscription's own id in `data.id`; transaction
  // and adjustment events carry it in `data.subscription_id`, and `data.id` is
  // the transaction. Reading `data.id` unconditionally would file a transaction
  // id as a subscription id and break every later lookup.
  const period = obj(data.current_billing_period ?? data.billing_period);
  const totals = obj(obj(data.details).totals ?? data.totals);

  return {
    eventId,
    eventType,
    occurredAt: date(top.occurred_at),
    orgId: str(custom.org_id),
    subscriptionId: eventType.startsWith("subscription.")
      ? str(data.id) ?? str(data.subscription_id)
      : str(data.subscription_id),
    customerId: str(data.customer_id),
    priceId: firstPrice,
    status: str(data.status),
    periodStart: date(period.starts_at),
    periodEnd: date(period.ends_at),
    amountMicrodollars: minorUnitsToMicrodollars(totals.total),
    feeMicrodollars: minorUnitsToMicrodollars(totals.fee),
  };
}
