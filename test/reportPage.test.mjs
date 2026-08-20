// The hosted run report — `BuildV5.md` Phase H (H1-H4).
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/reportPage.test.mjs
//
// **What this suite can and cannot prove.** The page is React, and nothing here
// renders it. What is checked is everything the page is a view *onto*: who is
// allowed to see a run, which artifacts and regions it is handed, how long the
// image URLs live, and what the history says. Layout, escaping and the three
// image fixes were verified in a browser against a real production build on
// 2026-08-19 — see `FinishedSPEC.md` §3t. Neither kind of evidence substitutes
// for the other, and saying so is cheaper than pretending otherwise.
//
// Two counter-tests, in the sense of CLAUDE.md rule 3:
//
//   R3.4b — history that includes the run being viewed. That is the naive
//           reading, and it tells a first-time customer their frame drifted
//           once and first drifted at the commit in front of them.
//   R5.3b — a presigned TTL taken from the default rather than the viewer's
//           remaining access. It hands a 30-second share link image URLs that
//           outlive it, so revocation is partial.

import { randomUUID, createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createFilesystemStorage } = await import(path.join(DIST, "storage/filesystem.js"));
const { blobKey, DEFAULT_GET_TTL_SECONDS } = await import(path.join(DIST, "storage.js"));
const { storageImageOrigin } = await import(path.join(DIST, "storage/origin.js"));
const { frameHistory, buildEnrichment } = await import(path.join(DIST, "enrichment.js"));
const { authorize, loadRun, ttlFor, priorRuns } = await import(path.join(DIST, "reportData.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const root = await mkdtemp(path.join(tmpdir(), "norma-report-"));
const storage = createFilesystemStorage({
  root,
  publicBaseUrl: "http://localhost:3000/api/blob",
  signingSecret: "test-secret-for-report-page",
});

// NORMA_DEV_OPEN opens every run to everyone. It is the local-development door
// and it must be shut here, or every authorization check below passes for the
// wrong reason.
delete process.env.NORMA_DEV_OPEN;

const OWNER = { viewer: "owner", expiresAt: null };

async function makeOrg(name) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  return id;
}

async function makeRepo(orgId, name) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,$3)", [id, orgId, name]);
  return id;
}

async function makeRun(orgId, repoId, opts = {}) {
  const id = randomUUID();
  const summary = opts.summary ?? { schemaVersion: 2, threshold: 0.1, frames: [] };
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()))",
    [id, orgId, repoId, opts.commit ?? "c0ffee1234", "main", JSON.stringify(summary), opts.state ?? "committed", opts.at ?? null]
  );
  return id;
}

async function addStat(orgId, repoId, runId, frame, opts = {}) {
  await db.query(
    `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, now()))`,
    [
      orgId, repoId, runId, frame,
      opts.mode ?? "baseline", opts.source ?? "baseline",
      opts.pct === undefined ? 1.5 : opts.pct,
      opts.ssim ?? 98,
      opts.flagged ?? false,
      opts.at ?? null,
    ]
  );
}

