#!/usr/bin/env node
//
// Retention sweep and deletion — the operator's entry point to `src/retention.ts`
// (PATHWAYS Pathway 1 item 9; FUTURENORMA §5 "a 90-day sweep with a dry-run mode").
//
//   node scripts/retention.mjs                      # dry run: what a 90-day sweep would remove
//   node scripts/retention.mjs --apply              # actually remove it
//   node scripts/retention.mjs --days 30 --org <id> # narrower window, one org
//   node scripts/retention.mjs --delete-org <id> --apply
//
// **Dry run is the default and `--apply` is the only way past it.** A deletion
// tool whose safe mode needs a flag is one that deletes an org the first time
// someone types the command wrong.
//
// Needs DATABASE_URL (and NORMA_STORAGE_* for real storage — without them the
// filesystem driver under .storage is used, which is not production).

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb } = await import(path.join(DIST, "db.js"));
const { createStorage } = await import(path.join(DIST, "storage.js"));
const { sweepRetention, deleteOrg, DEFAULT_RETENTION_DAYS } = await import(path.join(DIST, "retention.js"));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const apply = flag("--apply");
const days = Number(value("--days") ?? DEFAULT_RETENTION_DAYS);
const orgId = value("--org") ?? null;
const deleteOrgId = value("--delete-org") ?? null;

if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number");
  process.exit(2);
}

const db = await createDb();
const storage = await createStorage();

console.log(`storage driver: ${storage.driver}`);
console.log(apply ? "mode: APPLY — this deletes\n" : "mode: dry run — nothing will be deleted\n");

const outcome = deleteOrgId
  ? await deleteOrg(db, storage, deleteOrgId, { dryRun: !apply })
  : await sweepRetention(db, storage, { retentionDays: days, orgId, dryRun: !apply });

const { job } = outcome;
console.log(
  deleteOrgId
    ? `organization ${deleteOrgId}`
    : `runs older than ${days} days${orgId ? ` in org ${orgId}` : " (all orgs)"}`
);
console.log(`  objects : ${job.objects}`);
console.log(`  bytes   : ${job.bytes} (${(job.bytes / 1e6).toFixed(2)} MB)`);
console.log(`  rows    : ${job.rows}`);
console.log(`  job     : ${job.id} — ${job.state}${job.lastError ? ` — ${job.lastError}` : ""}`);

await db.close();
process.exit(job.state === "failed" ? 1 : 0);
