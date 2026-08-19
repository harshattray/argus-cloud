// Budget alert and breaker-audit suite — PATHWAYS.md Pathway 1 item 6 /
// §10.3 "1C" (second half); FUTURENORMA §3 ("alert at 50%, 75%, 90%, and 100%",
// "a 100% trip ... needs a manual reset").
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/budgetAlerts.test.mjs
//
// Three claims are under test:
//
//   1. Every threshold reaches a human exactly once per period, including when
//      several instances cross it at the same moment. B4r spawns 20 real
//      processes when DATABASE_URL is set; B4b runs the obvious in-memory
//      "have we alerted yet?" through the same 20 processes so B4r is known to
//      have teeth.
//   2. A failed alert channel is retried, not swallowed.
//   3. The breaker cannot be cleared without a name and a reason against it,
//      and the trip and the clearing are both on the record.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { isTripped, tripBreaker, resetBreaker, breakerHistory } = await import(path.join(DIST, "breaker.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { hostedExplain } = await import(path.join(DIST, "explainService.js"));
const { globalDayStatus, orgMonthStatus, keyMonthStatus, hardMaxCostMicrodollars } = await import(
  path.join(DIST, "providerBudget.js")
);
const {
  thresholdsCrossed,
  evaluateBudgetAlerts,
  evaluateAllBudgets,
  recordProviderFunding,
  providerBalanceStatus,
  recentAlerts,
  undeliveredAlertCount,
} = await import(path.join(DIST, "budgetAlerts.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

const SONNET = "claude-sonnet-5";
const T0 = new Date("2026-08-12T09:00:00.000Z");
const DAY = T0.toISOString().slice(0, 10);

async function makeOrg() {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, "ba-" + id.slice(0, 8)]);
  return id;
}
async function setDaySpend(microdollars, day = DAY) {
  await db.query(
    `INSERT INTO provider_spend_days (day, spend_microdollars) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET spend_microdollars = $2`,
    [day, microdollars]
  );
}
const alertsInto = (sink) => (message) => sink.push(message);

// ---------------------------------------------------------------------------
// B1 — the bands themselves
// ---------------------------------------------------------------------------
{
  check("B1.1", thresholdsCrossed(49).length === 0, "under half the budget crosses nothing");
  check("B1.2", JSON.stringify(thresholdsCrossed(50)) === "[50]", "50% crosses exactly the 50 mark");
  check("B1.3", JSON.stringify(thresholdsCrossed(95)) === "[50,75,90]", "95% has passed three marks, not one");
  check("B1.4", JSON.stringify(thresholdsCrossed(140)) === "[50,75,90,100]", "over budget crosses all four");
  check("B1.5", thresholdsCrossed(null).length === 0, "an unlimited scope crosses nothing");
}

// ---------------------------------------------------------------------------
// B2 — one alert per threshold per period, and a climb reports each band once
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  // Outstanding reservations count toward the day alongside committed spend
  // (`globalDayStatus`), which is the point of reserving. Clearing the two
  // tables above but not this one only looked right on PGlite, where every
  // suite gets its own database. Against one real server the reservations
  // providerBudget.test.mjs left behind added $0.08 to every reading here.
  await db.query("DELETE FROM provider_reservations");
  const limit = 1_000_000; // $1/day
  const sink = [];
  const alert = alertsInto(sink);
  const evaluate = async (spend) => {
    await setDaySpend(spend);
    return evaluateBudgetAlerts(
      db,
      {
        scope: "global-day",
        subjectId: "global",
        period: DAY,
        label: "today's provider budget",
        status: await globalDayStatus(db, limit, T0),
      },
      alert,
      T0
    );
  };

  const quiet = await evaluate(400_000); // 40%
  check("B2.1", quiet === null && sink.length === 0, "40% of the day's budget is not an event");

  const half = await evaluate(600_000); // 60%
  check("B2.2", half?.threshold === 50 && sink.length === 1, "crossing 50% alerts once");
  check("B2.3", sink[0].includes("50%") && sink[0].includes("$0.60 of $1.00"), `the message carries the numbers: ${sink[0].slice(0, 120)}…`);
  check("B2.4", sink[0].includes("reports, diffs, uploads, and CI are unaffected".slice(0, 20)) || sink[0].toLowerCase().includes("unaffected"),
    "and says what is not affected");

  const again = await evaluate(650_000); // still 65%
  check("B2.5", again === null && sink.length === 1, "staying inside the same band says nothing further");

  const jump = await evaluate(950_000); // 95%
  check("B2.6", jump?.threshold === 90 && sink.length === 2, "a jump from 65% to 95% sends one alert, not two");
  check("B2.7", JSON.stringify(jump.claimed) === "[75,90]", "and records both marks it passed");
  check("B2.8", sink[1].includes("90%") && sink[1].includes("75%"), "the message names the mark reached and the one skipped past");

  const full = await evaluate(1_000_000); // 100%
  check("B2.9", full?.threshold === 100 && sink.length === 3, "100% alerts");
  check("B2.10", sink[2].includes("explain pauses"), "and says explain will pause, not that the product will");

  const rows = await recentAlerts(db);
  check("B2.11", rows.length === 4 && rows.every((r) => r.deliveredAt !== null), "four thresholds recorded, all delivered");
}