async function addArtifact(orgId, runId, frame, kind, bytes, extension = "png") {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = blobKey(orgId, sha, extension);
  await storage.put(key, bytes);
  await db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'committed')`,
    [randomUUID(), orgId, runId, frame, kind, key, sha, bytes.byteLength]
  );
  return key;
}

/** Issue a share link the way `/api/share` does, and return its plaintext token. */
async function share(orgId, runId, opts = {}) {
  const token = randomBytes(24).toString("base64url");
  await db.query(
    "INSERT INTO share_links (id, org_id, run_id, token_hash, expires_at, revoked_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(), orgId, runId,
      createHash("sha256").update(token).digest("hex"),
      opts.expiresAt ?? null,
      opts.revokedAt ?? null,
    ]
  );
  return token;
}

const orgA = await makeOrg(`report-a-${randomUUID().slice(0, 8)}`);
const orgB = await makeOrg(`report-b-${randomUUID().slice(0, 8)}`);
const repoA = await makeRepo(orgA, "web");

// ═══ R1 — who may see a run (H4.1, H4.2, H4.3) ═══
{
  const runId = await makeRun(orgA, repoA);
  await addStat(orgA, repoA, runId, "hero.png", { flagged: true });

  check("R1.1", (await authorize(db, runId, undefined)) === null, "no token, no dev-open: refused");

  const live = await share(orgA, runId);
  const access = await authorize(db, runId, live);
  check("R1.2", access?.viewer === "share", "a live token grants share access");

  const revoked = await share(orgA, runId, { revokedAt: new Date() });
  check("R1.3", (await authorize(db, runId, revoked)) === null, "a revoked token is refused");

  const expired = await share(orgA, runId, { expiresAt: new Date(Date.now() - 1000) });
  check("R1.4", (await authorize(db, runId, expired)) === null, "an expired token is refused (H4.2)");

  const other = await makeRun(orgA, repoA);
  check("R1.5", (await authorize(db, other, live)) === null, "a token names one run and does not open another");

  check("R1.6", (await authorize(db, runId, live + "x")) === null, "a token with one character changed is refused");

  // The check reads `revoked_at` on every request rather than caching a
  // decision, so withdrawing a link takes effect on the next page load.
  await db.query("UPDATE share_links SET revoked_at = now() WHERE token_hash = $1", [
    createHash("sha256").update(live).digest("hex"),
  ]);
  check("R1.7", (await authorize(db, runId, live)) === null, "revocation takes effect immediately (H4.1)");
}

// ═══ R2 — a run is loadable only when it is committed, and only its own ═══
{
  const pending = await makeRun(orgA, repoA, { state: "pending" });
  await addStat(orgA, repoA, pending, "hero.png");
  check("R2.1", (await loadRun(db, storage, pending, OWNER)) === null,
    "a declared-but-uncommitted run does not load (migration 017)");

  const committed = await makeRun(orgA, repoA, { summary: { threshold: 0.25, frames: [] } });
  await addStat(orgA, repoA, committed, "hero.png", { flagged: true, pct: 4.2 });
  const report = await loadRun(db, storage, committed, OWNER);
  check("R2.2", report?.frames.length === 1, "a committed run loads its frames");
  check("R2.3", report?.threshold === 0.25, "the threshold comes from the uploaded summary");
  check("R2.4", (await loadRun(db, storage, randomUUID(), OWNER)) === null, "an unknown run id loads nothing");
}

// ═══ R3 — history is one computation, shared with the prompt (H3) ═══
{
  const repo = await makeRepo(orgA, "history-repo");
  const frame = "product.png";
  const base = Date.now() - 10 * 24 * 3600 * 1000;
  const past = [
    { commit: "aaa1111111", pct: 0.02, flagged: false },
    { commit: "bbb2222222", pct: 0.44, flagged: true },   // first drift
    { commit: "ccc3333333", pct: null, flagged: false },  // compared, no aligned number
    { commit: "ddd4444444", pct: 0.31, flagged: true },
  ];
  past.forEach(() => {});
  let i = 0;
  for (const entry of past) {
    const at = new Date(base + i * 3600 * 1000).toISOString();
    const runId = await makeRun(orgA, repo, { commit: entry.commit, at });
    await addStat(orgA, repo, runId, frame, { pct: entry.pct, flagged: entry.flagged, at });
    i++;
  }
  const current = await makeRun(orgA, repo, { commit: "eee5555555", at: new Date(base + 9e6).toISOString() });
  await addStat(orgA, repo, current, frame, { pct: 0.5, flagged: true, at: new Date(base + 9e6).toISOString() });

  const history = await frameHistory(db, { orgId: orgA, repoId: repo, frame });
  check("R3.1", history?.firstDriftCommit === "bbb2222222", `first drift is the earliest flagged commit (got ${history?.firstDriftCommit})`);
  check("R3.2", history?.recurrence === 3, `recurrence counts flagged runs including this one (got ${history?.recurrence})`);
  check("R3.3", history?.trend.length === 5, `the trend carries every committed run of the frame (got ${history?.trend.length})`);

  // The gate that matters: the prompt and the page must not disagree about
  // "first drift". BuildV5's I2.1 says two implementations that disagree is a
  // bug in one of them — so there is one.
  const enrichment = await buildEnrichment(db, { orgId: orgA, repoId: repo, frame });
  check("R3.4",
    enrichment?.firstDriftCommit === history?.firstDriftCommit &&
      enrichment?.recurrence.count === history?.recurrence,
    "the prompt's history and the page's history are the same computation");

  const shown = priorRuns(history, current);
  check("R3.5", shown?.trend.length === 4 && shown.trend.every((r) => r.runId !== current),
    "the run being viewed is not part of its own history");

  // R3.4b — the counter-test. Leaving the current run in is the obvious
  // implementation and it is wrong in the one case a new customer sees first.
  const firstEver = await makeRun(orgA, repo, { commit: "fff6666666" });
  await addStat(orgA, repo, firstEver, "brand-new.png", { flagged: true });
  const naive = await frameHistory(db, { orgId: orgA, repoId: repo, frame: "brand-new.png" });
  const corrected = priorRuns(naive, firstEver);
  check("R3.4b",
    naive?.trend.length === 1 && naive.recurrence === 1 && corrected === null,
    "a frame's first ever run has no history — naive: 1 prior run and 1 drift, corrected: none (H3.2)");

  const nothing = await frameHistory(db, { orgId: orgA, repoId: repo, frame: "never-seen.png" });
  check("R3.6", nothing === null, "a frame with no rows at all has no history");

  // A skipped frame writes no frame_stats row (recordFrameStats drops it), so a
  // *null* percentage is the only way a gap reaches the chart. It has to
  // survive the trip rather than being coerced to zero: a skip that reads as a
  // pass is worse than no chart.
  const nulls = shown.trend.filter((r) => r.alignedMismatchPercent === null);
  check("R3.7", nulls.length === 1, `a compared run with no aligned number stays null, not 0 (got ${nulls.length})`);
}

// ═══ R4 — artifacts, regions and graceful degradation (H1.3) ═══
{
  const runId = await makeRun(orgA, repoA);
  await addStat(orgA, repoA, runId, "full.png", { flagged: true });
  await addStat(orgA, repoA, runId, "clean.png", { flagged: false, pct: 0 });
  await addStat(orgA, repoA, runId, "bare.png", { flagged: false, pct: 0 });

  await addArtifact(orgA, runId, "full.png", "build", Buffer.from("build-bytes"));
  await addArtifact(orgA, runId, "full.png", "reference", Buffer.from("reference-bytes"));
  await addArtifact(orgA, runId, "full.png", "diff", Buffer.from("diff-bytes"));
  await addArtifact(orgA, runId, "clean.png", "thumbnail", Buffer.from("thumb-bytes"), "jpg");
  await addArtifact(
    orgA, runId, "full.png", "regions",
    Buffer.from(JSON.stringify({ version: 1, regions: [
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 1, y: 2, width: 3, height: 4 },
    ] })),
    "json"
  );

  const report = await loadRun(db, storage, runId, OWNER);
  const full = report.frames.find((f) => f.frame === "full.png");
  const clean = report.frames.find((f) => f.frame === "clean.png");
  const bare = report.frames.find((f) => f.frame === "bare.png");

  check("R4.1", full.images.build && full.images.reference && full.images.diff,
    "a flagged frame gets all three image URLs");
  check("R4.2", clean.images.thumbnail && !clean.images.build,
    "a clean frame gets its thumbnail and no full artifacts (Pathway 2 item 7)");
  check("R4.3",
    !bare.images.build && !bare.images.reference && !bare.images.diff && !bare.images.thumbnail,
    "a frame with no artifacts yields nulls, not broken URLs (H1.3)");
  check("R4.4", full.regions.length === 2 && full.regions[0].x === 10,
    `regions come from the sidecar (got ${full.regions.length})`);
  check("R4.5", clean.regions.length === 0, "a frame with no sidecar has no regions");

  // A row pointing at an object that is not there. The page must degrade, not
  // fail: one missing object is not a reason to refuse a whole report.
  const orphanRun = await makeRun(orgA, repoA);
  await addStat(orgA, repoA, orphanRun, "gone.png", { flagged: true });
  await db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
     VALUES ($1,$2,$3,'gone.png','regions',$4,'',$5,$5,'committed')`,
    [randomUUID(), orgA, orphanRun, blobKey(orgA, "f".repeat(64), "json"), 12]
  );
  const orphan = await loadRun(db, storage, orphanRun, OWNER);
  check("R4.6", orphan.frames[0].regions.length === 0, "a regions row whose object is missing degrades to no regions");

  // Hostile sidecars. Every one of these is a client-supplied file.
  const hostile = [
    ["not json at all", "unparseable JSON"],
    [JSON.stringify({ regions: "nope" }), "regions is not an array"],
    [JSON.stringify({ regions: [{ x: -5, y: 0, width: 10, height: 10 }] }), "a negative coordinate"],
    [JSON.stringify({ regions: [{ x: 0, y: 0, width: 0, height: 10 }] }), "a zero-width rectangle"],
    [JSON.stringify({ regions: [{ x: "1", y: 2, width: 3, height: 4 }] }), "a string coordinate"],
    [JSON.stringify({ regions: [{ x: 0, y: 0, width: Infinity, height: 1 }] }), "a non-finite dimension"],
  ];
  let refused = 0;
  for (const [body, why] of hostile) {
    const r = await makeRun(orgA, repoA);
    await addStat(orgA, repoA, r, "h.png", { flagged: true });
    await addArtifact(orgA, r, "h.png", "regions", Buffer.from(body), "json");
    const out = await loadRun(db, storage, r, OWNER);
    if (out.frames[0].regions.length === 0) {
      refused++;
    } else {
      console.log(`      hostile sidecar accepted: ${why}`);
    }
  }
  check("R4.7", refused === hostile.length, `every malformed region is dropped (${refused}/${hostile.length})`);

  // A sidecar claiming 4,000 regions must not become 4,000 boxes drawn over a
  // diff — that is a smear, and it is also a client deciding how much work the
  // page does.
  const manyRun = await makeRun(orgA, repoA);
  await addStat(orgA, repoA, manyRun, "many.png", { flagged: true });
  const many = Array.from({ length: 4000 }, (_, n) => ({ x: n, y: n, width: 5, height: 5 }));
  await addArtifact(orgA, manyRun, "many.png", "regions", Buffer.from(JSON.stringify({ regions: many })), "json");
  const capped = await loadRun(db, storage, manyRun, OWNER);
  check("R4.8", capped.frames[0].regions.length === 24,
    `the rendered region count is capped server-side (got ${capped.frames[0].regions.length})`);
}

