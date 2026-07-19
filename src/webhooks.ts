import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";
import { grantCredits } from "./ledger.js";

/**
 * MoR webhook → credit grant (Phase C / C5).
 *
 * Signature: HMAC-SHA256 over the raw body with the webhook secret,
 * hex-encoded — the scheme both Paddle (`ts:...;h1=...` simplified) and
 * Lemon Squeezy (X-Signature) reduce to. Verification is timing-safe and
 * happens before any parsing side effects. Grants are idempotent on the
 * event id, so MoR retries can never double-grant.
 *
 * Packs expire 12 months after purchase (stated at purchase — doctrine 1).
 */

export const PACK_EXPIRY_MONTHS = 12;

export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signBody(rawBody, secret);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WebhookResult =
  | { ok: true; granted: boolean; grantId?: string }
  | { ok: false; code: "bad_signature" | "bad_payload" | "unknown_product"; message: string };

export async function handleMorWebhook(
  db: Db,
  rawBody: string,
  signature: string,
  secret: string,
  now: Date = new Date()
): Promise<WebhookResult> {
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
