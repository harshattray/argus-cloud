// Provider-dollar reservation suite — PATHWAYS.md §10.3 "1B.1"–"1B.3";
// FUTURENORMA Doctrine 11 ("economic loss firewall").
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/providerBudget.test.mjs
//
// The claim under test is that concurrent requests cannot collectively exceed a
// budget. PGlite proves the read-then-write interleaving is closed on one
// connection. P4r spawns 20 real processes when DATABASE_URL is set, and P4b
// runs the *pre-1B.1* logic — check the recorded total, then call — through the
// same 20 processes, so P4r is known to have teeth.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { hostedExplain } = await import(path.join(DIST, "explainService.js"));
const { resetBreaker, isTripped } = await import(path.join(DIST, "breaker.js"));
const { buildUserContent, TRUNCATION_NOTE } = await import(path.join(DIST, "promptAssembly.js"));
const { SYSTEM_PROMPTS } = await import(path.join(DIST, "hostedPrompt.js"));
const {
  HARD_CAPS,
  maxInputTokens,
  hardMaxCostMicrodollars,
  marginReport,
  quoteModel,
  creditsRequired,
  MARGIN_FLOOR,
  reserveProviderBudget,
  settleProviderBudget,
  releaseProviderBudget,
  sweepExpiredReservations,
  globalDayStatus,
  thresholdCrossed,
  CREDIT_REVENUE_FLOOR_MICRODOLLARS,
  RESERVATION_TTL_SECONDS,
} = await import(path.join(DIST, "providerBudget.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

async function makeOrg() {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, "pb-" + id.slice(0, 8)]);
  return id;
}
const state = async (id) =>
  (await db.query("SELECT state, max_microdollars, actual_microdollars FROM provider_reservations WHERE id = $1", [id]))
    .rows[0];
const daySpend = async (day) =>
  Number(
    (await db.query("SELECT COALESCE(spend_microdollars, 0) AS t FROM provider_spend_days WHERE day = $1", [day]))
      .rows[0]?.t ?? 0
  );

const T0 = new Date("2026-08-10T12:00:00.000Z");
const DAY = "2026-08-10";
const SONNET = "claude-sonnet-5";
const OPUS = "claude-opus-4-8";

// --- P1: the hard maximum comes from caps, not from measurement -----------
{
  const hardMax = hardMaxCostMicrodollars(SONNET);
  const { system, user, image } = maxInputTokens();
  check("P1.1", typeof hardMax === "number" && hardMax > 0, `a sonnet analysis can cost at most $${(hardMax / 1e6).toFixed(4)}`);
  check(
    "P1.2",
    system === Math.ceil(HARD_CAPS.maxSystemPromptChars / HARD_CAPS.charsPerToken) &&
      user === Math.ceil(HARD_CAPS.maxUserContentChars / HARD_CAPS.charsPerToken),
    `input is bounded by the prompt caps, not by a sample (${system} system + ${user} user tokens)`
  );
  // The measured blended cost is ~$0.0164. The hard maximum must be above it —
  // if it were not, the "maximum" would be under-stating real traffic.
  check("P1.3", hardMax > 16_400, `the hard maximum exceeds the measured blended cost of $0.0164 ($${(hardMax / 1e6).toFixed(4)})`);
  check("P1.4", Math.abs(hardMaxCostMicrodollars(SONNET, { batch: true }) - hardMax * 0.5) <= 1, "the batch rate halves it");
  check("P1.5", hardMaxCostMicrodollars("model-we-never-priced") === null, "an unpriced model has no maximum — it cannot be authorized");

  // P1.6 — the system-prompt cap, measured against the real strings.
  //
  // `maxSystemPromptChars` said "Asserted against the real prompt in tests" and
  // was not: the prompts lived in `web/`, which this suite cannot import, so
  // P1.2 above only ever proved the constant equalled itself. The prompt is
  // priced into every reservation as a cache write, so one that outgrew the cap
  // would under-state the maximum cost of every call with nothing failing.
  // Moved into the package on 2026-08-19 so this can be true.
  const longest = Object.entries(SYSTEM_PROMPTS).sort((a, b) => b[1].length - a[1].length)[0];
  check(
    "P1.6",
    Object.values(SYSTEM_PROMPTS).every((p) => p.length <= HARD_CAPS.maxSystemPromptChars),
    `every system prompt fits the cap the reservation is derived from — longest is ${longest[0]} at ${longest[1].length} of ${HARD_CAPS.maxSystemPromptChars} chars`
  );
  check(
    "P1.7",
    Object.keys(SYSTEM_PROMPTS).length >= 2 && longest[1].length > 0,
    `and the cap is measured against every prompt that can be sent, not just one (${Object.keys(SYSTEM_PROMPTS).length} prompts)`
  );
  // The crop prompt must actually describe crops, or a crop-grounded request
  // would carry the hedge telling the model it has not been shown pixels.
  check(
    "P1.8",
    /NOT been shown pixels/.test(SYSTEM_PROMPTS.HOSTED_SYSTEM_PROMPT) &&
      !/NOT been shown pixels/.test(SYSTEM_PROMPTS.HOSTED_SYSTEM_PROMPT_CROPS) &&
      /untrusted/.test(SYSTEM_PROMPTS.HOSTED_SYSTEM_PROMPT_CROPS),
    "the hedge is on the metadata prompt only, and the crop prompt still calls the images untrusted"
  );
}

