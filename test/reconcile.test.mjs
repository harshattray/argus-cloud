// Revenue-attribution and reconciliation suite — PATHWAYS.md Pathway 1 item 7
// / §10.3 "1B. Fix reconciliation before selling credits"; FUTURENORMA §3
// ("keep subscription revenue, pack revenue, provider cost, payment fees,
// refunds, and goodwill credits separate in reconciliation").
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/reconcile.test.mjs
//
// Three claims are under test:
//
//   1. The cost split across funding grants is exact — the parts sum to the
//      whole, every time, including when the division has a remainder (R1).
//   2. The real economic path writes that split, and a failed analysis writes
//      nothing for the refund to have to undo (R2).
//   3. The month's report separates subscription revenue, pack revenue,
//      goodwill and unattributed spend — and **R3.4 runs the old formula over
//      the same seeded month** to show it false-alarms where the fixed one
//      does not. A test that has only ever been green may be asserting
//      nothing (CLAUDE.md rule 3).
//
// Every row this file writes is stamped into RECON_MONTH, a month in the past
// that no other suite touches. The suites share one database when
// DATABASE_URL is set and reconciliation is global, so an isolated month is
// what makes exact assertions possible instead of `>=` ones.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { attributeCost, recordUsage } = await import(path.join(DIST, "usage.js"));
const { hostedExplain } = await import(path.join(DIST, "explainService.js"));
const { recordSubscriptionPeriod, refundSubscriptionPeriod } = await import(path.join(DIST, "subscriptions.js"));
const { reconcileMonth, MARGIN_ALERT_THRESHOLD } = await import(path.join(DIST, "reconcile.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

// A month far enough back that no other suite writes into it.
const RECON_MONTH = "2025-04";
const IN_MONTH = "2025-04-11T10:00:00.000Z";
const MONTH_START = "2025-04-01T00:00:00.000Z";
const MONTH_END = "2025-05-01T00:00:00.000Z";

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const soon = new Date(Date.now() + 30 * 24 * 3600 * 1000);

const okFindings = {
  findings: [
    {
      frame: "x.png",
      region: { x: 0, y: 0, width: 10, height: 10 },
      category: "spacing",
      observation: "gap differs",
      cssHypothesis: "",
      selector: "",
      codePointer: "",
      suggestedFix: "",
      confidence: "high",
    },
  ],
};
// Fixed token counts, so every cost in this file is a number we can assert
// exactly rather than a range: sonnet-5 at 15,000 in / 1,200 out is
// 15000×3 + 1200×15 = 63,000µ$.
const SONNET_COST = 63_000;
const okProvider = async () => ({
  kind: "ok",
  json: structuredClone(okFindings),
  usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
});
const failingProvider = async () => ({ kind: "error", message: "provider unavailable" });
const deps = (provider) => ({ provider, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} });

async function makeOrg(name) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  return id;
}

/** Moves an org's meter and grant rows into RECON_MONTH. */
async function stampIntoMonth(orgId) {
  await db.query("UPDATE usage_events SET created_at = $1 WHERE org_id = $2", [IN_MONTH, orgId]);
  await db.query("UPDATE credit_grants SET created_at = $1 WHERE org_id = $2", [IN_MONTH, orgId]);
}

async function sourcesFor(orgId) {
  return (
    await db.query(
      `SELECT s.grant_kind, s.credits, s.cost_microdollars, e.status, e.cost_microdollars AS event_cost
       FROM usage_credit_sources s JOIN usage_events e ON e.id = s.usage_event_id
       WHERE e.org_id = $1
       ORDER BY s.grant_kind`,
      [orgId]
    )
  ).rows.map((r) => ({
    kind: r.grant_kind,
    credits: Number(r.credits),
    cost: Number(r.cost_microdollars),
    status: r.status,
    eventCost: Number(r.event_cost),
  }));
}

// ═══ R1 — the split is exact ══════════════════════════════════════════════
//
// A pure function, so this is arithmetic rather than plumbing. The property
// that matters is that no microdollar is lost: a rounding loss per event would
// make the margin report drift away from the meter it derives from, slowly and
// invisibly.

