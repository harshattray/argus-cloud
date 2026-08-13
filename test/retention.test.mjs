// Retention and deletion suite — PATHWAYS.md Pathway 1 item 9 / §10.3 "1D"
// second half; FUTURENORMA §5.
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/retention.test.mjs
//
// Checks are T1–T9. Two of them are counter-tests that run a naive
// implementation through the same harness, because a deletion test that passes
// against the obvious wrong code is not protecting anything:
//
//   T2b — deleting a run's objects without asking whether another run in the
//         same org still points at them. Blobs are deduplicated per org, so the
//         obvious version destroys a live report while expiring an old run.
//   T9b — two workers deleting the same job without claiming it first.
//
// T9/T9b need real backends and are skipped on PGlite, where every process
// gets its own private database.

import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createFilesystemStorage } = await import(path.join(DIST, "storage/filesystem.js"));
const { blobKey, orgPrefix } = await import(path.join(DIST, "storage.js"));
const {
  deleteRun,
  deleteRepo,
  deleteOrg,
  sweepRetention,
  enqueueDeletion,
  runDeletionJob,
  getDeletionJob,
  DEFAULT_RETENTION_DAYS,
  CLAIM_TTL_SECONDS,
} = await import(path.join(DIST, "retention.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

const STORAGE_ROOT = await mkdtemp(path.join(HERE, ".tmp-retention-"));
const storage = createFilesystemStorage({
  root: path.join(STORAGE_ROOT, "blobs"),
  publicBaseUrl: "http://localhost:3000/api/blob",
  signingSecret: "retention-suite",
});

const T0 = new Date("2026-08-13T12:00:00.000Z");
const daysAgo = (n) => new Date(T0.getTime() - n * 24 * 60 * 60 * 1000);
const bytes = (s) => new TextEncoder().encode(s);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

async function makeOrg() {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, "ret-" + id.slice(0, 8)]);
  return id;
}
async function makeRepo(orgId) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, "repo-" + id.slice(0, 8)]);
  return id;
}
async function makeRun(orgId, repoId, createdAt = T0) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, summary, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, orgId, repoId, JSON.stringify({ frames: [] }), createdAt.toISOString()]
  );
  return id;
}

/** Stores `content` and records it as an artifact of `runId`. Returns the key. */
async function putArtifact(orgId, runId, content, kind = "build") {
  const payload = bytes(content);
  const key = blobKey(orgId, sha256(content), "png");
  await storage.put(key, payload, { contentType: "image/png" });
  await db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), orgId, runId, "home", kind, key, sha256(content), payload.byteLength]
  );
  return key;
}

const exists = async (key) => (await storage.head(key)) !== null;
const countRows = async (sql, params) => Number((await db.query(sql, params)).rows[0].n);

// ---------------------------------------------------------------------------
// T1 — a run's objects and rows both go
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const contents = ["T1 build", "T1 reference", "T1 diff"];
  const expectedBytes = contents.reduce((n, c) => n + bytes(c).byteLength, 0);
  const keys = [
    await putArtifact(orgId, runId, contents[0]),
    await putArtifact(orgId, runId, contents[1], "reference"),
    await putArtifact(orgId, runId, contents[2], "diff"),
  ];
  await db.query("INSERT INTO share_links (id, org_id, run_id, token_hash) VALUES ($1, $2, $3, $4)", [
    randomUUID(),
    orgId,
    runId,
    sha256("T1 token"),
  ]);
  await db.query(
    "INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source) VALUES ($1, $2, $3, 'home', 'fidelity', 'figma')",
    [orgId, repoId, runId]
  );

  const outcome = await deleteRun(db, storage, runId);
  const stillThere = [];
  for (const key of keys) {
    if (await exists(key)) stillThere.push(key);
  }

  check("T1.1", outcome.done && outcome.job.state === "done", `the job finished (${outcome.job.state})`);
  check("T1.2", stillThere.length === 0, `all 3 objects are gone from storage (${stillThere.length} left)`);
  check("T1.3", outcome.job.objects === 3, `the receipt counts 3 objects (${outcome.job.objects})`);
  check(
    "T1.4",
    outcome.job.bytes === expectedBytes,
    `and the exact bytes they occupied (${outcome.job.bytes} of ${expectedBytes})`
  );
  check(
    "T1.5",
    (await countRows("SELECT count(*) AS n FROM run_artifacts WHERE run_id = $1", [runId])) === 0,
    "no artifact rows left"
  );
  check(
    "T1.6",
    (await countRows("SELECT count(*) AS n FROM runs WHERE id = $1", [runId])) === 0,
    "the run row is gone"
  );
  check(
    "T1.7",
    (await countRows("SELECT count(*) AS n FROM share_links WHERE run_id = $1", [runId])) === 0 &&
      (await countRows("SELECT count(*) AS n FROM frame_stats WHERE run_id = $1", [runId])) === 0,
    "its share link and frame stats cascaded with it"
  );
}