// --- P2: the prompt cap that makes the maximum real ----------------------
{
  const hostile = { blob: "x".repeat(500_000), nested: { more: "y".repeat(200_000) } };
  const content = buildUserContent({ frame: "a.png", label: "A", threshold: 0.5, stats: hostile }, null);
  check("P2.1", content.length <= HARD_CAPS.maxUserContentChars, `a 700KB stats blob assembles to ${content.length} chars, within the ${HARD_CAPS.maxUserContentChars} cap`);
  check("P2.2", content.includes(TRUNCATION_NOTE), "the model is told the data was cut rather than being handed a silent fragment");
  check("P2.3", content.includes("</frame-diff-data>"), "the data delimiter still closes — truncation cannot strip the boundary that marks it as data");
  const big = "e".repeat(400_000);
  const withEnrichment = buildUserContent({ frame: "a.png", label: "A", threshold: 0.5, stats: { a: 1 } }, big);
  check("P2.4", withEnrichment.length <= HARD_CAPS.maxUserContentChars, `an oversized enrichment block is also capped (${withEnrichment.length} chars)`);
  const small = buildUserContent({ frame: "a.png", label: "A", threshold: 0.5, stats: { mismatch: 4.2 } }, null);
  check("P2.5", !small.includes(TRUNCATION_NOTE) && small.includes("4.2"), "ordinary payloads pass through untouched");
}

// --- P3: a reservation is visible before the call ------------------------
{
  const orgId = await makeOrg();
  const hardMax = hardMaxCostMicrodollars(SONNET);
  const budget = hardMax * 2 + 10; // room for exactly two

  const first = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0,
  });
  const second = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0,
  });
  const third = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0,
  });
  check("P3.1", first.ok && second.ok, "two reservations fit a budget sized for two");
  check("P3.2", !third.ok && third.code === "budget_exhausted" && third.scope === "global-day", "the third is refused — outstanding reservations count, nothing was spent yet");
  check("P3.3", third.ok === false && third.outstandingMicrodollars === hardMax * 2, `the refusal reports what is in flight ($${(third.outstandingMicrodollars / 1e6).toFixed(4)})`);
  check("P3.4", (await daySpend(DAY)) === 0, "no spend has been recorded — a reservation is not a charge");

  // Releasing one frees exactly its own capacity.
  await releaseProviderBudget(db, second.reservationId);
  const fourth = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0,
  });
  check("P3.5", fourth.ok, "releasing a reservation frees its capacity for the next request");
  check("P3.6", (await state(second.reservationId)).state === "released", "the released row is terminal, not deleted");
}

// --- P4: concurrency — the whole point -----------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  const orgId = await makeOrg();
  const hardMax = hardMaxCostMicrodollars(SONNET);
  const room = 3;
  const budget = hardMax * room + 10;

  const results = await Promise.all(
    Array.from({ length: 40 }, () =>
      reserveProviderBudget(db, {
        reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
        limits: { globalDailyMicrodollars: budget }, now: T0,
      })
    )
  );
  const granted = results.filter((r) => r.ok).length;
  check("P4.1", granted === room, `40 concurrent requests against a budget with room for ${room} granted exactly ${room} (${granted})`);
  const outstanding = Number(
    (await db.query("SELECT COALESCE(SUM(max_microdollars),0) AS t FROM provider_reservations WHERE state = 'reserved'")).rows[0].t
  );
  check("P4.2", outstanding <= budget, `total reserved ($${(outstanding / 1e6).toFixed(4)}) never exceeds the budget ($${(budget / 1e6).toFixed(4)})`);
}

