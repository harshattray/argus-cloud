// Build 4.0 Phase C suite (C1–C8 table in BuildV4.md).
// Run: npm test
// Runs on PGlite (real Postgres in-process) by default; set DATABASE_URL to
// run the identical suite against a real Postgres server.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits, balance, consumeCredits, InsufficientCreditsError } = await import(path.join(DIST, "ledger.js"));
const { recordUsage } = await import(path.join(DIST, "usage.js"));
const { createApiKey, findApiKey } = await import(path.join(DIST, "apiKeys.js"));
const { handleMorWebhook, signBody } = await import(path.join(DIST, "webhooks.js"));
const { hostedExplain, CREDITS_PER_ANALYSIS, CREDITS_PER_DEEP, AUTO_EXPLAIN_PER_RUN_CAP } = await import(path.join(DIST, "explainService.js"));
const { isTripped, resetBreaker, EXPLAIN_PAUSED_MESSAGE } = await import(path.join(DIST, "breaker.js"));
const { reconcileMonth } = await import(path.join(DIST, "reconcile.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

async function makeOrg(name) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  return id;
}

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const okFindings = {
  findings: [
    { frame: "x.png", region: { x: 0, y: 0, width: 10, height: 10 }, category: "spacing",
      observation: "gap differs", cssHypothesis: "", selector: "", codePointer: "", suggestedFix: "", confidence: "high" },
  ],
};
const okProvider = async () => ({
  kind: "ok",
  json: structuredClone(okFindings),
  usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
});
const deps = (provider, { budget = 10_000_000_000, alerts = [] } = {}) => ({
  provider,
  dailyBudgetMicrodollars: budget,
  alert: (msg) => alerts.push(msg),
});
const baseReq = (orgId, over = {}) => ({
  orgId,
  frame: "pricing.png",
  buildHash: "b1",
  designHash: "d1",
  model: "claude-sonnet-5",
  pass: "analysis",
  ...over,
});

// ═══ C1 — ledger: expiry, exact-zero, concurrent decrements ═══════════════

{
  const org = await makeOrg("c1-expiry");
  await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 5, expiresAt: new Date(Date.now() - 1000) });
  check("C1.1", (await balance(db, org)) === 0, "expired grant contributes nothing to the balance");
  let threw = false;
  try { await consumeCredits(db, org, 1); } catch (e) { threw = e instanceof InsufficientCreditsError; }
  check("C1.2", threw, "consuming from an expired grant fails");

  const org2 = await makeOrg("c1-zero");
  await grantCredits(db, { orgId: org2, kind: "plan_allotment", credits: 3, expiresAt: farFuture });
  await consumeCredits(db, org2, 3);
  check("C1.3", (await balance(db, org2)) === 0, "exact-zero consumption reaches 0");
  let threwZero = false;
  try { await consumeCredits(db, org2, 1); } catch (e) { threwZero = e instanceof InsufficientCreditsError; }
  check("C1.4", threwZero && (await balance(db, org2)) === 0, "consumption at zero fails; balance never negative");

  const org3 = await makeOrg("c1-race");
  await grantCredits(db, { orgId: org3, kind: "pack_purchase", credits: 10, expiresAt: farFuture });
  const attempts = await Promise.allSettled(
    Array.from({ length: 25 }, () => consumeCredits(db, org3, 1))
  );
  const okCount = attempts.filter((a) => a.status === "fulfilled").length;
  const finalBalance = await balance(db, org3);
  check("C1.5", okCount === 10 && finalBalance === 0,
    `25 concurrent decrements of 10 credits: ${okCount} succeeded, balance ${finalBalance} (never negative)`);

  // Expiry-first ordering: the earlier-expiring grant is consumed first.
  const org4 = await makeOrg("c1-order");
  const soon = new Date(Date.now() + 24 * 3600 * 1000);
  await grantCredits(db, { orgId: org4, kind: "pack_purchase", credits: 2, expiresAt: soon });
  await grantCredits(db, { orgId: org4, kind: "pack_purchase", credits: 5, expiresAt: farFuture });
  const consumed = await consumeCredits(db, org4, 3);
  check("C1.6", consumed.length === 2 && consumed[0].amount === 2,
    "consumption drains the earliest-expiring grant first");
}

