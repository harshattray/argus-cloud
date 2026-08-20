#!/usr/bin/env node
//
// The private-preview organization — `BuildV5.md` J3.
//
//   DATABASE_URL=… node scripts/provision-preview-org.mjs
//   DATABASE_URL=… node scripts/provision-preview-org.mjs --key-file .env.preview
//
// **It is a real `team` org on purpose.** J3 says so in one line and the reason
// is worth keeping: the entitlement check that refuses uploads from unpaid
// plans (G2c) is the single control standing between "free" and the thing we
// charge for, and the easiest way to break it is to grant the preview an
// exception. There is no exception here. The org holds `team` with an active
// subscription, `createApiKey` refuses to mint an upload key for anything less,
// and the preview therefore exercises the same path a customer will.
//
// Idempotent: run it twice and the second run finds the org and says so rather
// than creating a twin. A second *key* is minted only when asked, because the
// plaintext is shown once and losing it is the ordinary reason to want another.
//
// **The key is printed once and never stored in plaintext** — only its hash
// reaches the database. `--key-file` writes it to a file instead of the
// terminal, which is what you want when the terminal is being read by someone
// else, including an agent. `.env.*` is gitignored.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const args = process.argv.slice(2);
const keyFileAt = args.indexOf("--key-file");
const keyFile = keyFileAt === -1 ? null : args[keyFileAt + 1];
const forceNewKey = args.includes("--new-key");

const ORG_NAME = "Normascope — private preview";
const KEY_LABEL = "private preview — upload";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required — this provisions a real organization, not a fixture");
  process.exit(2);
}

const { createDb } = await import(path.join(DIST, "db.js"));
const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));
const { planLimitsFor } = await import(path.join(DIST, "plans.js"));
const { randomUUID } = await import("node:crypto");

const db = await createDb();
console.log(`database: ${new URL(process.env.DATABASE_URL).host}\n`);

const existing = await db.query("SELECT id, plan, subscription_status FROM orgs WHERE name = $1", [ORG_NAME]);
let orgId;
if (existing.rows.length > 0) {
  orgId = existing.rows[0].id;
  console.log(`org: already exists — ${orgId} (${existing.rows[0].plan}, ${existing.rows[0].subscription_status})`);
} else {
  orgId = randomUUID();
  await db.query(
    "INSERT INTO orgs (id, name, plan, subscription_status, subscription_status_at) VALUES ($1,$2,'team','active',now())",
    [orgId, ORG_NAME]
  );
  console.log(`org: created ${orgId} — team, active`);
}

// Read back rather than trusting the insert: this is the check the preview
// exists to exercise, so asserting it here costs nothing and catches a plan
// row that was edited later.
const limits = await planLimitsFor(db, orgId);
console.log(`entitlement: canUpload=${limits.canUpload}, plan=${limits.plan}, retention=${limits.retentionDays}d`);
if (!limits.canUpload) {
  console.error("\nthe preview org cannot upload — that is the entitlement check working, and it means this org is wrong");
  await db.close();
  process.exit(1);
}

const keys = await db.query("SELECT count(*)::int AS n FROM api_keys WHERE org_id = $1 AND kind = 'upload'", [orgId]);
if (keys.rows[0].n > 0 && !forceNewKey) {
  console.log(`key: ${keys.rows[0].n} upload key(s) already exist — pass --new-key to mint another`);
} else {
  const created = await createApiKey(db, orgId, { kind: "upload", label: KEY_LABEL });
  const { plaintext } = created;
  if (keyFile) {
    writeFileSync(keyFile, `NORMA_CLOUD_KEY=${plaintext}\nNORMA_CLOUD_ORG=${orgId}\n`, { mode: 0o600 });
    console.log(`key: written to ${keyFile} (mode 600) — shown nowhere else`);
  } else {
    console.log(`\nkey (shown once):\n\n  ${plaintext}\n`);
  }
}

await db.close();