// ---------------------------------------------------------------------------
// B3 — a new period re-arms; a failed channel retries; nothing is silently lost
// ---------------------------------------------------------------------------
{
  const limit = 1_000_000;
  const nextDay = new Date("2026-08-13T09:00:00.000Z");
  await setDaySpend(600_000, nextDay.toISOString().slice(0, 10));
  const sink = [];
  const rolled = await evaluateBudgetAlerts(
    db,
    {
      scope: "global-day",
      subjectId: "global",
      period: nextDay.toISOString().slice(0, 10),
      label: "today's provider budget",
      status: await globalDayStatus(db, limit, nextDay),
    },
    alertsInto(sink),
    nextDay
  );
  check("B3.1", rolled?.threshold === 50 && sink.length === 1, "a new UTC day re-arms the thresholds — yesterday's 50% does not silence today's");

  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await setDaySpend(600_000);
  const subject = async () => ({
    scope: "global-day",
    subjectId: "global",
    period: DAY,
    label: "today's provider budget",
    status: await globalDayStatus(db, limit, T0),
  });
  const broken = await evaluateBudgetAlerts(db, await subject(), () => {
    throw new Error("pager unreachable");
  }, T0);
  check("B3.2", broken?.delivered === false, "a throwing alert channel is reported as undelivered, not as sent");
  check("B3.3", (await undeliveredAlertCount(db)) === 1, "and the undelivered alert is visible to an operator");
  const stored = (await recentAlerts(db))[0];
  check("B3.4", stored.lastError.includes("pager unreachable") && stored.attempts === 1, `with the reason recorded (${stored.lastError})`);

  const retrySink = [];
  const retried = await evaluateBudgetAlerts(db, await subject(), alertsInto(retrySink), T0);
  check("B3.5", retried?.delivered === true && retrySink.length === 1, "the next evaluation retries it — a failed alert is retried, never dropped");
  check("B3.6", (await undeliveredAlertCount(db)) === 0 && (await recentAlerts(db))[0].attempts === 2, "and the retry is recorded as delivered on the second attempt");

  const settled = await evaluateBudgetAlerts(db, await subject(), alertsInto(retrySink), T0);
  check("B3.7", settled === null && retrySink.length === 1, "once delivered it does not fire again");
}

// ---------------------------------------------------------------------------
// B4 — concurrency: one threshold, many instances, one alert
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await setDaySpend(600_000);
  const limit = 1_000_000;
  const sink = [];
  const subject = {
    scope: "global-day",
    subjectId: "global",
    period: DAY,
    label: "today's provider budget",
    status: await globalDayStatus(db, limit, T0),
  };
  await Promise.all(
    Array.from({ length: 20 }, () => evaluateBudgetAlerts(db, { ...subject }, alertsInto(sink), T0))
  );
  check("B4.1", sink.length === 1, `20 concurrent evaluations of the same threshold produced ${sink.length} alert(s)`);
}

