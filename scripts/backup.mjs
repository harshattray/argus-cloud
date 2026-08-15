#!/usr/bin/env node
//
// Take an encrypted database backup — PATHWAYS Pathway 1 item 10 ("maintain
// encrypted backups"); the operator's entry point to `src/backup.ts`.
//
//   DATABASE_URL=… NORMA_BACKUP_KEY=… node scripts/backup.mjs --actor nightly-cron
//   node scripts/backup.mjs --actor harsha --note "before the 015 migration"
//
// Needs `pg_dump` (PG_BIN overrides where to find it), DATABASE_URL, and
// NORMA_BACKUP_KEY. Without NORMA_STORAGE_BUCKET the dump lands under the
// filesystem storage driver's root, which is fine for a rehearsal and is not
// production.
//
// **The manifest is taken inside the dump's own snapshot.** The session below
// opens a REPEATABLE READ transaction, exports its snapshot, hands that id to
// `pg_dump --snapshot`, and counts rows in the same transaction. Counting
// before or after instead would disagree with the dump by whatever the site did
// in between — and a restore rehearsal that false-alarms on ordinary traffic is
// an alert an operator learns to ignore.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb } = await import(path.join(DIST, "db.js"));
const { createStorage } = await import(path.join(DIST, "storage.js"));
const {
  startBackup,
  completeBackup,
  failBackup,
  tableRowCounts,
  manifestRowTotal,
  parseBackupKey,
  encryptBackup,
  sha256Hex,
  backupStorageKey,
} = await import(path.join(DIST, "backup.js"));

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const actor = value("--actor") ?? "manual";
const note = value("--note") ?? "";
const databaseUrl = process.env.DATABASE_URL?.trim();
const pgBin = process.env.PG_BIN?.trim();
const pgDump = pgBin ? path.join(pgBin, "pg_dump") : "pg_dump";

if (!databaseUrl) {
  console.error("DATABASE_URL is required — there is nothing to back up without it.");
  process.exit(2);
}

let key;
try {
  key = parseBackupKey(process.env.NORMA_BACKUP_KEY);
} catch (err) {
  console.error(String(err.message ?? err));
  process.exit(2);
}

function run(command, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", (err) =>
      reject(new Error(`${command} could not be started (${err.message}). Set PG_BIN if it is not on PATH.`))
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(0, 500)}`))
    );
  });
}

const db = await createDb();
const storage = await createStorage();
const id = `bk_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${randomUUID().slice(0, 8)}`;
const workDir = await mkdtemp(path.join(tmpdir(), "normascope-backup-"));
const dumpFile = path.join(workDir, `${id}.dump`);

console.log(`backup ${id}`);
console.log(`  storage driver : ${storage.driver}`);

let manifest = null;
try {
  await startBackup(db, { id, actor });

  // The snapshot-sharing dance. The transaction must stay open for as long as
  // pg_dump runs — closing it invalidates the exported snapshot and pg_dump
  // fails rather than silently dumping a different point in time.
  manifest = await db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const snapshot = (await tx.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
    console.log(`  snapshot       : ${snapshot}`);
    await run(pgDump, [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--snapshot=${snapshot}`,
      `--file=${dumpFile}`,
      `--dbname=${databaseUrl}`,
    ]);
    return tableRowCounts(tx);
  });

  const plaintext = await readFile(dumpFile);
  const sealed = encryptBackup(plaintext, key);
  const digest = sha256Hex(sealed);
  const storageKey = backupStorageKey(id);
  await storage.put(storageKey, sealed, { contentType: "application/octet-stream" });

  // Read the object's size back from storage rather than trusting the write.
  // A `put` that returned without storing the bytes is exactly the failure a
  // backup must not discover at restore time.
  const stored = await storage.head(storageKey);
  if (!stored || stored.size !== sealed.length) {
    throw new Error(`stored object is ${stored ? stored.size : "missing"} bytes, expected ${sealed.length}`);
  }

  await completeBackup(db, {
    id,
    storageKey,
    bytes: sealed.length,
    sha256: digest,
    encrypted: true,
    manifest,
  });

  const tables = Object.keys(manifest).length;
  console.log(`  key            : ${storageKey}`);
  console.log(`  bytes          : ${sealed.length} (${(sealed.length / 1e6).toFixed(2)} MB encrypted)`);
  console.log(`  sha256         : ${digest}`);
  console.log(`  manifest       : ${tables} tables, ${manifestRowTotal(manifest)} rows${note ? ` — ${note}` : ""}`);
  console.log("\nRehearse it: node scripts/restore-rehearsal.mjs --actor <name>");
} catch (err) {
  await failBackup(db, id, err);
  console.error(`\nbackup ${id} FAILED: ${String(err.message ?? err)}`);
  await rm(workDir, { recursive: true, force: true });
  await db.close();
  process.exit(1);
}

await rm(workDir, { recursive: true, force: true });
await db.close();
