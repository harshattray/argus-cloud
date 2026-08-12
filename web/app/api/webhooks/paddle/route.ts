import { NextResponse } from "next/server";
import { handlePaddleWebhook } from "argus-cloud/webhooks.js";
import { getDb } from "../../../../lib/db";

/**
 * Paddle notification endpoint — PATHWAYS.md Pathway 1 item 8.
 *
 * `src/webhooks.ts` has existed since Phase C with nothing able to reach it.
 * This is the door.
 *
 * Four things this route must get right, and each one is a way to be
 * subtly broken while looking fine:
 *
 * 1. **The raw body.** Paddle signs the exact bytes it sent. `req.json()`
 *    would parse and discard them, and re-serialising gives a different string
 *    — different key order, different number formatting — so the HMAC would
 *    never match. `req.text()`, always, and the string is handed to the
 *    verifier untouched.
 *
 * 2. **The Node runtime.** The handler reaches Postgres and `node:crypto`.
 *    Edge would fail at import, at deploy time rather than in a test.
 *
 * 3. **2xx for anything we have decided about.** A processor retries a
 *    non-2xx. An event we correctly ignored — an unmapped type, an org we
 *    have never heard of — is a decision, not a failure, and answering 4xx
 *    would make Paddle redeliver it for days. Only a failed signature and a
 *    genuine server error are non-2xx.
 *
 * 4. **Nothing leaks.** The response body says nothing about which check
 *    failed, whether an org exists, or what the handler decided. All of that
 *    is on the `billing_events` row, where an operator can read it and an
 *    anonymous caller cannot. An endpoint that distinguishes "bad signature"
 *    from "unknown org" is an org-enumeration oracle.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Fail closed and loudly in the log, not in the response. Without a secret
    // every signature check would fail anyway; saying so plainly here is what
    // stops that being diagnosed as "Paddle is sending bad signatures".
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set — refusing to process webhooks");
    return new NextResponse(null, { status: 500 });
  }

  // The exact bytes Paddle signed. Never `req.json()`.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  let result;
  try {
    const db = await getDb();
    result = await handlePaddleWebhook(db, rawBody, req.headers.get("paddle-signature"), secret);
  } catch (err) {
    // A 5xx asks Paddle to retry, which is what we want for a transient
    // database failure — the event has not been applied and the claim row
    // records the error. The message never reaches the response.
    console.error("[paddle] handler failed:", (err as Error).message);
    return new NextResponse(null, { status: 500 });
  }

  if (!result.ok) {
    // Signature failures are logged by reason so a wrong secret can be told
    // apart from a replay, without the caller learning either. The body is
    // never logged: it carries customer names and addresses.
    console.warn(`[paddle] rejected delivery: ${result.reason}`);
    return new NextResponse(null, { status: 401 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Paddle verifies a notification destination before it will send to it, and a
 * bare GET is the usual way people check a URL is live. Answering 405 rather
 * than Next's default 404 makes "the route is deployed" and "the route does
 * not exist" distinguishable while still refusing to do anything.
 */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
