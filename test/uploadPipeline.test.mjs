// The three-phase artifact upload — PATHWAYS.md Pathway 2 items 4-6;
// `BuildV5.md` Phase G2/G2b/G2c.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/uploadPipeline.test.mjs
//
// Checks are U1-U15, H1-H9 and V1-V3. The thing under test is a protocol where the application
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
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
  UploadRefused,
  UploadRejected,
} = await import(path.join(DIST, "artifactUploads.js"));
const { planLimitsFor } = await import(path.join(DIST, "plans.js"));
const { createApiKey, NotEntitled } = await import(path.join(DIST, "apiKeys.js"));
const { declareResponse, commitResponse } = await import(path.join(DIST, "uploadHttp.js"));
const { buildEnrichment } = await import(path.join(DIST, "enrichment.js"));
const { creditsForPass, hardMaxCostMicrodollars, OPERATIONS, MARGIN_FLOOR, CREDIT_REVENUE_FLOOR_MICRODOLLARS } =
  await import(path.join(DIST, "providerBudget.js"));

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

// ---------------------------------------------------------------------------
// U14 — the credential does not exist to be leaked
// ---------------------------------------------------------------------------
//
// G2c's first line of defence, and the one that is easy to argue away: the key
// would be refused on every request anyway, so why refuse to mint it? Because a
// key that was never minted cannot sit in a GitHub Actions secret after a plan
// lapses, cannot be copied into a laptop dotfile, and cannot turn up in a log a
// year from now. Refusing at creation removes the object, not just its power.
const u14 = await refusal(() => createApiKey(db, freeOrg, { kind: "upload", label: "U14" }));
check(
  "U14",
  u14 instanceof NotEntitled && u14.plan === "free",
  `a free organization cannot be issued an upload key at all — "${u14?.message?.slice(0, 55)}…"`
);

// U14b — and nothing was written. A refusal that left the row behind would be
// worse than no check, because the key would exist with no plaintext ever shown.
const u14b = await db.query("SELECT count(*)::int AS n FROM api_keys WHERE org_id = $1", [freeOrg]);
check("U14b", u14b.rows[0].n === 0, "the refused key left no row behind");

// U14c — an entitled organization still gets one.
const issued = await createApiKey(db, org, { kind: "upload", label: "U14c" });
check("U14c", issued.plaintext.startsWith("nsk_"), "a team organization is issued an upload key as before");

// U14d — the two checks are independent. A key minted while entitled stops
// working the moment the plan changes, which is why the request path asks
// again rather than trusting the key's existence.
await db.query("UPDATE orgs SET plan = 'lapsed' WHERE id = $1", [org]);
const u14d = await refusal(() => declareOne(org, "U14d after lapse"));
await db.query("UPDATE orgs SET plan = 'team' WHERE id = $1", [org]);
check(
  "U14d",
  u14d instanceof UploadRefused && u14d.reason === "not_entitled",
  "a key minted while entitled is refused once the plan lapses — key existence is never authorization"
);

// ---------------------------------------------------------------------------
// U15 — the plan changes between declare and commit
// ---------------------------------------------------------------------------
//
// The case that looked safe by construction and was not. Declare refuses an
// unentitled organization, so a free plan can never own a pending run — but an
// organization that declares while paying and lapses before committing has one
// already, fully transferred. Without a second check it becomes visible on a
// plan that is not entitled to it.
const lapsing = await makeOrg("team");
const midflight = await declareOne(lapsing, "U15 declared while paying");
const midKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [midflight.runId])).rows[0]
  .storage_key;
await storage.put(midKey, bytesOf("U15 declared while paying"), { contentType: "image/png" });
await db.query("UPDATE orgs SET plan = 'free' WHERE id = $1", [lapsing]);

const u15 = await refusal(() => commitUpload(db, storage, { orgId: lapsing, runId: midflight.runId }));
check(
  "U15",
  u15 instanceof UploadRefused && u15.reason === "not_entitled",
  `a run declared on a paying plan cannot be published after a downgrade — "${u15?.message?.slice(0, 55)}…"`
);

// U15b — refused, not destroyed. A refusal is not a verification failure: the
// rows stay for the sweeper, which releases the reservation on its own
// schedule. Deleting here would make a billing state look like data loss.
const u15b = await db.query("SELECT count(*)::int AS n FROM run_artifacts WHERE run_id = $1 AND state = 'pending'", [
  midflight.runId,
]);
check(
  "U15b",
  u15b.rows[0].n === 1 && (await runState(midflight.runId)) === "pending" && (await storage.head(midKey)) !== null,
  "the refused run keeps its rows and its object — the sweeper cleans up, not the refusal"
);

// U15c — a lapsed organization retrying a commit that already succeeded still
// gets its success. Lapse never removes what was already published, and a CI
// runner retrying a completed step must not start failing.
const settled = await makeOrg("team");
const settledRun = await declareOne(settled, "U15c already published");
const settledKey = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [settledRun.runId]))
  .rows[0].storage_key;
