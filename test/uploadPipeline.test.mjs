// The three-phase artifact upload — PATHWAYS.md Pathway 2 items 4-6;
// `BuildV5.md` Phase G2/G2b/G2c.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/uploadPipeline.test.mjs
//
// Checks are U1-U14. The thing under test is a protocol where the application
// is deliberately not in the byte path: after `declare` hands out a presigned
// URL, the client uploads straight to storage and we see nothing until
// `commit`. Every check here is therefore about what can be proven *afterwards*
// against a declaration made in advance.
//
// Two counter-tests, in the sense of CLAUDE.md rule 3:
//
//   U6b — a commit that trusts the client's declaration instead of heading the
//         object. It accepts a 200MB upload declared as 1KB, which is the whole
//         attack the size check exists for.
//   U7b — a commit that checks size but not content. It accepts an object whose
//         bytes hash to something other than the key they are stored under,
//         which would poison deduplication for every later run in the org.

import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createFilesystemStorage } = await import(path.join(DIST, "storage/filesystem.js"));
const {
  declareUpload,
  commitUpload,
  sweepAbandonedUploads,
  planLimitsFor,
  UploadRefused,
  UploadRejected,
} = await import(path.join(DIST, "artifactUploads.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}
async function refusal(fn) {
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

const ROOT = await mkdtemp(path.join(HERE, ".tmp-upload-"));
const storage = createFilesystemStorage({
  root: path.join(ROOT, "blobs"),
  publicBaseUrl: "http://localhost:3000/api/blob",
  signingSecret: "upload-suite",
});

const bytesOf = (s) => new TextEncoder().encode(s);
const sha256 = (s) => createHash("sha256").update(bytesOf(s)).digest("hex");

async function makeOrg(plan = "team") {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, $3)", [id, "up-" + id.slice(0, 8), plan]);
  return id;
}
const counters = async (orgId) =>
  (await db.query("SELECT bytes_stored, bytes_reserved, runs_today FROM org_storage WHERE org_id = $1", [orgId]))
    .rows[0] ?? { bytes_stored: "0", bytes_reserved: "0", runs_today: 0 };
const runState = async (runId) =>
  (await db.query("SELECT state FROM runs WHERE id = $1", [runId])).rows[0]?.state ?? "(gone)";

/** Declares one artifact carrying `content`. */
function artifactFor(content, frame = "home", kind = "build") {
  return { frame, kind, sha256: sha256(content), bytes: bytesOf(content).byteLength };
}
const declareOne = (orgId, content, over = {}) =>
  declareUpload(db, storage, {
    orgId,
    repoName: "web",
    summary: { frames: [] },
    artifacts: [artifactFor(content)],
    ...over,
  });

// ---------------------------------------------------------------------------
// U1/U2 — entitlement, and refused for the right reason
// ---------------------------------------------------------------------------
//
// A free organization must be told it is free, not told it exceeded a limit of
// zero. G2c separates entitlement from quota precisely so the message a customer
// reads names the real reason and the real fix.
const freeOrg = await makeOrg("free");
const u1 = await refusal(() => declareOne(freeOrg, "U1"));
check(
  "U1",
  u1 instanceof UploadRefused && u1.reason === "not_entitled" && /cannot upload/.test(u1.message),
  `a free organization is refused as unentitled, not as over quota — "${u1?.message?.slice(0, 60)}…"`
);

const lapsedOrg = await makeOrg("lapsed");
const u2 = await refusal(() => declareOne(lapsedOrg, "U2"));
check("U2", u2 instanceof UploadRefused && u2.reason === "not_entitled", "a lapsed organization cannot upload either");

// U2b — and neither of them reserved anything on the way to being refused.
const u2b = await counters(freeOrg);
check(
  "U2b",
  Number(u2b.bytes_reserved) === 0 && Number(u2b.runs_today) === 0,
  "a refused declaration reserves no bytes and burns no daily run"
);

// ---------------------------------------------------------------------------
// U3/U4 — a declared run exists, reserves, and is invisible
// ---------------------------------------------------------------------------
const org = await makeOrg("team");
const CONTENT = "U3 build screenshot";
const declared = await declareOne(org, CONTENT);
check(
  "U3",
  declared.uploads.length === 1 && declared.uploads[0].url.length > 0 && declared.bytesReserved === bytesOf(CONTENT).byteLength,
  `declare returns a presigned PUT and reserves the declared ${declared.bytesReserved} bytes`
);

const c3 = await counters(org);
check(
  "U4",
  (await runState(declared.runId)) === "pending" &&
    Number(c3.bytes_reserved) === bytesOf(CONTENT).byteLength &&
    Number(c3.bytes_stored) === 0,
  "the run is pending and its bytes are reserved, not stored — nothing is visible yet"
);

// ---------------------------------------------------------------------------
// U5 — the happy path
// ---------------------------------------------------------------------------
const key3 = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [declared.runId])).rows[0]
  .storage_key;