// ═══ R5 — a presigned URL never outlives the access that revealed it ═══
{
  const now = Date.now();
  check("R5.1", ttlFor({ viewer: "owner", expiresAt: null }, now) === DEFAULT_GET_TTL_SECONDS,
    "an owner gets the default TTL");
  check("R5.2", ttlFor({ viewer: "share", expiresAt: new Date(now + 30 * 24 * 3600 * 1000) }, now) === DEFAULT_GET_TTL_SECONDS,
    "a long-lived share link still gets only the default TTL, not its own life");

  const soon = ttlFor({ viewer: "share", expiresAt: new Date(now + 45_000) }, now);
  check("R5.3", soon === 45, `a share link expiring in 45s hands out 45s URLs (got ${soon}s)`);

  // R5.3b — the counter-test. Taking the default regardless of the viewer's
  // remaining access is the obvious implementation, and it means a link
  // revoked or expired in 45 seconds leaves working image URLs behind it.
  check("R5.3b", DEFAULT_GET_TTL_SECONDS > 45,
    `ignoring the share's expiry would have handed out ${DEFAULT_GET_TTL_SECONDS}s URLs to a 45s link`);

  const floor = ttlFor({ viewer: "share", expiresAt: new Date(now + 1000) }, now);
  check("R5.4", floor === 20, `a nearly-dead link floors at 20s rather than signing a dead URL (got ${floor}s)`);
  const past = ttlFor({ viewer: "share", expiresAt: new Date(now - 60_000) }, now);
  check("R5.5", past === 20, "an already-expired link cannot produce a negative TTL");
}