if (REAL_PG) {
  // The in-process run above shares one connection. This is the run that
  // matters: 20 separate OS processes, each with its own pool, crossing the
  // same threshold at the same moment.
  const { spawn } = await import("node:child_process");
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await setDaySpend(600_000);

  // A wall-clock barrier, not just a simultaneous spawn. Twenty node processes
  // take well over 100ms to boot, so without it the later ones read after the
  // earlier ones have already written and the race under test never happens —
  // the first version of this measured 2 of 20 colliding rather than 20.
  const worker = (legacy, startAt) => `
    import path from "node:path";
    const DIST = ${JSON.stringify(DIST)};
    const { createDb } = await import(path.join(DIST, "db.js"));
    const { globalDayStatus } = await import(path.join(DIST, "providerBudget.js"));
    const { evaluateBudgetAlerts } = await import(path.join(DIST, "budgetAlerts.js"));
    const db = await createDb();
    await db.query("SELECT 1"); // connect before the barrier, not after it
    await new Promise((r) => setTimeout(r, Math.max(0, ${startAt} - Date.now())));
    let sent = 0;
    ${
      legacy
        ? // The obvious implementation: read what has been alerted, decide, send.
          // Every process reads before any of them writes, so every process sends.
          `const seen = (await db.query("SELECT threshold FROM budget_alerts WHERE threshold = 50")).rows.length > 0;
           await new Promise((r) => setTimeout(r, 40));
           if (!seen) {
             await db.query("INSERT INTO budget_alerts (scope, subject_id, period, threshold, used_percent, limit_microdollars, used_microdollars, attempts, claimed_at, delivered_at) VALUES ('global-day','legacy','${DAY}',50,60,1000000,600000,1,now(),now()) ON CONFLICT DO NOTHING");
             sent = 1;
           }`
        : `const delivery = await evaluateBudgetAlerts(
             db,
             { scope: "global-day", subjectId: "global", period: ${JSON.stringify(DAY)},
               label: "today's provider budget",
               status: await globalDayStatus(db, 1000000, new Date(${JSON.stringify(T0.toISOString())})) },
             () => { sent = 1; },
             new Date(${JSON.stringify(T0.toISOString())})
           );
           if (!delivery) sent = 0;`
    }
    await db.close();
    process.stdout.write(JSON.stringify({ sent }));
  `;

  const run = (legacy) => {
    const startAt = Date.now() + 4000;
    return Promise.all(
      Array.from({ length: 20 }, () =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, ["--input-type=module", "-e", worker(legacy, startAt)], {
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let out = "";
          let err = "";
          child.stdout.on("data", (d) => (out += d));
          child.stderr.on("data", (d) => (err += d));
          child.on("close", () => resolve({ out, err }));
        })
      )
    );
  };

  const results = await run(false);
  const broke = results.filter((r) => !r.out.trim());
  const sent = results.reduce((n, r) => n + (r.out.trim() ? JSON.parse(r.out).sent : 0), 0);
  check("B4r.1", broke.length === 0, `20 separate processes evaluated one threshold, ${broke.length} failed` + (broke.length ? ` — ${broke[0].err.split("\n").filter(Boolean).pop()}` : ""));
  check("B4r.2", sent === 1, `exactly one of 20 processes paged a human (${sent})`);

  await db.query("DELETE FROM budget_alerts");
  const legacyResults = await run(true);
  const legacyBroke = legacyResults.filter((r) => !r.out.trim());
  const legacySent = legacyResults.reduce((n, r) => n + (r.out.trim() ? JSON.parse(r.out).sent : 0), 0);
  check("B4b.0", legacyBroke.length === 0, `the control workers ran, ${legacyBroke.length} failed` + (legacyBroke.length ? ` — ${legacyBroke[0].err.split("\n").filter(Boolean).pop()}` : ""));
  check("B4b.1", legacySent > 1, `the read-then-decide version pages ${legacySent} times for one event — B4r has teeth`);
  await db.query("DELETE FROM budget_alerts");
}

