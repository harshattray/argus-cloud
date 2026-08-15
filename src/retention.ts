import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { Storage } from "./storage.js";
import { orgPrefix } from "./storage/keys.js";
import { forgetStoredBytes } from "./artifactUploads.js";

/**
 * Retention and deletion (PATHWAYS.md Pathway 1 item 9 / §10.3 "1D" second
 * half). FUTURENORMA §5 states the contract: run, repo and org delete remove
 * objects from storage as well as rows, and a 90-day sweep runs with a dry-run
 * mode.
 *
 * Four rules, each of which changes what the code has to look like:
 *
 * 1. **Objects before rows.** A `run_artifacts` row is the only pointer to a
 *    stored object. Delete the row first and a crash one line later leaves
 *    bytes nobody can find, nobody is billed for, and the customer was told
 *    were gone. Deleting the object first is the recoverable order: the row
 *    survives, the retry re-deletes an object that is already absent, and the
 *    port makes that succeed (`storage.delete` is idempotent by contract).
 *
 * 2. **A blob may be shared inside its org, so a run does not own its bytes.**
 *    Keys are content-addressed per organization
 *    (`org/{orgId}/blob/{sha256}.{ext}`), and Pathway 2 item 6 requires dedupe
 *    within an org. Two runs uploading the same screenshot are two artifact
 *    rows pointing at one object. Deleting a run therefore deletes an object
 *    only when it is the **last** row in that org referencing the key —
 *    otherwise expiring an old run silently breaks a current report. The naive
 *    per-row delete is what `T2b` runs, to prove this test would catch it.
 *
 * 3. **Resumable, and honest about where it got to.** Serverless invocations
 *    are time-boxed and an org can hold more objects than one invocation can
 *    delete. Work is claimed, done in bounded batches, and the cursor advances
 *    only past artifacts that actually went. Interrupt it anywhere and the next
 *    run continues rather than starting over or skipping.
 *
 * 4. **A dry run walks the same path.** It reads the same rows, resolves the
 *    same shared-blob question and fills the same counters; it just does not
 *    call the two mutating operations. A dry run implemented as a separate
 *    query would be a prediction of a different program.
 *
 * **Deleting an org deletes its books.** `usage_events`, `credit_grants` and
 * `subscription_periods` all cascade from `orgs`, so an org deletion rewrites
 * the reconciliation history for every month that org traded in. That is a
 * real conflict between erasure and Doctrine 2, and it is not this module's to
 * settle: what it does is snapshot the totals into the receipt first, so the
 * aggregate survives, and record the open question in `FinishedSPEC.md` §3j.
 */

/**
 * FUTURENORMA §5's "90-day sweep", and the number the hosted report's retention
 * promise is written against.
 *
 * A per-plan override belongs in plan configuration read at runtime (§4 Step 6)
 * rather than here — a second tier is meant to be a config row, not a code
 * change. Until that exists this is the only value, and callers may override it
 * per invocation.
 */
export const DEFAULT_RETENTION_DAYS = 90;

/**
 * How long a claimed job may sit before another worker may take it over. A
 * worker killed mid-batch (a redeploy, an OOM) must not park a deletion
 * forever; the same ceiling `provider_reservations` uses, for the same reason.
 */
export const CLAIM_TTL_SECONDS = 15 * 60;

/** Artifacts processed per invocation. Bounded so one call cannot run long. */
export const DEFAULT_BATCH_SIZE = 200;

export type DeletionScope = "run" | "repo" | "org" | "retention";

export interface DeletionCounts {
  /** Objects actually removed from storage (dry run: objects that would be). */
  objects: number;
  /** Database rows removed, not counting what cascaded from them. */
  rows: number;
  bytes: number;
}

export interface DeletionJob extends DeletionCounts {
  id: string;
  scope: DeletionScope;
  targetId: string | null;
  orgId: string | null;
  dryRun: boolean;
  state: "pending" | "running" | "done" | "failed";
  claims: number;
  lastError: string;
}