// ═══ R6 — tenant isolation on the paths that turn an id into bytes (E4) ═══
{
  const repoB = await makeRepo(orgB, "web");
  const runB = await makeRun(orgB, repoB);
  await addStat(orgB, repoB, runB, "hero.png", { flagged: true });
  await addArtifact(orgB, runB, "hero.png", "build", Buffer.from("org-b-bytes"));

  // Org A's artifacts must never appear on org B's run even when the frame name
  // matches — the artifact query carries org_id alongside run_id.
  const crossRun = await makeRun(orgA, repoA);
  await addStat(orgA, repoA, crossRun, "hero.png", { flagged: true });
  await db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
     VALUES ($1,$2,$3,'hero.png','build',$4,'',5,5,'committed')`,
    [randomUUID(), orgB, crossRun, blobKey(orgB, "a".repeat(64), "png")]
  );
  const report = await loadRun(db, storage, crossRun, OWNER);
  check("R6.1", report.frames[0].images.build === null,
    "an artifact row owned by another org is not served on this org's run");

  const tokenB = await share(orgB, runB);
  check("R6.2", (await authorize(db, crossRun, tokenB)) === null,
    "org B's share token does not open org A's run");

  // History is org-scoped: two orgs with the same repo and frame names must not
  // see each other's trend.
  const repoA2 = await makeRepo(orgA, "shared-name");
  const repoB2 = await makeRepo(orgB, "shared-name");
  const rA = await makeRun(orgA, repoA2);
  await addStat(orgA, repoA2, rA, "same.png", { flagged: true });
  const rB = await makeRun(orgB, repoB2);
  await addStat(orgB, repoB2, rB, "same.png", { flagged: true });
  const hA = await frameHistory(db, { orgId: orgA, repoId: repoA2, frame: "same.png" });
  check("R6.3", hA.trend.length === 1 && hA.trend[0].runId === rA,
    "history for an identically named repo and frame stays inside its own org");
}

// ═══ R7 — the CSP's image origin is the origin storage actually signs ═══
{
  // Derived rather than configured, so it cannot drift from the driver. This is
  // the check that keeps that true — `storage/origin.ts` explains why, and says
  // plainly that the R2 shape is unproven until Step 5's J2.
  const fsUrl = (await storage.presignGet(blobKey(orgA, "b".repeat(64), "png"))).url;
  const fsOrigin = storageImageOrigin({ NORMA_STORAGE_PUBLIC_URL: "http://localhost:3000/api/blob" });
  check("R7.1", new URL(fsUrl).origin === fsOrigin,
    `the filesystem driver's signed origin matches what the CSP is told (${fsOrigin})`);

  check("R7.2", storageImageOrigin({}) === null,
    "with no storage configured the CSP needs no source beyond 'self'");
  check("R7.3", storageImageOrigin({ NORMA_STORAGE_PUBLIC_URL: "/api/blob" }) === null,
    "a relative base URL is same-origin and adds no CSP source");
  check("R7.4",
    storageImageOrigin({
      NORMA_STORAGE_BUCKET: "normascope-cloud",
      NORMA_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
      NORMA_STORAGE_FORCE_PATH_STYLE: "1",
    }) === "http://127.0.0.1:9000",
    "path-style (MinIO) puts the bucket in the path, so the origin is the endpoint");
  check("R7.5",
    storageImageOrigin({
      NORMA_STORAGE_BUCKET: "normascope-cloud",
      NORMA_STORAGE_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    }) === "https://normascope-cloud.acct.r2.cloudflarestorage.com",
    "virtual-hosted prefixes the bucket onto the endpoint host — and storage.test.mjs S5.7 checks that answer against the URL R2 actually signs");
}

await rm(root, { recursive: true, force: true });
await db.close();
console.log(failures === 0 ? "\nAll report-page checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
