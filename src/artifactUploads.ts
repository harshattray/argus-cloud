/**
 * The three-phase artifact upload — PATHWAYS.md Pathway 2 items 4-6;
 * `BuildV5.md` Phase G2/G2b/G2c.
 *
 *     declare  → this module: entitlement, quota, reservation, presigned PUTs
 *     transfer → the client, straight to R2. We are not in the byte path.
 *     commit   → this module: verify what arrived, then make the run visible
 *
 * **The shape exists because of the middle line.** Vercel's request body cap is
 * below a single full-page screenshot pair, so the application never proxies
 * image bytes. The consequence is that once a presigned URL is issued we cannot
 * watch the transfer, cannot cut it off, and cannot ask R2 to stop. Every limit
 * is therefore either signed into the URL (`contentLength`) or reconciled
 * afterwards against a declaration the client made in advance.
 *
 * **Bytes are reserved, settled and released here and nowhere else.**
 * `reserveBytes`, `settleBytes` and `releaseBytes` are the only code that writes
 * `org_storage`. This is the same rule `economicPath.ts` enforces for provider
 * dollars and it exists for the same reason: those two files used to hand-roll
 * the sequence separately and had already drifted. A fourth caller copying the
 * sequence is how a quota silently stops meaning anything — don't.
 *
 * **Entitlement is not quota.** `can_upload` is asked before any number is
 * looked at, and asked again on every request rather than trusted from key
 * creation. Plans lapse; a key that was valid when it was minted proves nothing
 * about now. G2c: key existence is never authorization.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { Storage } from "./storage.js";
import { blobKey } from "./storage.js";

export type ArtifactKind = "build" | "reference" | "diff" | "summary" | "thumbnail" | "report" | "regions";

const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "build",
  "reference",
  "diff",
  "summary",
  "thumbnail",
  "report",
  "regions",
];

/** How long a presigned PUT lives. Long enough for a slow CI runner, short enough that a leaked URL is stale fast. */
export const PUT_TTL_SECONDS = 120;

/** A declared upload that never transferred is swept after this long. */
export const ABANDONED_AFTER_MINUTES = 15;

export interface DeclaredArtifact {
  frame: string;
  kind: ArtifactKind;
  /** Lowercase hex, 64 characters. Also the object's address, so it cannot be cosmetic. */
  sha256: string;
  bytes: number;
  contentType?: string;
}

export interface PlanLimits {
  plan: string;
  canUpload: boolean;
  runsPerDay: number;
  artifactsPerRun: number;
  bytesPerRun: number;
  bytesStoredMax: number;
  retentionDays: number;
}

/**
 * Why an upload was refused, in a form the CLI can print and exit 0 on.
 *
 * The standing rule for lapse, downgrade and quota (BuildV3.5 item 6) is that
 * CI stays green: an upload that cannot happen is a message naming the plan
 * state and the fix, never a bare 403 and never a red build. `reason` is what
 * the caller branches on; `message` is what a human reads.
 */
export class UploadRefused extends Error {
  constructor(
    readonly reason:
      | "not_entitled"
      | "runs_per_day"
      | "artifacts_per_run"
      | "bytes_per_run"
      | "bytes_stored_max"
      | "malformed",
    message: string
  ) {
    super(message);
    this.name = "UploadRefused";
  }
}

/** A commit that could not be trusted. Distinct from a refusal: something is wrong, not merely disallowed. */
export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejected";
  }
}

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------

/**
 * Reads the limits for an organization's plan.
 *
 * Two lookups rather than a join because the failure modes differ and both must
 * be loud: an organization with no row is a bug in provisioning, and a plan with
 * no limits row is a bug in migration seeding. Neither may quietly become
 * "unlimited", which is what a LEFT JOIN and a `?? Infinity` would produce.
 */
