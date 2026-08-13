// Rate limiter suite — PATHWAYS.md Pathway 1 item 3 / §10.3 "1C".
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/rateLimit.test.mjs
//
// The claim under test is a *shared* ceiling. PGlite gives concurrent calls on
// one in-process connection, which proves the read-then-write interleaving is
// closed. It cannot prove the serverless case — many instances, many
// connections, one database — so R10 spawns 20 real processes when
// DATABASE_URL is set, and R10b shows what a process-local counter does with
// the same 20 processes, so R10 is known to have teeth.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey, findApiKey } = await import(path.join(DIST, "apiKeys.js"));
const {
  checkRateLimit,
  rateLimitMessage,
  rateLimitTotals,
  rateLimitBySubject,
  windowStartFor,
  RETENTION_MINUTES,
  WINDOW_SECONDS,
} = await import(path.join(DIST, "rateLimit.js"));

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
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, "rl-" + id.slice(0, 8)]);
  return id;
}

const T0 = new Date("2026-08-10T12:00:00.000Z");
const counters = (orgId) =>
  db.query(
    "SELECT scope, subject_id, allowed, rejected FROM rate_limit_windows WHERE org_id = $1 ORDER BY scope",
    [orgId]
  );

// --- R1: the ceiling is the ceiling ---------------------------------------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { kind: "agent", ratePerMinute: 3 });
  const subject = { orgId, apiKeyId: key.id, ratePerMinute: 3 };

  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await checkRateLimit(db, subject, { now: T0 }));
  }
  check("R1.1", results.slice(0, 3).every((r) => r.allowed), "the first 3 of 5 requests are allowed at a limit of 3");
  check("R1.2", results.slice(3).every((r) => !r.allowed), "requests 4 and 5 are refused");
  check("R1.3", results[3].scope === "key" && results[3].limit === 3, `the refusal names the key ceiling (${results[3].scope}, ${results[3].limit})`);
  check(
    "R1.4",
    results[3].retryAfterSeconds >= 1 && results[3].retryAfterSeconds <= WINDOW_SECONDS,
    `it carries retry timing (${results[3].retryAfterSeconds}s)`
  );

  // R2: a refused request must not spend window budget, or a hard-retrying
  // client would hold itself out past the end of its own window.
  const rows = (await counters(orgId)).rows;
  const keyRow = rows.find((r) => r.scope === "key");
  check("R2.1", Number(keyRow.allowed) === 3, `the allowed counter stopped at the limit (${keyRow.allowed})`);
  check("R2.2", Number(keyRow.rejected) === 2, `both refusals were recorded separately (${keyRow.rejected})`);
}

// --- R3: the window rolls over --------------------------------------------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { ratePerMinute: 2 });
  const subject = { orgId, apiKeyId: key.id, ratePerMinute: 2 };
  await checkRateLimit(db, subject, { now: T0 });
  await checkRateLimit(db, subject, { now: T0 });
  const blocked = await checkRateLimit(db, subject, { now: T0 });
  const nextMinute = new Date(T0.getTime() + WINDOW_SECONDS * 1000);
  const after = await checkRateLimit(db, subject, { now: nextMinute });
  check("R3.1", !blocked.allowed, "exhausted inside the minute");
  check("R3.2", after.allowed, "allowed again in the next minute");
  check(
    "R3.3",
    windowStartFor(new Date("2026-08-10T12:00:59.999Z")).toISOString() === T0.toISOString(),
    "the window boundary is the calendar minute, not the first request"
  );
}

// --- R4: an org cannot mint its way past the ceiling ----------------------
{
  const orgId = await makeOrg();
  const a = await createApiKey(db, orgId, { label: "a", ratePerMinute: 100 });
  const b = await createApiKey(db, orgId, { label: "b", ratePerMinute: 100 });
  const opts = { now: T0, orgLimit: 4 };
  const seq = [];
  for (let i = 0; i < 3; i++) {
    seq.push(await checkRateLimit(db, { orgId, apiKeyId: a.id, ratePerMinute: 100 }, opts));
  }
  for (let i = 0; i < 3; i++) {
    seq.push(await checkRateLimit(db, { orgId, apiKeyId: b.id, ratePerMinute: 100 }, opts));
  }
  const allowed = seq.filter((r) => r.allowed).length;
  check("R4.1", allowed === 4, `two keys well under their own ceilings still share one org ceiling (${allowed} of 6 allowed)`);
  check("R4.2", seq[4].scope === "organization", `the refusal names the organization ceiling (${seq[4].scope})`);

  // R5: the refusal is atomic. The org ceiling refused request 5, so the key
  // counter for b must not have advanced for it.
  const rows = (await counters(orgId)).rows;
  const bRow = rows.find((r) => r.subject_id === b.id);
  check("R5.1", Number(bRow.allowed) === 1, `the key counter recorded only the request that got through (${bRow.allowed})`);
  const orgRow = rows.find((r) => r.scope === "org");
  check("R5.2", Number(orgRow.allowed) === 4 && Number(orgRow.rejected) === 2, `org row: ${orgRow.allowed} allowed, ${orgRow.rejected} rejected`);
}

