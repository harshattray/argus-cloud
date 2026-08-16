#!/usr/bin/env node
//
// Stamp `schema_migrations` on a database whose schema is already current.
//
//   node scripts/adopt-schema.mjs --url "$STAGING_URL"
//   node scripts/adopt-schema.mjs --url "$STAGING_URL" --dry-run
//
// **The case this exists for.** A Neon "schema only" branch copies table
// structures and no rows — and `schema_migrations` is a table whose *rows* are
// the bookkeeping. The branch therefore arrives with every table the parent has
// and a migration log claiming nothing was ever applied. `migrate()` reads that
// log, concludes it must run `001`, and dies on `CREATE TABLE orgs`:
//
//     error: relation "orgs" already exists
//
// The database is not broken and nothing needs re-creating. What is missing is
// the record, and this writes it.
//
// **It refuses unless the schema really is current.** Stamping a database that
// does not have the tables would tell `migrate()` to skip work that genuinely
// needs doing, and the failure would surface later as a missing column rather
// than here as a clear error. So every table the build's migrations create must
// already exist, or this exits without writing.
//
// Exit codes:
//   0  stamped, or already complete
//   1  the schema does not match the build — nothing written
//   2  could not run

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = (value("--url") ?? process.env.DATABASE_URL ?? "").trim();
const dryRun = args.includes("--dry-run");

if (!url) {
  console.error("need a database: --url <connection string> (or DATABASE_URL)");
  process.exit(2);
}

const { EMBEDDED_MIGRATIONS } = await import(path.join(ROOT, "dist", "migrations.generated.js"));
const { default: pg } = await import(path.join(ROOT, "node_modules", "pg", "lib", "index.js"));

/**
 * Every table the migrations create.
 *
 * Read from the SQL rather than maintained by hand, so a new migration cannot
 * add a table this check forgets to look for.
 */
const expectedTables = new Set();
for (const m of EMBEDDED_MIGRATIONS) {
  for (const match of m.sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/gi)) {
    expectedTables.add(match[1].toLowerCase());
  }
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  console.error(`could not connect — ${String(err.message ?? err)}`);
  process.exit(2);
}

try {
  const present = new Set(
    (
      await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    ).rows.map((r) => r.table_name.toLowerCase())
  );
  const missing = [...expectedTables].filter((t) => !present.has(t));

  console.log(`build expects ${expectedTables.size} table(s); the database has ${present.size}`);

  if (missing.length > 0) {
    console.error(`\nthis database is missing ${missing.length} table(s) the build creates:`);
    for (const t of missing.slice(0, 10)) console.error(`  - ${t}`);
    console.error(
      `\nIts schema is not current, so stamping it would hide real work. ` +
        `Let \`migrate()\` run against it instead — an empty database migrates cleanly.`
    );
    process.exit(1);
  }

  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const already = new Set(
    (await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
  );
  const toStamp = EMBEDDED_MIGRATIONS.map((m) => m.name).filter((n) => !already.has(n));

  if (toStamp.length === 0) {
    console.log("already complete — nothing to stamp.");
    process.exit(0);
  }

  console.log(`\n${toStamp.length} migration(s) to record as applied:`);
  for (const n of toStamp) console.log(`  + ${n}`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    process.exit(0);
  }

  // One statement, so a database is never left half-stamped. A partial stamp is
  // worse than none: `migrate()` would resume mid-sequence and fail on whichever
  // object the next migration creates.
  await client.query(
    "INSERT INTO schema_migrations (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING",
    [toStamp]
  );
  const total = (await client.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n;
  console.log(`\nstamped. schema_migrations now records ${total} migration(s).`);
} finally {
  await client.end();
}