export interface EnqueueDeletion {
  scope: DeletionScope;
  targetId?: string | null;
  orgId?: string | null;
  dryRun?: boolean;
  /** Retention sweeps only: runs created before this go. Fixed at enqueue. */
  cutoffAt?: Date | null;
}

interface JobRow {
  id: string;
  scope: DeletionScope;
  target_id: string | null;
  org_id: string | null;
  cutoff_at: string | Date | null;
  dry_run: boolean;
  state: DeletionJob["state"];
  cursor: string;
  objects_deleted: number;
  rows_deleted: number;
  bytes_deleted: string | number;
  claims: number;
  last_error: string;
}

const toJob = (row: JobRow): DeletionJob => ({
  id: row.id,
  scope: row.scope,
  targetId: row.target_id,
  orgId: row.org_id,
  dryRun: row.dry_run,
  state: row.state,
  claims: row.claims,
  lastError: row.last_error,
  objects: Number(row.objects_deleted),
  rows: Number(row.rows_deleted),
  bytes: Number(row.bytes_deleted),
});

export async function enqueueDeletion(db: Db, req: EnqueueDeletion): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO deletion_jobs (id, scope, target_id, org_id, cutoff_at, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      req.scope,
      req.targetId ?? null,
      req.orgId ?? null,
      req.cutoffAt ? req.cutoffAt.toISOString() : null,
      Boolean(req.dryRun),
    ]
  );
  return id;
}

export async function getDeletionJob(db: Db, jobId: string): Promise<DeletionJob | null> {
  const row = (await db.query<JobRow>("SELECT * FROM deletion_jobs WHERE id = $1", [jobId])).rows[0];
  return row ? toJob(row) : null;
}

export interface RunJobOptions {
  batchSize?: number;
  now?: Date;
}

export interface RunJobOutcome {
  /** False when another worker holds the job — this call did nothing. */
  claimed: boolean;
  /** False when the batch budget ran out with work left; call again. */
  done: boolean;
  job: DeletionJob;
}

/**
 * Claims a job and does up to one batch of its work.
 *
 * The claim is a conditional UPDATE, which is what makes two workers safe:
 * exactly one transitions the row, the other reads `claimed: false` and stops.
 * A `running` job whose claim has expired can be taken over — a dead worker
 * must not be able to park a deletion.
 */
export async function runDeletionJob(
  db: Db,
  storage: Storage,
  jobId: string,
  options: RunJobOptions = {}
): Promise<RunJobOutcome> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_SECONDS * 1000);

  const claimed = await db.query<JobRow>(
    `UPDATE deletion_jobs
        SET state = 'running', claimed_at = $2, claims = claims + 1
      WHERE id = $1
        AND (state IN ('pending', 'failed')
             OR (state = 'running' AND claimed_at < $3))
      RETURNING *`,
    [jobId, now.toISOString(), staleBefore.toISOString()]
  );

  if (claimed.rows.length === 0) {
    const existing = await getDeletionJob(db, jobId);
    if (!existing) {
      throw new Error(`unknown deletion job ${jobId}`);
    }
    // Already finished, or someone else is holding it. Either way this call
    // must not touch storage — a second deleter is how counts double.
    return { claimed: false, done: existing.state === "done", job: existing };
  }

  const job = claimed.rows[0];
  const counts: DeletionCounts = { objects: 0, rows: 0, bytes: 0 };
  let cursor = job.cursor;

  try {
    const progress = await work(db, storage, job, { batchSize, now, counts, cursor });
    cursor = progress.cursor;
    const finished = progress.done;
    const updated = await db.query<JobRow>(
      `UPDATE deletion_jobs
          SET state = $2,
              cursor = $3,
              objects_deleted = objects_deleted + $4,
              rows_deleted = rows_deleted + $5,
              bytes_deleted = bytes_deleted + $6,
              last_error = '',
              finished_at = CASE WHEN $2 = 'done' THEN $7::timestamptz ELSE NULL END
        WHERE id = $1
        RETURNING *`,
      [
        job.id,
        finished ? "done" : "pending",
        cursor,
        counts.objects,
        counts.rows,
        counts.bytes,
        now.toISOString(),
      ]
    );
    return { claimed: true, done: finished, job: toJob(updated.rows[0]) };
  } catch (err) {
    // Partial progress is kept on purpose. The objects counted here are gone;
    // recording zero because the batch later failed would make the receipt lie
    // and make a retry double-count.
    const failed = await db.query<JobRow>(
      `UPDATE deletion_jobs
          SET state = 'failed',
              cursor = $3,
              objects_deleted = objects_deleted + $4,
              rows_deleted = rows_deleted + $5,
              bytes_deleted = bytes_deleted + $6,
              last_error = $2
        WHERE id = $1
        RETURNING *`,
      [job.id, String(err).slice(0, 500), cursor, counts.objects, counts.rows, counts.bytes]
    );
    return { claimed: true, done: false, job: toJob(failed.rows[0]) };
  }
}

