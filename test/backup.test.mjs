// Backup and restore-rehearsal suite — PATHWAYS.md Pathway 1 item 10
// ("maintain encrypted backups, tested restores"); launch checklist "backup
// restore is rehearsed".
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/backup.test.mjs
//
// Four claims are under test:
//
//   1. A dump is sealed before it leaves the process, and anything short of the
//      right key over unaltered bytes fails to open — no partial restores.
//   2. The manifest comparison catches a lost table, not just a changed count.
//      K6 runs the obvious "walk the restored tables" version through the same
//      case to prove K2 has teeth.
//   3. A backup or rehearsal cannot record an outcome the database disagrees
//      with: no `done` without bytes, no `passed` over a list of mismatches, no
//      rehearsal without a name against it.
//   4. Never having backed up reads as stale, not as unknown.
//
// The dump and restore themselves are `pg_dump`/`pg_restore` and live in
// scripts/; what is testable without those binaries is here. FinishedSPEC §3k
// records the real rehearsal.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const {
  BACKUP_MAX_AGE_HOURS,
  REHEARSAL_MAX_AGE_DAYS,
  tableRowCounts,
  compareManifests,
  manifestRowTotal,
  parseBackupKey,
  newBackupKeyHex,
  encryptBackup,
  decryptBackup,
  sha256Hex,
  backupStorageKey,
  startBackup,
  completeBackup,
  failBackup,
  getBackup,
  latestBackup,
  lastSuccessfulBackup,
  recentBackups,
  startRehearsal,
  completeRehearsal,
  failRehearsal,
  latestRehearsal,
  lastPassedRehearsal,
  recoveryHealth,
} = await import(path.join(DIST, "backup.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}
async function threw(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

const T0 = new Date("2026-08-15T09:00:00.000Z");
const hoursAgo = (n) => new Date(T0.getTime() - n * 3_600_000);
const daysAgo = (n) => new Date(T0.getTime() - n * 86_400_000);

// This suite owns these two tables. Clearing them keeps `recoveryHealth`, which
// reads "the newest row", from depending on which suite ran before it.
await db.query("DELETE FROM restore_rehearsals");
await db.query("DELETE FROM backups");

// ---------------------------------------------------------------------------
// K1 — the dump is sealed, and only opens intact
// ---------------------------------------------------------------------------
{
  const key = parseBackupKey(newBackupKeyHex());
  const plaintext = Buffer.from("PGDMP\x00pretend this is 40MB of customer data", "utf-8");
  const sealed = encryptBackup(plaintext, key);

  check("K1.1", !sealed.subarray(4).includes(plaintext.subarray(0, 12)), "the plaintext is not in the sealed object");
  check("K1.2", Buffer.compare(decryptBackup(sealed, key), plaintext) === 0, "the right key returns the dump exactly");

  const wrongKey = parseBackupKey(newBackupKeyHex());
  check(
    "K1.3",
    (await threw(() => decryptBackup(sealed, wrongKey))) !== null,
    "a wrong key refuses rather than returning junk"
  );

  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 0x01; // one bit of the ciphertext
  check("K1.4", (await threw(() => decryptBackup(tampered, key))) !== null, "one flipped bit fails the GCM tag");

  const truncated = sealed.subarray(0, sealed.length - 8);
  check("K1.5", (await threw(() => decryptBackup(truncated, key))) !== null, "a truncated object fails");

  const foreign = Buffer.concat([Buffer.from("XXXX"), sealed.subarray(4)]);
  check("K1.6", (await threw(() => decryptBackup(foreign, key))) !== null, "an object we did not write is refused");

  check("K1.7", parseBackupKey(key.toString("base64")).equals(key), "base64 and hex forms of one key are the same key");
  check(
    "K1.8",
    (await threw(() => parseBackupKey("abcd"))) !== null && (await threw(() => parseBackupKey(""))) !== null,
    "a short key and a missing key are both rejected at configuration time"
  );
  check("K1.9", sha256Hex(sealed) === sha256Hex(Buffer.from(sealed)), "the digest is stable over the same bytes");
  check(
    "K1.10",
    backupStorageKey("bk_x", new Date("2026-08-15T00:00:00Z")) === "backups/2026-08-15/bk_x.dump.enc",
    "objects are date-partitioned under backups/"
  );
}

// ---------------------------------------------------------------------------
// K2 — the manifest, and what disagreement looks like
// ---------------------------------------------------------------------------
{
  const manifest = await tableRowCounts(db);
  const names = Object.keys(manifest);
  check("K2.1", names.includes("orgs") && names.includes("backups"), `${names.length} tables counted, schema included`);
  check(
    "K2.2",
    names.every((n, i) => i === 0 || names[i - 1] <= n),
    "table order is deterministic, so two manifests compare directly"
  );
  check("K2.3", compareManifests(manifest, manifest).length === 0, "a manifest agrees with itself");

  const short = { ...manifest, orgs: (manifest.orgs ?? 0) + 1 };
  const changed = compareManifests(short, manifest);
  check(
    "K2.4",
    changed.length === 1 && changed[0].table === "orgs" && changed[0].actual === (manifest.orgs ?? 0),
    "a row-count difference names the table and both numbers"
  );

  const lost = { ...manifest };
  delete lost.credit_grants;
  const dropped = compareManifests(manifest, lost);
  check(
    "K2.5",
    dropped.length === 1 && dropped[0].table === "credit_grants" && dropped[0].actual === null,
    "a table that did not come back is a mismatch, not a skip"
  );

  const extra = compareManifests(lost, manifest);
  check(
    "K2.6",
    extra.length === 1 && extra[0].expected === null,
    "a table the manifest never knew about is also a mismatch"
  );
  check("K2.7", manifestRowTotal({ a: 2, b: 3 }) === 5, "the row total is what a rehearsal reports it checked");
}

// ---------------------------------------------------------------------------
// K3 — a backup cannot claim an outcome the database disagrees with
// ---------------------------------------------------------------------------
{
  const id = `bk_${randomUUID().slice(0, 8)}`;
  check("K3.1", (await threw(() => startBackup(db, { id, actor: "  " }))) !== null, "a backup must name what ran it");

  await startBackup(db, { id, actor: "test", now: hoursAgo(1) });
  const running = await getBackup(db, id);
  check("K3.2", running.state === "running" && running.finishedAt === null, "the row exists before the dump does");

  const bare = await threw(() =>
    db.query("UPDATE backups SET state = 'done', finished_at = $2 WHERE id = $1", [id, T0.toISOString()])
  );
  check("K3.3", bare !== null, "a backup cannot be marked done without bytes and a key — the database refuses");

  await completeBackup(db, {
    id,
    storageKey: backupStorageKey(id, T0),
    bytes: 4096,
    sha256: "a".repeat(64),
    encrypted: true,
    manifest: { orgs: 3, runs: 9 },
    now: hoursAgo(1),
  });
  const done = await getBackup(db, id);
  check("K3.4", done.state === "done" && done.bytes === 4096 && done.encrypted, "a finished backup records where it went");
  check(
    "K3.5",
    done.manifest?.orgs === 3 && done.manifest?.runs === 9,
    "the manifest survives the round trip through the database"
  );

  const failed = `bk_${randomUUID().slice(0, 8)}`;
  await startBackup(db, { id: failed, actor: "test", now: hoursAgo(1) });
  await failBackup(db, failed, new Error("pg_dump exited 1"), hoursAgo(1));
  const failedRow = await getBackup(db, failed);
  check("K3.6", failedRow.state === "failed" && failedRow.lastError.includes("pg_dump"), "a failed dump keeps its error");
  check(
    "K3.7",
    (await lastSuccessfulBackup(db)).id === id,
    "the failed attempt is not what a restore would reach for"
  );
  check("K3.8", (await recentBackups(db, 5)).length === 2, "both attempts are visible to an operator");
}

// ---------------------------------------------------------------------------
// K4 — a rehearsal cannot record a pass over a disagreement
// ---------------------------------------------------------------------------
{
  const backupId = (await lastSuccessfulBackup(db)).id;
  const id = `rh_${randomUUID().slice(0, 8)}`;

  check(
    "K4.1",
    (await threw(() => startRehearsal(db, { id, backupId, actor: "" }))) !== null,
    "a rehearsal nobody's name is on is not evidence"
  );

  await startRehearsal(db, { id, backupId, actor: "test", now: hoursAgo(2) });
  const state = await completeRehearsal(db, {
    id,
    mismatches: [{ table: "runs", expected: 9, actual: 4 }],
    tablesChecked: 2,
    rowsChecked: 7,
    restoreSeconds: 3.5,
    now: hoursAgo(2),
  });
  check("K4.2", state === "failed", "a mismatch fails the rehearsal — the caller does not get to decide");
  const failedRow = await latestRehearsal(db);
  check(
    "K4.3",
    failedRow.mismatches.length === 1 && failedRow.mismatches[0].table === "runs",
    "the disagreement is stored, so a failure is diagnosable later"
  );
  check("K4.4", (await lastPassedRehearsal(db)) === null, "a failed rehearsal is not evidence of a working backup");

  const lying = await threw(() =>
    db.query(
      `UPDATE restore_rehearsals SET state = 'passed', mismatches = '[{"table":"runs"}]'::jsonb, finished_at = $2 WHERE id = $1`,
      [id, T0.toISOString()]
    )
  );
  check("K4.5", lying !== null, "no script can record a green rehearsal over a list of mismatches");

  const good = `rh_${randomUUID().slice(0, 8)}`;
  await startRehearsal(db, { id: good, backupId, actor: "test", now: hoursAgo(2) });
  const passed = await completeRehearsal(db, {
    id: good,
    mismatches: [],
    tablesChecked: 24,
    rowsChecked: 812,
    restoreSeconds: 11.25,
    now: hoursAgo(2),
  });
  check("K4.6", passed === "passed", "an empty mismatch list is the only thing that passes");
  check(
    "K4.7",
    (await lastPassedRehearsal(db)).rowsChecked === 812,
    "the passed rehearsal reports how much it actually compared"
  );

  const broken = `rh_${randomUUID().slice(0, 8)}`;
  await startRehearsal(db, { id: broken, backupId, actor: "test", now: hoursAgo(1) });
  await failRehearsal(db, broken, new Error("pg_restore exited 1"), hoursAgo(1));
  check(
    "K4.8",
    (await latestRehearsal(db)).lastError.includes("pg_restore"),
    "a rehearsal that could not run at all is recorded as failed, not skipped"
  );
}

// ---------------------------------------------------------------------------
// K5 — staleness, and the empty deployment
// ---------------------------------------------------------------------------
{
  await db.query("DELETE FROM restore_rehearsals");
  await db.query("DELETE FROM backups");

  const empty = await recoveryHealth(db, T0);
  check(
    "K5.1",
    empty.backupStale && empty.backupAgeHours === null,
    "never having backed up is stale, not unknown — the alert fires on day one"
  );
  check("K5.2", empty.rehearsalStale && empty.rehearsalAgeDays === null, "never having restored is stale too");

  const fresh = `bk_${randomUUID().slice(0, 8)}`;
  await startBackup(db, { id: fresh, actor: "test", now: hoursAgo(3) });
  await completeBackup(db, {
    id: fresh,
    storageKey: backupStorageKey(fresh, T0),
    bytes: 1024,
    sha256: "b".repeat(64),
    encrypted: true,
    manifest: { orgs: 1 },
    now: hoursAgo(3),
  });
  const rehearsalId = `rh_${randomUUID().slice(0, 8)}`;
  await startRehearsal(db, { id: rehearsalId, backupId: fresh, actor: "test", now: hoursAgo(3) });
  await completeRehearsal(db, {
    id: rehearsalId,
    mismatches: [],
    tablesChecked: 1,
    rowsChecked: 1,
    now: hoursAgo(3),
  });

  const healthy = await recoveryHealth(db, T0);
  check("K5.3", !healthy.backupStale && Math.round(healthy.backupAgeHours) === 3, "a three-hour-old backup is fresh");
  check("K5.4", !healthy.rehearsalStale, "a rehearsal from this morning is fresh");

  // The backup finished three hours before T0, so the age at each of these is
  // the offset plus three.
  const later = new Date(T0.getTime() + (BACKUP_MAX_AGE_HOURS - 4) * 3_600_000);
  check("K5.5", !(await recoveryHealth(db, later)).backupStale, `at ${BACKUP_MAX_AGE_HOURS - 1}h the backup is still fine`);
  const tooLate = new Date(T0.getTime() + (BACKUP_MAX_AGE_HOURS - 2) * 3_600_000);
  check("K5.6", (await recoveryHealth(db, tooLate)).backupStale, `past ${BACKUP_MAX_AGE_HOURS}h it is stale`);

  // A month on, with the nightly dump still running and nobody restoring one:
  // the two clocks are independent, and this is the state the item exists for.
  const monthLater = new Date(T0.getTime() + (REHEARSAL_MAX_AGE_DAYS + 1) * 86_400_000);
  const nightly = `bk_${randomUUID().slice(0, 8)}`;
  const lastNight = new Date(monthLater.getTime() - 2 * 3_600_000);
  await startBackup(db, { id: nightly, actor: "test", now: lastNight });
  await completeBackup(db, {
    id: nightly,
    storageKey: backupStorageKey(nightly, lastNight),
    bytes: 2048,
    sha256: "c".repeat(64),
    encrypted: true,
    manifest: { orgs: 1 },
    now: lastNight,
  });
  const drifted = await recoveryHealth(db, monthLater);
  check(
    "K5.7",
    drifted.rehearsalStale && !drifted.backupStale,
    `backups kept running and the ${REHEARSAL_MAX_AGE_DAYS}-day rehearsal clock still ran out`
  );

  // A backup taken but never rehearsed is the case this whole item exists for.
  await db.query("DELETE FROM backups WHERE id = $1", [nightly]);
  await db.query("DELETE FROM restore_rehearsals");
  const unrehearsed = await recoveryHealth(db, T0);
  check(
    "K5.8",
    !unrehearsed.backupStale && unrehearsed.rehearsalStale,
    "backups running and never restored still reads as unproven"
  );
  check("K5.9", (await recoveryHealth(db, daysAgo(0))).lastGoodBackup.id === fresh, "health names the backup it read");
}

// ---------------------------------------------------------------------------
// K6 — the comparison has teeth
// ---------------------------------------------------------------------------
//
// The obvious implementation walks the restored database and checks each table
// it finds against the manifest. It cannot see a table that failed to restore
// at all — the exact failure a rehearsal exists to catch — and it reports a
// clean pass on a database missing a table of customer data.
{
  const manifest = { orgs: 4, runs: 90, credit_grants: 12 };
  const restoredMissingATable = { orgs: 4, runs: 90 };

  const naive = Object.entries(restoredMissingATable).filter(([table, count]) => manifest[table] !== count);
  const real = compareManifests(manifest, restoredMissingATable);

  check("K6.1", naive.length === 0, "the walk-the-restored-tables version calls a lost table a pass — the control");
  check(
    "K6.2",
    real.length === 1 && real[0].table === "credit_grants" && real[0].actual === null,
    "compareManifests catches it, so K2.5 is a guard rather than a green line"
  );
}

await db.query("DELETE FROM restore_rehearsals");
await db.query("DELETE FROM backups");
await db.close();

console.log(`\n${failures === 0 ? "all backup checks green" : `${failures} FAILING CHECK(S)`}`);
process.exit(failures === 0 ? 0 : 1);