// ---------------------------------------------------------------------------
// B5 — organization and key scopes alert independently of the global day
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  const orgA = await makeOrg();
  const orgB = await makeOrg();
  const orgLimit = 1_000_000;
  await db.query(
    `INSERT INTO usage_events (org_id, frame, model, pass, interactive, auto, status, cost_microdollars, created_at)
     VALUES ($1, 'f', $2, 'analysis', true, false, 'charged', $3, $4)`,
    [orgA, SONNET, 800_000, T0.toISOString()]
  );

  const statusA = await orgMonthStatus(db, orgA, orgLimit, T0);
  const statusB = await orgMonthStatus(db, orgB, orgLimit, T0);
  check("B5.1", Math.round(statusA.usedPercent) === 80 && statusB.usedPercent === 0, `org A is at ${statusA.usedPercent.toFixed(0)}% of its own ceiling while org B is at 0%`);

  const sink = [];
  const a = await evaluateBudgetAlerts(
    db,
    { scope: "org-month", subjectId: orgA, period: "2026-08", label: `organization ${orgA}`, status: statusA },
    alertsInto(sink),
    T0
  );
  const b = await evaluateBudgetAlerts(
    db,
    { scope: "org-month", subjectId: orgB, period: "2026-08", label: `organization ${orgB}`, status: statusB },
    alertsInto(sink),
    T0
  );
  check("B5.2", a?.threshold === 75 && b === null && sink.length === 1, "one organization crossing its ceiling alerts for that organization only");

  const unlimited = await evaluateBudgetAlerts(
    db,
    { scope: "org-month", subjectId: orgA, period: "2026-08", label: "unlimited", status: await orgMonthStatus(db, orgA, null, T0) },
    alertsInto(sink),
    T0
  );
  check("B5.3", unlimited === null && sink.length === 1, "an organization with no dollar ceiling configured has no percentage and alerts nothing");

  const keyStatus = await keyMonthStatus(db, "some-key", 1_000_000, T0);
  check("B5.4", keyStatus.scope === "key-month" && keyStatus.usedPercent === 0, "the key scope reports independently of the org");

  await db.query("DELETE FROM usage_events");
}

// ---------------------------------------------------------------------------
// B6 — the provider account balance is watched before it becomes the failure
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  check("B6.1", (await providerBalanceStatus(db, T0)) === null, "with no funding recorded there is no balance to report — nothing is invented");

  await recordProviderFunding(db, {
    id: "fund-1",
    balanceMicrodollars: 20_000_000, // $20 preloaded
    actor: "harsha",
    note: "launch float",
    now: new Date("2026-08-12T00:00:00.000Z"),
  });
  await setDaySpend(11_000_000); // $11 of $20
  const status = await providerBalanceStatus(db, T0);
  check("B6.2", status.remainingMicrodollars === 9_000_000 && Math.round(status.usedPercent) === 55, `$11 of a $20 float leaves $9 (${status.usedPercent.toFixed(0)}% used)`);

  const sink = [];
  await evaluateAllBudgets(db, { orgId: "n/a", limits: { globalDailyMicrodollars: 50_000_000 } }, alertsInto(sink), T0);
  check("B6.3", sink.some((m) => m.includes("provider account balance") && m.includes("50%")), "the funded balance crosses 50% and a human is told before the provider becomes the limiting failure");

  let rejected = false;
  try {
    await recordProviderFunding(db, { id: "fund-2", balanceMicrodollars: 1_000_000, actor: "  " });
  } catch {
    rejected = true;
  }
  check("B6.4", rejected, "a funding record with nobody's name on it is refused");

  await recordProviderFunding(db, {
    id: "fund-3",
    balanceMicrodollars: 40_000_000,
    actor: "harsha",
    now: new Date("2026-08-14T00:00:00.000Z"),
  });
  const refunded = await providerBalanceStatus(db, new Date("2026-08-14T09:00:00.000Z"));
  check("B6.5", refunded.fundingId === "fund-3" && refunded.usedMicrodollars === 0, "a new funding record becomes the current balance and re-arms its own alerts");
  await db.query("DELETE FROM provider_fundings");
}

