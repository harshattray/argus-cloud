// Plan states and plan limits — migration 016; `BuildV5.md` Phase G2c.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/planLimits.test.mjs
//
// Checks are P1-P8, covering migrations 016 and 019. Two questions are being protected here, and G2c is explicit
// that they are different questions:
//
//   entitlement — may this organization upload at all?
//   quota       — how much may an entitled one send?
//
// A free plan is not a team plan with its numbers set to zero. If it were, one
// mistaken UPDATE on a limits row would silently grant upload to every free
// organization, which is why `can_upload` is a column of its own and why P5
// checks it independently of every number beside it.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { planLimitsFor } = await import(path.join(DIST, "plans.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}
async function rejected(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return String(err?.message ?? err);
  }
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

// ---------------------------------------------------------------------------
// P1 — the abolished state is gone from the schema, not just from the docs
// ---------------------------------------------------------------------------
//
// The trial was abolished on 2026-08-03. Until 016 the database would still
// happily create an organization on it.
const trialId = randomUUID();
const p1 = await rejected(() =>
  db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'trial')", [trialId, "p1"])
);
check("P1", p1 !== null, "an organization can no longer be created on the abolished 'trial' plan");

// ---------------------------------------------------------------------------
// P2 — a new organization lands on free, not on a paid or abolished plan
// ---------------------------------------------------------------------------
//
// The direction of the default matters more than the value. A default that errs
// toward a paid plan gives away the product to anyone who creates an org; this
// one errs toward the plan that cannot upload.
const defId = randomUUID();
await db.query("INSERT INTO orgs (id, name) VALUES ($1, $2)", [defId, "p2"]);
const p2 = await db.query("SELECT plan FROM orgs WHERE id = $1", [defId]);
check("P2", p2.rows[0].plan === "free", `a new organization defaults to 'free' (got '${p2.rows[0].plan}')`);

// ---------------------------------------------------------------------------
// P3 — every plan has a limits row from the first boot
// ---------------------------------------------------------------------------
//
// A missing row is an organization with no answer to "may this upload?", and
// absent rows are a bad place to keep a security answer.
const p3 = await db.query("SELECT plan FROM plan_limits ORDER BY plan");
check(
  "P3",
  p3.rows.map((r) => r.plan).join(",") === "free,team",
  `both plans have a limits row (${p3.rows.map((r) => r.plan).join(", ")})`
);

// P3b — and 'lapsed' is no longer a plan at all. It is a subscription state
// (migration 019): the tier says what was bought, the status says what happened
// to it. The old lapsed limits row differed from free on one column that is
// only read after the can_upload gate both fail, so it decided nothing.
const p3b = await rejected(() =>
  db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'lapsed')", [randomUUID(), "p3b"])
);
check("P3b", p3b !== null, "'lapsed' is refused as a plan — it is a subscription status now");

// ---------------------------------------------------------------------------
// P4 — the org plan values and the limits table cannot drift apart
// ---------------------------------------------------------------------------
const p4 = await rejected(() => db.query("INSERT INTO plan_limits (plan) VALUES ('enterprise')"));
check("P4", p4 !== null, "a limits row for a plan no organization can hold is refused");

// ---------------------------------------------------------------------------
// P5 — entitlement: exactly one plan may upload
// ---------------------------------------------------------------------------
const p5 = await db.query("SELECT plan FROM plan_limits WHERE can_upload ORDER BY plan");
check(
  "P5",
  p5.rows.length === 1 && p5.rows[0].plan === "team",
  `only 'team' may upload — free never, lapsed no longer (entitled: ${p5.rows.map((r) => r.plan).join(", ") || "none"})`
);

// ---------------------------------------------------------------------------
// P6 — the documented quota figures are what is actually stored
// ---------------------------------------------------------------------------
//
// These are policy starting points from G2c, not measurements. The check exists
// so that changing them is a deliberate act with a failing test attached, rather
// than a number quietly drifting away from what the plan contract promises.
const team = (await db.query("SELECT * FROM plan_limits WHERE plan = 'team'")).rows[0];
check(
  "P6",
  team.runs_per_day === 200 &&
    team.artifacts_per_run === 600 &&
    Number(team.bytes_per_run) === 262_144_000 &&
    Number(team.bytes_stored_max) === 53_687_091_200 &&
    team.retention_days === 90,
  "team: 200 runs/day, 600 artifacts/run, 250MB/run, 50GB stored, 90-day retention"
);

// ---------------------------------------------------------------------------
// P7 — a lapsed subscription blocks uploads without touching the tier
// ---------------------------------------------------------------------------
//
// The standing rule for payment failure: rejected politely, CI stays green,
// nothing deleted. The organization stays on `team` — it bought team — and the
// lapse lives in the status, which is also the only place `past_due` and
// `refunded` can be expressed at all.
const lapsedOrg = randomUUID();
await db.query(
  "INSERT INTO orgs (id, name, plan, subscription_status) VALUES ($1, $2, 'team', 'lapsed')",
  [lapsedOrg, "p7-" + lapsedOrg.slice(0, 8)]
);
const lapsedLimits = await planLimitsFor(db, lapsedOrg);
check(
  "P7",
  lapsedLimits.plan === "team" &&
    lapsedLimits.canUpload === true &&
    lapsedLimits.uploadAllowed === false &&
    Number(lapsedLimits.bytesStoredMax) > 0,
  "a lapsed subscription blocks uploads while the tier and its stored bytes stay intact"
);

// P7b — grace does not block. PATHWAYS is explicit that a past_due org keeps
// working during grace; a failed card must not read as an outage.
const graceOrg = randomUUID();
await db.query(
  "INSERT INTO orgs (id, name, plan, subscription_status) VALUES ($1, $2, 'team', 'past_due')",
  [graceOrg, "p7b-" + graceOrg.slice(0, 8)]
);
check(
  "P7b",
  (await planLimitsFor(db, graceOrg)).uploadAllowed === true,
  "past_due still uploads — grace is not a lockout"
);

// P7c — an invented status cannot exist to be mis-handled.
const p7c = await rejected(() =>
  db.query("INSERT INTO orgs (id, name, plan, subscription_status) VALUES ($1, $2, 'team', 'suspended')", [
    randomUUID(),
    "p7c",
  ])
);
check("P7c", p7c !== null, "a status outside the five is refused by the database");

// ---------------------------------------------------------------------------
// P8 — retention cannot be configured to zero
// ---------------------------------------------------------------------------
//
// Retention is a promise in the plan contract (90 days). A limits table that
// accepts 0 turns one careless UPDATE into an instruction to delete every
// artifact the next sweep touches.
const p8 = await rejected(() => db.query("UPDATE plan_limits SET retention_days = 0 WHERE plan = 'team'"));
check("P8", p8 !== null, "retention_days = 0 is refused — a config typo cannot become a deletion order");

await db.query("DELETE FROM orgs WHERE id = $1", [defId]);
await db.close();

console.log(failures === 0 ? "\nplanLimits: all checks passed" : `\nplanLimits: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