// --- P4r/P4b (real Postgres): 20 separate processes ----------------------
if (REAL_PG) {
  const tmp = await mkdtemp(path.join(HERE, ".tmp-budget-"));
  try {
    await db.query("DELETE FROM provider_reservations");
    await db.query("DELETE FROM provider_spend_days");
    const orgId = await makeOrg();
    const hardMax = hardMaxCostMicrodollars(SONNET);
    const room = 4;
    const budget = hardMax * room + 10;

    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `import { randomUUID } from "node:crypto";\n` +
        `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { reserveProviderBudget } = await import(${JSON.stringify(path.join(DIST, "providerBudget.js"))});\n` +
        `const db = await createDb();\n` +
        `const r = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: process.env.ORG_ID,\n` +
        `  model: ${JSON.stringify(SONNET)}, pass: "analysis",\n` +
        `  limits: { globalDailyMicrodollars: Number(process.env.BUDGET) }, now: new Date(process.env.NOW) });\n` +
        `console.log(r.ok ? "granted" : "refused");\n` +
        `await db.close();\n`
    );

    // The pre-1B.1 shape: read the recorded total, decide, then "call". No
    // reservation is written, so nothing a concurrent process does is visible.
    const oldWorker = path.join(tmp, "old-worker.mjs");
    await writeFile(
      oldWorker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const db = await createDb();\n` +
        `const spent = Number((await db.query("SELECT COALESCE(spend_microdollars,0) AS t FROM provider_spend_days WHERE day = $1", [process.env.DAY])).rows[0]?.t ?? 0);\n` +
        `console.log(spent < Number(process.env.BUDGET) ? "granted" : "refused");\n` +
        `await db.close();\n`
    );

    const { spawn } = await import("node:child_process");
    const run = (file) =>
      Promise.all(
        Array.from(
          { length: 20 },
          () =>
            new Promise((resolve) => {
              const child = spawn(process.execPath, [file], {
                env: { ...process.env, ORG_ID: orgId, BUDGET: String(budget), NOW: T0.toISOString(), DAY },
              });
              let out = "";
              let err = "";
              child.stdout.on("data", (d) => (out += d));
              child.stderr.on("data", (d) => (err += d));
              child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
            })
        )
      );

    const results = await run(worker);
    const failed = results.filter((r) => r.code !== 0);
    check("P4r.1", failed.length === 0, `20 separate processes reserved against one budget, ${failed.length} failed` + (failed.length ? ` — ${failed[0].err.split("\n").filter(Boolean).pop()}` : ""));
    const granted = results.filter((r) => r.out === "granted").length;
    check("P4r.2", granted === room, `across 20 processes exactly ${room} were granted (${granted})`);
    const outstanding = Number(
      (await db.query("SELECT COALESCE(SUM(max_microdollars),0) AS t FROM provider_reservations WHERE state = 'reserved'")).rows[0].t
    );
    check("P4r.3", outstanding <= budget, `nothing overshot: $${(outstanding / 1e6).toFixed(4)} reserved against a $${(budget / 1e6).toFixed(4)} budget`);

    const oldResults = await run(oldWorker);
    const oldGranted = oldResults.filter((r) => r.out === "granted").length;
    check("P4b.1", oldGranted === 20, `the pre-1B.1 check-then-call logic admits all 20 against room for ${room} (${oldGranted}) — P4r has teeth`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// --- P5: settlement is idempotent ----------------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  const orgId = await makeOrg();
  const id = randomUUID();
  const reserved = await reserveProviderBudget(db, {
    reservationId: id, orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: 10_000_000 }, now: T0,
  });
  const actual = 12_345;
  const settled = await settleProviderBudget(db, id, actual, T0);
  check("P5.1", settled.ok && settled.alreadySettled === false && (await daySpend(DAY)) === actual, `settling records the real cost, not the reservation (${await daySpend(DAY)} of a ${reserved.maxMicrodollars} maximum)`);

  const again = await settleProviderBudget(db, id, actual, T0);
  check("P5.2", again.ok && again.alreadySettled === true && (await daySpend(DAY)) === actual, "a retried worker settles nothing a second time — the day's spend is unchanged");
  check("P5.3", (await state(id)).state === "settled", "and the row stays in its terminal state");

  const releaseAfterSettle = await releaseProviderBudget(db, id);
  check("P5.4", releaseAfterSettle.released === false && (await state(id)).state === "settled", "a settled reservation cannot be released back — only one terminal transition is legal");

  const other = randomUUID();
  await reserveProviderBudget(db, {
    reservationId: other, orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: 10_000_000 }, now: T0,
  });
  await releaseProviderBudget(db, other);
  const settleAfterRelease = await settleProviderBudget(db, other, 999, T0);
  check("P5.5", !settleAfterRelease.ok && settleAfterRelease.code === "not_reservable", "a released reservation cannot then be charged");
  check("P5.6", (await daySpend(DAY)) === actual, "and that refusal added nothing to the day");

  const unknown = await settleProviderBudget(db, randomUUID(), 500, T0);
  check("P5.7", !unknown.ok && unknown.code === "unknown_reservation", "settling an id we never issued is refused, not invented");
}

// --- P6: expiry ----------------------------------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  const orgId = await makeOrg();
  const hardMax = hardMaxCostMicrodollars(SONNET);
  const budget = hardMax + 10; // room for exactly one

  const abandoned = randomUUID();
  await reserveProviderBudget(db, {
    reservationId: abandoned, orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0, ttlSeconds: 60,
  });
  const blocked = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: T0,
  });
  check("P6.1", !blocked.ok, "while it is live, the abandoned reservation holds the budget");

  const later = new Date(T0.getTime() + 120_000);
  const afterExpiry = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: budget }, now: later,
  });
  check("P6.2", afterExpiry.ok, "once expired it stops holding capacity, with or without the sweeper");

  const swept = await sweepExpiredReservations(db, later);
  check("P6.3", swept === 1 && (await state(abandoned)).state === "expired", `the sweeper marks it (${swept} swept)`);

  const lateSettle = await settleProviderBudget(db, abandoned, 7_000, later);
  check("P6.4", lateSettle.ok && (await daySpend(DAY)) === 7_000, "a late worker's real spend is still recorded — expiry ends permission, not accounting");
  check("P6.5", RESERVATION_TTL_SECONDS >= 60, `the default life is ${RESERVATION_TTL_SECONDS}s`);
}

// --- P7: tenant scopes ---------------------------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  const orgA = await makeOrg();
  const orgB = await makeOrg();
  const hardMax = hardMaxCostMicrodollars(SONNET);
  const limits = { globalDailyMicrodollars: 100_000_000, orgMonthlyMicrodollars: hardMax + 10 };

  const a1 = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: orgA, model: SONNET, pass: "analysis", limits, now: T0 });
  const a2 = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: orgA, model: SONNET, pass: "analysis", limits, now: T0 });
  check("P7.1", a1.ok && !a2.ok && a2.scope === "org-month", "an org ceiling refuses the org's second call while the global budget is wide open");

  const b1 = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: orgB, model: SONNET, pass: "analysis", limits, now: T0 });
  check("P7.2", b1.ok, "org B is unaffected by org A exhausting its own ceiling");

  const unlimited = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId: orgA, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: 100_000_000 }, now: T0,
  });
  check("P7.3", unlimited.ok, "with no org ceiling configured the scope is not enforced — credits remain the org's cap");

  const key = await createApiKey(db, orgA, { kind: "agent" });
  const keyLimits = { globalDailyMicrodollars: 100_000_000, keyMonthlyMicrodollars: hardMax + 10 };
  const k1 = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: orgA, apiKeyId: key.id, model: SONNET, pass: "analysis", limits: keyLimits, now: T0 });
  const k2 = await reserveProviderBudget(db, { reservationId: randomUUID(), orgId: orgA, apiKeyId: key.id, model: SONNET, pass: "analysis", limits: keyLimits, now: T0 });
  check("P7.4", k1.ok && !k2.ok && k2.scope === "key-month", "a per-key dollar ceiling bounds one runaway agent without touching the org");

  await db.query("DELETE FROM orgs WHERE id = $1", [orgA]);
  const left = await db.query("SELECT id FROM provider_reservations WHERE org_id = $1", [orgA]);
  check("P7.5", left.rows.length === 0, "deleting an org takes its reservations with it (ON DELETE CASCADE)");
}

// --- P8: alerts ----------------------------------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  const orgId = await makeOrg();
  const limit = 1_000_000;
  await reserveProviderBudget(db, { reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis", limits: { globalDailyMicrodollars: limit }, now: T0 });
  const status = await globalDayStatus(db, limit, T0);
  check("P8.1", status.outstandingMicrodollars > 0 && status.committedMicrodollars === 0, "the status view separates money in flight from money spent");
  check("P8.2", status.usedPercent > 0, `and reports usage including reservations (${status.usedPercent.toFixed(1)}%)`);
  check("P8.3", thresholdCrossed(49) === null && thresholdCrossed(50) === 50 && thresholdCrossed(76) === 75 && thresholdCrossed(100) === 100, "thresholds band at 50/75/90/100");
  check("P8.4", thresholdCrossed(null) === null, "an unlimited scope crosses nothing");
}

// --- P9: end to end through hostedExplain --------------------------------
{
  await db.query("DELETE FROM provider_reservations");
  await db.query("DELETE FROM provider_spend_days");
  await resetBreaker(db, { actor: "test-operator", reason: "suite continues after a deliberate trip" });
  const orgId = await makeOrg();
  await grantCredits(db, { orgId, kind: "pack_purchase", credits: 50, expiresAt: new Date(Date.now() + 365 * 864e5) });

  const okProvider = async () => ({
    kind: "ok",
    json: { findings: [{ frame: "x.png", region: { x: 0, y: 0, width: 1, height: 1 }, category: "spacing", observation: "gap differs", cssHypothesis: "", selector: "", codePointer: "", suggestedFix: "", confidence: "high" }] },
    usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  });
  const deps = (provider) => ({ provider, dailyBudgetMicrodollars: 50_000_000, alert: () => {} });
  const req = (over = {}) => ({ orgId, frame: "x.png", buildHash: "b", designHash: "d", model: SONNET, pass: "analysis", ...over });

  const good = await hostedExplain(db, deps(okProvider), req());
  const rows = (await db.query("SELECT state, max_microdollars, actual_microdollars FROM provider_reservations")).rows;
  check("P9.1", good.ok && rows.length === 1 && rows[0].state === "settled", "a successful explain leaves exactly one settled reservation");
  check(
    "P9.2",
    Number(rows[0].actual_microdollars) < Number(rows[0].max_microdollars),
    `the settled cost ($${(Number(rows[0].actual_microdollars) / 1e6).toFixed(4)}) is well under the maximum reserved ($${(Number(rows[0].max_microdollars) / 1e6).toFixed(4)}) — the difference was released`
  );
  const spend = Number((await db.query("SELECT COALESCE(SUM(spend_microdollars),0) AS t FROM provider_spend_days")).rows[0].t);
  check("P9.3", spend === Number(rows[0].actual_microdollars), `the day's spend equals the settled amount and is counted exactly once (${spend})`);

  const failing = async () => ({ kind: "error", message: "provider exploded" });
  const balBefore = await balance(db, orgId);
  const bad = await hostedExplain(db, deps(failing), req({ buildHash: "b2" }));
  const released = (await db.query("SELECT state FROM provider_reservations WHERE state = 'released'")).rows;
  check("P9.4", !bad.ok && released.length === 1, "a provider failure releases our dollars");
  check("P9.5", (await balance(db, orgId)) === balBefore, "and refunds the customer's credits — a failed analysis costs the user nothing");
  const spendAfter = Number((await db.query("SELECT COALESCE(SUM(spend_microdollars),0) AS t FROM provider_spend_days")).rows[0].t);
  check("P9.6", spendAfter === spend, "and adds nothing to the day's spend");

  // Unpriced model: no reservation, no call, no charge.
  const unpriced = await hostedExplain(db, deps(okProvider), req({ model: "claude-imaginary-9", buildHash: "b3" }));
  check("P9.7", !unpriced.ok && unpriced.code === "model_not_priced" && unpriced.ciStaysGreen, "an unpriced model fails closed before any reservation");
  check("P9.8", !(await isTripped(db)), "and none of that tripped the breaker — only the global ceiling does that");

  // Our dollars are reserved BEFORE the customer's credits, so a customer who
  // cannot pay leaves a reservation already taken. It must be given back.
  //
  // Nothing covered this until 2026-08-12, and it was found by deleting the
  // release and watching every suite stay green. The damage is quiet: the
  // reservation is never settled and never released, so it holds capacity
  // against the global day for its full TTL. One org out of credits would
  // reduce the ceiling for every other org, and the only symptom would be
  // budget refusals nobody could account for.
  await db.query("DELETE FROM provider_reservations");
  const brokeOrg = await makeOrg();
  await grantCredits(db, { orgId: brokeOrg, kind: "pack_purchase", credits: 1, expiresAt: new Date(Date.now() + 365 * 864e5) });
  const poor = await hostedExplain(db, deps(okProvider), {
    orgId: brokeOrg, frame: "x.png", buildHash: "b9", designHash: "d", model: SONNET, pass: "analysis",
  });
  const held = (await db.query("SELECT state FROM provider_reservations WHERE org_id = $1", [brokeOrg])).rows;
  check("P9.9", !poor.ok && poor.code === "insufficient_credits", "an org without the credits for a call is refused");
  check(
    "P9.10",
    held.length === 1 && held[0].state === "released",
    `and the provider dollars reserved a moment earlier are released, not left holding the day's capacity (state: ${held[0]?.state ?? "no reservation row"})`
  );
  const stillFree = await reserveProviderBudget(db, {
    reservationId: randomUUID(), orgId, model: SONNET, pass: "analysis",
    limits: { globalDailyMicrodollars: hardMaxCostMicrodollars(SONNET) + Number((await db.query("SELECT COALESCE(SUM(spend_microdollars),0) AS t FROM provider_spend_days")).rows[0].t) },
  });
  check("P9.11", stillFree.ok, "so the capacity is genuinely available to the next request");
}

// --- P10: credits are derived from cost, and no sale can lose money -------
// The rule decided 2026-08-10: credits are relative to the cost we incur, and no
// scenario may deny profit. Because credits are *derived* rather than chosen,
// this is now a hard assertion rather than a report — if someone points an
// operation at a pricier model without the price following, the suite stops.
{
  const rows = marginReport();
  console.log("\n  worst case vs revenue, at the cheapest pack ($0.03535/credit, net of Paddle):");
  for (const row of rows) {
    console.log(
      `    ${row.pass.padEnd(9)} ${row.model.padEnd(20)} max $${(row.hardMaxMicrodollars / 1e6).toFixed(4)}` +
        `  →  ${row.credits} credits = $${(row.revenueMicrodollars / 1e6).toFixed(4)}` +
        `  margin ${(row.worstCaseMargin * 100).toFixed(1)}%`
    );
  }

  check("P10.1", rows.length > 0 && rows.every((r) => Number.isFinite(r.hardMaxMicrodollars)), "every sellable operation has a finite worst case");
  check("P10.2", rows.every((r) => r.clearsFloor), `every operation clears the ${MARGIN_FLOOR * 100}% margin floor at its WORST case, not its average`);
  check("P10.3", rows.every((r) => r.hardMaxMicrodollars < r.revenueMicrodollars), "no operation can be sold below cost under any input we accept");
  check("P10.4", CREDIT_REVENUE_FLOOR_MICRODOLLARS === 35_350, "the floor is the cheapest pack net of payment fees, not the list price");

  // The derivation must react to price, not be a constant someone typed. A
  // pricier model must cost more credits, or the rule is decorative.
  const haiku = quoteModel("claude-haiku-4-5");
  const sonnet = quoteModel(SONNET);
  const opus = quoteModel(OPUS);
  check("P10.5", haiku.credits < sonnet.credits && sonnet.credits < opus.credits,
    `credits track model cost: haiku ${haiku.credits} < sonnet ${sonnet.credits} < opus ${opus.credits}`);
  check("P10.6", creditsRequired("model-we-never-priced") === null, "an unpriced model cannot be priced in credits either — it is unsellable, not free");
  check("P10.7", creditsRequired(SONNET) >= 1, "no operation is ever free by rounding");

  console.log("\n  what each model would cost if a pass were moved to it:");
  for (const m of ["claude-haiku-4-5", SONNET, OPUS]) {
    const q = quoteModel(m);
    console.log(`    ${m.padEnd(20)} max $${(q.hardMaxMicrodollars / 1e6).toFixed(4)}  →  ${q.credits} credit(s) per call`);
  }
  console.log(
    "    (cost only. Moving a pass to another model needs the calibration fixtures\n" +
      "     re-run against it first — PATHWAYS §'Provider substitution'.)"
  );
}

await db.close();

if (!REAL_PG) {
  console.log(
    "\n⚠️  P4 ran on PGlite: 40 concurrent CALLS on one in-process connection.\n" +
      "   P4r (20 separate processes) and its counter-test P4b were SKIPPED — they\n" +
      "   need a shared server. What ran proves the check-then-write race is closed;\n" +
      "   it does NOT prove the serverless case, which is the whole reason this\n" +
      "   module exists. Per Doctrine 3 that is an open risk, not a pass.\n" +
      '   Close it with: DATABASE_URL="$(scripts/test-db.sh start)" node test/providerBudget.test.mjs'
  );
}

console.log(failures === 0 ? "\nproviderBudget: all checks passed" : `\nproviderBudget: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