// ═══ C2 — per-run auto-explain cap ════════════════════════════════════════

{
  const org = await makeOrg("c2");
  await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 100, expiresAt: farFuture });
  const runId = "run-c2";
  const outcomes = [];
  for (let i = 0; i < AUTO_EXPLAIN_PER_RUN_CAP + 1; i++) {
    outcomes.push(
      await hostedExplain(db, deps(okProvider), baseReq(org, { runId, auto: true, frame: `f${i}.png`, buildHash: `b${i}` }))
    );
  }
  const sixth = outcomes[AUTO_EXPLAIN_PER_RUN_CAP];
  check("C2.1", outcomes.slice(0, AUTO_EXPLAIN_PER_RUN_CAP).every((o) => o.ok) && !sixth.ok && sixth.code === "run_cap",
    `frames 1–${AUTO_EXPLAIN_PER_RUN_CAP} analyzed; frame ${AUTO_EXPLAIN_PER_RUN_CAP + 1} capped`);
  check("C2.2", !sixth.ok && sixth.message.includes("manually") && sixth.ciStaysGreen,
    "cap message offers the manual (paid) trigger and CI stays green");
  const manual = await hostedExplain(db, deps(okProvider), baseReq(org, { runId, auto: false, frame: "f9.png", buildHash: "b9" }));
  check("C2.3", manual.ok === true, "manual trigger still works past the auto cap");
}

// ═══ C3 — result cache: free hits, org-scoped ═════════════════════════════

{
  const orgA = await makeOrg("c3-a");
  const orgB = await makeOrg("c3-b");
  for (const org of [orgA, orgB]) {
    await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 10, expiresAt: farFuture });
  }
  let calls = 0;
  const counting = async () => { calls++; return okProvider(); };

  const first = await hostedExplain(db, deps(counting), baseReq(orgA));
  const balAfterFirst = await balance(db, orgA);
  const second = await hostedExplain(db, deps(counting), baseReq(orgA));
  const balAfterSecond = await balance(db, orgA);
  check("C3.1", first.ok && !first.cached && second.ok && second.cached && calls === 1,
    `identical re-request served from cache (provider calls: ${calls})`);
  const afterOne = 10 - CREDITS_PER_ANALYSIS;
  check("C3.2", balAfterFirst === afterOne && balAfterSecond === afterOne && second.creditsCharged === 0,
    `cache hit is free — no decrement (balance held at ${balAfterSecond} after one ${CREDITS_PER_ANALYSIS}-credit analysis)`);
  const events = await db.query(
    "SELECT status FROM usage_events WHERE org_id = $1 ORDER BY id", [orgA]);
  check("C3.3", events.rows.map((r) => r.status).join(",") === "charged,cache_hit",
    "both outcomes metered append-only");

  const crossOrg = await hostedExplain(db, deps(counting), baseReq(orgB));
  check("C3.4", crossOrg.ok && !crossOrg.cached && calls === 2,
    "identical content from another org is a cache MISS (no cross-tenant reads)");
}

// ═══ C4 — failed analyses cost nothing ════════════════════════════════════

{
  const org = await makeOrg("c4");
  await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 10, expiresAt: farFuture });
  const scenarios = [
    ["provider-500", async () => ({ kind: "error", message: "API error 500" })],
    ["refusal", async () => ({ kind: "refusal" })],
    ["schema-fail", async () => ({ kind: "ok", json: { findings: "not-an-array" }, usage: { inputTokens: 10, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } })],
  ];
  let allRefunded = true;
  for (const [label, provider] of scenarios) {
    const out = await hostedExplain(db, deps(provider), baseReq(org, { buildHash: `c4-${label}` }));
    const bal = await balance(db, org);
    if (out.ok || out.code !== "analysis_failed" || bal !== 10 || !out.message.includes("no credits were used")) {
      allRefunded = false;
      console.log(`       ${label}: ok=${out.ok} code=${out.code ?? ""} balance=${bal}`);
    }
  }
  const logged = await db.query(
    "SELECT COUNT(*) AS n FROM usage_events WHERE org_id = $1 AND status = 'failed_no_charge'", [org]);
  check("C4.1", allRefunded, "provider 500 / refusal / schema fail → zero charge, honest message");
  check("C4.2", Number(logged.rows[0].n) === 3, "every failure logged as failed_no_charge");
}