export async function planLimitsFor(db: Db, orgId: string): Promise<PlanLimits> {
  const org = await db.query<{ plan: string }>("SELECT plan FROM orgs WHERE id = $1", [orgId]);
  if (org.rows.length === 0) {
    throw new UploadRefused("malformed", `no such organization: ${orgId}`);
  }
  const plan = org.rows[0].plan;
  const limits = await db.query<{
    can_upload: boolean;
    runs_per_day: number;
    artifacts_per_run: number;
    bytes_per_run: string;
    bytes_stored_max: string;
    retention_days: number;
  }>(
    `SELECT can_upload, runs_per_day, artifacts_per_run, bytes_per_run, bytes_stored_max, retention_days
       FROM plan_limits WHERE plan = $1`,
    [plan]
  );
  if (limits.rows.length === 0) {
    throw new UploadRefused("malformed", `plan '${plan}' has no limits row — provisioning is incomplete`);
  }
  const r = limits.rows[0];
  return {
    plan,
    canUpload: r.can_upload,
    runsPerDay: r.runs_per_day,
    artifactsPerRun: r.artifacts_per_run,
    bytesPerRun: Number(r.bytes_per_run),
    bytesStoredMax: Number(r.bytes_stored_max),
    retentionDays: r.retention_days,
  };
}

// ---------------------------------------------------------------------------
// Byte accounting — the only writers of org_storage
// ---------------------------------------------------------------------------

interface StorageCounters {
  bytesStored: number;
  bytesReserved: number;
  runsToday: number;
}

/**
 * Reads and rolls over an organization's counters, creating the row if absent.
 *
 * **The day rollover is arithmetic, not a scheduled job.** A row whose
 * `runs_day` is not today reads as zero runs and is stamped forward. A nightly
 * reset job is a job that can fail to run, and the failure mode of *that* is an
 * organization stuck at yesterday's limit with nothing to point at.
 *
 * Locked FOR UPDATE because everything downstream is check-then-act: twenty
 * concurrent declares must not each read the same total and each conclude there
 * is room.
 */