interface WorkContext {
  batchSize: number;
  now: Date;
  counts: DeletionCounts;
  cursor: string;
}

async function work(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext
): Promise<{ done: boolean; cursor: string }> {
  switch (job.scope) {
    case "org":
      return deleteOrgWork(db, storage, job, ctx);
    case "run":
      return deleteRunWork(db, storage, job, ctx);
    case "repo":
      return deleteRepoWork(db, storage, job, ctx);
    case "retention":
      return sweepWork(db, storage, job, ctx);
    default:
      throw new Error(`unknown deletion scope ${job.scope}`);
  }
}

// ---------------------------------------------------------------------------
// Artifacts — the part every scope shares
// ---------------------------------------------------------------------------

interface ArtifactRow {
  id: string;
  org_id: string;
  storage_key: string;
  bytes: string | number;
}

/**
 * Deletes up to `budget` of one run's artifacts, objects first.
 *
 * `cursor` is the last artifact id finished. On the deleting path rows
 * disappear so it would be redundant; on the dry-run path nothing disappears
 * and without it the walk would re-read the same batch forever. One cursor for
 * both keeps the two paths the same program.
 */
async function deleteRunArtifacts(
  db: Db,
  storage: Storage,
  job: JobRow,
  runId: string,
  ctx: WorkContext,
  budget: number,
  cursor: string
): Promise<{ remaining: boolean; cursor: string; used: number }> {
  let used = 0;
  let at = cursor;

  for (;;) {
    if (used >= budget) {
      return { remaining: true, cursor: at, used };
    }
    const batch = await db.query<ArtifactRow>(
      `SELECT id, org_id, storage_key, bytes
         FROM run_artifacts
        WHERE run_id = $1 AND id > $2
        ORDER BY id
        LIMIT $3`,
      [runId, at, Math.min(budget - used, 100)]
    );
    if (batch.rows.length === 0) {
      return { remaining: false, cursor: at, used };
    }

    for (const artifact of batch.rows) {
      // Rule 2: does anything else in this org still point at these bytes?
      // Asked per artifact rather than per batch because the answer changes as
      // the batch is processed — the second of two rows sharing a key is the
      // one that frees the object.
      const others = await db.query<{ n: string }>(
        `SELECT count(*) AS n
           FROM run_artifacts
          WHERE org_id = $1 AND storage_key = $2 AND id <> $3`,
        [artifact.org_id, artifact.storage_key, artifact.id]
      );
      const shared = Number(others.rows[0].n) > 0;

      if (!shared) {
        // Rule 1: object first. If this throws, the row is still here and the
        // retry repeats it against a storage port whose delete is idempotent.
        if (!job.dry_run) {
          await storage.delete(artifact.storage_key);
        }
        ctx.counts.objects += 1;
        ctx.counts.bytes += Number(artifact.bytes);

        // Rule 5, and the note that used to sit at the bottom of this loop:
        // give the organization its quota back.
        //
        // **Only in this branch, and that is the whole subtlety.**
        // `org_storage.bytes_stored` counts *objects*, not rows: a declaration
        // whose hash the organization already holds is committed without
        // reserving or settling anything, so it never added to the total.
        // Releasing per row would therefore subtract bytes that were never
        // added, and an organization that uploaded one baseline across fifty
        // runs would end up at zero — or, with the floor, simply wrong.
        // Releasing when the object goes matches how it arrived.
        //
        // Without this, `bytes_stored` only ever rises. Deleting a run frees
        // the objects and not the quota, and an organization that deleted
        // everything would still read as full and eventually be unable to
        // upload into an empty account.
        if (!job.dry_run) {
          await forgetStoredBytes(db, artifact.org_id, Number(artifact.bytes));
        }
      }
      if (!job.dry_run) {
        await db.query("DELETE FROM run_artifacts WHERE id = $1", [artifact.id]);
        ctx.counts.rows += 1;
      }
      at = artifact.id;
      used += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

async function deleteRunWork(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext
): Promise<{ done: boolean; cursor: string }> {
  const runId = job.target_id;
  if (!runId) {
    throw new Error("run deletion job has no target_id");
  }
  const progress = await deleteRunArtifacts(db, storage, job, runId, ctx, ctx.batchSize, ctx.cursor);
  if (progress.remaining) {
    return { done: false, cursor: progress.cursor };
  }
  if (!job.dry_run) {
    // Cascades share_links, frame_stats, run_findings and explain_batches.
    const gone = await db.query<{ id: string }>("DELETE FROM runs WHERE id = $1 RETURNING id", [runId]);
    ctx.counts.rows += gone.rows.length;
  }
  return { done: true, cursor: progress.cursor };
}

/**
 * Walks a repo's runs oldest first, deleting each completely before starting
 * the next. The cursor is `{runId}\0{artifactId}` — a run half-finished
 * when the budget ran out resumes inside itself rather than from its first
 * artifact, which on a retry loop would mean never finishing a large run.
 */
async function deleteRunsOf(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext,
  nextRun: (afterRunId: string) => Promise<string | null>
): Promise<{ done: boolean; cursor: string }> {
  const [startRun = "", startArtifact = ""] = ctx.cursor.split("\0");
  let runId: string | null = startRun || (await nextRun(""));
  let artifactCursor = startArtifact;
  let used = 0;

  while (runId) {
    const progress = await deleteRunArtifacts(
      db,
      storage,
      job,
      runId,
      ctx,
      ctx.batchSize - used,
      artifactCursor
    );
    used += progress.used;
    if (progress.remaining) {
      return { done: false, cursor: `${runId}\0${progress.cursor}` };
    }
    if (!job.dry_run) {
      const gone = await db.query<{ id: string }>("DELETE FROM runs WHERE id = $1 RETURNING id", [runId]);
      ctx.counts.rows += gone.rows.length;
    }
    const finishedRun: string = runId;
    artifactCursor = "";
    // On the dry-run path the run row is still there, so "the next run after
    // this one" has to mean by id, not "the first one left".
    runId = await nextRun(finishedRun);
    if (used >= ctx.batchSize && runId) {
      return { done: false, cursor: `${runId}\0` };
    }
  }
  return { done: true, cursor: "" };
}

async function deleteRepoWork(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext
): Promise<{ done: boolean; cursor: string }> {
  const repoId = job.target_id;
  if (!repoId) {
    throw new Error("repo deletion job has no target_id");
  }
  const progress = await deleteRunsOf(db, storage, job, ctx, async (after) => {
    const row = await db.query<{ id: string }>(
      "SELECT id FROM runs WHERE repo_id = $1 AND id > $2 ORDER BY id LIMIT 1",
      [repoId, after]
    );
    return row.rows[0]?.id ?? null;
  });
  if (!progress.done) {
    return progress;
  }
  if (!job.dry_run) {
    const gone = await db.query<{ id: string }>("DELETE FROM repos WHERE id = $1 RETURNING id", [repoId]);
    ctx.counts.rows += gone.rows.length;
  }
  return { done: true, cursor: "" };
}

async function sweepWork(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext
): Promise<{ done: boolean; cursor: string }> {
  const cutoff = job.cutoff_at;
  if (!cutoff) {
    throw new Error("retention job has no cutoff_at");
  }
  const cutoffIso = cutoff instanceof Date ? cutoff.toISOString() : String(cutoff);
  return deleteRunsOf(db, storage, job, ctx, async (after) => {
    const row = await db.query<{ id: string }>(
      `SELECT id FROM runs
        WHERE created_at < $1 AND id > $2
          AND ($3::text IS NULL OR org_id = $3)
        ORDER BY id LIMIT 1`,
      [cutoffIso, after, job.org_id]
    );
    return row.rows[0]?.id ?? null;
  });
}

/**
 * Erasing an organization.
 *
 * One prefix delete rather than an artifact walk, because `storage/keys.ts`
 * puts every one of an org's objects under `org/{orgId}/` precisely so this
 * stays a prefix delete — including objects from abandoned uploads that no row
 * ever recorded. Then one `DELETE FROM orgs`, which cascades the schema.
 *
 * The dry run cannot enumerate a prefix — the port has no list, deliberately —
 * so it reports what the database knows: recorded artifacts and their bytes.
 * Untracked objects under the prefix will be deleted by the real run and are
 * not in the dry run's count. Said plainly here because a receipt that quoted
 * the dry run's number as the truth would be wrong in the customer's favour and
 * still wrong.
 */
async function deleteOrgWork(
  db: Db,
  storage: Storage,
  job: JobRow,
  ctx: WorkContext
): Promise<{ done: boolean; cursor: string }> {
  const orgId = job.target_id ?? job.org_id;
  if (!orgId) {
    throw new Error("org deletion job has no target_id");
  }

  const known = await db.query<{ n: string; bytes: string | null }>(
    "SELECT count(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM run_artifacts WHERE org_id = $1",
    [orgId]
  );

  if (job.dry_run) {
    ctx.counts.objects += Number(known.rows[0].n);
    ctx.counts.bytes += Number(known.rows[0].bytes ?? 0);
    const rows = await db.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM runs WHERE org_id = $1)
            + (SELECT count(*) FROM repos WHERE org_id = $1)
            + (SELECT count(*) FROM run_artifacts WHERE org_id = $1)
            + (SELECT count(*) FROM api_keys WHERE org_id = $1) AS n`,
      [orgId]
    );
    ctx.counts.rows += Number(rows.rows[0].n);
    return { done: true, cursor: "" };
  }

  await snapshotFinancials(db, job.id, orgId);

  // Objects before rows, at org scale: the prefix is derivable from the org id
  // alone, but only while some record of the org exists to derive it from.
  const objects = await storage.deletePrefix(orgPrefix(orgId));
  ctx.counts.objects += objects;
  ctx.counts.bytes += Number(known.rows[0].bytes ?? 0);

  const gone = await db.query<{ id: string }>("DELETE FROM orgs WHERE id = $1 RETURNING id", [orgId]);
  ctx.counts.rows += gone.rows.length;
  return { done: true, cursor: "" };
}

/**
 * Copies the org's lifetime totals onto the receipt before the cascade takes
 * the rows they came from. Aggregates only — this is what keeps a deleted
 * customer's months from silently changing the margin report, not a way to
 * retain their data.
 */
async function snapshotFinancials(db: Db, jobId: string, orgId: string): Promise<void> {
  const usage = await db.query<{ events: string; cost: string; credits: string }>(
    `SELECT count(*) AS events,
            COALESCE(SUM(cost_microdollars), 0) AS cost,
            COALESCE(SUM(credits_charged), 0) AS credits
       FROM usage_events WHERE org_id = $1`,
    [orgId]
  );
  const grants = await db.query<{ grants: string; credits: string; paid: string }>(
    `SELECT count(*) AS grants,
            COALESCE(SUM(credits), 0) AS credits,
            COALESCE(SUM(price_microdollars), 0) AS paid
       FROM credit_grants WHERE org_id = $1`,
    [orgId]
  );
  const subs = await db.query<{ periods: string; price: string; refunded: string; fees: string }>(
    `SELECT count(*) AS periods,
            COALESCE(SUM(price_microdollars), 0) AS price,
            COALESCE(SUM(refunded_microdollars), 0) AS refunded,
            COALESCE(SUM(fee_microdollars), 0) AS fees
       FROM subscription_periods WHERE org_id = $1`,
    [orgId]
  );

  const financials = {
    usageEvents: Number(usage.rows[0].events),
    providerCostMicrodollars: Number(usage.rows[0].cost),
    creditsCharged: Number(usage.rows[0].credits),
    grants: Number(grants.rows[0].grants),
    creditsGranted: Number(grants.rows[0].credits),
    packRevenueMicrodollars: Number(grants.rows[0].paid),
    subscriptionPeriods: Number(subs.rows[0].periods),
    subscriptionRevenueMicrodollars: Number(subs.rows[0].price),
    refundedMicrodollars: Number(subs.rows[0].refunded),
    feeMicrodollars: Number(subs.rows[0].fees),
  };
  await db.query("UPDATE deletion_jobs SET financials = $2 WHERE id = $1", [
    jobId,
    JSON.stringify(financials),
  ]);
}

// ---------------------------------------------------------------------------
// Callers
// ---------------------------------------------------------------------------

export interface DeleteOptions {
  dryRun?: boolean;
  batchSize?: number;
  now?: Date;
  /** Invocations to spend before giving up and leaving the job for later. */
  maxBatches?: number;
}

/** Enqueues a job and runs it to completion, or until `maxBatches` is spent. */
async function enqueueAndRun(
  db: Db,
  storage: Storage,
  req: EnqueueDeletion,
  options: DeleteOptions
): Promise<RunJobOutcome> {
  const jobId = await enqueueDeletion(db, { ...req, dryRun: options.dryRun });
  const maxBatches = options.maxBatches ?? 1000;
  let outcome: RunJobOutcome | null = null;
  for (let i = 0; i < maxBatches; i++) {
    outcome = await runDeletionJob(db, storage, jobId, options);
    if (outcome.done || outcome.job.state === "failed" || !outcome.claimed) {
      break;
    }
  }
  return outcome as RunJobOutcome;
}

export function deleteRun(db: Db, storage: Storage, runId: string, options: DeleteOptions = {}) {
  return enqueueAndRun(db, storage, { scope: "run", targetId: runId }, options);
}

export function deleteRepo(db: Db, storage: Storage, repoId: string, options: DeleteOptions = {}) {
  return enqueueAndRun(db, storage, { scope: "repo", targetId: repoId }, options);
}

export function deleteOrg(db: Db, storage: Storage, orgId: string, options: DeleteOptions = {}) {
  return enqueueAndRun(db, storage, { scope: "org", targetId: orgId, orgId }, options);
}

export interface SweepOptions extends DeleteOptions {
  retentionDays?: number;
  /** Limit the sweep to one org. Unset sweeps every org. */
  orgId?: string | null;
}

/**
 * The 90-day sweep. `dryRun: true` reports exactly what the real sweep would
 * remove, from the same walk.
 */
export function sweepRetention(db: Db, storage: Storage, options: SweepOptions = {}) {
  const now = options.now ?? new Date();
  const days = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoffAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return enqueueAndRun(
    db,
    storage,
    { scope: "retention", orgId: options.orgId ?? null, cutoffAt },
    options
  );
}