// ═══ C5 — MoR webhook → grant; tampered signature rejected ════════════════

{
  const org = await makeOrg("c5");
  await db.query("INSERT INTO products (id, credits, price_microdollars) VALUES ('pack-200', 200, 79000000)");
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ event_id: "evt_1", event_type: "pack.purchased", org_id: org, product_id: "pack-200" });

  const good = await handleMorWebhook(db, body, signBody(body, secret), secret);
  check("C5.1", good.ok && good.granted && (await balance(db, org)) === 200,
    "valid webhook → 200-credit grant appears");

  const replay = await handleMorWebhook(db, body, signBody(body, secret), secret);
  check("C5.2", replay.ok && !replay.granted && (await balance(db, org)) === 200,
    "webhook retry (same event id) never double-grants");

  const tampered = body.replace("pack-200", "pack-999");
  const bad = await handleMorWebhook(db, tampered, signBody(body, secret), secret);
  check("C5.3", !bad.ok && bad.code === "bad_signature" && (await balance(db, org)) === 200,
    "tampered payload rejected before any effect");

  const unknownBody = JSON.stringify({ event_id: "evt_2", event_type: "pack.purchased", org_id: org, product_id: "nope" });
  const unknown = await handleMorWebhook(db, unknownBody, signBody(unknownBody, secret), secret);
  check("C5.4", !unknown.ok && unknown.code === "unknown_product" && (await balance(db, org)) === 200,
    "unknown product grants nothing");
}

// ═══ C6 — circuit breaker: paused explain, unaffected product ═════════════
//
// Rewritten 2026-08-10 for provider-dollar reservations (PATHWAYS §10.3 1B.1).
// The old C6.1 asserted the *weaker* pre-reservation guarantee: the call went
// through, the spend was recorded, and only then did the breaker trip — i.e.
// the budget was discovered after it had been exceeded. The reservation now
// refuses the call up front, so the assertion moves with it: no provider call,
// no spend, no credits, and the breaker still trips stickily.

{
  const org = await makeOrg("c6");
  await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 50, expiresAt: farFuture });
  const alerts = [];
  // Budget below one analysis cost (~15K in × $3 + 1.2K out × $15 ≈ $0.063),
  // and therefore far below its hard maximum.
  const tinyDeps = deps(okProvider, { budget: 10_000, alerts });
  let providerCalls = 0;
  const countingDeps = {
    ...tinyDeps,
    provider: async (...args) => {
      providerCalls++;
      return okProvider(...args);
    },
  };

  const spendBefore = Number(
    (await db.query("SELECT COALESCE(SUM(spend_microdollars), 0) AS t FROM provider_spend_days")).rows[0].t
  );
  const tripping = await hostedExplain(db, countingDeps, baseReq(org, { buildHash: "c6-1" }));
  const spendAfter = Number(
    (await db.query("SELECT COALESCE(SUM(spend_microdollars), 0) AS t FROM provider_spend_days")).rows[0].t
  );
  check("C6.1", !tripping.ok && tripping.code === "explain_paused" && (await isTripped(db)) && alerts.length === 1,
    "a call that cannot fit the daily budget is refused, and the breaker trips stickily with one alert");
  check("C6.1b", providerCalls === 0 && spendAfter === spendBefore,
    `the provider was never called and nothing was spent (${providerCalls} calls, ${spendAfter - spendBefore} microdollars)`);
  check("C6.1c", (await balance(db, org)) === 50 && tripping.ciStaysGreen,
    "no credits were touched and CI stays green");

  const paused = await hostedExplain(db, tinyDeps, baseReq(org, { buildHash: "c6-2" }));
  const balAfter = await balance(db, org);
  check("C6.2", !paused.ok && paused.code === "explain_paused" && paused.message === EXPLAIN_PAUSED_MESSAGE && balAfter === 50,
    "explain paused everywhere with the honest message; no credits touched");

  // The product is unaffected: uploads/runs tables keep working.
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ('r-c6', $1, 'web')", [org]);
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, summary, state) VALUES ('run-c6', $1, 'r-c6', '{}'::jsonb, 'committed')", [org]);
  const run = await db.query("SELECT id FROM runs WHERE id = 'run-c6'");
  check("C6.3", run.rows.length === 1 && alerts.length === 1,
    "uploads/reports/diffs unaffected; alert fired exactly once");

  await resetBreaker(db, { actor: "test-operator", reason: "suite continues after a deliberate trip" });
  const resumed = await hostedExplain(db, deps(okProvider), baseReq(org, { buildHash: "c6-3" }));
  check("C6.4", resumed.ok === true && !(await isTripped(db)), "manual reset resumes explain");
}