// ---------------------------------------------------------------------------
// B7 — the breaker cannot be cleared anonymously, and both halves are on record
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM breaker_events");
  await resetBreaker(db, { actor: "test-setup", reason: "start from a known state" });
  await db.query("DELETE FROM breaker_events");

  const sink = [];
  await tripBreaker(db, "daily provider budget would be exceeded", alertsInto(sink), T0);
  check("B7.1", (await isTripped(db)) && sink.length === 1, "the breaker trips and alerts once");

  const afterTrip = await breakerHistory(db);
  check("B7.2", afterTrip.length === 1 && afterTrip[0].action === "tripped" && afterTrip[0].actor === "system",
    "the trip is on the record, attributed to the system");

  await tripBreaker(db, "a second refusal moments later", alertsInto(sink), T0);
  check("B7.3", sink.length === 1 && (await breakerHistory(db)).length === 1,
    "a second refusal during the same incident neither re-alerts nor writes a second audit row");

  for (const bad of [{ actor: "", reason: "looks fine" }, { actor: "harsha", reason: "   " }]) {
    let refused = false;
    try {
      await resetBreaker(db, bad);
    } catch {
      refused = true;
    }
    check(`B7.4:${bad.actor || "no-actor"}`, refused && (await isTripped(db)),
      `a reset with ${bad.actor ? "no reason" : "no actor"} is refused and the breaker stays tripped`);
  }

  await resetBreaker(db, { actor: "harsha", reason: "raised the daily cap to $80 after reviewing the spike" });
  check("B7.5", !(await isTripped(db)), "an attributed reset clears it");
  const history = await breakerHistory(db);
  check("B7.6", history.length === 2 && history[0].action === "reset" && history[0].actor === "harsha" && history[0].reason.includes("$80"),
    "and who cleared it, when, and why is permanently readable");
  check("B7.7", history[1].action === "tripped", "the trip it cleared is still there — the log is append-only");
}

// ---------------------------------------------------------------------------
// B8 — end to end: a trip pauses explain only, and a reset resumes it
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await resetBreaker(db, { actor: "test-setup", reason: "known state before the end-to-end case" });

  const orgId = await makeOrg();
  await grantCredits(db, { orgId, kind: "pack_purchase", credits: 200, expiresAt: new Date(Date.now() + 365 * 864e5) });
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'r')", [randomUUID(), orgId]).catch(() => {});

  const sink = [];
  const hardMax = hardMaxCostMicrodollars(SONNET);
  // A budget with room for two calls, already 60% consumed: the next call
  // crosses 50% and 75% at once, the one after cannot fit at all.
  const dailyBudget = hardMax * 4;
  await setDaySpend(Math.round(dailyBudget * 0.6));

  const provider = async () => ({
    kind: "ok",
    json: { findings: [{ observation: "spacing drift", category: "layout", confidence: "medium" }] },
    usage: { inputTokens: 900, outputTokens: 200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  });
  const deps = { provider, dailyBudgetMicrodollars: dailyBudget, alert: alertsInto(sink), now: () => T0 };
  const req = (buildHash) => ({
    orgId,
    frame: "home.png",
    buildHash,
    designHash: "d",
    model: SONNET,
    pass: "analysis",
  });

  const first = await hostedExplain(db, deps, req("b8-1"));
  check("B8.1", first.ok === true, "an explain inside the budget succeeds");
  check("B8.2", sink.some((m) => m.startsWith("Normascope budget alert")), `and the crossing it caused reaches an operator (${sink.length} alert(s))`);

  await setDaySpend(dailyBudget); // the day is now spent
  const paused = await hostedExplain(db, deps, req("b8-2"));
  check("B8.3", paused.ok === false && paused.code === "explain_paused", "at 100% the next explain is refused before the provider is called");
  check("B8.4", paused.ciStaysGreen === true, "and CI stays green — a spend ceiling is not a build failure");
  check("B8.5", await isTripped(db), "the breaker is tripped and stays tripped without a human");

  const rows = await db.query("SELECT status FROM usage_events WHERE org_id = $1 AND status = 'blocked_no_charge'", [orgId]);
  check("B8.6", rows.rows.length === 1, "the refusal is recorded as a no-charge event, not as a customer failure");

  const tripEvent = (await breakerHistory(db))[0];
  check("B8.7", tripEvent.action === "tripped" && tripEvent.reason.includes("daily provider budget"), `the audit log names why spending stopped: ${tripEvent.reason.slice(0, 60)}…`);

  await setDaySpend(0);
  const stillPaused = await hostedExplain(db, deps, req("b8-3"));
  check("B8.8", stillPaused.code === "explain_paused", "clearing the spend does not clear the breaker — only a human does");

  await resetBreaker(db, { actor: "harsha", reason: "spike understood; cap raised" });
  const resumed = await hostedExplain(db, deps, req("b8-4"));
  check("B8.9", resumed.ok === true, "after an attributed reset, explain resumes");
}

