// Migration safety suite — PATHWAYS.md Pathway 1 item 1 / §10.3 "1A. Make
// migrations safe".
//
// Run: npm test — runs on PGlite.
// Run against real Postgres: DATABASE_URL=postgres://... node test/migrations.test.mjs
//
// ⚠️ Read M3's note before treating the concurrency result as proof. On PGlite
// this suite exercises concurrent *calls*, not concurrent *connections*; only a
// DATABASE_URL run proves the serverless cold-start case.

import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const MIGRATIONS = path.resolve(HERE, "..", "migrations");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));

const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/** Fresh, isolated database per test. On real Postgres they share one server. */
async function freshDb() {
  const db = await createDb();
  if (REAL_PG) {
    // Real-Postgres runs reuse one database, so start from a clean schema.
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  }
  return db;
}

const fileCount = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).length;

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}`);
console.log(`migrations on disk: ${fileCount}\n`);

// --- M1: a fresh database migrates cleanly ------------------------------
{
  const db = await freshDb();
  await migrate(db);
  const rows = await db.query("SELECT name FROM schema_migrations ORDER BY name");
  check("M1.1", rows.rows.length === fileCount, `applied ${rows.rows.length} of ${fileCount} migrations`);
  const orgs = await db.query("SELECT to_regclass('orgs') AS t");
  check("M1.2", orgs.rows[0].t !== null, "schema actually exists (orgs table present)");
  await db.close();
}

// --- M2: re-running is a no-op ------------------------------------------
{
  const db = await freshDb();
  await migrate(db);
  await migrate(db);
  await migrate(db);
  const rows = await db.query("SELECT count(*) AS n FROM schema_migrations");
  check("M2.1", Number(rows.rows[0].n) === fileCount, `three runs still leave ${fileCount} rows — idempotent`);
  await db.close();
}

// --- M3: concurrent cold starts -----------------------------------------
// PATHWAYS §10.3 1A item 4. The pass condition is BuildV5 F2.1's: exactly one
// migration run, no duplicate-object errors.
{
  const db = await freshDb();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => migrate(db)));
  const rejected = results.filter((r) => r.status === "rejected");
  check(
    "M3.1",
    rejected.length === 0,
    `20 concurrent migrate() calls, ${rejected.length} rejected` +
      (rejected.length ? ` — first: ${String(rejected[0].reason).split("\n")[0]}` : "")
  );
  const rows = await db.query("SELECT count(*) AS n FROM schema_migrations");
  check("M3.2", Number(rows.rows[0].n) === fileCount, `exactly ${fileCount} rows after 20 concurrent runs`);
  await db.close();
}

// --- M3b: the counter-test — prove M3 can fail --------------------------
// A concurrency test that passes against the broken implementation proves
// nothing. This reproduces the pre-1A migrate() verbatim (no lock, no
// transaction) and asserts it FAILS the same way F2.1 describes. If this ever
// starts passing, M3 has stopped testing anything and both need rewriting.
{
  async function preLockMigrate(db) {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    const applied = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await db.exec(await readFile(path.join(MIGRATIONS, file), "utf-8"));
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    }
  }
  const db = await freshDb();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => preLockMigrate(db)));
  const rejected = results.filter((r) => r.status === "rejected");
  check(
    "M3b.1",
    rejected.length > 0,
    `pre-1A implementation still fails under concurrency (${rejected.length}/20 rejected) — M3 has teeth`
  );
  await db.close();
}

// --- M4: an older bundle against a newer schema -------------------------
// PATHWAYS §10.3 1A item 5. A rollback deploy ships fewer migration files than
// the database has applied. It must start, and must not undo anything.
{
  const db = await freshDb();
  await migrate(db);
  await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", ["999_from_a_newer_bundle.sql"]);

  let threw = null;
  try {
    await migrate(db); // the "older" bundle: it only knows the files on disk
  } catch (err) {
    threw = err;
  }
  check("M4.1", threw === null, `older bundle starts against a newer schema${threw ? `: ${threw}` : ""}`);

  const future = await db.query("SELECT name FROM schema_migrations WHERE name = $1", [
    "999_from_a_newer_bundle.sql",
  ]);
  check("M4.2", future.rows.length === 1, "the newer bundle's migration row is left alone, not deleted");

  const orgs = await db.query("SELECT to_regclass('orgs') AS t");
  check("M4.3", orgs.rows[0].t !== null, "no destructive migration attempted — schema intact");
  await db.close();
}

// --- M5: a failing migration rolls back completely ----------------------
// Also the regression guard for the PGlite wrapper: `exec` must run through the
// transaction handle. If it routes to the outer instance instead, the DDL below
// survives the rollback and M5.2 fails.
{
  const tmp = await mkdtemp(path.join(HERE, ".tmp-migrations-"));
  try {
    await writeFile(path.join(tmp, "001_ok.sql"), "CREATE TABLE m5_ok (id INT);");
    await writeFile(path.join(tmp, "002_bad.sql"), "CREATE TABLE m5_bad (id INT);\nTHIS IS NOT SQL;");

    const db = await freshDb();
    let threw = null;
    try {
      await migrate(db, tmp);
    } catch (err) {
      threw = err;
    }
    check("M5.1", threw !== null, "a migration with invalid SQL rejects rather than half-applying");

    const ok = await db.query("SELECT to_regclass('m5_ok') AS t");
    check(
      "M5.2",
      ok.rows[0].t === null,
      "the migration that succeeded before the failure was rolled back — exec ran inside the transaction"
    );
    await db.close();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// --- M6: the lock is transaction-scoped, not session-scoped -------------
// A session lock leaked back into the pool would wedge every later boot. Proof
// that it was released: migrate again on a new handle and get the lock.
{
  const db = await freshDb();
  await migrate(db);
  const second = await createDb();
  let threw = null;
  try {
    await migrate(second);
  } catch (err) {
    threw = err;
  }
  check("M6.1", threw === null, "a later migrate() acquires the lock — it was not left held");
  await second.close();
  await db.close();
}

// --- M7: 20 real cold starts, separate processes -------------------------
// The literal test PATHWAYS §10.3 1A item 4 asks for, and the one M3 cannot
// make on its own: M3 is concurrent *calls* sharing one pool, which is a
// weaker claim than concurrent *processes* each opening their own connections.
// Only meaningful against a shared server, so it is skipped on PGlite, where
// every process would get its own private in-memory database.
if (REAL_PG) {
  const { spawn } = await import("node:child_process");
  const tmp = await mkdtemp(path.join(HERE, ".tmp-coldstart-"));
  try {
    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `const { createDb, migrate } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const db = await createDb();\n` +
        `const pid = (await db.query("SELECT pg_backend_pid() AS p")).rows[0].p;\n` +
        `await migrate(db);\n` +
        `console.log(pid);\n` +
        `await db.close();\n`
    );

    const seed = await freshDb();
    await seed.close();

    const results = await Promise.all(
      Array.from(
        { length: 20 },
        () =>
          new Promise((resolve) => {
            const child = spawn(process.execPath, [worker], { env: process.env });
            let out = "";
            let err = "";
            child.stdout.on("data", (d) => (out += d));
            child.stderr.on("data", (d) => (err += d));
            child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
          })
      )
    );

    const failed = results.filter((r) => r.code !== 0);
    check(
      "M7.1",
      failed.length === 0,
      `20 separate processes cold-started against one database, ${failed.length} failed` +
        (failed.length ? ` — ${failed[0].err.split("\n").filter(Boolean).pop()}` : "")
    );

    const pids = new Set(results.map((r) => r.out).filter(Boolean));
    check("M7.2", pids.size > 1, `they occupied ${pids.size} distinct Postgres backends — genuinely separate connections`);

    const verify = await createDb();
    const rows = await verify.query("SELECT count(*) AS n FROM schema_migrations");
    check("M7.3", Number(rows.rows[0].n) === fileCount, `exactly ${fileCount} rows after 20 process cold starts`);
    await verify.close();

    // M7b — the counter-test for M7, same reasoning as M3b. Against real
    // backends the pre-1A failure is uglier than the single-connection one:
    // concurrent CREATE TABLE collides in the system catalog itself.
    const oldWorker = path.join(tmp, "old-worker.mjs");
    await writeFile(
      oldWorker,
      `import { readFile, readdir } from "node:fs/promises";\n` +
        `import path from "node:path";\n` +
        `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const DIR = ${JSON.stringify(MIGRATIONS)};\n` +
        `const db = await createDb();\n` +
        `await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");\n` +
        `const applied = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map(r => r.name));\n` +
        `for (const f of (await readdir(DIR)).filter(x => x.endsWith(".sql")).sort()) {\n` +
        `  if (applied.has(f)) continue;\n` +
        `  await db.exec(await readFile(path.join(DIR, f), "utf-8"));\n` +
        `  await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);\n` +
        `}\n` +
        `await db.close();\n`
    );

    const reset = await freshDb();
    await reset.close();

    const oldResults = await Promise.all(
      Array.from(
        { length: 20 },
        () =>
          new Promise((resolve) => {
            const child = spawn(process.execPath, [oldWorker], { env: process.env });
            let err = "";
            child.stderr.on("data", (d) => (err += d));
            child.on("close", (code) => resolve({ code, err: err.trim() }));
          })
      )
    );
    const oldFailed = oldResults.filter((r) => r.code !== 0);
    check(
      "M7b.1",
      oldFailed.length > 0,
      `pre-1A implementation still fails 20 real cold starts (${oldFailed.length}/20) — M7 has teeth`
    );

    // Leave the database migrated for anything that runs after this file.
    const restore = await freshDb();
    await migrate(restore);
    await restore.close();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

if (!REAL_PG) {
  console.log(
    "\n⚠️  M3 ran on PGlite: 20 concurrent CALLS on one in-process connection.\n" +
      "   M7 (20 separate processes) was SKIPPED — it needs a shared server.\n" +
      "   That proves the read-then-write interleaving race is closed, and M3b\n" +
      "   proves the assertion can fail. It does NOT prove the multi-connection\n" +
      "   serverless case — pg_advisory_xact_lock across separate backends is\n" +
      "   untested here. Per Doctrine 3 that is an open risk, not a pass.\n" +
      "   Close it with: DATABASE_URL=postgres://... node test/migrations.test.mjs"
  );
}

console.log(failures === 0 ? "\nmigrations: all checks passed" : `\nmigrations: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
