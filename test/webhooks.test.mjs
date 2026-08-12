// Paddle webhook suite — PATHWAYS.md Pathway 1 item 8 ("add the reachable MoR
// webhook route and Paddle signature adapter") and §3 "Payment failure safe
// state"; FUTURENORMA §3 ("grant credits only from an idempotently verified
// payment webhook").
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/webhooks.test.mjs
//
// Four claims are under test:
//
//   1. The signature is Paddle's actual scheme — HMAC over `ts:rawBody` — and
//      it rejects a tampered body, a wrong secret, a malformed header and a
//      replay outside the tolerance window (W1).
//   2. Entitlement is created only by a verified event, exactly once, however
//      many times it is delivered (W2, W3).
//   3. Out-of-order delivery cannot resurrect a cancelled subscription (W4).
//      This is the one that would be silent in production: nothing errors, the
//      customer simply keeps a subscription they cancelled.
//   4. A pack cannot be bought by an org with no live subscription, checked on
//      the server rather than trusted from checkout (W5).
//
// What is NOT proven here: no real Paddle delivery has ever reached this code.
// Sandbox needs an account (FUTURENORMA §4 Step 7). The field paths inside
// Paddle's `data` object are followed from the published shape and are the
// part a sandbox run will correct; they are isolated in `paddle.js:parseEvent`.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { balance } = await import(path.join(DIST, "ledger.js"));
const { handlePaddleWebhook } = await import(path.join(DIST, "webhooks.js"));
const { signPaddle, verifyPaddleSignature, parseEvent, minorUnitsToMicrodollars, SIGNATURE_TOLERANCE_SECONDS } =
  await import(path.join(DIST, "paddle.js"));
