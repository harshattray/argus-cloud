// Local-dev seed: one org, one API key, 100 credits. Prints the key once.
// Run from web/:  PGLITE_DATA_DIR=../.pgdata node scripts/seed-dev.mjs
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDb, migrate } = await import(require.resolve("argus-cloud/db.js"));
const { createApiKey } = await import(require.resolve("argus-cloud/apiKeys.js"));
const { grantCredits } = await import(require.resolve("argus-cloud/ledger.js"));
const { randomUUID } = await import("node:crypto");

const db = await createDb();
await migrate(db);

const orgId = randomUUID();
await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, 'dev-org', 'team')", [orgId]);
const key = await createApiKey(db, orgId, { kind: "upload", label: "dev" });
await grantCredits(db, {
  orgId,
  kind: "plan_allotment",
  credits: 100,
  expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
});

console.log(`org: ${orgId}`);
console.log(`api key (shown once): ${key.plaintext}`);
await db.close();
