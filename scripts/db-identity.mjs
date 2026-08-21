#!/usr/bin/env node
//
// "Which database is this?" — asked without writing to it.
//
//   DATABASE_URL='postgres://…' node scripts/db-identity.mjs
//
// **Why this exists.** There are now three connection strings in play —
// production, the staging branch behind the preview deployment, and whatever a
// laptop is pointed at — and Vercel marks the first two Sensitive, so neither
// can be read back from the dashboard or the CLI. The failure that makes this
// worth a script is not subtle: provisioning an organization into production
// while believing it is staging, or worse, running a migration there.
//
// **It only reads.** Every statement is a SELECT, there is no migrate() call,
// and it opens no transaction. Pointing it at production is safe, which is the
// property that makes it usable for the question it answers.
//
// It prints nothing that identifies a customer: counts, the highest migration,
// and the names of organizations only where they are this repo's own fixtures.

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("usage: DATABASE_URL='postgres://…' node scripts/db-identity.mjs");
  process.exit(2);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (err) {
  console.error(`could not connect: ${String(err.message ?? err)}`);
  process.exit(2);
}

const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await client.query(sql, params)).rows;

const parsed = new URL(url);
console.log(`host      ${parsed.host}`);
console.log(`database  ${parsed.pathname.replace(/^\//, "")}`);
console.log(`user      ${parsed.username}`);
console.log(`sslmode   ${parsed.searchParams.get("sslmode") ?? "(unset — see FinishedSPEC §9)"}`);

// Neon puts the branch in the host for direct endpoints and hides it behind the
// pooler otherwise, so it is reported when the server knows it and skipped when
// it does not. Guessing it from the host would be wrong exactly when it matters.
const version = await one("SELECT version() AS v");
console.log(`server    ${String(version.v).split(" on ")[0]}`);

const tables = await one(
  "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log(`tables    ${tables.n}`);

const hasMigrations = await one(
  "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'"
);
if (hasMigrations.n === 0) {
  console.log("migrations  none recorded — schema_migrations does not exist");
} else {
  // The column is `name`, not `id` — the table is keyed on the migration's
  // filename. Worth stating because guessing `id` is the obvious mistake and it
  // fails at exactly the moment this script is most wanted.
  const range = await one(
    "SELECT COUNT(*)::int AS n, MIN(name) AS lo, MAX(name) AS hi FROM schema_migrations"
  );
  console.log(`migrations  ${range.n} applied, ${range.lo ?? "-"} … ${range.hi ?? "-"}`);
  if (range.n === 0 && tables.n > 0) {
    console.log(
      "\n⚠️  Tables exist but nothing is recorded as applied. This is the schema-only\n" +
        "    branch trap: migrate() will start at 001 and fail with\n" +
        '    `relation "orgs" already exists`. Run scripts/adopt-schema.mjs against it —\n' +
        "    do not re-create the branch, which produces the identical state."
    );
  }
}

const hasOrgs = await one(
  "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orgs'"
);
if (hasOrgs.n > 0) {
  const orgs = await all("SELECT name, plan, owner_user_id FROM orgs ORDER BY created_at LIMIT 10");
  const total = await one("SELECT COUNT(*)::int AS n FROM orgs");
  const runs = await one("SELECT COUNT(*)::int AS n FROM runs");
  console.log(`orgs      ${total.n}${total.n ? ` (${orgs.filter((o) => o.owner_user_id).length} claimed)` : ""}`);
  console.log(`runs      ${runs.n}`);
  for (const org of orgs) {
    // A name is the one field that tells production from a fixture at a glance,
    // and every organization that exists today is one of ours. Truncated, and
    // this is the line to drop if that ever stops being true.
    console.log(`          · ${org.name.slice(0, 48)} [${org.plan}]${org.owner_user_id ? " owned" : " unclaimed"}`);
  }
}

/**
 * Did the deployment I just used write here?
 *
 * **This is the question the rest of the script cannot answer.** Two Neon
 * branches carry the same schema, the same database name, and often the same
 * table counts, so nothing structural tells them apart. What does is traffic:
 * `auth_events` and `auth_throttle` are written by a sign-in attempt and by
 * nothing else, so a row from five minutes ago is proof that the deployment you
 * were just clicking through is connected to *this* database.
 *
 * Neither table holds an address or an IP — both are keyed hashes — so this
 * prints timing and outcomes, which is all the question needs.
 */
const hasEvents = await one(
  "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auth_events'"
);
if (hasEvents.n > 0) {
  const recent = await all(
    `SELECT kind, outcome, reason, at,
            EXTRACT(EPOCH FROM (now() - at))::int AS age_seconds
       FROM auth_events ORDER BY at DESC LIMIT 5`
  );
  const throttle = await one(
    "SELECT COUNT(*)::int AS n, MAX(window_start) AS newest FROM auth_throttle"
  );
  console.log(`sign-ins  ${recent.length === 0 ? "no authentication traffic has ever reached this database" : ""}`);
  for (const row of recent) {
    const age =
      row.age_seconds < 90
        ? `${row.age_seconds}s ago`
        : row.age_seconds < 5400
          ? `${Math.round(row.age_seconds / 60)}m ago`
          : `${Math.round(row.age_seconds / 3600)}h ago`;
    console.log(`          · ${age.padStart(8)}  ${row.kind} ${row.outcome}${row.reason ? ` (${row.reason})` : ""}`);
  }
  console.log(`throttle  ${throttle.n} counter row(s)${throttle.newest ? `, newest window ${new Date(throttle.newest).toISOString()}` : ""}`);
}

const hasSessions = await one(
  "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sessions'"
);
console.log(`step 6    ${hasSessions.n > 0 ? "session layer present (migration 021 applied)" : "not applied — this database predates migration 021"}`);

// Writable or not, asked without writing: a read-only Neon compute reports it,
// and so does a session that has been put into read-only mode for any other
// reason. Cheaper and safer than finding out with an INSERT.
const readOnly = await one("SHOW transaction_read_only");
console.log(`writable  ${readOnly.transaction_read_only === "on" ? "NO — this endpoint is read-only" : "yes"}`);

await client.end();
