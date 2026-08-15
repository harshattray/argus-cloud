import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Backups and restore rehearsal (PATHWAYS.md Pathway 1 item 10; §3 "Operations
 * and recovery": "maintain encrypted backups, tested restores"; launch
 * checklist: "backup restore is rehearsed").
 *
 * **What this module is for.** Items 1–9 bound what the product can spend and
 * what it can delete. All of them assume the database still exists. This is the
 * other half: a dump that is encrypted before it leaves the process, and a
 * rehearsal that restores one and checks the data came back.
 *
 * **A backup nobody has restored is a belief.** The rehearsal is therefore not
 * an optional extra around the backup — it is the only thing that turns the
 * backup into evidence, and it gets its own table, its own alert, and its own
 * staleness clock. The manifest is what makes it possible: row counts per table
 * taken at dump time, compared against the restored database, so a rehearsal
 * proves the *data* returned rather than proving `pg_restore` exited 0.
 *
 * **Encryption happens here, not at the storage layer.** The dump holds every
 * customer's data, and the storage port is deliberately dumb about content. A
 * bucket misconfiguration should expose ciphertext, so the bytes are sealed
 * before `put()` is ever called, with the tag checked on the way back — a
 * truncated or altered object fails to open rather than restoring quietly.
 *
 * The moving parts live in `scripts/backup.mjs` and
 * `scripts/restore-rehearsal.mjs`, which run `pg_dump`/`pg_restore`. Everything
 * that can be tested without those binaries lives here.
 */

// ---------------------------------------------------------------------------
// Staleness policy
// ---------------------------------------------------------------------------

/**
 * How old the newest successful backup may be before an operator is told.
 *
 * 26 rather than 24 for a daily schedule: a job that runs at 03:00 and takes
 * twenty minutes must not page anyone simply because the check ran at 03:05.
 */
export const BACKUP_MAX_AGE_HOURS = 26;

/**
 * How old the newest *passed* rehearsal may be. Monthly, because a rehearsal
 * restores a full database and is a heavier thing to run than a dump — and
 * because the failure it catches (a backup that cannot be restored) is a slow
 * one, not something that appears overnight.
 */
export const REHEARSAL_MAX_AGE_DAYS = 30;

// ---------------------------------------------------------------------------
// The manifest — what the database held when the dump was taken
// ---------------------------------------------------------------------------

/** Row count per table, keyed by table name. The dump's contents, summarised. */
export type BackupManifest = Record<string, number>;

export interface ManifestMismatch {
  table: string;
  /** Row count the manifest recorded at dump time. Null when the table is absent from it. */
  expected: number | null;
  /** Row count found in the restored database. Null when the table did not come back. */
  actual: number | null;
}

/**
 * Row counts for every table in the public schema, table name order.
 *
 * `COUNT(*)` per table rather than `reltuples`: the planner's estimate is close
 * enough for planning and useless for proving a restore, which is exactly the
 * case where "close enough" hides the missing rows.
 *
 * Table names come from `information_schema`, so they cannot be caller-supplied
 * — they are still quoted, because a table named in mixed case or with a
 * reserved word would otherwise produce SQL that fails at the worst moment.
 */
export async function tableRowCounts(db: Db): Promise<BackupManifest> {
  const tables = (
    await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
  ).rows.map((r) => r.table_name);

  const manifest: BackupManifest = {};
  for (const table of tables) {
    const quoted = `"${table.replace(/"/g, '""')}"`;
    const result = await db.query<{ total: string | number }>(`SELECT COUNT(*) AS total FROM ${quoted}`);
    manifest[table] = Number(result.rows[0]?.total ?? 0);
  }
  return manifest;
}

/**
 * Every table where the restored database disagrees with the manifest.
 *
 * An empty array is the only thing that counts as a pass, and the database
 * enforces that (`restore_rehearsals`' CHECK) so no script can record a green
 * rehearsal over a list of disagreements.
 *
 * A table present in one side and missing from the other is a mismatch, not a
 * skip. A restore that silently dropped a table would otherwise compare only
 * the tables that survived and report everything fine.
 */
export function compareManifests(expected: BackupManifest, actual: BackupManifest): ManifestMismatch[] {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const mismatches: ManifestMismatch[] = [];
  for (const table of names) {
    const before = Object.prototype.hasOwnProperty.call(expected, table) ? expected[table] : null;
    const after = Object.prototype.hasOwnProperty.call(actual, table) ? actual[table] : null;
    if (before !== after) {
      mismatches.push({ table, expected: before, actual: after });
    }
  }
  return mismatches;
}