const { reconcileMonth } = await import(path.join(DIST, "reconcile.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const SECRET = "pdl_ntfset_01hxyz_notarealsecret";
const NOW = new Date("2026-04-15T12:00:00.000Z");
const TS = Math.floor(NOW.getTime() / 1000);

async function makeOrg(name, status = "none") {
  const id = randomUUID();
  await db.query(
    "INSERT INTO orgs (id, name, plan, subscription_status) VALUES ($1, $2, 'team', $3)",
    [id, name, status]
  );
  return id;
}

/** Balance as of the suite's fixed clock — see NOW. Reading it at the real
 * current time would call the period-scoped allowance expired. */
const bal = (orgId) => balance(db, orgId, NOW);

async function orgRow(id) {
  return (
    await db.query(
      "SELECT subscription_status, subscription_status_at, mor_subscription_id FROM orgs WHERE id = $1",
      [id]
    )
  ).rows[0];
}

async function eventRow(eventId) {
  return (await db.query("SELECT outcome, detail, claimed_org_id FROM billing_events WHERE event_id = $1", [eventId])).rows[0];
}

/** Builds a signed delivery the way Paddle would. */
function delivery(payload, { secret = SECRET, ts = TS, tamper = null } = {}) {
  const raw = JSON.stringify(payload);
  const header = signPaddle(raw, secret, ts);
  return { raw: tamper ? tamper(raw) : raw, header };
}

const subscriptionEvent = (over = {}) => ({
  event_id: over.event_id ?? `evt_${randomUUID()}`,
  event_type: over.event_type ?? "subscription.created",
  occurred_at: over.occurred_at ?? NOW.toISOString(),
  data: {
    id: over.subscriptionId ?? "sub_01hxyz",
    customer_id: "ctm_01hxyz",
    status: over.status ?? "active",
    custom_data: { org_id: over.orgId },
    current_billing_period: {
      starts_at: "2026-04-15T12:00:00.000Z",
      ends_at: "2026-05-15T12:00:00.000Z",
    },
    items: [{ price: { id: over.priceId ?? "cloud_monthly" } }],
  },
});

const transactionEvent = (over = {}) => ({
  event_id: over.event_id ?? `txn_${randomUUID()}`,
  event_type: "transaction.completed",
  occurred_at: over.occurred_at ?? NOW.toISOString(),
  data: {
    id: "txn_01hxyz",
    customer_id: "ctm_01hxyz",
    subscription_id: over.subscriptionId ?? "sub_01hxyz",
    custom_data: { org_id: over.orgId },
    billing_period: {
      starts_at: "2026-04-15T12:00:00.000Z",
      ends_at: "2026-05-15T12:00:00.000Z",
    },
    items: [{ price: { id: over.priceId ?? "cloud_monthly" } }],
    // Paddle reports money as minor-unit strings: "5900" is $59.00.
    details: { totals: { total: over.total ?? "5900", fee: over.fee ?? "345" } },
  },
});

// ═══ W1 — the signature scheme ════════════════════════════════════════════

{
  const raw = JSON.stringify({ event_id: "evt_1", event_type: "x", data: {} });
  const header = signPaddle(raw, SECRET, TS);

  check("W1.1", verifyPaddleSignature(raw, header, SECRET, NOW).ok,
    `a correctly signed body verifies (${header.slice(0, 24)}…)`);

  // The timestamp is inside the MAC. Signing the body alone would still verify
  // here, which is why the next check exists.
  const bodyOnlyHmac = (await import("node:crypto")).createHmac("sha256", SECRET).update(raw).digest("hex");
  check("W1.2", !verifyPaddleSignature(raw, `ts=${TS};h1=${bodyOnlyHmac}`, SECRET, NOW).ok,
    "an HMAC over the body alone is rejected — the signed payload is `ts:body`, not `body`");

  const tampered = verifyPaddleSignature(raw.replace("evt_1", "evt_2"), header, SECRET, NOW);
  check("W1.3", !tampered.ok && tampered.reason === "bad_signature", "a single changed byte invalidates it");

  check("W1.4", !verifyPaddleSignature(raw, header, "wrong-secret", NOW).ok, "a wrong secret is rejected");
  check("W1.5", verifyPaddleSignature(raw, null, SECRET, NOW).reason === "missing_header", "no header is rejected");
  check("W1.6", verifyPaddleSignature(raw, "garbage", SECRET, NOW).reason === "malformed_header",
    "a header with no ts/h1 is rejected");
  check("W1.7", verifyPaddleSignature(raw, `ts=abc;h1=${"0".repeat(64)}`, SECRET, NOW).reason === "malformed_header",
    "a non-numeric timestamp is rejected before any comparison");

  // Replay: a genuine, correctly-signed request captured and resent later.
  const later = new Date(NOW.getTime() + (SIGNATURE_TOLERANCE_SECONDS + 60) * 1000);
  const replayed = verifyPaddleSignature(raw, header, SECRET, later);
  check("W1.8", !replayed.ok && replayed.reason === "stale_timestamp",
    `a valid signature replayed ${SIGNATURE_TOLERANCE_SECONDS + 60}s later is refused — this is what the timestamp is for`);

  const inWindow = new Date(NOW.getTime() + (SIGNATURE_TOLERANCE_SECONDS - 60) * 1000);
  check("W1.9", verifyPaddleSignature(raw, header, SECRET, inWindow).ok,
    "a slow but legitimate delivery inside the window still verifies");

  const future = signPaddle(raw, SECRET, TS + SIGNATURE_TOLERANCE_SECONDS + 600);
  check("W1.10", verifyPaddleSignature(raw, future, SECRET, NOW).reason === "future_timestamp",
    "a far-future timestamp is refused, so a signature cannot be minted to last");

  // Paddle may add key versions; an unknown one must not break the endpoint.
  check("W1.11", verifyPaddleSignature(raw, `${header};h2=deadbeef`, SECRET, NOW).ok,
    "an unrecognised key version alongside h1 is ignored, not fatal");
}

// ═══ W1b — the money conversion ═══════════════════════════════════════════

{
  check("W1b.1", minorUnitsToMicrodollars("5900") === 59_000_000,
    "Paddle's minor units are cents: \"5900\" is $59.00, not $5,900");
  check("W1b.2", minorUnitsToMicrodollars("345") === 3_450_000, "\"345\" is the $3.45 Paddle fee");
  check("W1b.3", minorUnitsToMicrodollars("abc") === null && minorUnitsToMicrodollars(undefined) === null,
    "a non-numeric amount is null, never a silent zero");

  const parsed = parseEvent(transactionEvent({ orgId: "org-x" }));
  check("W1b.4",
    parsed.orgId === "org-x" && parsed.priceId === "cloud_monthly" &&
      parsed.amountMicrodollars === 59_000_000 && parsed.feeMicrodollars === 3_450_000 &&
      parsed.subscriptionId === "sub_01hxyz",
    "a transaction parses to org, price, amount, fee and subscription id");

  const sub = parseEvent(subscriptionEvent({ orgId: "org-x" }));
  check("W1b.5", sub.subscriptionId === "sub_01hxyz" && sub.status === "active",
    "a subscription event takes its id from data.id, not data.subscription_id");
  check("W1b.6", parseEvent({ data: {} }) === null && parseEvent("nonsense") === null,
    "a payload with no event_id is not an event");
}

// ═══ W2 — a verified payment creates entitlement, exactly once ════════════

{
  const org = await makeOrg("w2-subscriber");

  const activation = delivery(subscriptionEvent({ orgId: org, subscriptionId: "sub_w2" }));
  const activated = await handlePaddleWebhook(db, activation.raw, activation.header, SECRET, { now: NOW });
  check("W2.1", activated.ok && activated.outcome === "applied" && (await orgRow(org)).subscription_status === "active",
    `subscription.created activates the org (${activated.ok ? activated.detail : activated.reason})`);

  const payment = transactionEvent({ orgId: org, subscriptionId: "sub_w2" });
  const first = delivery(payment);
  const granted = await handlePaddleWebhook(db, first.raw, first.header, SECRET, { now: NOW });
  check("W2.2", granted.ok && granted.outcome === "applied" && (await bal(org)) === 500,
    `the completed transaction grants the 500-credit allowance (balance ${await bal(org)})`);

  // Paddle retries on any non-2xx and can duplicate on its own. The same event
  // delivered twice must not be two months of credits.
  const replay = delivery(payment);
  const again = await handlePaddleWebhook(db, replay.raw, replay.header, SECRET, { now: NOW });
  check("W2.3", again.ok && again.outcome === "duplicate" && (await bal(org)) === 500,
    `a redelivered event is recognised and grants nothing further (balance still ${await bal(org)})`);

  const periods = (await db.query("SELECT COUNT(*) AS n FROM subscription_periods WHERE org_id = $1", [org])).rows[0];
  check("W2.4", Number(periods.n) === 1, "and records one billing period, not two");

  const report = await reconcileMonth(db, "2026-04", () => {});
  check("W2.5",
    report.subscription.grossMicrodollars === 59_000_000 && report.subscription.feeMicrodollars === 3_450_000 &&
      report.subscription.recordsMissingFees === 0,
    `the period reaches reconciliation with the processor's own fee ($${(report.subscription.feeMicrodollars / 1e6).toFixed(2)})`);

  // An unsigned or wrongly-signed body must create nothing at all.
  const forged = transactionEvent({ orgId: org, subscriptionId: "sub_w2" });
  const bad = await handlePaddleWebhook(db, JSON.stringify(forged), signPaddle(JSON.stringify(forged), "attacker", TS), SECRET, { now: NOW });
  check("W2.6",
    !bad.ok && bad.reason === "bad_signature" && (await bal(org)) === 500 &&
      (await eventRow(forged.event_id)) === undefined,
    "a forged delivery grants nothing and is not even recorded — an unverified body is not evidence");
}

// ═══ W3 — events we cannot act on are recorded and answered, not retried ══

{
  const unknownOrg = delivery(subscriptionEvent({ orgId: "org-that-does-not-exist", subscriptionId: "sub_w3_ghost" }));
  const missing = await handlePaddleWebhook(db, unknownOrg.raw, unknownOrg.header, SECRET, { now: NOW });
  check("W3.1", missing.ok && missing.outcome === "unknown_org",
    "an event for an org we have never heard of is a 2xx decision, not a retry loop");

  const org = await makeOrg("w3-catalog", "active");
  const badPrice = delivery(transactionEvent({ orgId: org, priceId: "price_not_in_catalog" }));
  const refused = await handlePaddleWebhook(db, badPrice.raw, badPrice.header, SECRET, { now: NOW });
  check("W3.2", refused.ok && refused.outcome === "unknown_product" && (await bal(org)) === 0,
    "a price we do not sell grants nothing");

  const other = delivery({
    event_id: `evt_${randomUUID()}`,
    event_type: "customer.updated",
    occurred_at: NOW.toISOString(),
    data: { id: "ctm_1", custom_data: { org_id: org } },
  });
  const ignored = await handlePaddleWebhook(db, other.raw, other.header, SECRET, { now: NOW });
  check("W3.3", ignored.ok && ignored.outcome === "unknown_type",
    "an event type we have no handler for is recorded and ignored");

  const rows = (await db.query("SELECT COUNT(*) AS n FROM billing_events WHERE outcome != 'processing'")).rows[0];
  check("W3.4", Number(rows.n) >= 5,
    `every decided delivery leaves an audit row for the operator console (${rows.n} so far)`);
}

// ═══ W4 — out-of-order delivery cannot resurrect a cancellation ═══════════
//
// The failure this prevents is silent. Nothing errors; a customer who
// cancelled simply stays subscribed, and the first anyone knows is a
// chargeback.

{
  const org = await makeOrg("w4-ordering");
  const T1 = new Date("2026-04-15T10:00:00.000Z");
  const T2 = new Date("2026-04-15T10:05:00.000Z");

  const created = delivery(subscriptionEvent({ orgId: org, subscriptionId: "sub_w4", occurred_at: T1.toISOString(), status: "active" }));
  await handlePaddleWebhook(db, created.raw, created.header, SECRET, { now: NOW });

  const cancelled = delivery(
    subscriptionEvent({ orgId: org, subscriptionId: "sub_w4", event_type: "subscription.canceled", occurred_at: T2.toISOString(), status: "canceled" })
  );
  await handlePaddleWebhook(db, cancelled.raw, cancelled.header, SECRET, { now: NOW });
  check("W4.1", (await orgRow(org)).subscription_status === "lapsed", "cancellation lapses the org");

  // Now the late arrival: an *older* update, delivered after the cancellation.
  const late = delivery(
    subscriptionEvent({
      orgId: org, subscriptionId: "sub_w4", event_type: "subscription.updated",
      occurred_at: new Date("2026-04-15T10:02:00.000Z").toISOString(), status: "active",
    })
  );
  const stale = await handlePaddleWebhook(db, late.raw, late.header, SECRET, { now: NOW });
  check("W4.2",
    stale.ok && stale.outcome === "stale" && (await orgRow(org)).subscription_status === "lapsed",
    "an older event arriving later is discarded — the cancellation stands");

  // A genuinely newer event still applies, so the guard is not just "reject
  // everything after a cancellation".
  const resumed = delivery(
    subscriptionEvent({
      orgId: org, subscriptionId: "sub_w4", event_type: "subscription.resumed",
      occurred_at: new Date("2026-04-15T11:00:00.000Z").toISOString(), status: "active",
    })
  );
  await handlePaddleWebhook(db, resumed.raw, resumed.header, SECRET, { now: NOW });
  check("W4.3", (await orgRow(org)).subscription_status === "active",
    "a later event still applies — the rule is ordering, not a one-way door");

  const pastDue = delivery(
    subscriptionEvent({
      orgId: org, subscriptionId: "sub_w4", event_type: "subscription.updated",
      occurred_at: new Date("2026-04-15T11:30:00.000Z").toISOString(), status: "past_due",
    })
  );
  await handlePaddleWebhook(db, pastDue.raw, pastDue.header, SECRET, { now: NOW });
  check("W4.4", (await orgRow(org)).subscription_status === "past_due",
    "a failed charge moves the org to past_due, not to deleted — no data is touched");

  // One Paddle subscription belongs to one org. An event trying to bind
  // `sub_w4` to a second org must be refused — and refused as a *decision*,
  // because a 5xx would have Paddle redeliver it every few minutes for days.
  const other = await makeOrg("w4-thief");
  const steal = delivery(
    subscriptionEvent({
      orgId: other, subscriptionId: "sub_w4", event_type: "subscription.updated",
      occurred_at: new Date("2026-04-15T12:00:00.000Z").toISOString(), status: "active",
    })
  );
  const refused = await handlePaddleWebhook(db, steal.raw, steal.header, SECRET, { now: NOW });
  check("W4.5",
    refused.ok && refused.outcome === "ignored" && refused.detail.includes("already bound") &&
      (await orgRow(other)).subscription_status === "none" &&
      (await orgRow(org)).subscription_status === "past_due",
    "a subscription already bound to one org is not reassigned to another, and the answer is 2xx not a retry loop");
}

// ═══ W5 — a pack requires a live subscription, checked server-side ════════

{
  const lapsed = await makeOrg("w5-lapsed", "lapsed");
  const attempt = delivery(transactionEvent({ orgId: lapsed, priceId: "pack_200", total: "1200", fee: "110" }));
  const refused = await handlePaddleWebhook(db, attempt.raw, attempt.header, SECRET, { now: NOW });
  check("W5.1",
    refused.ok && refused.outcome === "ignored" && (await bal(lapsed)) === 0 &&
      refused.detail.includes("refund required"),
    "a pack bought without a live subscription grants nothing and says a refund is owed");

  const active = await makeOrg("w5-active", "active");
  const bought = delivery(transactionEvent({ orgId: active, priceId: "pack_200", total: "1200", fee: "110" }));
  const ok = await handlePaddleWebhook(db, bought.raw, bought.header, SECRET, { now: NOW });
  check("W5.2", ok.ok && ok.outcome === "applied" && (await bal(active)) === 200,
    `a subscribed org gets its pack credits (balance ${await bal(active)})`);

  const packRow = (
    await db.query("SELECT price_microdollars, fee_microdollars FROM credit_grants WHERE org_id = $1", [active])
  ).rows[0];
  check("W5.3", Number(packRow.price_microdollars) === 12_000_000,
    "the pack records what was actually collected, not the catalog price");
}

// ═══ W6 — refunds reduce revenue and leave the record intact ══════════════

{
  const org = await makeOrg("w6-refund");
  const activation = delivery(subscriptionEvent({ orgId: org, subscriptionId: "sub_w6" }));
  await handlePaddleWebhook(db, activation.raw, activation.header, SECRET, { now: NOW });
  const payment = delivery(transactionEvent({ orgId: org, subscriptionId: "sub_w6" }));
  await handlePaddleWebhook(db, payment.raw, payment.header, SECRET, { now: NOW });

  const before = await bal(org);
  const refund = delivery({
    event_id: `adj_${randomUUID()}`,
    event_type: "adjustment.updated",
    occurred_at: NOW.toISOString(),
    data: {
      id: "adj_01hxyz",
      action: "refund",
      subscription_id: "sub_w6",
      custom_data: { org_id: org },
      totals: { total: "5900" },
    },
  });
  const applied = await handlePaddleWebhook(db, refund.raw, refund.header, SECRET, { now: NOW });

  const period = (
    await db.query("SELECT price_microdollars, refunded_microdollars FROM subscription_periods WHERE org_id = $1", [org])
  ).rows[0];
  check("W6.1",
    applied.ok && applied.outcome === "applied" &&
      Number(period.refunded_microdollars) === 59_000_000 && Number(period.price_microdollars) === 59_000_000,
    "a refund reduces revenue in place; the period stays on the record with its original price");
  check("W6.2", (await bal(org)) === before,
    `credits already granted are not clawed back (balance ${before} → ${await bal(org)}) — they bought provider calls that really happened`);
}

await db.close();

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("Paddle webhook suite: all checks passed");