// ---------------------------------------------------------------------------
// B9 — the CI batch path alerts too
// ---------------------------------------------------------------------------
//
// The economic request path is implemented **twice** — `explainService.ts` for
// interactive explain and `ciBatch.ts` for CI batches — so every rule has to be
// added to both, and forgetting one fails silently. Adding budget alerts today
// meant touching both files; `cibatch.test.mjs` stubs its alert channel as
// `() => {}` and asserts nothing about it, so the CI half was covered by no
// test at all. This is that test. It is a regression guard on the duplication,
// not on the feature.
{
  const { enqueueCiBatch } = await import(path.join(DIST, "ciBatch.js"));
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await resetBreaker(db, { actor: "test-setup", reason: "known state before the CI batch case" });

  const orgId = await makeOrg();
  const repoId = randomUUID();
  const runId = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'r')", [repoId, orgId]);
  await db.query("INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,'c1','{}','committed')", [
    runId,
    orgId,
    repoId,
  ]);
  await grantCredits(db, { orgId, kind: "pack_purchase", credits: 500, expiresAt: new Date(Date.now() + 365 * 864e5) });

  const sink = [];
  const dailyBudget = hardMaxCostMicrodollars(SONNET, { batch: true }) * 10;
  await setDaySpend(Math.round(dailyBudget * 0.6)); // 60% before the batch runs

  const enq = await enqueueCiBatch(
    db,
    {
      submit: async () => `batch_${randomUUID().slice(0, 8)}`,
      fetch: async () => null,
      scan: () => null,
      dailyBudgetMicrodollars: dailyBudget,
      alert: alertsInto(sink),
      now: () => T0,
    },
    {
      orgId,
      repoId,
      runId,
      model: SONNET,
      frames: [
        { frame: "a.png", buildHash: "b1", designHash: "d" },
        { frame: "b.png", buildHash: "b2", designHash: "d" },
      ],
    }
  );

  check("B9.1", enq.batchId !== null, "a CI batch enqueues inside the budget");
  check("B9.2", sink.some((m) => m.startsWith("Normascope budget alert")), `and its reservations page an operator too — the CI path is not a silent one (${sink.length} alert(s))`);

  // Each frame reserves separately, so a batch can genuinely cross more than
  // one mark — 75% on the first frame, 90% on the second. That is several
  // crossings seconds apart, not one event paged repeatedly, and the bound that
  // matters is per *threshold*: four in a day, never the same one twice.
  const budgetAlerts = sink.filter((m) => m.startsWith("Normascope budget alert"));
  const rows = await db.query("SELECT threshold, COUNT(*) AS n FROM budget_alerts WHERE scope = 'global-day' GROUP BY threshold");
  check("B9.3", rows.rows.every((r) => Number(r.n) === 1), "no threshold is recorded twice, however many frames the batch holds");
  check("B9.4", budgetAlerts.length <= 4, `and the batch cannot page more than the four thresholds (${budgetAlerts.length})`);

  // A second batch reserves more, so it may legitimately cross a *higher* mark
  // — that is the budget genuinely moving, and silencing it would be the bug.
  // What must never happen is the same mark paging twice.
  await enqueueCiBatch(
    db,
    {
      submit: async () => `batch_${randomUUID().slice(0, 8)}`,
      fetch: async () => null,
      scan: () => null,
      dailyBudgetMicrodollars: dailyBudget,
      alert: alertsInto(sink),
      now: () => T0,
    },
    { orgId, repoId, runId, model: SONNET, frames: [{ frame: "c.png", buildHash: "b3", designHash: "d" }] }
  );
  const after = await db.query("SELECT threshold, COUNT(*) AS n FROM budget_alerts WHERE scope = 'global-day' GROUP BY threshold");
  check("B9.5", after.rows.every((r) => Number(r.n) === 1), "a second batch may cross a higher mark, but never pages one already sent");
  check("B9.6", after.rows.length >= rows.rows.length, `and the marks only accumulate (${rows.rows.length} → ${after.rows.length})`);
}