// ═══ C7 — agent key exhausts budget mid-run; CI stays green ═══════════════

{
  const org = await makeOrg("c7");
  await grantCredits(db, { orgId: org, kind: "pack_purchase", credits: 100, expiresAt: farFuture });
  const threeAnalyses = 3 * CREDITS_PER_ANALYSIS;
  const { plaintext } = await createApiKey(db, org, { kind: "agent", monthlyBudgetCredits: threeAnalyses, label: "ci-agent" });
  const key = await findApiKey(db, plaintext);
  check("C7.1", key && key.kind === "agent" && key.monthly_budget_credits === threeAnalyses,
    `agent key resolves with a budget of three analyses (${threeAnalyses} credits)`);

  const first = await hostedExplain(db, deps(okProvider), baseReq(org, { apiKey: key, buildHash: "c7-1" }));
  const second = await hostedExplain(db, deps(okProvider), baseReq(org, { apiKey: key, buildHash: "c7-2" }));
  const third = await hostedExplain(db, deps(okProvider), baseReq(org, { apiKey: key, buildHash: "c7-3" }));
  check("C7.2", first.ok && second.ok && third.ok, `agent key works within budget (3 × ${CREDITS_PER_ANALYSIS} credits)`);

  const exhausted = await hostedExplain(db, deps(okProvider), baseReq(org, { apiKey: key, buildHash: "c7-4" }));
  check("C7.3",
    !exhausted.ok && exhausted.code === "agent_budget_exhausted" && exhausted.ciStaysGreen &&
      exhausted.message.includes(`used ${threeAnalyses} of its ${threeAnalyses}`) && exhausted.message.includes("monthly credits"),
    `exhaustion → clear error, CI green (${exhausted.ok ? "?" : exhausted.message.slice(0, 60)}…)`);

  const deep = await hostedExplain(db, deps(okProvider), baseReq(org, { apiKey: key, pass: "deep", buildHash: "c7-5" }));
  check("C7.4", !deep.ok && deep.code === "agent_budget_exhausted",
    `deep pass (${CREDITS_PER_DEEP} credits) also refused once over budget`);
}

// ═══ C8 — reconciliation ══════════════════════════════════════════════════
//
// Moved to `test/reconcile.test.mjs` (2026-08-13, Pathway 1 item 7). The
// checks that lived here seeded into the *current* month, which every other
// suite in this file also writes into, so they could only assert `>=` and a
// margin ranging over whatever else had run. The reconciliation the product
// now needs — subscription revenue, cost split by funding grant, goodwill and
// unattributed spend kept apart — is not assertable that way. The new suite
// seeds an isolated past month and asserts exact figures, including a guard
// (R3.4) that runs the old formula over the same data to prove it false-alarms.
{
  const report = await reconcileMonth(db, new Date().toISOString().slice(0, 7), () => {});
  check("C8.1", typeof report.cogs.totalMicrodollars === "number" && report.month.length === 7,
    "reconcileMonth still reads this suite's own month without throwing");
}

await db.close();

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("Build 4.0 Phase C suite: all checks passed");