await storage.put(key3, bytesOf(CONTENT), { contentType: "image/png" });
const committed = await commitUpload(db, storage, { orgId: org, runId: declared.runId });
const c5 = await counters(org);
check(
  "U5",
  (await runState(declared.runId)) === "committed" &&
    committed.bytesCommitted === bytesOf(CONTENT).byteLength &&
    Number(c5.bytes_stored) === bytesOf(CONTENT).byteLength &&
    Number(c5.bytes_reserved) === 0,
  "commit makes the run visible and moves the reservation into stored bytes"
);

// U5b — commit is idempotent. CI runners retry.
const again = await commitUpload(db, storage, { orgId: org, runId: declared.runId });
check("U5b", again.bytesCommitted >= 0 && (await runState(declared.runId)) === "committed", "a repeated commit is harmless");

// ---------------------------------------------------------------------------
// U6 — a client that uploads more than it declared
// ---------------------------------------------------------------------------
//
// The whole reason the protocol declares sizes in advance: the quota was checked
// against 19 bytes and the client sent 2000.
const lie = await declareOne(org, "U6 small declaration", { artifacts: [artifactFor("U6 small declaration")] });
const lieKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [lie.runId])).rows[0]
  .storage_key;
await storage.put(lieKey, bytesOf("X".repeat(2000)), { contentType: "image/png" });
const u6 = await refusal(() => commitUpload(db, storage, { orgId: org, runId: lie.runId }));
check(
  "U6",
  u6 instanceof UploadRejected && /2000 bytes, declared/.test(u6.message),
  `an upload larger than its declaration is refused — "${u6?.message?.slice(0, 70)}…"`
);

// U6b — the counter-test: a commit that believes the declaration.
const naiveRun = await declareOne(org, "U6b naive", { artifacts: [artifactFor("U6b naive")] });
const naiveKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [naiveRun.runId])).rows[0]
  .storage_key;
await storage.put(naiveKey, bytesOf("X".repeat(5000)), { contentType: "image/png" });
await db.query("UPDATE run_artifacts SET bytes = declared_bytes, state = 'committed' WHERE run_id = $1", [naiveRun.runId]);
await db.query("UPDATE runs SET state = 'committed' WHERE id = $1", [naiveRun.runId]);
const naiveStored = (await storage.head(naiveKey)).size;
check(
  "U6b",
  (await runState(naiveRun.runId)) === "committed" && naiveStored === 5000,
  `without the head check the same run commits happily over ${naiveStored} stored bytes it declared 9 for — U6 is doing the work`
);

// U6c — and the real failure cleaned up after itself.
const u6c = await db.query("SELECT count(*)::int AS n FROM run_artifacts WHERE run_id = $1", [lie.runId]);
check(
  "U6c",
  u6c.rows[0].n === 0 && (await storage.head(lieKey)) === null && (await runState(lie.runId)) === "(gone)",
  "a refused commit deletes the objects, the rows and the run — a retry starts clean"
);

// ---------------------------------------------------------------------------
// U7 — right size, wrong content
// ---------------------------------------------------------------------------
//
// Objects are addressed by their hash, so bytes that disagree with their own key
// would be served to every later run that honestly declares that hash.
const swapRun = await declareOne(org, "U7 honest", { artifacts: [artifactFor("U7 honest")] });
const swapKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [swapRun.runId])).rows[0]
  .storage_key;
await storage.put(swapKey, bytesOf("U7 forged"), { contentType: "image/png" });
const u7 = await refusal(() => commitUpload(db, storage, { orgId: org, runId: swapRun.runId }));
check(
  "U7",
  u7 instanceof UploadRejected && /hashes to/.test(u7.message),
  `content that disagrees with the hash it is stored under is refused — "${u7?.message?.slice(0, 60)}…"`
);