{
  const single = attributeCost(63_000, [{ grantId: "g1", grantKind: "plan_allotment", credits: 5 }]);
  check("R1.1", single.length === 1 && single[0].costMicrodollars === 63_000,
    `one funding grant takes the whole cost (${single[0]?.costMicrodollars}µ$)`);

  // 63,003 over 3+2 credits does not divide: 37,801.8 and 25,201.2.
  const split = attributeCost(63_003, [
    { grantId: "g1", grantKind: "plan_allotment", credits: 3 },
    { grantId: "g2", grantKind: "pack_purchase", credits: 2 },
  ]);
  const total = split.reduce((s, p) => s + p.costMicrodollars, 0);
  check("R1.2", total === 63_003 && split[0].costMicrodollars === 37_802 && split[1].costMicrodollars === 25_201,
    `indivisible cost sums exactly, remainder to the larger share (${split.map((p) => p.costMicrodollars).join(" + ")} = ${total})`);

  check("R1.3", attributeCost(63_000, []).length === 0,
    "nothing funded it, nothing is attributed — no row claiming a source we do not have");

  // Three grants, all uneven. The invariant is the sum, not any one part.
  const three = attributeCost(100_001, [
    { grantId: "a", grantKind: "plan_allotment", credits: 1 },
    { grantId: "b", grantKind: "pack_purchase", credits: 1 },
    { grantId: "c", grantKind: "goodwill", credits: 1 },
  ]);
  check("R1.4", three.reduce((s, p) => s + p.costMicrodollars, 0) === 100_001,
    `three equal shares of an indivisible cost still sum to the whole (${three.map((p) => p.costMicrodollars).join(" + ")})`);
}

// ═══ R2 — the real path records what funded the charge ════════════════════

{
  // An allowance with only 3 credits left and a pack behind it. `ledger.ts`
  // consumes soonest-to-expire first, so one 5-credit analysis is funded 3
  // from the allowance and 2 from the pack — the case the old reconciliation
  // could not see at all.
  const org = await makeOrg("r2-split");
  await grantCredits(db, { orgId: org, kind: "plan_allotment", credits: 3, expiresAt: soon });
  await grantCredits(db, {
    orgId: org, kind: "pack_purchase", credits: 200, expiresAt: farFuture,
    sourceRef: "evt-r2-pack", priceMicrodollars: 7_000_000,
  });

  const run = await hostedExplain(db, deps(okProvider), {
    orgId: org, frame: "pricing.png", buildHash: "r2-1", designHash: "d1",
    model: "claude-sonnet-5", pass: "analysis",
  });
  check("R2.0", run.ok && run.creditsCharged === 5, `analysis charged (${run.ok ? run.creditsCharged : run.code})`);

  const rows = await sourcesFor(org);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  check("R2.1",
    rows.length === 2 &&
      byKind.get("plan_allotment")?.credits === 3 &&
      byKind.get("pack_purchase")?.credits === 2,
    `one charge, two funding sources with the right kinds (${rows.map((r) => `${r.kind}:${r.credits}`).join(", ")})`);
  check("R2.2",
    rows.reduce((s, r) => s + r.cost, 0) === SONNET_COST && rows.every((r) => r.eventCost === SONNET_COST),
    `the attributed costs sum to the event's own cost (${rows.map((r) => r.cost).join(" + ")} = ${SONNET_COST}µ$)`);

  // A failed analysis costs the customer nothing. The reservation has exactly
  // one terminal transition, so a refunded charge never had an attribution row
  // to reverse — this asserts the absence, which is the whole guarantee.
  const before = await balance(db, org);
  const failed = await hostedExplain(db, deps(failingProvider), {
    orgId: org, frame: "pricing.png", buildHash: "r2-2", designHash: "d1",
    model: "claude-sonnet-5", pass: "analysis",
  });
  const after = await balance(db, org);
  const failedRows = (await sourcesFor(org)).filter((r) => r.status !== "charged");
  check("R2.3",
    !failed.ok && after === before && failedRows.length === 0,
    `failed analysis: credits refunded (${before} → ${after}) and no attribution row to reverse`);
}

