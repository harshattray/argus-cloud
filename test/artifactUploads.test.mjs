// Artifact upload constraints — PATHWAYS.md Pathway 2 items 4-6; migration 015.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/artifactUploads.test.mjs
//
// Checks are A1-A9. These are database constraints rather than application
// code, and the reason to test them is that the application is *not* the last
// line of defence here: once a presigned URL is issued the app is out of the
// byte path, so the commit-time comparison is the only thing standing between
// a lying client and a run that reports a size nobody verified.
//
// A2b is a counter-test in the sense of CLAUDE.md rule 3. A constraint that has
// only ever been satisfied is indistinguishable from no constraint at all, so
// A2b builds the same table *without* the guard, feeds it the same dishonest
// row, and shows it sails through. If A2 ever stops having teeth, A2b is what
// says so.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/** Runs `fn` and reports whether the database refused it. */
async function rejected(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return String(err?.message ?? err);
  }
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

async function makeOrg() {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, "art-" + id.slice(0, 8)]);
  return id;
}
async function makeRepo(orgId) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, "repo-" + id.slice(0, 8)]);
  return id;
}
async function makeRun(orgId, repoId) {
  const id = randomUUID();
  await db.query("INSERT INTO runs (id, org_id, repo_id, summary) VALUES ($1, $2, $3, $4)", [
    id,
    orgId,
    repoId,
    JSON.stringify({ frames: [] }),
  ]);
  return id;
}

/** Inserts an artifact row. Every column the constraints care about is explicit. */
function insertArtifact(orgId, runId, over = {}) {
  const row = {
    id: randomUUID(),
    frame: "home",
    kind: "build",
    storage_key: `org/${orgId}/blob/${randomUUID().replace(/-/g, "")}.png`,
    sha256: "",
    bytes: 0,
    declared_bytes: 0,
    state: "pending",
    ...over,
  };
  return db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [row.id, orgId, runId, row.frame, row.kind, row.storage_key, row.sha256, row.bytes, row.declared_bytes, row.state]
  );
}

const orgId = await makeOrg();
const repoId = await makeRepo(orgId);
const runId = await makeRun(orgId, repoId);

// ---------------------------------------------------------------------------
// A1 — the declaration is recorded separately from the delivery
// ---------------------------------------------------------------------------
await insertArtifact(orgId, runId, { frame: "a1", declared_bytes: 4096, bytes: 0, state: "pending" });
const a1 = await db.query("SELECT declared_bytes, bytes FROM run_artifacts WHERE run_id = $1 AND frame = 'a1'", [runId]);
check(
  "A1",
  Number(a1.rows[0].declared_bytes) === 4096 && Number(a1.rows[0].bytes) === 0,
  "a pending artifact holds what was declared (4096) and nothing delivered yet (0)"
);

// ---------------------------------------------------------------------------
// A2 — a committed artifact cannot weigh something other than it declared
// ---------------------------------------------------------------------------
//
// The lying client: declares 1 KB to pass the quota check, uploads 200 MB.
const a2 = await rejected(() =>
  insertArtifact(orgId, runId, { frame: "a2", declared_bytes: 1024, bytes: 200_000_000, state: "committed" })
);
check("A2", a2 !== null, `committing 200MB against a 1KB declaration is refused — ${a2 ? "rejected" : "ACCEPTED"}`);

// A2b — the counter-test. Same row, same database, no constraint.
await db.exec(`CREATE TEMP TABLE naive_artifacts (
  id TEXT PRIMARY KEY, bytes BIGINT NOT NULL, declared_bytes BIGINT NOT NULL, state TEXT NOT NULL
)`);
const a2b = await rejected(() =>
  db.query("INSERT INTO naive_artifacts (id, bytes, declared_bytes, state) VALUES ($1, 200000000, 1024, 'committed')", [
    randomUUID(),
  ])
);
check(
  "A2b",
  a2b === null,
  "without the constraint the identical dishonest row is accepted — A2 is doing the work, not the insert"
);

// ---------------------------------------------------------------------------
// A3 — an honest commit is allowed
// ---------------------------------------------------------------------------
const a3 = await rejected(() =>
  insertArtifact(orgId, runId, { frame: "a3", declared_bytes: 8192, bytes: 8192, state: "committed" })
);
check("A3", a3 === null, "a commit whose delivery matches its declaration is accepted");

// ---------------------------------------------------------------------------
// A4 — one artifact of each kind per frame per run
// ---------------------------------------------------------------------------
await insertArtifact(orgId, runId, { frame: "a4", kind: "build", declared_bytes: 10 });
const a4 = await rejected(() => insertArtifact(orgId, runId, { frame: "a4", kind: "build", declared_bytes: 999 }));
check("A4", a4 !== null, "declaring the same frame's build artifact twice in one run is refused");