// ---------------------------------------------------------------------------
// T2 — a blob two runs share survives until the last one goes
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const oldRun = await makeRun(orgId, repoId, daysAgo(200));
  const liveRun = await makeRun(orgId, repoId, T0);

  // The same unchanged screenshot in both runs — one object, two rows. This is
  // the normal case, not an edge case: a frame that has not changed in months
  // hashes the same every run.
  const shared = await putArtifact(orgId, oldRun, "T2 unchanged frame");
  await putArtifact(orgId, liveRun, "T2 unchanged frame");
  const onlyOld = await putArtifact(orgId, oldRun, "T2 old-only frame");

  const outcome = await deleteRun(db, storage, oldRun);
  check("T2.1", await exists(shared), "deleting the old run leaves the blob the live run still points at");
  check("T2.2", !(await exists(onlyOld)), "the blob only the old run referenced is deleted");
  check("T2.3", outcome.job.objects === 1, `the receipt counts one object, not two (${outcome.job.objects})`);
  check(
    "T2.4",
    (await countRows("SELECT count(*) AS n FROM run_artifacts WHERE run_id = $1", [liveRun])) === 1,
    "the live run's artifact row is untouched"
  );

  await deleteRun(db, storage, liveRun);
  check("T2.5", !(await exists(shared)), "and when the last run referencing it goes, so does the object");
}

// ---------------------------------------------------------------------------
// T2b — the counter-test: the obvious implementation breaks a live report
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const oldRun = await makeRun(orgId, repoId, daysAgo(200));
  const liveRun = await makeRun(orgId, repoId, T0);
  const shared = await putArtifact(orgId, oldRun, "T2b unchanged frame");
  await putArtifact(orgId, liveRun, "T2b unchanged frame");

  // "Delete the run's artifacts" written the way anyone would write it first.
  const naiveDeleteRun = async (runId) => {
    const rows = await db.query("SELECT id, storage_key FROM run_artifacts WHERE run_id = $1", [runId]);
    for (const row of rows.rows) {
      await storage.delete(row.storage_key);
      await db.query("DELETE FROM run_artifacts WHERE id = $1", [row.id]);
    }
    await db.query("DELETE FROM runs WHERE id = $1", [runId]);
  };
  await naiveDeleteRun(oldRun);

  const liveRowsLeft = await countRows("SELECT count(*) AS n FROM run_artifacts WHERE run_id = $1", [liveRun]);
  check(
    "T2b.1",
    !(await exists(shared)) && liveRowsLeft === 1,
    "the naive per-row delete removes a blob the live run still points at — its row survives, its bytes do not; T2 has teeth"
  );
  await db.query("DELETE FROM runs WHERE id = $1", [liveRun]);
}

// ---------------------------------------------------------------------------
// T3 — a dry run predicts the real one and changes nothing
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const keys = [
    await putArtifact(orgId, runId, "T3 one"),
    await putArtifact(orgId, runId, "T3 two"),
    await putArtifact(orgId, runId, "T3 three"),
  ];

  const dry = await deleteRun(db, storage, runId, { dryRun: true });
  let present = 0;
  for (const key of keys) {
    if (await exists(key)) present++;
  }
  check("T3.1", dry.done && dry.job.dryRun, "the dry run completes and is recorded as a dry run");
  check("T3.2", present === keys.length, `it deleted nothing (${present}/${keys.length} objects still stored)`);
  check(
    "T3.3",
    (await countRows("SELECT count(*) AS n FROM runs WHERE id = $1", [runId])) === 1,
    "the run row is still there"
  );

  const real = await deleteRun(db, storage, runId);
  check(
    "T3.4",
    real.job.objects === dry.job.objects && real.job.bytes === dry.job.bytes,
    `the real run removes exactly what the dry run predicted (${dry.job.objects} objects, ${dry.job.bytes} bytes)`
  );
}

