#!/usr/bin/env node
//
// Rehearse a restore — PATHWAYS launch checklist, "backup restore is rehearsed".
//
//   DATABASE_URL=… NORMA_BACKUP_KEY=… node scripts/restore-rehearsal.mjs --actor harsha
//   node scripts/restore-rehearsal.mjs --actor monthly-drill --backup bk_20260815T0900_ab12cd34
//   node scripts/restore-rehearsal.mjs --actor harsha --target-url postgres://…/scratch --keep
//
// What it proves, in order, refusing to continue at the first thing that fails:
//
//   1. the stored object still hashes to what the backup recorded;
//   2. it decrypts with the current key;
//   3. `pg_restore` loads it into an empty database with --exit-on-error;
//   4. **every table's row count matches the manifest taken inside the dump's
//      own snapshot.**
//
// Step 4 is the one that matters. The first three prove the file survived;
// only the manifest comparison proves the *data* came back, and the verdict is
// stored as the list of tables that disagreed rather than a boolean, so a
// failure is diagnosable later.
//
// The scratch database is created next to the source and dropped afterwards
// unless --keep. Pass --target-url to restore into a database you prepared
// (a Neon branch, say) — that one is never created or dropped.
//
// Exit codes: 0 rehearsal passed, 1 rehearsal failed, 2 could not run.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb } = await import(path.join(DIST, "db.js"));
const { createStorage } = await import(path.join(DIST, "storage.js"));
const {
  getBackup,
  lastSuccessfulBackup,
  startRehearsal,
  completeRehearsal,
  failRehearsal,
  tableRowCounts,
  compareManifests,
  manifestRowTotal,
  parseBackupKey,
  decryptBackup,
  sha256Hex,
} = await import(path.join(DIST, "backup.js"));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const actor = value("--actor") ?? "";
const backupId = value("--backup") ?? null;
const targetUrl = value("--target-url") ?? null;
const keep = flag("--keep");
const databaseUrl = process.env.DATABASE_URL?.trim();
const pgBin = process.env.PG_BIN?.trim();
const pgRestore = pgBin ? path.join(pgBin, "pg_restore") : "pg_restore";

if (actor.trim().length === 0) {
  console.error("--actor is required: a rehearsal nobody's name is on is not evidence.");
  process.exit(2);
}
if (!databaseUrl) {
  console.error("DATABASE_URL is required — it is where the backup record lives.");
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

/** A scratch database name beside the source, and the URL that reaches it. */
function scratchUrlFrom(sourceUrl, name) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
function maintenanceUrlFrom(sourceUrl) {
  const url = new URL(sourceUrl);
  url.pathname = "/postgres";
  return url.toString();
}

const { default: pg } = await import("pg");

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: value("--maintenance-url") ?? maintenanceUrlFrom(databaseUrl) });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const db = await createDb();
const storage = await createStorage();

const backup = backupId ? await getBackup(db, backupId) : await lastSuccessfulBackup(db);
if (!backup) {
  console.error(
    backupId ? `no backup with id ${backupId}` : "no successful backup to rehearse — run scripts/backup.mjs first."
  );
  await db.close();
  process.exit(2);
}
if (backup.state !== "done") {
  console.error(`backup ${backup.id} is ${backup.state}, not a completed backup.`);
  await db.close();
  process.exit(2);
}

const rehearsalId = `rh_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${randomUUID().slice(0, 8)}`;
const scratchName = `normascope_rehearse_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const scratchUrl = targetUrl ?? scratchUrlFrom(databaseUrl, scratchName);
const workDir = await mkdtemp(path.join(tmpdir(), "normascope-restore-"));
const dumpFile = path.join(workDir, `${backup.id}.dump`);
let created = false;

console.log(`rehearsal ${rehearsalId}`);
console.log(`  backup   : ${backup.id} (${backup.bytes} bytes, ${backup.storageKey})`);
console.log(`  target   : ${targetUrl ? "supplied by --target-url" : scratchName}`);

const started = Date.now();
try {
  await startRehearsal(db, { id: rehearsalId, backupId: backup.id, actor, note: value("--note") ?? "" });

  const sealed = await storage.get(backup.storageKey);
  if (!sealed) {
    throw new Error(`the stored object is gone: ${backup.storageKey}`);
  }
  const digest = sha256Hex(sealed);
  if (backup.sha256 && digest !== backup.sha256) {
    throw new Error(`stored object hashes to ${digest}, backup recorded ${backup.sha256}`);
  }
  const plaintext = decryptBackup(sealed, key);
  await writeFile(dumpFile, plaintext);
  console.log(`  decrypted: ${plaintext.length} bytes`);

  if (!targetUrl) {
    await adminQuery(`CREATE DATABASE "${scratchName}"`);
    created = true;
  }

  await run(pgRestore, ["--no-owner", "--no-privileges", "--exit-on-error", `--dbname=${scratchUrl}`, dumpFile]);

  const client = new pg.Client({ connectionString: scratchUrl });
  await client.connect();
  let restored;
  try {
    // tableRowCounts only needs `query`, so a bare client is enough — no pool,
    // no migration, nothing that could write to the database being inspected.
    restored = await tableRowCounts({ query: (text, params) => client.query(text, params) });
  } finally {
    await client.end();
  }

  const expected = backup.manifest ?? {};
  const mismatches = compareManifests(expected, restored);
  const state = await completeRehearsal(db, {
    id: rehearsalId,
    mismatches,
    tablesChecked: Object.keys(expected).length,
    rowsChecked: manifestRowTotal(restored),
    restoreSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
  });

  console.log(
    `  compared : ${Object.keys(expected).length} tables, ${manifestRowTotal(restored)} rows, ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  if (state === "passed") {
    console.log(`\nrehearsal PASSED — backup ${backup.id} restores completely.`);
  } else {
    console.log(`\nrehearsal FAILED — ${mismatches.length} table(s) disagreed with the manifest:`);
    for (const m of mismatches.slice(0, 20)) {
      console.log(`  ${m.table}: manifest ${m.expected ?? "absent"}, restored ${m.actual ?? "absent"}`);
    }
  }

  if (created && !keep) {
    await adminQuery(`DROP DATABASE "${scratchName}"`);
  } else if (created) {
    console.log(`\nkept: ${scratchUrl}`);
  }
  await rm(workDir, { recursive: true, force: true });
  await db.close();
  process.exit(state === "passed" ? 0 : 1);
} catch (err) {
  await failRehearsal(db, rehearsalId, err);
  console.error(`\nrehearsal ${rehearsalId} could not complete: ${String(err.message ?? err)}`);
  if (created && !keep) {
    await adminQuery(`DROP DATABASE "${scratchName}"`).catch(() => {});
  }
  await rm(workDir, { recursive: true, force: true });
  await db.close();
  process.exit(1);
}