/** Total rows the manifest accounts for — what a rehearsal reports it checked. */
export function manifestRowTotal(manifest: BackupManifest): number {
  return Object.values(manifest).reduce((sum, n) => sum + n, 0);
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/**
 * Magic bytes, doubling as AES-GCM associated data so the version cannot be
 * rewritten without breaking the tag. Bump the digit if the layout ever changes;
 * `decryptBackup` refuses anything it does not recognise rather than guessing.
 */
const MAGIC = Buffer.from("NSB1", "ascii");
const IV_BYTES = 12; // GCM's native nonce size
const TAG_BYTES = 16;
export const BACKUP_KEY_BYTES = 32; // AES-256

export class BackupCryptoError extends Error {}

/**
 * Reads the 32-byte key from its stored form — 64 hex characters or base64.
 *
 * Both are accepted because operators paste whichever their secret store hands
 * back, and a key that is *nearly* right is the failure that shows up months
 * later at restore time. Anything that does not decode to exactly 32 bytes is
 * rejected here, loudly, at the point it can still be fixed.
 */
export function parseBackupKey(raw: string | undefined | null): Buffer {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    throw new BackupCryptoError(
      "no backup encryption key. Set NORMA_BACKUP_KEY to 32 bytes (64 hex characters) — " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` generates one."
    );
  }
  const candidates: Buffer[] = [];
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    candidates.push(Buffer.from(value, "hex"));
  }
  candidates.push(Buffer.from(value, "base64"));
  const key = candidates.find((buf) => buf.length === BACKUP_KEY_BYTES);
  if (!key) {
    throw new BackupCryptoError(
      `backup encryption key must decode to ${BACKUP_KEY_BYTES} bytes (64 hex characters or base64); got ${value.length} characters`
    );
  }
  return key;
}

/** A fresh key, in the form the environment variable wants. */
export function newBackupKeyHex(): string {
  return randomBytes(BACKUP_KEY_BYTES).toString("hex");
}

/** `MAGIC | iv | tag | ciphertext`. Self-describing, so a restore needs only the key. */
export function encryptBackup(plaintext: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/**
 * Opens a sealed dump, or throws.
 *
 * Every failure here is the same answer — these bytes are not a dump we wrote,
 * with this key, unaltered — and it must be an exception rather than a partial
 * result. A restore that proceeds on damaged input is worse than one that
 * refuses, because it produces a database that looks restored.
 */
export function decryptBackup(payload: Uint8Array, key: Buffer): Buffer {
  const buf = Buffer.from(payload);
  const header = MAGIC.length + IV_BYTES + TAG_BYTES;
  if (buf.length < header || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupCryptoError("not a Normascope backup object (bad magic or truncated header)");
  }
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = buf.subarray(MAGIC.length + IV_BYTES, header);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buf.subarray(header)), decipher.final()]);
  } catch {
    // Deliberately not forwarding the OpenSSL text: "unsupported state or
    // unable to authenticate data" tells an operator nothing they can act on.
    throw new BackupCryptoError("backup failed to decrypt — wrong key, or the object was altered or truncated");
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Where a dump is stored. Date-partitioned so a bucket listing reads chronologically. */
export function backupStorageKey(id: string, now: Date = new Date()): string {
  return `backups/${now.toISOString().slice(0, 10)}/${id}.dump.enc`;
}

// ---------------------------------------------------------------------------
// Bookkeeping — backups
// ---------------------------------------------------------------------------

export interface BackupRow {
  id: string;
  kind: string;
  storageKey: string;
  bytes: number;
  sha256: string;
  encrypted: boolean;
  state: "running" | "done" | "failed";
  manifest: BackupManifest | null;
  actor: string;
  lastError: string;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Opens the record before the dump runs.
 *
 * Written first on purpose: a process that dies mid-dump leaves a `running` row
 * that ages into an alert, where writing the row at the end would leave nothing
 * at all. "Last night's backup crashed" and "nothing ran last night" are
 * different incidents and both need to be visible.
 */
export async function startBackup(
  db: Db,
  backup: { id: string; actor: string; now?: Date; kind?: string }
): Promise<void> {
  const actor = backup.actor?.trim() ?? "";
  if (actor.length === 0) {
    throw new Error("a backup must record who or what started it");
  }
  await db.query("INSERT INTO backups (id, kind, actor, state, started_at) VALUES ($1, $2, $3, 'running', $4)", [
    backup.id,
    backup.kind ?? "pg_dump",
    actor,
    (backup.now ?? new Date()).toISOString(),
  ]);
}

export async function completeBackup(
  db: Db,
  backup: {
    id: string;
    storageKey: string;
    bytes: number;
    sha256: string;
    encrypted: boolean;
    manifest: BackupManifest;
    now?: Date;
  }
): Promise<void> {
  await db.query(
    `UPDATE backups
     SET state = 'done', storage_key = $2, bytes = $3, sha256 = $4, encrypted = $5,
         manifest = $6, last_error = '', finished_at = $7
     WHERE id = $1`,
    [
      backup.id,
      backup.storageKey,
      Math.round(backup.bytes),
      backup.sha256,
      backup.encrypted,
      JSON.stringify(backup.manifest),
      (backup.now ?? new Date()).toISOString(),
    ]
  );
}

export async function failBackup(db: Db, id: string, error: unknown, now: Date = new Date()): Promise<void> {
  await db.query("UPDATE backups SET state = 'failed', last_error = $2, finished_at = $3 WHERE id = $1", [
    id,
    String((error as Error)?.message ?? error).slice(0, 1000),
    now.toISOString(),
  ]);
}

function toBackupRow(r: Record<string, unknown>): BackupRow {
  return {
    id: String(r.id),
    kind: String(r.kind),
    storageKey: String(r.storage_key ?? ""),
    bytes: Number(r.bytes ?? 0),
    sha256: String(r.sha256 ?? ""),
    encrypted: Boolean(r.encrypted),
    state: String(r.state) as BackupRow["state"],
    manifest: parseManifest(r.manifest),
    actor: String(r.actor ?? ""),
    lastError: String(r.last_error ?? ""),
    startedAt: new Date(r.started_at as string).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
  };
}

/**
 * JSONB comes back parsed from one driver and as text from another. Both are
 * in use here — PGlite in the suites, node-postgres in production — so the
 * column is read through this rather than trusting either.
 */
function parseManifest(value: unknown): BackupManifest | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as BackupManifest;
    } catch {
      return null;
    }
  }
  return value as BackupManifest;
}

const BACKUP_COLUMNS =
  "id, kind, storage_key, bytes, sha256, encrypted, state, manifest, actor, last_error, started_at, finished_at";

export async function getBackup(db: Db, id: string): Promise<BackupRow | null> {
  const rows = await db.query<Record<string, unknown>>(`SELECT ${BACKUP_COLUMNS} FROM backups WHERE id = $1`, [id]);
  return rows.rows[0] ? toBackupRow(rows.rows[0]) : null;
}

/** The newest attempt of any outcome — what "did the last backup fail?" reads. */
export async function latestBackup(db: Db): Promise<BackupRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${BACKUP_COLUMNS} FROM backups ORDER BY started_at DESC, id DESC LIMIT 1`
  );
  return rows.rows[0] ? toBackupRow(rows.rows[0]) : null;
}

/** The newest backup that actually finished — what a restore would use. */
export async function lastSuccessfulBackup(db: Db): Promise<BackupRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${BACKUP_COLUMNS} FROM backups WHERE state = 'done' ORDER BY finished_at DESC, id DESC LIMIT 1`
  );
  return rows.rows[0] ? toBackupRow(rows.rows[0]) : null;
}

export async function recentBackups(db: Db, limit = 10): Promise<BackupRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${BACKUP_COLUMNS} FROM backups ORDER BY started_at DESC, id DESC LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return rows.rows.map(toBackupRow);
}

// ---------------------------------------------------------------------------
// Bookkeeping — rehearsals
// ---------------------------------------------------------------------------

export interface RehearsalRow {
  id: string;
  backupId: string;
  state: "running" | "passed" | "failed";
  tablesChecked: number;
  rowsChecked: number;
  mismatches: ManifestMismatch[] | null;
  restoreSeconds: number | null;
  actor: string;
  note: string;
  lastError: string;
  startedAt: string;
  finishedAt: string | null;
}

export async function startRehearsal(
  db: Db,
  rehearsal: { id: string; backupId: string; actor: string; note?: string; now?: Date }
): Promise<void> {
  const actor = rehearsal.actor?.trim() ?? "";
  if (actor.length === 0) {
    // Same rule as the breaker reset: a rehearsal is a claim that someone
    // checked, and an unattributed claim is not evidence.
    throw new Error("a restore rehearsal must name who or what ran it");
  }
  await db.query(
    "INSERT INTO restore_rehearsals (id, backup_id, actor, note, state, started_at) VALUES ($1, $2, $3, $4, 'running', $5)",
    [rehearsal.id, rehearsal.backupId, actor, rehearsal.note ?? "", (rehearsal.now ?? new Date()).toISOString()]
  );
}

/**
 * Records the verdict. `mismatches` decides it — an empty list passes, anything
 * else fails — so the caller cannot report a pass and a disagreement at once.
 */
export async function completeRehearsal(
  db: Db,
  rehearsal: {
    id: string;
    mismatches: ManifestMismatch[];
    tablesChecked: number;
    rowsChecked: number;
    restoreSeconds?: number;
    now?: Date;
  }
): Promise<"passed" | "failed"> {
  const state = rehearsal.mismatches.length === 0 ? "passed" : "failed";
  await db.query(
    `UPDATE restore_rehearsals
     SET state = $2, mismatches = $3, tables_checked = $4, rows_checked = $5,
         restore_seconds = $6, finished_at = $7
     WHERE id = $1`,
    [
      rehearsal.id,
      state,
      JSON.stringify(rehearsal.mismatches),
      rehearsal.tablesChecked,
      rehearsal.rowsChecked,
      rehearsal.restoreSeconds ?? null,
      (rehearsal.now ?? new Date()).toISOString(),
    ]
  );
  return state;
}

export async function failRehearsal(db: Db, id: string, error: unknown, now: Date = new Date()): Promise<void> {
  await db.query(
    "UPDATE restore_rehearsals SET state = 'failed', last_error = $2, finished_at = $3 WHERE id = $1",
    [id, String((error as Error)?.message ?? error).slice(0, 1000), now.toISOString()]
  );
}

function toRehearsalRow(r: Record<string, unknown>): RehearsalRow {
  const mismatches = parseManifest(r.mismatches) as unknown as ManifestMismatch[] | null;
  return {
    id: String(r.id),
    backupId: String(r.backup_id),
    state: String(r.state) as RehearsalRow["state"],
    tablesChecked: Number(r.tables_checked ?? 0),
    rowsChecked: Number(r.rows_checked ?? 0),
    mismatches: Array.isArray(mismatches) ? mismatches : null,
    restoreSeconds: r.restore_seconds == null ? null : Number(r.restore_seconds),
    actor: String(r.actor ?? ""),
    note: String(r.note ?? ""),
    lastError: String(r.last_error ?? ""),
    startedAt: new Date(r.started_at as string).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
  };
}

const REHEARSAL_COLUMNS =
  "id, backup_id, state, tables_checked, rows_checked, mismatches, restore_seconds, actor, note, last_error, started_at, finished_at";

export async function latestRehearsal(db: Db): Promise<RehearsalRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${REHEARSAL_COLUMNS} FROM restore_rehearsals ORDER BY started_at DESC, id DESC LIMIT 1`
  );
  return rows.rows[0] ? toRehearsalRow(rows.rows[0]) : null;
}