await storage.put(settledKey, bytesOf("U15c already published"), { contentType: "image/png" });
await commitUpload(db, storage, { orgId: settled, runId: settledRun.runId });
await db.query("UPDATE orgs SET plan = 'lapsed' WHERE id = $1", [settled]);
const u15c = await refusal(() => commitUpload(db, storage, { orgId: settled, runId: settledRun.runId }));
check(
  "U15c",
  u15c === null && (await runState(settledRun.runId)) === "committed",
  "re-committing an already-published run still succeeds after a lapse"
);

// ---------------------------------------------------------------------------
// H1-H9 — the HTTP surface
// ---------------------------------------------------------------------------
//
// The route files themselves are Next modules the suite cannot import, so
// everything that could be *wrong* about them lives in `uploadHttp.ts` and is
// checked here: which refusal becomes which status, and whether a key from one
// organization can act on another's run.

const h1 = await declareResponse(db, storage, freeOrg, {
  repo: "web",
  summary: {},
  artifacts: [artifactFor("H1")],
});
check(
  "H1",
  h1.status === 402 && h1.body.code === "not_entitled",
  `an unentitled organization gets 402 with a code the client can branch on (${h1.status})`
);

const h2 = await declareResponse(db, storage, org, { repo: "", summary: {}, artifacts: [artifactFor("H2")] });
const h2b = await declareResponse(db, storage, org, { repo: "web", summary: {}, artifacts: [] });
check(
  "H2",
  h2.status === 400 && h2b.status === 400 && h2b.body.code === "malformed",
  "a missing repo and an empty artifact list are both 400"
);

const overOrg = await makeOrg("team");
await declareOne(overOrg, "H3 first");
await db.query("UPDATE org_storage SET runs_today = 200 WHERE org_id = $1", [overOrg]);
const h3 = await declareResponse(db, storage, overOrg, {
  repo: "web",
  summary: {},
  artifacts: [artifactFor("H3")],
});
check("H3", h3.status === 429 && h3.body.code === "runs_per_day", `too many runs today is 429 (${h3.status})`);

const h4 = await declareResponse(db, storage, org, {
  repo: "web",
  summary: {},
  artifacts: [{ frame: "big", kind: "build", sha256: sha256("h4"), bytes: 300_000_000 }],
});
check("H4", h4.status === 413 && h4.body.code === "bytes_per_run", `an oversized run is 413 (${h4.status})`);

// H5 — the successful declare carries everything the client needs to finish:
// where to PUT, and where to commit.
const h5 = await declareResponse(db, storage, org, {
  repo: "web",
  summary: { frames: [] },
  artifacts: [artifactFor("H5 content", "h5")],
});
check(
  "H5",
  h5.status === 201 &&
    typeof h5.body.runId === "string" &&
    Array.isArray(h5.body.uploads) &&
    h5.body.commit === `/api/upload/${h5.body.runId}/commit`,
  "a successful declare is 201 with the upload URLs and the commit path"
);

// H6 — commit before anything was uploaded.
const h6 = await commitResponse(db, storage, org, String(h5.body.runId));
check(
  "H6",
  h6.status === 422 && h6.body.code === "commit_rejected" && /never uploaded/.test(String(h6.body.error)),
  `committing an untransferred run is 422 and says why (${h6.status})`
);

// H7 — the whole path through the HTTP layer.
const h7declare = await declareResponse(db, storage, org, {
  repo: "web",
  summary: { frames: [] },
  artifacts: [artifactFor("H7 content", "h7")],
});
const h7key = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [h7declare.body.runId]))
  .rows[0].storage_key;
await storage.put(h7key, bytesOf("H7 content"), { contentType: "image/png" });
const h7 = await commitResponse(db, storage, org, String(h7declare.body.runId));
check(
  "H7",
  h7.status === 200 && h7.body.artifacts === 1 && h7.body.url === `/r/${h7declare.body.runId}`,
  "a verified commit is 200 with the run's URL"
);

// H8 — a key from another organization cannot commit this run.
//
// A run id travels in a URL and is guessable in a way a key is not. Without the
// organization check, a valid key from any other customer could commit — and,
// because a rejected commit deletes what it found, destroy — this one's run.
const neighbour = await makeOrg("team");
const h8declare = await declareResponse(db, storage, org, {
  repo: "web",
  summary: { frames: [] },
  artifacts: [artifactFor("H8 content", "h8")],
});
const h8 = await commitResponse(db, storage, neighbour, String(h8declare.body.runId));
const h8survived = await db.query("SELECT count(*)::int AS n FROM run_artifacts WHERE run_id = $1", [
  h8declare.body.runId,
]);
check(
  "H8",
  h8.status === 422 && /no such run/.test(String(h8.body.error)) && h8survived.rows[0].n === 1,
  "a neighbouring organization's key cannot commit this run, and the run survives the attempt"
);

// H9 — and that refusal reaches the wire as a billing answer, not a corruption
// answer. A lapsed customer told "422 commit rejected" would go looking for a
// broken file; 402 with `not_entitled` sends them to the right place.
const h9org = await makeOrg("team");
const h9run = await declareResponse(db, storage, h9org, {
  repo: "web",
  summary: { frames: [] },
  artifacts: [artifactFor("H9 content", "h9")],
});
const h9key = (await db.query("SELECT storage_key FROM run_artifacts WHERE run_id = $1", [h9run.body.runId])).rows[0]
  .storage_key;