// ---------------------------------------------------------------------------
// T4 — the 90-day sweep
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const ancient = await makeRun(orgId, repoId, daysAgo(200));
  const justOver = await makeRun(orgId, repoId, daysAgo(91));
  const justUnder = await makeRun(orgId, repoId, daysAgo(89));
  const ancientKey = await putArtifact(orgId, ancient, "T4 ancient");
  const justOverKey = await putArtifact(orgId, justOver, "T4 just over");
  const justUnderKey = await putArtifact(orgId, justUnder, "T4 just under");

  // A second org's old run, to prove the sweep is not org-scoped by accident.
  const otherOrg = await makeOrg();
  const otherRepo = await makeRepo(otherOrg);
  const otherOld = await makeRun(otherOrg, otherRepo, daysAgo(200));
  const otherKey = await putArtifact(otherOrg, otherOld, "T4 other org");

  const scoped = await sweepRetention(db, storage, { now: T0, orgId });
  check("T4.1", scoped.job.objects === 2, `${DEFAULT_RETENTION_DAYS}-day sweep took the two runs past the window (${scoped.job.objects} objects)`);
  check("T4.2", !(await exists(ancientKey)) && !(await exists(justOverKey)), "200 days and 91 days old are gone");
  check("T4.3", await exists(justUnderKey), "89 days old is kept — inside the window");
  check(
    "T4.4",
    (await countRows("SELECT count(*) AS n FROM runs WHERE id = $1", [justUnder])) === 1,
    "and its run row is intact"
  );
  check("T4.5", await exists(otherKey), "the other org's old run is untouched by an org-scoped sweep");

  const all = await sweepRetention(db, storage, { now: T0 });
  check("T4.6", !(await exists(otherKey)), "an unscoped sweep takes it too");
  check("T4.7", all.job.objects === 1, `and counts only what was left to take (${all.job.objects})`);
}

// ---------------------------------------------------------------------------
// T5 — resumable across invocations, and idempotent afterwards
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  for (let i = 0; i < 5; i++) {
    await putArtifact(orgId, runId, `T5 artifact ${i}`);
  }

  const jobId = await enqueueDeletion(db, { scope: "run", targetId: runId });
  let calls = 0;
  let outcome = null;
  do {
    outcome = await runDeletionJob(db, storage, jobId, { batchSize: 1 });
    calls++;
  } while (!outcome.done && calls < 20);

  check("T5.1", outcome.done, `the job finished after ${calls} bounded invocations`);
  check("T5.2", calls > 1, "it genuinely took more than one — the batch size was respected");
  check("T5.3", outcome.job.objects === 5, `counts accumulated across them (${outcome.job.objects} objects)`);
  check("T5.4", outcome.job.claims === calls, `the receipt records ${outcome.job.claims} claims, not ${calls} failures`);

  const again = await runDeletionJob(db, storage, jobId, { batchSize: 1 });
  check(
    "T5.5",
    !again.claimed && again.done && again.job.objects === 5,
    `running a finished job again does nothing and does not double the count (${again.job.objects})`
  );
}