export async function lastPassedRehearsal(db: Db): Promise<RehearsalRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${REHEARSAL_COLUMNS} FROM restore_rehearsals WHERE state = 'passed' ORDER BY finished_at DESC, id DESC LIMIT 1`
  );
  return rows.rows[0] ? toRehearsalRow(rows.rows[0]) : null;
}

export async function recentRehearsals(db: Db, limit = 10): Promise<RehearsalRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${REHEARSAL_COLUMNS} FROM restore_rehearsals ORDER BY started_at DESC, id DESC LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return rows.rows.map(toRehearsalRow);
}

// ---------------------------------------------------------------------------
// Health — what the ops check and the operator page both read
// ---------------------------------------------------------------------------

export interface RecoveryHealth {
  lastBackup: BackupRow | null;
  lastGoodBackup: BackupRow | null;
  lastRehearsal: RehearsalRow | null;
  lastPassedRehearsal: RehearsalRow | null;
  /** Hours since the newest successful backup finished. Null when there has never been one. */
  backupAgeHours: number | null;
  /** Days since the newest passed rehearsal finished. Null when there has never been one. */
  rehearsalAgeDays: number | null;
  backupStale: boolean;
  rehearsalStale: boolean;
}

/**
 * **Never having backed up is stale, not unknown.** A null age with
 * `backupStale: true` is the correct reading of an empty table: the alert must
 * fire on the first day of a deployment that has no backup, which is exactly
 * the deployment most likely to lose data.
 */
export async function recoveryHealth(db: Db, now: Date = new Date()): Promise<RecoveryHealth> {
  const [lastBackup, lastGoodBackup, lastRehearsal_, lastPassed] = await Promise.all([
    latestBackup(db),
    lastSuccessfulBackup(db),
    latestRehearsal(db),
    lastPassedRehearsal(db),
  ]);

  const backupAgeHours =
    lastGoodBackup?.finishedAt != null
      ? (now.getTime() - new Date(lastGoodBackup.finishedAt).getTime()) / 3_600_000
      : null;
  const rehearsalAgeDays =
    lastPassed?.finishedAt != null
      ? (now.getTime() - new Date(lastPassed.finishedAt).getTime()) / 86_400_000
      : null;

  return {
    lastBackup,
    lastGoodBackup,
    lastRehearsal: lastRehearsal_,
    lastPassedRehearsal: lastPassed,
    backupAgeHours,
    rehearsalAgeDays,
    backupStale: backupAgeHours === null || backupAgeHours > BACKUP_MAX_AGE_HOURS,
    rehearsalStale: rehearsalAgeDays === null || rehearsalAgeDays > REHEARSAL_MAX_AGE_DAYS,
  };
}