// --- R6: one exhausted org does not touch another -------------------------
{
  const orgA = await makeOrg();
  const orgB = await makeOrg();
  const keyA = await createApiKey(db, orgA, { ratePerMinute: 2 });
  const keyB = await createApiKey(db, orgB, { ratePerMinute: 2 });
  const opts = { now: T0, orgLimit: 2 };
  for (let i = 0; i < 6; i++) {
    await checkRateLimit(db, { orgA, orgId: orgA, apiKeyId: keyA.id, ratePerMinute: 2 }, opts);
  }
  const bFirst = await checkRateLimit(db, { orgId: orgB, apiKeyId: keyB.id, ratePerMinute: 2 }, opts);
  const bSecond = await checkRateLimit(db, { orgId: orgB, apiKeyId: keyB.id, ratePerMinute: 2 }, opts);
  check("R6.1", bFirst.allowed && bSecond.allowed, "org B is unaffected by org A exhausting its ceiling");
  const bRows = (await counters(orgB)).rows;
  check("R6.2", bRows.every((r) => Number(r.rejected) === 0), "org B recorded no rejections");
}

// --- R7: the stored per-key limit wins over the default -------------------
{
  const orgId = await makeOrg();
  const created = await createApiKey(db, orgId, { kind: "agent", ratePerMinute: 1 });
  const record = await findApiKey(db, created.plaintext);
  check("R7.1", record.rate_per_minute === 1, "the stored rate_per_minute round-trips out of the key record");
  const subject = { orgId, apiKeyId: record.id, ratePerMinute: record.rate_per_minute };
  const first = await checkRateLimit(db, subject, { now: T0, keyLimit: 1000 });
  const second = await checkRateLimit(db, subject, { now: T0, keyLimit: 1000 });
  check("R7.2", first.allowed && !second.allowed, "a key's own limit of 1 beats a default of 1000");
}

// --- R8: zero means zero, including the first request of a window ---------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { ratePerMinute: 0 });
  const decision = await checkRateLimit(db, { orgId, apiKeyId: key.id, ratePerMinute: 0 }, { now: T0 });
  check("R8.1", !decision.allowed, "a limit of 0 refuses the very first request — the upsert's INSERT arm cannot leak one through");
  const rows = (await counters(orgId)).rows;
  check("R8.2", rows.some((r) => r.scope === "key" && Number(r.rejected) === 1 && Number(r.allowed) === 0), "and it is recorded as a rejection, not an allowance");
}

// --- R9: expired counter rows are dropped when a new window opens ---------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { ratePerMinute: 5 });
  const subject = { orgId, apiKeyId: key.id, ratePerMinute: 5 };
  const old = new Date(T0.getTime() - (RETENTION_MINUTES + 10) * 60_000);
  await checkRateLimit(db, subject, { now: old });
  const before = (await counters(orgId)).rows.length;
  await checkRateLimit(db, subject, { now: T0 });
  const rows = (await counters(orgId)).rows;
  check("R9.1", before === 2, `the old window left ${before} rows`);
  check(
    "R9.2",
    rows.length === 2 && rows.every((r) => Number(r.allowed) === 1),
    `opening a new window pruned them; ${rows.length} current rows remain`
  );
}

// --- R10: concurrency -----------------------------------------------------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { ratePerMinute: 10 });
  const subject = { orgId, apiKeyId: key.id, ratePerMinute: 10 };
  const results = await Promise.all(
    Array.from({ length: 50 }, () => checkRateLimit(db, subject, { now: T0, orgLimit: 1000 }))
  );
  const allowed = results.filter((r) => r.allowed).length;
  check("R10.1", allowed === 10, `50 concurrent calls against one key admitted exactly 10 (${allowed})`);
  const rows = (await counters(orgId)).rows;
  const keyRow = rows.find((r) => r.scope === "key");
  check("R10.2", Number(keyRow.allowed) === 10 && Number(keyRow.rejected) === 40, `counters agree: ${keyRow.allowed} allowed, ${keyRow.rejected} rejected`);
}