await storage.put(h9key, bytesOf("H9 content"), { contentType: "image/png" });
await db.query("UPDATE orgs SET plan = 'lapsed' WHERE id = $1", [h9org]);
const h9 = await commitResponse(db, storage, h9org, String(h9run.body.runId));
check(
  "H9",
  h9.status === 402 && h9.body.code === "not_entitled",
  `a commit refused on plan grounds is 402, not 422 (${h9.status})`
);

// ---------------------------------------------------------------------------
// V1-V2 — "not queryable until it commits" is enforced, not just declared
// ---------------------------------------------------------------------------
//
// Migration 017 added `runs.state` and promised a declared-but-uncommitted run
// is invisible. The state existed and **nothing read it**: the run page, the
// share endpoint, both explain routes and the trend queries all selected runs
// by id alone. A half-finished upload was viewable, shareable, and counted in
// history — which is the entire failure the state was added to prevent.
//
// V1 covers the trend path, which is the one reachable from the suite. The four
// route queries are one `AND state = 'committed'` each; V2 pins them by reading
// the source, because a route file the suite cannot import is a route file
// where a silent regression has nowhere to show up.
const visOrg = await makeOrg("team");
const visRepo = randomUUID();
await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'vis')", [visRepo, visOrg]);

async function statsRun(state, flagged) {
  const id = randomUUID();
  await db.query("INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,$4,'{}',$5)", [
    id,
    visOrg,
    visRepo,
    `sha-${state}`,
    state,
  ]);
  await db.query(
    `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, flagged)
     VALUES ($1,$2,$3,'home','fidelity','figma',5.0,$4)`,
    [visOrg, visRepo, id, flagged]
  );
  return id;
}
await statsRun("committed", true);
await statsRun("pending", true);

const enrich = await buildEnrichment(db, { orgId: visOrg, repoId: visRepo, frame: "home" });
check(
  "V1",
  enrich !== null && !JSON.stringify(enrich).includes("sha-pending"),
  "an uncommitted run does not appear in history or trends"
);

const routeSources = [
  "web/app/r/[runId]/page.tsx",
  "web/app/api/share/route.ts",
  "web/app/api/explain/route.ts",
  "web/app/api/ci-explain/route.ts",
];
const unguarded = [];
for (const file of routeSources) {
  const source = await readFile(path.resolve(HERE, "..", file), "utf-8");
  const selectsRuns = /FROM runs WHERE/.test(source);
  const guarded = /state = 'committed'/.test(source);
  if (selectsRuns && !guarded) unguarded.push(file);
}
check(
  "V2",
  unguarded.length === 0,
  `every route that reads a run by id filters on committed (${unguarded.join(", ") || "all guarded"})`
);

// ---------------------------------------------------------------------------
// V3 — the price a customer is shown is the price they are charged
// ---------------------------------------------------------------------------
//
// The explain buttons read "1 credit" and "3 credits" for months after those
// prices were abandoned. They were replaced on 2026-08-10 because they lost
// money at the ceiling; `creditsRequired` derives the real ones from the worst
// case cost of the model each pass runs on, and the charge followed
// immediately. The labels did not, so the paid button offered a price the
// system did not honour.
//
// Checked at the source, because a React component the suite cannot render is
// where a hardcoded number has nowhere to be caught.
const panel = await readFile(path.resolve(HERE, "..", "web/app/r/[runId]/explain-panel.tsx"), "utf-8");
const literalPrice = /\(\s*\d+\s+credits?\s*\)/.exec(panel);
check(
  "V3",
  literalPrice === null,
  `the explain buttons carry no literal price${literalPrice ? ` — found "${literalPrice[0]}"` : ""}`
);

// V3b — and the numbers themselves still clear the margin floor at the worst
// case, so the fix cannot be "make the label match a price that is too low".
const analysis = creditsForPass("analysis");
const deep = creditsForPass("deep");
const worst = (pass) => hardMaxCostMicrodollars(OPERATIONS[pass].model);
const margin = (credits, pass) => 1 - worst(pass) / (credits * CREDIT_REVENUE_FLOOR_MICRODOLLARS);
check(
  "V3b",
  margin(analysis, "analysis") >= MARGIN_FLOOR && margin(deep, "deep") >= MARGIN_FLOOR,
  `analysis ${analysis} credits (${(100 * margin(analysis, "analysis")).toFixed(1)}% at worst case), ` +
    `deep ${deep} (${(100 * margin(deep, "deep")).toFixed(1)}%) — both clear the ${100 * MARGIN_FLOOR}% floor`
);

await rm(ROOT, { recursive: true, force: true });
for (const id of [freeOrg, lapsedOrg, org, tightOrg, dailyOrg, sweepOrg, orphan, overOrg, neighbour, lapsing, settled, h9org, visOrg]) {
  await db.query("DELETE FROM orgs WHERE id = $1", [id]);
}
await db.close();

console.log(failures === 0 ? "\nuploadPipeline: all checks passed" : `\nuploadPipeline: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