// ---------------------------------------------------------------------------
// T6 — partial failure keeps its progress and resumes
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  for (let i = 0; i < 4; i++) {
    await putArtifact(orgId, runId, `T6 artifact ${i}`);
  }

  // A storage port that fails on the third object, the way a network blip or a
  // revoked credential would.
  let deletes = 0;
  const flaky = {
    ...storage,
    async delete(key) {
      deletes++;
      if (deletes === 3) {
        throw new Error("storage unavailable");
      }
      return storage.delete(key);
    },
  };

  const jobId = await enqueueDeletion(db, { scope: "run", targetId: runId });
  const failed = await runDeletionJob(db, flaky, jobId);
  const leftAfterFailure = await countRows("SELECT count(*) AS n FROM run_artifacts WHERE run_id = $1", [runId]);

  check("T6.1", failed.job.state === "failed", `a storage failure fails the job (${failed.job.state})`);
  check("T6.2", failed.job.objects === 2, `the two objects that did go are counted (${failed.job.objects})`);
  check("T6.3", leftAfterFailure === 2, `the rows for what did not go are still there (${leftAfterFailure}) — nothing is orphaned`);
  check(
    "T6.4",
    (await countRows("SELECT count(*) AS n FROM runs WHERE id = $1", [runId])) === 1,
    "and the run row is still there, so the work is still findable"
  );
  check("T6.5", failed.job.lastError.includes("storage unavailable"), `the receipt says why (${failed.job.lastError.slice(0, 40)})`);

  const resumed = await runDeletionJob(db, storage, jobId);
  check("T6.6", resumed.done, "a retry against working storage finishes the job");
  check("T6.7", resumed.job.objects === 4, `total across both attempts is 4, not 6 — no double count (${resumed.job.objects})`);
  check(
    "T6.8",
    (await countRows("SELECT count(*) AS n FROM runs WHERE id = $1", [runId])) === 0,
    "the run row goes only once every one of its objects has"
  );
}

// ---------------------------------------------------------------------------
// T7 — erasing an organization
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const tracked = await putArtifact(orgId, runId, "T7 tracked");
  // An abandoned upload: bytes under the org prefix that no row records. A
  // walk of run_artifacts would never find it; the prefix delete must.
  const orphan = blobKey(orgId, sha256("T7 abandoned"), "png");
  await storage.put(orphan, bytes("T7 abandoned"));

  await db.query("INSERT INTO api_keys (id, org_id, key_hash) VALUES ($1, $2, $3)", [
    randomUUID(),
    orgId,
    sha256("T7 key"),
  ]);
  await db.query(
    `INSERT INTO usage_events (org_id, model, pass, status, cost_microdollars, credits_charged)
     VALUES ($1, 'claude-sonnet-4-5', 'analysis', 'charged', 4200, 5)`,
    [orgId]
  );
  await db.query(
    `INSERT INTO credit_grants (id, org_id, kind, credits, remaining_credits, expires_at, price_microdollars)
     VALUES ($1, $2, 'pack_purchase', 500, 495, $3, 29000000)`,
    [randomUUID(), orgId, new Date(T0.getTime() + 3.15e10).toISOString()]
  );

  // A neighbour, to prove the prefix delete does not reach past its own org.
  const neighbourOrg = await makeOrg();
  const neighbourRepo = await makeRepo(neighbourOrg);
  const neighbourRun = await makeRun(neighbourOrg, neighbourRepo);
  const neighbourKey = await putArtifact(neighbourOrg, neighbourRun, "T7 neighbour");

  const outcome = await deleteOrg(db, storage, orgId);
  const receipt = await getDeletionJob(db, outcome.job.id);
  const financials = (
    await db.query("SELECT financials FROM deletion_jobs WHERE id = $1", [outcome.job.id])
  ).rows[0].financials;
  const money = typeof financials === "string" ? JSON.parse(financials) : financials;

  check("T7.1", !(await exists(tracked)) && !(await exists(orphan)), "every object under the org prefix is gone, recorded or not");
  check("T7.2", outcome.job.objects === 2, `both are counted (${outcome.job.objects})`);
  check(
    "T7.3",
    (await countRows("SELECT count(*) AS n FROM orgs WHERE id = $1", [orgId])) === 0 &&
      (await countRows("SELECT count(*) AS n FROM runs WHERE org_id = $1", [orgId])) === 0 &&
      (await countRows("SELECT count(*) AS n FROM api_keys WHERE org_id = $1", [orgId])) === 0,
    "the org row and everything cascading from it are gone"
  );
  check("T7.4", receipt !== null && receipt.state === "done", "the receipt survives the org it describes");
  check(
    "T7.5",
    money?.providerCostMicrodollars === 4200 && money?.packRevenueMicrodollars === 29000000,
    `and carries the money the cascade destroyed ($${((money?.packRevenueMicrodollars ?? 0) / 1e6).toFixed(2)} revenue, $${((money?.providerCostMicrodollars ?? 0) / 1e6).toFixed(4)} provider cost)`
  );
  check("T7.6", await exists(neighbourKey), "the neighbouring org's objects are untouched");
  check(
    "T7.7",
    (await countRows("SELECT count(*) AS n FROM runs WHERE org_id = $1", [neighbourOrg])) === 1,
    "and so are its rows"
  );
}