async function counters(tx: Db, orgId: string): Promise<StorageCounters> {
  await tx.query(
    `INSERT INTO org_storage (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
    [orgId]
  );
  const row = await tx.query<{
    bytes_stored: string;
    bytes_reserved: string;
    runs_today: number;
    stale: boolean;
  }>(
    `SELECT bytes_stored, bytes_reserved, runs_today, (runs_day <> CURRENT_DATE) AS stale
       FROM org_storage WHERE org_id = $1 FOR UPDATE`,
    [orgId]
  );
  const r = row.rows[0];
  if (r.stale) {
    await tx.query("UPDATE org_storage SET runs_today = 0, runs_day = CURRENT_DATE WHERE org_id = $1", [orgId]);
  }
  return {
    bytesStored: Number(r.bytes_stored),
    bytesReserved: Number(r.bytes_reserved),
    runsToday: r.stale ? 0 : r.runs_today,
  };
}

/** Promises capacity for bytes that are not here yet, and counts the run against today. */
async function reserveBytes(tx: Db, orgId: string, bytes: number): Promise<void> {
  await tx.query(
    `UPDATE org_storage
        SET bytes_reserved = bytes_reserved + $2, runs_today = runs_today + 1, updated_at = now()
      WHERE org_id = $1`,
    [orgId, bytes]
  );
}

/**
 * Moves a reservation into stored bytes once the objects are verifiably present.
 *
 * `GREATEST(…, 0)` on the reservation is not defensive noise: the sweeper and a
 * commit can both decide an artifact is finished, and the row's CHECK would
 * abort the whole commit rather than let the count go negative. Losing a
 * reservation is a rounding error; losing a customer's committed upload to a
 * constraint violation is not.
 */
async function settleBytes(tx: Db, orgId: string, bytes: number): Promise<void> {
  await tx.query(
    `UPDATE org_storage
        SET bytes_reserved = GREATEST(bytes_reserved - $2, 0),
            bytes_stored   = bytes_stored + $2,
            updated_at     = now()
      WHERE org_id = $1`,
    [orgId, bytes]
  );
}

/** Gives capacity back when an upload failed or was abandoned. Never touches stored bytes. */
async function releaseBytes(tx: Db, orgId: string, bytes: number): Promise<void> {
  await tx.query(
    `UPDATE org_storage
        SET bytes_reserved = GREATEST(bytes_reserved - $2, 0), updated_at = now()
      WHERE org_id = $1`,
    [orgId, bytes]
  );
}

/** Stored bytes go away when their objects do. Called by deletion and by nothing else. */
export async function forgetStoredBytes(db: Db, orgId: string, bytes: number): Promise<void> {
  await db.query(
    `UPDATE org_storage SET bytes_stored = GREATEST(bytes_stored - $2, 0), updated_at = now() WHERE org_id = $1`,
    [orgId, bytes]
  );
}

// ---------------------------------------------------------------------------
// Declare
// ---------------------------------------------------------------------------

export interface DeclareRequest {
  orgId: string;
  repoName: string;
  commitSha?: string;
  branch?: string;
  summary: unknown;
  artifacts: DeclaredArtifact[];
}

export interface PresignedUpload {
  frame: string;
  kind: ArtifactKind;
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface DeclareResult {
  runId: string;
  uploads: PresignedUpload[];
  /** Already held by this organization; the client must not upload these. */
  deduplicated: { frame: string; kind: ArtifactKind }[];
  bytesReserved: number;
}

const SHA256 = /^[0-9a-f]{64}$/;

function validate(artifacts: DeclaredArtifact[], limits: PlanLimits): void {
  if (artifacts.length > limits.artifactsPerRun) {
    throw new UploadRefused(
      "artifacts_per_run",
      `${artifacts.length} artifacts exceeds the ${limits.artifactsPerRun} per run allowed on the ${limits.plan} plan`
    );
  }
  const seen = new Set<string>();
  for (const a of artifacts) {
    if (!ARTIFACT_KINDS.includes(a.kind)) {
      throw new UploadRefused("malformed", `unknown artifact kind '${a.kind}'`);
    }
    if (!SHA256.test(a.sha256)) {
      throw new UploadRefused("malformed", `artifact ${a.frame}/${a.kind}: sha256 must be 64 lowercase hex characters`);
    }
    // A zero-byte declaration would reserve nothing and then accept anything,
    // which is the exact hole the declared/actual pair exists to close.
    if (!Number.isInteger(a.bytes) || a.bytes <= 0) {
      throw new UploadRefused("malformed", `artifact ${a.frame}/${a.kind}: bytes must be a positive integer`);
    }
    const key = `${a.frame} ${a.kind}`;
    if (seen.has(key)) {
      throw new UploadRefused("malformed", `artifact ${a.frame}/${a.kind} declared twice in one run`);
    }
    seen.add(key);
  }
}

/**
 * Phase 1. Checks, reserves, writes `pending` rows, and hands back presigned PUTs.
 *
 * Order is deliberate and is the order G2b specifies: **key → entitlement →
 * quota → reservation → signature.** Entitlement before quota because a free
 * organization must be refused for being free, not for exceeding a limit of
 * zero — the message a customer reads should name the real reason. Reservation
 * before signature because a URL that exists is a URL that can be used.
 *
 * Everything happens in one transaction, so a failure part-way reserves nothing
 * and leaves no half-declared run. The presigning happens *after* it commits:
 * signing inside the transaction would hold a database connection open across a
 * network call to R2 for every artifact in the run.
 */
export async function declareUpload(
  db: Db,
  storage: Storage,
  request: DeclareRequest
): Promise<DeclareResult> {
  const { orgId, repoName, artifacts } = request;

  const prepared = await db.transaction(async (tx) => {
    const limits = await planLimitsFor(tx, orgId);

    // Entitlement first, and never inferred from a number being zero.
    if (!limits.canUpload) {
      throw new UploadRefused(
        "not_entitled",
        `the ${limits.plan} plan cannot upload. The CLI stays fully local on this plan; ` +
          `subscribe to Normascope Cloud to keep history and hosted reports.`
      );
    }

    validate(artifacts, limits);

    const declaredBytes = artifacts.reduce((sum, a) => sum + a.bytes, 0);
    if (declaredBytes > limits.bytesPerRun) {
      throw new UploadRefused(
        "bytes_per_run",
        `this run declares ${declaredBytes} bytes, over the ${limits.bytesPerRun} per run allowed on the ${limits.plan} plan`
      );
    }

    const before = await counters(tx, orgId);
    if (before.runsToday >= limits.runsPerDay) {
      throw new UploadRefused(
        "runs_per_day",
        `${limits.runsPerDay} runs already uploaded today on the ${limits.plan} plan; the count resets at midnight UTC`
      );
    }

    // Which of these does the organization already hold? A deduplicated
    // artifact costs no bytes and gets no URL, so it is settled before the
    // quota arithmetic rather than after.
    const shas = [...new Set(artifacts.map((a) => a.sha256))];
    const existing = await tx.query<{ sha256: string; storage_key: string }>(
      `SELECT DISTINCT sha256, storage_key FROM run_artifacts
        WHERE org_id = $1 AND state = 'committed' AND sha256 = ANY($2)`,
      [orgId, shas]
    );
    const held = new Map(existing.rows.map((r) => [r.sha256, r.storage_key]));

    const fresh = artifacts.filter((a) => !held.has(a.sha256));
    const freshBytes = fresh.reduce((sum, a) => sum + a.bytes, 0);

    if (before.bytesStored + before.bytesReserved + freshBytes > limits.bytesStoredMax) {
      throw new UploadRefused(
        "bytes_stored_max",
        `this run would take the organization past the ${limits.bytesStoredMax} bytes stored allowed on the ${limits.plan} plan`
      );
    }

    const repoId = await upsertRepo(tx, orgId, repoName);
    const runId = randomUUID();
    await tx.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state) VALUES ($1,$2,$3,$4,$5,$6,'pending')",
      [runId, orgId, repoId, request.commitSha ?? "", request.branch ?? "", JSON.stringify(request.summary ?? {})]
    );

    const expiresAt = new Date(Date.now() + PUT_TTL_SECONDS * 1000);
    const toSign: { artifact: DeclaredArtifact; key: string; nonce: string }[] = [];
    const deduplicated: { frame: string; kind: ArtifactKind }[] = [];

    for (const a of artifacts) {
      const reused = held.get(a.sha256);
      if (reused) {
        // Committed on arrival: the bytes are already in storage and already
        // counted against this organization's total. Recording the row is what
        // makes the run point at them.
        await tx.query(
          `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'committed')`,
          [randomUUID(), orgId, runId, a.frame, a.kind, reused, a.sha256, a.bytes]
        );
        deduplicated.push({ frame: a.frame, kind: a.kind });
        continue;
      }
      const key = blobKey(orgId, a.sha256, extensionFor(a.kind));
      const nonce = randomUUID();
      await tx.query(
        `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state, put_nonce, put_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,'pending',$9,$10)`,
        [randomUUID(), orgId, runId, a.frame, a.kind, key, a.sha256, a.bytes, nonce, expiresAt.toISOString()]
      );
      toSign.push({ artifact: a, key, nonce });
    }

    await reserveBytes(tx, orgId, freshBytes);
    return { runId, toSign, deduplicated, freshBytes };
  });

  const uploads: PresignedUpload[] = [];
  for (const { artifact, key, nonce } of prepared.toSign) {
    const put = await storage.presignPut(key, {
      contentLength: artifact.bytes,
      contentType: artifact.contentType ?? contentTypeFor(artifact.kind),
      ttlSeconds: PUT_TTL_SECONDS,
      nonce,
    });
    uploads.push({ frame: artifact.frame, kind: artifact.kind, url: put.url, headers: put.headers, expiresAt: put.expiresAt });
  }

  return {
    runId: prepared.runId,
    uploads,
    deduplicated: prepared.deduplicated,
    bytesReserved: prepared.freshBytes,
  };
}

async function upsertRepo(tx: Db, orgId: string, name: string): Promise<string> {
  const found = await tx.query<{ id: string }>("SELECT id FROM repos WHERE org_id = $1 AND name = $2", [orgId, name]);
  if (found.rows[0]) {
    return found.rows[0].id;
  }
  const id = randomUUID();
  await tx.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, name]);
  return id;
}

function extensionFor(kind: ArtifactKind): string {
  if (kind === "summary" || kind === "regions") return "json";
  if (kind === "report") return "html";
  return "png";
}

function contentTypeFor(kind: ArtifactKind): string {
  if (kind === "summary" || kind === "regions") return "application/json";
  if (kind === "report") return "text/html";
  return "image/png";
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export interface CommitResult {
  runId: string;
  artifactsCommitted: number;
  bytesCommitted: number;
}

/**
 * Phase 3. Verifies every promised object actually arrived, then makes the run visible.
 *
 * **What is checked, precisely.** Each pending object is `head`ed and its stored
 * size compared against the declaration. With `verifyContent` (the default) the
 * bytes are also read back and hashed, because size alone does not prove
 * content — and content is what the object is *addressed by*. An object whose
 * key says one hash and whose bytes say another would poison deduplication for
 * the whole organization: every later run declaring the honest hash would be
 * handed the dishonest bytes.
 *
 * **Any failure fails the whole run.** A partially committed run is a report
 * with holes in it, which reads to a customer as data loss rather than a failed
 * upload. The objects that did arrive are deleted and the reservation released,
 * so a retry starts clean.
 */
export async function commitUpload(
  db: Db,
  storage: Storage,
  options: { orgId: string; runId: string; verifyContent?: boolean }
): Promise<CommitResult> {
  const { orgId, runId } = options;
  const verifyContent = options.verifyContent ?? true;

  const run = await db.query<{ state: string }>("SELECT state FROM runs WHERE id = $1 AND org_id = $2", [runId, orgId]);
  if (run.rows.length === 0) {
    throw new UploadRejected(`no such run for this organization: ${runId}`);
  }
  if (run.rows[0].state === "committed") {
    // Idempotent: a client that retries a commit it already completed gets the
    // same answer rather than an error. CI runners retry.
    const already = await db.query<{ n: string; bytes: string }>(
      "SELECT count(*) AS n, COALESCE(SUM(bytes),0) AS bytes FROM run_artifacts WHERE run_id = $1",
      [runId]
    );
    return {
      runId,
      artifactsCommitted: Number(already.rows[0].n),
      bytesCommitted: Number(already.rows[0].bytes),
    };
  }

  const pending = await db.query<{ id: string; storage_key: string; sha256: string; declared_bytes: string }>(
    "SELECT id, storage_key, sha256, declared_bytes FROM run_artifacts WHERE run_id = $1 AND state = 'pending' ORDER BY id",
    [runId]
  );

  const verified: { id: string; bytes: number }[] = [];
  let failure: string | null = null;

  for (const row of pending.rows) {
    const declared = Number(row.declared_bytes);
    const head = await storage.head(row.storage_key);
    if (!head) {
      failure = `${row.storage_key} was never uploaded`;
      break;
    }
    if (head.size !== declared) {
      failure = `${row.storage_key} is ${head.size} bytes, declared ${declared}`;
      break;
    }
    if (verifyContent) {
      const body = await storage.get(row.storage_key);
      if (!body) {
        failure = `${row.storage_key} could not be read back`;
        break;
      }
      const actual = await sha256Of(body);
      if (actual !== row.sha256) {
        failure = `${row.storage_key} hashes to ${actual}, declared ${row.sha256}`;
        break;
      }
    }
    verified.push({ id: row.id, bytes: declared });
  }

  if (failure) {
    await failRun(db, storage, orgId, runId);
    throw new UploadRejected(`commit refused — ${failure}`);
  }

  const bytesCommitted = verified.reduce((sum, v) => sum + v.bytes, 0);
  await db.transaction(async (tx) => {
    for (const v of verified) {
      await tx.query(
        "UPDATE run_artifacts SET bytes = declared_bytes, state = 'committed', put_nonce = '', put_expires_at = NULL WHERE id = $1",
        [v.id]
      );
    }
    await settleBytes(tx, orgId, bytesCommitted);
    await tx.query("UPDATE runs SET state = 'committed' WHERE id = $1", [runId]);
  });

  const total = await db.query<{ n: string }>("SELECT count(*) AS n FROM run_artifacts WHERE run_id = $1", [runId]);
  return { runId, artifactsCommitted: Number(total.rows[0].n), bytesCommitted };
}

async function sha256Of(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Undoes a declared run: deletes whatever arrived, drops the rows, releases the
 * reservation.
 *
 * Objects before rows, the same order `retention.ts` uses and for the same
 * reason — the row is the only pointer to the object, so dropping it first
 * strands bytes nobody can find and nobody stops paying for. Deduplicated
 * artifacts are `committed`, never `pending`, so this cannot delete an object a
 * previous run is still using.
 */
async function failRun(db: Db, storage: Storage, orgId: string, runId: string): Promise<void> {
  const rows = await db.query<{ id: string; storage_key: string; declared_bytes: string }>(
    "SELECT id, storage_key, declared_bytes FROM run_artifacts WHERE run_id = $1 AND state = 'pending'",
    [runId]
  );
  let released = 0;
  for (const row of rows.rows) {
    await storage.delete(row.storage_key);
    released += Number(row.declared_bytes);
  }
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM run_artifacts WHERE run_id = $1 AND state = 'pending'", [runId]);
    await releaseBytes(tx, orgId, released);
    // The run row goes only if nothing committed survives it — a run that
    // deduplicated some artifacts and failed others has rows worth keeping out
    // of the way, not rows worth resurrecting.
    await tx.query(
      "DELETE FROM runs WHERE id = $1 AND state = 'pending' AND NOT EXISTS (SELECT 1 FROM run_artifacts WHERE run_id = $1)",
      [runId]
    );
  });
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export interface SweepResult {
  runsSwept: number;
  artifactsDeleted: number;
  bytesReleased: number;
}

/**
 * Deletes declarations that never transferred and gives their capacity back.
 *
 * Without this an abandoned upload is two problems at once: a slow leak of
 * reserved bytes that no longer correspond to anything, and a trivial griefing
 * vector — declare the whole quota, upload nothing, repeat.
 *
 * Runs are swept whole rather than artifact by artifact, because a run missing
 * three of its forty artifacts is not a run anybody wants restored.
 */
export async function sweepAbandonedUploads(
  db: Db,
  storage: Storage,
  options: { olderThanMinutes?: number; now?: Date; limit?: number } = {}
): Promise<SweepResult> {
  const minutes = options.olderThanMinutes ?? ABANDONED_AFTER_MINUTES;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - minutes * 60 * 1000);

  const stale = await db.query<{ id: string; org_id: string }>(
    `SELECT id, org_id FROM runs
      WHERE state = 'pending' AND created_at < $1
      ORDER BY created_at
      LIMIT $2`,
    [cutoff.toISOString(), options.limit ?? 100]
  );

  let artifactsDeleted = 0;
  let bytesReleased = 0;
  for (const run of stale.rows) {
    const rows = await db.query<{ declared_bytes: string }>(
      "SELECT declared_bytes FROM run_artifacts WHERE run_id = $1 AND state = 'pending'",
      [run.id]
    );
    artifactsDeleted += rows.rows.length;
    bytesReleased += rows.rows.reduce((sum, r) => sum + Number(r.declared_bytes), 0);
    await failRun(db, storage, run.org_id, run.id);
  }

  return { runsSwept: stale.rows.length, artifactsDeleted, bytesReleased };
}