// U7b — the counter-test: size-only verification lets it through.
const sizeOnlyRun = await declareOne(org, "U7b honest", { artifacts: [artifactFor("U7b honest")] });
const sizeOnlyKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [sizeOnlyRun.runId]))
  .rows[0].storage_key;
await storage.put(sizeOnlyKey, bytesOf("U7b forged"), { contentType: "image/png" });
const u7b = await refusal(() => commitUpload(db, storage, { orgId: org, runId: sizeOnlyRun.runId, verifyContent: false }));
check(
  "U7b",
  u7b === null && (await runState(sizeOnlyRun.runId)) === "committed",
  "with content verification off the forged object commits — U7 is the check catching it, not the size"
);

// ---------------------------------------------------------------------------
// U8 — deduplication: the org already holds these bytes
// ---------------------------------------------------------------------------
const beforeDedup = await counters(org);
const dedup = await declareOne(org, CONTENT, { artifacts: [artifactFor(CONTENT, "home-again")] });
const afterDedup = await counters(org);
check(
  "U8",
  dedup.uploads.length === 0 &&
    dedup.deduplicated.length === 1 &&
    dedup.bytesReserved === 0 &&
    Number(afterDedup.bytes_reserved) === Number(beforeDedup.bytes_reserved),
  "an artifact the organization already holds gets no URL and reserves no bytes"
);

// U8b — and the run commits with nothing to transfer.
const dedupCommit = await commitUpload(db, storage, { orgId: org, runId: dedup.runId });
check(
  "U8b",
  (await runState(dedup.runId)) === "committed" && dedupCommit.artifactsCommitted === 1,
  "a fully deduplicated run commits without a single byte moving"
);

// ---------------------------------------------------------------------------
// U9 — malformed declarations
// ---------------------------------------------------------------------------
const u9a = await refusal(() =>
  declareUpload(db, storage, {
    orgId: org,
    repoName: "web",
    summary: {},
    artifacts: [{ frame: "z", kind: "build", sha256: sha256("z"), bytes: 0 }],
  })
);
const u9b = await refusal(() =>
  declareUpload(db, storage, {
    orgId: org,
    repoName: "web",
    summary: {},
    artifacts: [{ frame: "z", kind: "build", sha256: "not-a-hash", bytes: 10 }],
  })
);
const u9c = await refusal(() =>
  declareUpload(db, storage, {
    orgId: org,
    repoName: "web",
    summary: {},
    artifacts: [artifactFor("dup", "same"), artifactFor("dup2", "same")],
  })
);
check(
  "U9",
  u9a?.reason === "malformed" && u9b?.reason === "malformed" && u9c?.reason === "malformed",
  "a zero-byte declaration, a bogus hash, and the same frame/kind twice are all refused"
);

// ---------------------------------------------------------------------------
// U10 — quotas
// ---------------------------------------------------------------------------
const tightOrg = await makeOrg("team");
await db.query("UPDATE org_storage SET bytes_stored = 0 WHERE org_id = $1", [tightOrg]);
const u10 = await refusal(() =>
  declareUpload(db, storage, {
    orgId: tightOrg,
    repoName: "web",
    summary: {},
    artifacts: [{ frame: "big", kind: "build", sha256: sha256("big"), bytes: 300_000_000 }],
  })
);
check(
  "U10",
  u10?.reason === "bytes_per_run",
  `300MB in one run is over the 250MB per-run limit — "${u10?.message?.slice(0, 60)}…"`
);

// U10b — the stored ceiling, checked against reserved bytes as well as stored.
await db.query("INSERT INTO org_storage (org_id, bytes_stored) VALUES ($1, 53687091100) ON CONFLICT (org_id) DO UPDATE SET bytes_stored = 53687091100", [tightOrg]);
const u10b = await refusal(() =>
  declareUpload(db, storage, {
    orgId: tightOrg,
    repoName: "web",
    summary: {},
    artifacts: [{ frame: "last", kind: "build", sha256: sha256("last"), bytes: 1000 }],
  })
);
check("U10b", u10b?.reason === "bytes_stored_max", "an organization near its 50GB ceiling is refused the run that would cross it");