// ═══ R3 — the month's report ══════════════════════════════════════════════
//
// Realistic volume, seeded directly. R2 above proves the economic path writes
// these rows; this section proves the arithmetic over a month's worth of them,
// which 300 real provider round-trips would prove no better and far slower.

/** Seeds one charged analysis funded entirely by `grant`, inside RECON_MONTH. */
async function seedCharged(orgId, grantId, grantKind, credits, costMicrodollars) {
  const eventId = await recordUsage(db, {
    orgId, model: "claude-sonnet-5", pass: "analysis", status: "charged",
    costMicrodollars, creditsCharged: credits,
  });
  await db.query("UPDATE usage_events SET created_at = $1 WHERE id = $2", [IN_MONTH, eventId]);
  await db.query(
    `INSERT INTO usage_credit_sources (usage_event_id, grant_id, grant_kind, credits, cost_microdollars)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, grantId, grantKind, credits, costMicrodollars]
  );
  return eventId;
}

const SUBSCRIPTION_PRICE = 59_000_000;
// The measured post-intro list-price review cost (calibration.md, FUTURENORMA
// §3). A subscriber burning its whole 500-credit allowance is 100 analyses.
const REVIEW_COST = 16_400;
const ANALYSES_PER_SUBSCRIBER = 100;
const SUBSCRIBERS = 3;
const PACK_PRICE = 7_000_000;

{
  // Three subscribers, each burning the monthly allowance the subscription
  // paid for. One of them also buys a $7 pack. One goodwill credit is issued.
  let packGrantId = null;
  for (let i = 0; i < SUBSCRIBERS; i++) {
    const org = await makeOrg(`r3-sub-${i}`);
    await recordSubscriptionPeriod(db, {
      orgId: org,
      periodStart: new Date(MONTH_START),
      periodEnd: new Date(MONTH_END),
      priceMicrodollars: SUBSCRIPTION_PRICE,
      sourceRef: `evt-r3-sub-${i}`,
    });
    const allotment = await grantCredits(db, {
      orgId: org, kind: "plan_allotment", credits: 500, expiresAt: farFuture,
      sourceRef: `evt-r3-allot-${i}`,
    });
    for (let n = 0; n < ANALYSES_PER_SUBSCRIBER; n++) {
      await seedCharged(org, allotment, "plan_allotment", 5, REVIEW_COST);
    }
    if (i === 0) {
      packGrantId = await grantCredits(db, {
        orgId: org, kind: "pack_purchase", credits: 100, expiresAt: farFuture,
        sourceRef: "evt-r3-pack", priceMicrodollars: PACK_PRICE,
      });
      await seedCharged(org, packGrantId, "pack_purchase", 5, REVIEW_COST);
    }
    await stampIntoMonth(org);
  }

  const goodwillOrg = await makeOrg("r3-goodwill");
  const goodwillGrant = await grantCredits(db, {
    orgId: goodwillOrg, kind: "goodwill", credits: 20, expiresAt: farFuture,
    sourceRef: "evt-r3-goodwill",
  });
  await seedCharged(goodwillOrg, goodwillGrant, "goodwill", 5, REVIEW_COST);
  await stampIntoMonth(goodwillOrg);

  const alerts = [];
  const report = await reconcileMonth(db, RECON_MONTH, (m) => alerts.push(m));

  const expectedAllotmentCogs = SUBSCRIBERS * ANALYSES_PER_SUBSCRIBER * REVIEW_COST;

  check("R3.1",
    report.subscription.grossMicrodollars === SUBSCRIBERS * SUBSCRIPTION_PRICE &&
      report.subscription.count === SUBSCRIBERS,
    `subscription revenue is visible: ${SUBSCRIBERS} periods, $${(report.subscription.grossMicrodollars / 1e6).toFixed(0)} — it used to be structurally invisible`);

  check("R3.2",
    report.cogs.allotmentFundedMicrodollars === expectedAllotmentCogs &&
      report.cogs.packFundedMicrodollars === REVIEW_COST &&
      report.cogs.goodwillFundedMicrodollars === REVIEW_COST &&
      report.cogs.unattributedMicrodollars === 0 &&
      report.cogs.totalMicrodollars ===
        expectedAllotmentCogs + REVIEW_COST + REVIEW_COST,
    `cost splits by funding source and the parts sum to the meter's total ` +
      `(allowance ${report.cogs.allotmentFundedMicrodollars}, pack ${report.cogs.packFundedMicrodollars}, ` +
      `goodwill ${report.cogs.goodwillFundedMicrodollars}, unattributed ${report.cogs.unattributedMicrodollars})`);

  check("R3.3",
    !report.alerted && alerts.length === 0 && report.grossMargin > 0.9,
    `a healthy month stays quiet: margin ${(report.grossMargin * 100).toFixed(1)}%`);

  // ── The guard ───────────────────────────────────────────────────────────
  // The old implementation: every provider dollar in the month, divided by
  // pack revenue alone. Same data, same month. If this does not fire, the
  // check above is proving nothing.
  const naiveMargin =
    (report.packs.grossMicrodollars - report.cogs.totalMicrodollars) / report.packs.grossMicrodollars;
  check("R3.4",
    naiveMargin < MARGIN_ALERT_THRESHOLD && report.grossMargin >= MARGIN_ALERT_THRESHOLD,
    `the old formula false-alarms on this same month — naive ${(naiveMargin * 100).toFixed(1)}% vs actual ${(report.grossMargin * 100).toFixed(1)}%`);

  check("R3.5",
    report.goodwillGrants === 1 && report.goodwillCreditsGranted === 20 &&
      report.cogs.goodwillFundedMicrodollars === REVIEW_COST,
    `goodwill is cost with no revenue, on its own line (${report.goodwillCreditsGranted} credits, $${(report.cogs.goodwillFundedMicrodollars / 1e6).toFixed(4)} spent)`);

  check("R3.6",
    !report.feesComplete && report.subscription.recordsMissingFees === SUBSCRIBERS &&
      report.packs.feeMicrodollars === 0,
    `unrecorded processor fees are flagged, not silently treated as zero (${report.subscription.recordsMissingFees} periods missing fees)`);

  check("R3.7",
    !report.storageMeasured && report.storageMicrodollars === 0,
    "storage cost is reported as unmeasured rather than assumed");

  const again = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R3.8",
    JSON.stringify(again) === JSON.stringify(report),
    "the report is deterministic — same month, same append-only records, same answer");
}