// ---------------------------------------------------------------------------
// T8 — one job, one worker
// ---------------------------------------------------------------------------
{
  const orgId = await makeOrg();
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  await putArtifact(orgId, runId, "T8 artifact");

  const jobId = await enqueueDeletion(db, { scope: "run", targetId: runId });
  const [a, b] = await Promise.all([
    runDeletionJob(db, storage, jobId),
    runDeletionJob(db, storage, jobId),
  ]);
  const claimedCount = [a, b].filter((r) => r.claimed).length;
  check("T8.1", claimedCount === 1, `two concurrent workers, ${claimedCount} claim`);

  const finished = await getDeletionJob(db, jobId);
  check("T8.2", finished.objects === 1, `the object is counted once (${finished.objects})`);

  // A worker that died holding the claim must not park the job forever.
  const stalled = await enqueueDeletion(db, { scope: "run", targetId: await makeRun(orgId, repoId) });
  await db.query("UPDATE deletion_jobs SET state = 'running', claimed_at = $2 WHERE id = $1", [
    stalled,
    new Date(T0.getTime() - (CLAIM_TTL_SECONDS + 60) * 1000).toISOString(),
  ]);
  const takenOver = await runDeletionJob(db, storage, stalled, { now: T0 });
  check("T8.3", takenOver.claimed && takenOver.done, "a claim older than the TTL can be taken over");

  const held = await enqueueDeletion(db, { scope: "run", targetId: await makeRun(orgId, repoId) });
  await db.query("UPDATE deletion_jobs SET state = 'running', claimed_at = $2 WHERE id = $1", [
    held,
    new Date(T0.getTime() - 60 * 1000).toISOString(),
  ]);
  const refused = await runDeletionJob(db, storage, held, { now: T0 });
  check("T8.4", !refused.claimed, "a fresh claim is not");
}

