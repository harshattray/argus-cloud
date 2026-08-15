#!/usr/bin/env node
//
// Compare the applied schema of two databases — how far staging is ahead of
// production, and whether either has anything the other has never seen.
//
//   node scripts/schema-drift.mjs --from "$PROD_URL" --to "$STAGING_URL"
//   PROD_URL=… STAGING_URL=… node scripts/schema-drift.mjs
//
// **Why this exists.** Staging is meant to run ahead of production — that is
// what makes it a rehearsal. The danger is not the gap, it is not knowing the
// size of it: a production deploy that quietly applies four unrehearsed
// migrations at once is the thing staging was supposed to prevent, and without
// a way to look, "they are in sync" is a belief.
//
// Read-only. Every statement here is a SELECT; this script cannot change
// either database, which is what makes it safe to point at production.
//
// Exit codes:
//   0  level, cleanly ahead, or empty — an empty target is a database nobody
//      has migrated yet, which needs a request rather than a decision
//   1  genuine drift — the target has applied some migrations and is missing
//      others the source has, so it is no longer a rehearsal of it
//   2  could not run

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const fromUrl = (value("--from") ?? process.env.PROD_URL ?? "").trim();
const toUrl = (value("--to") ?? process.env.STAGING_URL ?? "").trim();
const fromName = value("--from-name") ?? "production";
const toName = value("--to-name") ?? "staging";

if (!fromUrl || !toUrl) {
  console.error("need two databases: --from <url> --to <url> (or PROD_URL and STAGING_URL)");
  process.exit(2);
}

const { default: pg } = await import(path.join(ROOT, "node_modules", "pg", "lib", "index.js"));

/** Applied migration names, and the local ones the build knows about. */
async function applied(url, label) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`${label}: could not connect — ${String(err.message ?? err)}`);
    process.exit(2);
  }
  try {
    const res = await client.query("SELECT name FROM schema_migrations ORDER BY name");
    return res.rows.map((r) => r.name);
  } catch {
    // No schema_migrations at all is a legitimate answer: an empty database.
    return [];
  } finally {
    await client.end();
  }
}

const [from, to] = await Promise.all([applied(fromUrl, fromName), applied(toUrl, toName)]);
const fromSet = new Set(from);
const toSet = new Set(to);

const ahead = to.filter((m) => !fromSet.has(m));
const behind = from.filter((m) => !toSet.has(m));

const { EMBEDDED_MIGRATIONS } = await import(path.join(ROOT, "dist", "migrations.generated.js"));
const local = EMBEDDED_MIGRATIONS.map((m) => m.name);
const unshipped = local.filter((m) => !toSet.has(m) && !fromSet.has(m));

console.log(`${fromName.padEnd(12)} ${from.length} migration(s), latest ${from.at(-1) ?? "(none)"}`);
console.log(`${toName.padEnd(12)} ${to.length} migration(s), latest ${to.at(-1) ?? "(none)"}`);
console.log(`this build   ${local.length} migration(s), latest ${local.at(-1) ?? "(none)"}`);

if (ahead.length > 0) {
  console.log(`\n${toName} is ahead by ${ahead.length}:`);
  for (const m of ahead) console.log(`  + ${m}`);
}
if (unshipped.length > 0) {
  console.log(`\nin this build, applied nowhere yet (${unshipped.length}):`);
  for (const m of unshipped) console.log(`  · ${m}`);
}

// An empty target is not drift — it is a database nobody has migrated yet.
//
// **Worth its own case because the advice differs completely.** A diverged
// branch has to be re-created; an empty one only needs a request, since
// `migrate()` applies everything on first use. Telling someone to re-branch a
// perfectly good fresh branch is advice that destroys the thing it is meant to
// protect — and this script gave exactly that advice for a Neon branch created
// schema-only, which starts with no `schema_migrations` at all.
//
// Exit 0: nothing is wrong. There is simply nothing there yet.
if (to.length === 0) {
  console.log(`\n${toName} is empty — no migrations applied yet, which is not drift.`);
  console.log(
    `A fresh branch starts with no \`schema_migrations\`; the first database request applies all ${from.length}.`
  );
  console.log(`Open a deployment pointed at ${toName}, then run this again. Do not re-branch — there is nothing to fix.`);
  process.exit(0);
}

// The bad case, and the reason this exits non-zero. If the source has a
// migration the target has never applied *while the target has applied others*,
// the two have genuinely diverged: the target is no longer a rehearsal of the
// source, and anything proven on it proves nothing. Re-branch rather than
// reconcile by hand.
if (behind.length > 0) {
  console.log(`\n⚠️  ${fromName} has ${behind.length} migration(s) ${toName} has never applied:`);
  for (const m of behind) console.log(`  - ${m}`);
  console.log(`\n${toName} is not a rehearsal of ${fromName}. Re-branch it from ${fromName} before trusting a deploy.`);
  process.exit(1);
}

if (ahead.length === 0) {
  console.log(`\n${toName} and ${fromName} are level.`);
} else {
  console.log(`\n${toName} leads ${fromName} cleanly by ${ahead.length} — that is the rehearsal working.`);
  console.log(`Deploying to ${fromName} will apply those ${ahead.length}, already exercised on ${toName}.`);
}