// ═══ R4 — spend nobody can account for is reported, not absorbed ══════════

{
  // A charged event with no funding record: what every pre-migration-011 row
  // looks like, and what a future path bypassing `economicPath.ts` would
  // create. Folding it into one of the funded lines would be a guess.
  const org = await makeOrg("r4-orphan");
  const eventId = await recordUsage(db, {
    orgId: org, model: "claude-sonnet-5", pass: "analysis", status: "charged",
    costMicrodollars: 500_000, creditsCharged: 5,
  });
  await db.query("UPDATE usage_events SET created_at = $1 WHERE id = $2", [IN_MONTH, eventId]);

  const report = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R4.1",
    report.cogs.unattributedMicrodollars === 500_000,
    `unfunded spend appears on its own line ($${(report.cogs.unattributedMicrodollars / 1e6).toFixed(2)}), not averaged into a funded one`);
  check("R4.2",
    report.cogs.allotmentFundedMicrodollars +
      report.cogs.packFundedMicrodollars +
      report.cogs.goodwillFundedMicrodollars +
      report.cogs.unattributedMicrodollars ===
      report.cogs.totalMicrodollars,
    "the four cost lines still sum to the meter's total");
  check("R4.3",
    report.contribution.totalMicrodollars ===
      report.subscription.netMicrodollars + report.packs.netMicrodollars - report.cogs.totalMicrodollars,
    "contribution is net revenue minus every cost line, including the unexplained one");
}

// ═══ R5 — fees and refunds move the numbers they should ═══════════════════

