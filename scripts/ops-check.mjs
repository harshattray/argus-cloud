#!/usr/bin/env node
//
// The scheduled operational check — PATHWAYS Pathway 1 item 10 ("operational
// alerts"); §3 "Operations and recovery".
//
//   DATABASE_URL=… node scripts/ops-check.mjs
//   node scripts/ops-check.mjs --quiet        # print only what is wrong
//
// Run it on a schedule. It reads the tables the rest of the product writes —
// backups, restore rehearsals, deletion jobs, the breaker, budget alerts,
// provider reservations — and announces anything wrong exactly once per period
// through the configured alert channel.
//
// Exit codes are the second delivery path, and deliberately so: a webhook can
// be down, and a cron job that exits non-zero is noticed by whatever runs it.
//
//   0  nothing wrong
//   1  something is wrong (each signal printed), or an alert could not be sent
//   2  the check itself could not run

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb } = await import(path.join(DIST, "db.js"));
const { createAlertChannel } = await import(path.join(DIST, "alertChannel.js"));
const { checkOperationalHealth } = await import(path.join(DIST, "opsAlerts.js"));
const { recoveryHealth } = await import(path.join(DIST, "backup.js"));

const quiet = process.argv.includes("--quiet");

let db;
try {
  db = await createDb();
} catch (err) {
  console.error(`ops-check could not connect: ${String(err.message ?? err)}`);
  process.exit(2);
}

const channel = createAlertChannel();
if (!quiet) {
  console.log(`alert channel: ${channel.describe()}`);
}

let result;
try {
  result = await checkOperationalHealth(db, channel.alert);
} catch (err) {
  console.error(`ops-check failed while reading state: ${String(err.message ?? err)}`);
  await db.close();
  process.exit(2);
}

// Awaiting the sends is the whole reason this script exists rather than a route:
// on the request path an alert is fire-and-forget, and here it is not.
const sends = await channel.flush();
const failedSends = sends.filter((s) => !s.ok);

if (!quiet) {
  const health = await recoveryHealth(db);
  const age = (hours) => (hours === null ? "never" : `${hours.toFixed(1)}h ago`);
  const days = (d) => (d === null ? "never" : `${d.toFixed(0)}d ago`);
  console.log(`last good backup   : ${age(health.backupAgeHours)}${health.lastGoodBackup ? ` (${health.lastGoodBackup.id})` : ""}`);
  console.log(`last passed restore: ${days(health.rehearsalAgeDays)}${health.lastPassedRehearsal ? ` (${health.lastPassedRehearsal.id})` : ""}`);
}

if (result.healthy) {
  if (!quiet) console.log("\nnothing wrong.");
} else {
  console.log(`\n${result.signals.length} problem(s):`);
  for (const signal of result.signals) {
    const announced = result.deliveries.some(
      (d) => d.kind === signal.kind && d.subjectId === signal.subjectId && d.period === signal.period
    );
    console.log(`  [${signal.severity}] ${signal.kind} — ${signal.detail}${announced ? "" : " (already alerted)"}`);
  }
}

for (const send of failedSends) {
  console.error(`alert channel failure: ${send.transport} — ${send.error}`);
}

await db.close();
process.exit(result.healthy && failedSends.length === 0 ? 0 : 1);