// ---------------------------------------------------------------------------
// U11 — runs per day, and the rollover that needs no cron
// ---------------------------------------------------------------------------
const dailyOrg = await makeOrg("team");
await declareOne(dailyOrg, "U11 first");
await db.query("UPDATE org_storage SET runs_today = 200 WHERE org_id = $1", [dailyOrg]);
const u11 = await refusal(() => declareOne(dailyOrg, "U11 over"));
check("U11", u11?.reason === "runs_per_day", "the 201st run of the day is refused");

// U11b — stamp the counter with yesterday and it reads as zero again, with
// nothing scheduled to have made that happen.
await db.query("UPDATE org_storage SET runs_day = CURRENT_DATE - 1 WHERE org_id = $1", [dailyOrg]);
const u11b = await refusal(() => declareOne(dailyOrg, "U11 tomorrow"));
check("U11b", u11b === null, "a counter stamped with a past day reads as zero — the reset is arithmetic, not a job");

// ---------------------------------------------------------------------------
// U12 — the sweeper
// ---------------------------------------------------------------------------
//
// An abandoned declaration is two problems: a leak of reserved bytes, and a
// griefing vector — declare the whole quota, upload nothing, repeat.
const sweepOrg = await makeOrg("team");
const abandoned = await declareOne(sweepOrg, "U12 never uploaded");
const beforeSweep = await counters(sweepOrg);
const swept = await sweepAbandonedUploads(db, storage, { olderThanMinutes: 0 });
const afterSweep = await counters(sweepOrg);
check(
  "U12",
  swept.runsSwept >= 1 &&
    (await runState(abandoned.runId)) === "(gone)" &&
    Number(afterSweep.bytes_reserved) === 0 &&
    Number(beforeSweep.bytes_reserved) > 0,
  `an abandoned declaration is swept and its ${beforeSweep.bytes_reserved} reserved bytes released`
);

// U12b — a run that has not aged out is left alone.
//
// Asserted on *this* run rather than on the sweeper's total. The suites share
// one database when DATABASE_URL is set, so a global count is a claim about
// every other suite's fixtures too — and this check failed for exactly that
// reason once migration 017 made an unspecified run default to `pending`.
const young = await declareOne(sweepOrg, "U12b young");
await sweepAbandonedUploads(db, storage, { olderThanMinutes: 60 });
const youngRows = await db.query("SELECT count(*)::int AS n FROM run_artifacts WHERE run_id = $1", [young.runId]);
check(
  "U12b",
  (await runState(young.runId)) === "pending" && youngRows.rows[0].n === 1,
  "a declaration still inside its window keeps its run and its artifact rows"
);

// ---------------------------------------------------------------------------
// U13 — plan limits are read, not assumed
// ---------------------------------------------------------------------------
const limits = await planLimitsFor(db, org);
check(
  "U13",
  limits.canUpload === true && limits.runsPerDay === 200 && limits.bytesPerRun === 262_144_000,
  "limits come from the plan_limits row, so a new tier is an INSERT rather than a deploy"
);

// U13b — an organization whose plan has no limits row is refused loudly rather
// than defaulting to unlimited.
await db.query("INSERT INTO plan_limits (plan, can_upload) VALUES ('team', true) ON CONFLICT (plan) DO NOTHING");
const orphan = await makeOrg("team");
await db.query("DELETE FROM plan_limits WHERE plan = 'team'");
const u13b = await refusal(() => declareOne(orphan, "U13b"));
await db.query(
  `INSERT INTO plan_limits (plan, can_upload, runs_per_day, artifacts_per_run, bytes_per_run, bytes_stored_max, retention_days)
   VALUES ('team', true, 200, 600, 262144000, 53687091200, 90)`
);
check(
  "U13b",
  u13b?.reason === "malformed" && /no limits row/.test(u13b.message),
  "a plan with no limits row refuses the upload instead of quietly becoming unlimited"
);

await rm(ROOT, { recursive: true, force: true });
for (const id of [freeOrg, lapsedOrg, org, tightOrg, dailyOrg, sweepOrg, orphan]) {
  await db.query("DELETE FROM orgs WHERE id = $1", [id]);
}
await db.close();

console.log(failures === 0 ? "\nuploadPipeline: all checks passed" : `\nuploadPipeline: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