// A4b — the same frame's *other* kinds are still fine. The rule is one per
// (run, frame, kind), not one per frame.
const a4b = await rejected(async () => {
  await insertArtifact(orgId, runId, { frame: "a4", kind: "diff", declared_bytes: 10 });
  await insertArtifact(orgId, runId, { frame: "a4", kind: "reference", declared_bytes: 10 });
});
check("A4b", a4b === null, "build, diff and reference for one frame coexist — the rule is per kind");

// ---------------------------------------------------------------------------
// A5 — deduplication survives. Two runs may point at one object.
// ---------------------------------------------------------------------------
//
// This is the rule migration 013 built the whole deletion path around: an
// unchanged baseline across 50 runs is stored once. A uniqueness rule on
// storage_key would have quietly destroyed it, which is why A5 exists next to
// A4 rather than being assumed.
const runId2 = await makeRun(orgId, repoId);
const sharedKey = `org/${orgId}/blob/${randomUUID().replace(/-/g, "")}.png`;
const a5 = await rejected(async () => {
  await insertArtifact(orgId, runId, { frame: "a5", kind: "reference", storage_key: sharedKey, declared_bytes: 64 });
  await insertArtifact(orgId, runId2, { frame: "a5", kind: "reference", storage_key: sharedKey, declared_bytes: 64 });
});
check("A5", a5 === null, "two runs sharing one deduplicated object are still allowed");

// ---------------------------------------------------------------------------
// A6 — kind and state are constrained, not merely commented
// ---------------------------------------------------------------------------
const a6kind = await rejected(() => insertArtifact(orgId, runId, { frame: "a6", kind: "screenshot" }));
const a6state = await rejected(() => insertArtifact(orgId, runId, { frame: "a6s", state: "uploaded" }));
check("A6", a6kind !== null && a6state !== null, "an unknown kind and an unknown state are both refused");

// A6b — the two kinds Phase G adds are accepted.
const a6b = await rejected(async () => {
  await insertArtifact(orgId, runId, { frame: "", kind: "report", declared_bytes: 10 });
  await insertArtifact(orgId, runId, { frame: "", kind: "regions", declared_bytes: 10 });
});
check("A6b", a6b === null, "report and regions are valid kinds");

// ---------------------------------------------------------------------------
// A7 — org_storage keeps promised bytes apart from present bytes
// ---------------------------------------------------------------------------
await db.query("INSERT INTO org_storage (org_id, bytes_stored, bytes_reserved) VALUES ($1, 1000, 250)", [orgId]);
const a7 = await db.query("SELECT bytes_stored, bytes_reserved, runs_today, runs_day FROM org_storage WHERE org_id = $1", [
  orgId,
]);
check(
  "A7",
  Number(a7.rows[0].bytes_stored) === 1000 && Number(a7.rows[0].bytes_reserved) === 250,
  "stored and reserved bytes are tracked separately, so an in-flight upload cannot be double-counted"
);

// A7b — the counters cannot go negative. A release that ran twice would
// otherwise leave an org with a negative reservation and unlimited quota.
const a7b = await rejected(() =>
  db.query("UPDATE org_storage SET bytes_reserved = bytes_reserved - 500 WHERE org_id = $1", [orgId])
);
check("A7b", a7b !== null, "releasing more than was reserved is refused rather than wrapping negative");

// ---------------------------------------------------------------------------
// A8 — the daily counter carries the day it refers to
// ---------------------------------------------------------------------------
//
// So the reset is arithmetic, not a scheduled job. A job that does not run
// leaves an org permanently at yesterday's limit.
const a8 = await db.query(
  "SELECT (runs_day = CURRENT_DATE) AS is_today FROM org_storage WHERE org_id = $1",
  [orgId]
);
check("A8", a8.rows[0].is_today === true, "a fresh counter row is stamped with today, so a stale day reads as zero");

// ---------------------------------------------------------------------------
// A9 — deleting an org takes its storage accounting with it
// ---------------------------------------------------------------------------
const doomed = await makeOrg();
await db.query("INSERT INTO org_storage (org_id, bytes_stored) VALUES ($1, 42)", [doomed]);
await db.query("DELETE FROM orgs WHERE id = $1", [doomed]);
const a9 = await db.query("SELECT count(*)::int AS n FROM org_storage WHERE org_id = $1", [doomed]);
check("A9", a9.rows[0].n === 0, "org_storage cascades on org deletion — no orphaned quota rows");

await db.query("DELETE FROM orgs WHERE id = $1", [orgId]);
await db.close();

console.log(failures === 0 ? "\nartifactUploads: all checks passed" : `\nartifactUploads: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