// ---------------------------------------------------------------------------
// B10 — both paths refuse a tenant ceiling the same way
// ---------------------------------------------------------------------------
//
// The guard on the extraction itself. Before `economicPath.ts`, an org or key
// pinned against its own dollar ceiling alerted on the interactive path and was
// silent on the CI path — a divergence with no reason behind it, found only by
// reading the two implementations side by side. Both now share one function, so
// this asserts the behaviour they share rather than the code they share: delete
// the alert from `reserveBoth` and both halves of this go red at once.
{
  const { enqueueCiBatch } = await import(path.join(DIST, "ciBatch.js"));
  await db.query("DELETE FROM budget_alerts");
  await db.query("DELETE FROM provider_spend_days");
  await db.query("DELETE FROM provider_reservations");
  await resetBreaker(db, { actor: "test-setup", reason: "known state before the parity case" });

  const mkOrg = async () => {
    const orgId = await makeOrg();
    await grantCredits(db, { orgId, kind: "pack_purchase", credits: 500, expiresAt: new Date(Date.now() + 365 * 864e5) });
    return orgId;
  };
  // An org ceiling far below one call's worst case: the reservation cannot fit,
  // and the refusal is the org's alone — the global day is wide open.
  const tinyOrgCeiling = 1;
  const generousDay = hardMaxCostMicrodollars(SONNET) * 1000;

  const interactiveSink = [];
  const orgA = await mkOrg();
  const interactive = await hostedExplain(
    db,
    {
      provider: async () => ({ kind: "ok", json: { findings: [] }, usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } }),
      dailyBudgetMicrodollars: generousDay,
      orgMonthlyBudgetMicrodollars: tinyOrgCeiling,
      alert: alertsInto(interactiveSink),
      now: () => T0,
    },
    { orgId: orgA, frame: "home.png", buildHash: "p1", designHash: "d", model: SONNET, pass: "analysis" }
  );

  const batchSink = [];
  const orgB = await mkOrg();
  const repoB = randomUUID();
  const runB = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'r')", [repoB, orgB]);
  await db.query("INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,'c1','{}','committed')", [runB, orgB, repoB]);
  const batched = await enqueueCiBatch(
    db,
    {
      submit: async () => "batch_never",
      fetch: async () => null,
      scan: () => null,
      dailyBudgetMicrodollars: generousDay,
      orgMonthlyBudgetMicrodollars: tinyOrgCeiling,
      alert: alertsInto(batchSink),
      now: () => T0,
    },
    { orgId: orgB, repoId: repoB, runId: runB, model: SONNET, frames: [{ frame: "home.png", buildHash: "p1", designHash: "d" }] }
  );

  const refused = (sink) => sink.filter((m) => m.includes("provider budget refused a call"));
  check("B10.1", !interactive.ok && interactive.code === "provider_budget_exhausted", "the interactive path refuses at the org ceiling");
  check("B10.2", batched.batchId === null && batched.skipped.length === 1, "the CI path refuses the same frame");
  check("B10.3", refused(interactiveSink).length === 1 && refused(batchSink).length === 1,
    `and BOTH page an operator — the CI path used to be silent here (${refused(interactiveSink).length} vs ${refused(batchSink).length})`);
  check("B10.4", !(await isTripped(db)), "neither trips the global breaker — one tenant's ceiling must not pause explain for everyone");

  const blocked = await db.query("SELECT org_id FROM usage_events WHERE status = 'blocked_no_charge' AND org_id IN ($1, $2)", [orgA, orgB]);
  check("B10.5", blocked.rows.length === 2, "and both record the refusal as a no-charge event rather than refusing silently");
  check("B10.6", (await balance(db, orgA)) === 500 && (await balance(db, orgB)) === 500, "no credits were taken on either path");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await db.close();
process.exit(failures === 0 ? 0 : 1);