// --- R10 (real): 20 separate processes, one database ----------------------
// The serverless case. Twenty instances, twenty connections, one shared
// ceiling — the claim a single in-process pool cannot make.
if (REAL_PG) {
  const tmp = await mkdtemp(path.join(HERE, ".tmp-ratelimit-"));
  try {
    const orgId = await makeOrg();
    const key = await createApiKey(db, orgId, { ratePerMinute: 5 });

    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { checkRateLimit } = await import(${JSON.stringify(path.join(DIST, "rateLimit.js"))});\n` +
        `const db = await createDb();\n` +
        `const d = await checkRateLimit(db, { orgId: process.env.ORG_ID, apiKeyId: process.env.KEY_ID, ratePerMinute: 5 }, { now: new Date(process.env.NOW), orgLimit: 1000 });\n` +
        `console.log(d.allowed ? "allowed" : "refused");\n` +
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
                env: { ...process.env, ORG_ID: orgId, KEY_ID: key.id, NOW: T0.toISOString() },
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
    check(
      "R10r.1",
      failed.length === 0,
      `20 separate processes ran the limiter, ${failed.length} failed` + (failed.length ? ` — ${failed[0].err.split("\n").filter(Boolean).pop()}` : "")
    );
    const allowed = results.filter((r) => r.out === "allowed").length;
    check("R10r.2", allowed === 5, `across 20 processes exactly 5 got through the limit of 5 (${allowed})`);

    // R10b — the counter-test. The same 20 processes against a per-instance
    // counter, which is what "add a rate limiter" usually means. Every one of
    // them is under its own limit, so all 20 pass: the ceiling is 20× what it
    // says. This is why the count lives in the database.
    const local = path.join(tmp, "local-worker.mjs");
    await writeFile(
      local,
      `let count = 0;\n` + // module-scope counter: one per instance
        `const limit = 5;\n` +
        `count += 1;\n` +
        `console.log(count <= limit ? "allowed" : "refused");\n`
    );
    const localResults = await run(local);
    const localAllowed = localResults.filter((r) => r.out === "allowed").length;
    check("R10b.1", localAllowed === 20, `a process-local counter admits all 20 against a limit of 5 (${localAllowed}) — R10r has teeth`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// --- R11: deletion-awareness ----------------------------------------------
{
  const orgId = await makeOrg();
  const key = await createApiKey(db, orgId, { ratePerMinute: 5 });
  await checkRateLimit(db, { orgId, apiKeyId: key.id, ratePerMinute: 5 }, { now: T0 });
  check("R11.1", (await counters(orgId)).rows.length === 2, "counters exist for the org");
  await db.query("DELETE FROM orgs WHERE id = $1", [orgId]);
  check("R11.2", (await counters(orgId)).rows.length === 0, "deleting the org takes its counters with it (ON DELETE CASCADE)");
}

// --- R12: the operator view -----------------------------------------------
{
  const orgId = await makeOrg();
  const quiet = await createApiKey(db, orgId, { label: "quiet", ratePerMinute: 50 });
  const noisy = await createApiKey(db, orgId, { label: "noisy", ratePerMinute: 2 });
  const opts = { now: T0, orgLimit: 1000 };
  await checkRateLimit(db, { orgId, apiKeyId: quiet.id, ratePerMinute: 50 }, opts);
  for (let i = 0; i < 6; i++) {
    await checkRateLimit(db, { orgId, apiKeyId: noisy.id, ratePerMinute: 2 }, opts);
  }

  const totals = await rateLimitTotals(db, 60, T0);
  check("R12.1", totals.rejected > 0 && totals.allowed > 0, `totals report both sides (${totals.allowed} allowed, ${totals.rejected} rejected)`);

  const subjects = await rateLimitBySubject(db, 60, T0);
  const mine = subjects.filter((s) => s.orgId === orgId);
  check("R12.2", mine[0].subjectId === noisy.id, "the runaway key sorts to the top, worst first");
  check("R12.3", mine[0].rejected === 4 && mine[0].allowed === 2, `its row is exact: ${mine[0].allowed} allowed, ${mine[0].rejected} rejected`);
  check(
    "R12.4",
    subjects.every((s) => !String(s.subjectId).startsWith("nsk_")),
    "the view carries key ids, never key material"
  );
}

// --- R13: what the refused caller is told ---------------------------------
{
  const message = rateLimitMessage({ allowed: false, scope: "key", limit: 60, retryAfterSeconds: 12 });
  check("R13.1", message.includes("60 requests per minute") && message.includes("12s"), "the message states the ceiling and when to retry");
  check("R13.2", message.includes("No credits were used"), "and that nothing was charged — a refused request must not read like a spend");
}

await db.close();

if (!REAL_PG) {
  console.log(
    "\n⚠️  R10 ran on PGlite: 50 concurrent CALLS on one in-process connection.\n" +
      "   R10r (20 separate processes) and its counter-test R10b were SKIPPED —\n" +
      "   they need a shared server. What ran proves the read-then-write race is\n" +
      "   closed; it does NOT prove the serverless case, where the whole point is\n" +
      "   that instances share nothing but the database. Per Doctrine 3 that is an\n" +
      "   open risk, not a pass.\n" +
      '   Close it with: DATABASE_URL="$(scripts/test-db.sh start)" node test/rateLimit.test.mjs'
  );
}

console.log(failures === 0 ? "\nrateLimit: all checks passed" : `\nrateLimit: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