// ---------------------------------------------------------------------------
// T9 — 20 separate processes, one job (real Postgres only)
// ---------------------------------------------------------------------------
//
// The claim above shares one connection pool. This is the serverless case: 20
// instances, 20 connections, one job row. The wall-clock barrier is the same
// device `migrations` M7 and `budgetAlerts` B4 use — spawning 20 processes
// together does not make them run together.
if (REAL_PG) {
  const tmp = await mkdtemp(path.join(HERE, ".tmp-retention-cold-"));
  const { spawn } = await import("node:child_process");
  try {
    const BARRIER_MS = 4000;
    const BARRIER =
      `const late = Date.now() - Number(process.env.BARRIER_AT);\n` +
      `console.error("barrier " + late);\n` +
      `await new Promise((r) => setTimeout(r, Math.max(0, -late)));\n`;

    const race = (file, env) => {
      const barrierAt = Date.now() + BARRIER_MS;
      return Promise.all(
        Array.from(
          { length: 20 },
          () =>
            new Promise((resolve) => {
              const child = spawn(process.execPath, [file], {
                env: { ...process.env, ...env, BARRIER_AT: String(barrierAt) },
              });
              let out = "";
              let err = "";
              child.stdout.on("data", (d) => (out += d));
              child.stderr.on("data", (d) => (err += d));
              child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
            })
        )
      );
    };
    const atBarrier = (results) =>
      results.filter((r) => Number(/barrier (-?\d+)/.exec(r.err)?.[1] ?? 0) < 0).length;

    const storageEnv = { NORMA_STORAGE_DIR: path.join(STORAGE_ROOT, "blobs") };

    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { createStorage } = await import(${JSON.stringify(path.join(DIST, "storage.js"))});\n` +
        `const { runDeletionJob } = await import(${JSON.stringify(path.join(DIST, "retention.js"))});\n` +
        `const db = await createDb();\n` +
        `await db.query("SELECT 1");\n` +
        BARRIER +
        `const storage = await createStorage();\n` +
        `const r = await runDeletionJob(db, storage, process.env.JOB_ID);\n` +
        `console.log(JSON.stringify({ claimed: r.claimed, objects: r.job.objects }));\n` +
        `await db.close();\n`
    );

    const orgId = await makeOrg();
    const repoId = await makeRepo(orgId);
    const runId = await makeRun(orgId, repoId);
    const keys = [];
    for (let i = 0; i < 3; i++) {
      keys.push(await putArtifact(orgId, runId, `T9 artifact ${i}`));
    }
    const jobId = await enqueueDeletion(db, { scope: "run", targetId: runId });

    const results = await race(worker, { ...storageEnv, JOB_ID: jobId });
    const ready = atBarrier(results);
    const broke = results.filter((r) => r.code !== 0);
    const claimed = results.filter((r) => {
      try {
        return JSON.parse(r.out).claimed;
      } catch {
        return false;
      }
    }).length;
    const job = await getDeletionJob(db, jobId);

    check("T9.0", ready === 20, `all 20 processes were waiting when the barrier opened (${ready}/20)`);
    check(
      "T9.1",
      broke.length === 0,
      `20 separate processes ran one deletion job, ${broke.length} failed` +
        (broke.length ? ` — ${broke[0].err.split("\n").filter(Boolean).pop()}` : "")
    );
    check("T9.2", claimed === 1, `exactly one of them claimed it (${claimed})`);
    check("T9.3", job.objects === 3, `the three objects are counted once each (${job.objects})`);
    let leftover = 0;
    for (const key of keys) {
      if (await exists(key)) leftover++;
    }
    check("T9.4", leftover === 0, `and every one is gone from storage (${leftover} left)`);

    // T9b — the counter-test. Same 20 processes, no claim: just find this
    // run's artifacts and delete them. Without the claim the work is done by
    // more than one worker, which is how a receipt learns to lie.
    const oldWorker = path.join(tmp, "old-worker.mjs");
    await writeFile(
      oldWorker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { createStorage } = await import(${JSON.stringify(path.join(DIST, "storage.js"))});\n` +
        `const db = await createDb();\n` +
        `await db.query("SELECT 1");\n` +
        BARRIER +
        `const storage = await createStorage();\n` +
        `const rows = (await db.query("SELECT id, storage_key FROM run_artifacts WHERE run_id = $1", [process.env.RUN_ID])).rows;\n` +
        `let objects = 0;\n` +
        `for (const row of rows) {\n` +
        `  await storage.delete(row.storage_key);\n` +
        `  await db.query("DELETE FROM run_artifacts WHERE id = $1", [row.id]);\n` +
        `  objects++;\n` +
        `}\n` +
        `console.log(JSON.stringify({ objects }));\n` +
        `await db.close();\n`
    );

    const secondRun = await makeRun(orgId, repoId);
    for (let i = 0; i < 3; i++) {
      await putArtifact(orgId, secondRun, `T9b artifact ${i}`);
    }
    const oldResults = await race(oldWorker, { ...storageEnv, RUN_ID: secondRun });
    const oldReady = atBarrier(oldResults);
    const workers = oldResults.filter((r) => {
      try {
        return JSON.parse(r.out).objects > 0;
      } catch {
        return false;
      }
    }).length;
    const reported = oldResults.reduce((n, r) => {
      try {
        return n + JSON.parse(r.out).objects;
      } catch {
        return n;
      }
    }, 0);

    check("T9b.0", oldReady === 20, `the 20 control processes all reached the barrier (${oldReady}/20)`);
    check(
      "T9b.1",
      workers > 1,
      `unclaimed, ${workers} of 20 processes deleted the same run and between them reported ${reported} objects for 3 — T9 has teeth`
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await rm(STORAGE_ROOT, { recursive: true, force: true });
await db.close();

if (!REAL_PG) {
  console.log(
    "\n⚠️  T9/T9b were SKIPPED — 20 separate processes contending for one job\n" +
      "   need a shared server; on PGlite each process gets its own database.\n" +
      "   Close it with: DATABASE_URL=\"$(scripts/test-db.sh start)\" npm test"
  );
}

console.log(failures === 0 ? "\nretention: all checks passed" : `\nretention: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