{
  const org = await makeOrg("r5-fees");
  // Paddle on $59 is 5% + $0.50 = $3.45.
  const periodId = await recordSubscriptionPeriod(db, {
    orgId: org,
    periodStart: new Date(MONTH_START),
    periodEnd: new Date(MONTH_END),
    priceMicrodollars: SUBSCRIPTION_PRICE,
    feeMicrodollars: 3_450_000,
    sourceRef: "evt-r5-sub",
  });

  const withFee = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R5.1",
    withFee.subscription.feeMicrodollars === 3_450_000 &&
      withFee.subscription.netMicrodollars ===
        withFee.subscription.grossMicrodollars - 3_450_000,
    `a recorded processor fee comes off net revenue ($${(withFee.subscription.feeMicrodollars / 1e6).toFixed(2)})`);

  const duplicate = await recordSubscriptionPeriod(db, {
    orgId: org,
    periodStart: new Date(MONTH_START),
    periodEnd: new Date(MONTH_END),
    priceMicrodollars: SUBSCRIPTION_PRICE,
    sourceRef: "evt-r5-sub",
  });
  const afterDuplicate = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R5.2",
    duplicate === null && afterDuplicate.subscription.count === withFee.subscription.count,
    "a replayed webhook records no second month of revenue");

  await refundSubscriptionPeriod(db, periodId, SUBSCRIPTION_PRICE);
  const refunded = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R5.3",
    refunded.subscription.refundedMicrodollars === SUBSCRIPTION_PRICE &&
      refunded.subscription.netMicrodollars ===
        withFee.subscription.netMicrodollars - SUBSCRIPTION_PRICE,
    `a refund reduces revenue in place and leaves the period on the record ($${(refunded.subscription.refundedMicrodollars / 1e6).toFixed(2)} refunded)`);

  await refundSubscriptionPeriod(db, periodId, SUBSCRIPTION_PRICE);
  const twice = await reconcileMonth(db, RECON_MONTH, () => {});
  check("R5.4",
    twice.subscription.refundedMicrodollars === SUBSCRIPTION_PRICE,
    "a repeated refund event cannot refund more than was charged");
}

// ═══ R6 — the alert still fires when it should ════════════════════════════

{
  // A month where provider cost genuinely exceeds half of net revenue. The
  // fix must not have turned the alert off, only stopped it crying wolf.
  const month = "2025-03";
  const org = await makeOrg("r6-loss");
  const grantId = await grantCredits(db, {
    orgId: org, kind: "pack_purchase", credits: 100, expiresAt: farFuture,
    sourceRef: "evt-r6-pack", priceMicrodollars: PACK_PRICE,
  });
  const eventId = await seedCharged(org, grantId, "pack_purchase", 5, 6_000_000);
  const marchStamp = "2025-03-11T10:00:00.000Z";
  await db.query("UPDATE usage_events SET created_at = $1 WHERE org_id = $2", [marchStamp, org]);
  await db.query("UPDATE credit_grants SET created_at = $1 WHERE org_id = $2", [marchStamp, org]);

  const alerts = [];
  const report = await reconcileMonth(db, month, (m) => alerts.push(m), { storageMicrodollars: 200_000 });
  check("R6.1",
    report.alerted && alerts.length === 1 && alerts[0].includes("reprice"),
    `margin ${(report.grossMargin * 100).toFixed(1)}% below ${MARGIN_ALERT_THRESHOLD * 100}% still fires the reprice alert`);
  check("R6.2",
    alerts[0].includes("subscription $0.00") && alerts[0].includes("packs $7.00") &&
      alerts[0].includes("storage $0.20"),
    "the alert names each pot, so an operator can see which one is wrong");
  check("R6.3",
    report.storageMeasured && report.contribution.totalMicrodollars === PACK_PRICE - 6_000_000 - 200_000,
    `supplied storage cost is subtracted from contribution ($${(report.contribution.totalMicrodollars / 1e6).toFixed(2)})`);
  check("R6.4",
    !report.feesComplete && alerts[0].includes("real margin is lower"),
    "with fees unrecorded the alert says so rather than implying the figure is final");
  void eventId;
}

await db.close();

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("Reconciliation attribution suite: all checks passed");
