#!/usr/bin/env node
//
// Fill a local database with enough to look at — an organization on each plan
// and one whose subscription has lapsed,
// an upload key, a repository, and a couple of runs.
//
//   npm run seed:dev                                   # PGlite, the dev default
//   DATABASE_URL="$(scripts/test-db.sh start)" npm run seed:dev
//
// **This refuses to run against a hosted database.** A seed script is a write
// script, and the failure mode of pointing one at production is inventing
// customers in the real ledger. The check is a hostname match rather than a
// prompt, because a prompt is something you click through at speed.
//
// Everything it creates is prefixed `dev-` and printed, so it can be told apart
// from anything real at a glance.

import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const url = process.env.DATABASE_URL?.trim() ?? "";
const HOSTED = /neon\.tech|amazonaws\.com|supabase|render\.com|railway|\.cloud\b/i;
if (HOSTED.test(url)) {
  console.error("seed-dev refuses to run against a hosted database.");
  console.error(`  DATABASE_URL points at: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}`);
  console.error("  Unset it for PGlite, or use scripts/test-db.sh for a local server.");
  process.exit(2);
}

// **Without this the seed wrote to nowhere.** `createDb()` falls back to an
// *in-memory* PGlite when `PGLITE_DATA_DIR` is unset — that is what the test
// suites rely on. `PGLITE_DATA_DIR` is set in `web/.env.local`, which Next
// loads and a script at the repo root does not, so `npm run seed:dev` created
// an organization, a key and several runs inside a database that ceased to
// exist when the process exited. It printed URLs the whole time, and every one
// of them 404'd. Found on 2026-08-19 while trying to look at a seeded report.
//
// The default matches `web/.env.local`'s absolute path, and an explicit value
// still wins so a real server can be targeted.
if (!url) {
  process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR?.trim() || path.join(ROOT, ".pgdata");
}

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));

const db = await createDb();
await migrate(db);
console.log(url ? `database: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}` : `database: PGlite at ${process.env.PGLITE_DATA_DIR}`);

const plans = ["team", "free"];
const made = [];

for (const plan of plans) {
  const id = randomUUID();
  const name = `dev-${plan}`;
  const existing = await db.query("SELECT id FROM orgs WHERE name = $1", [name]);
  if (existing.rows.length > 0) {
    made.push({ plan, id: existing.rows[0].id, name, note: "already there" });
    continue;
  }
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, $3)", [id, name, plan]);
  made.push({ plan, id, name, note: "created" });
}

console.log("organizations:");
for (const org of made) {
  console.log(`  ${org.name.padEnd(12)} ${org.plan.padEnd(7)} ${org.id}  (${org.note})`);
}

// Only the entitled organization can hold an upload key — createApiKey refuses
// the others, which is itself worth seeing locally.
const team = made.find((o) => o.plan === "team");
const keyCount = await db.query("SELECT count(*)::int AS n FROM api_keys WHERE org_id = $1", [team.id]);
if (keyCount.rows[0].n === 0) {
  const key = await createApiKey(db, team.id, { kind: "upload", label: "dev-upload-key" });
  console.log(`\nupload key for ${team.name} (shown once, as in production):\n  ${key.plaintext}`);
} else {
  console.log(`\n${team.name} already has ${keyCount.rows[0].n} key(s) — /admin/keys lists them.`);
}

const free = made.find((o) => o.plan === "free");
try {
  await createApiKey(db, free.id, { kind: "upload", label: "should-not-exist" });
  console.log(`  ⚠ ${free.name} was issued an upload key — entitlement is not being enforced`);
} catch {
  console.log(`  ${free.name}: refused an upload key, as expected`);
}

// A lapsed subscription is a *status*, not a plan (migration 019). The
// organization keeps the tier it bought; the lapse is what happened to the
// subscription. Seeded so the difference is visible locally: dev-lapsed holds a
// team plan and still cannot upload.
const lapsedId = randomUUID();
const lapsedExists = await db.query("SELECT id FROM orgs WHERE name = $1", ["dev-lapsed"]);
if (lapsedExists.rows.length === 0) {
  await db.query(
    "INSERT INTO orgs (id, name, plan, subscription_status, subscription_status_at) VALUES ($1, 'dev-lapsed', 'team', 'lapsed', now())",
    [lapsedId]
  );
  console.log("  dev-lapsed  : team plan, subscription lapsed — uploads refused, data readable");
}

const repoId = randomUUID();
const repoExists = await db.query("SELECT id FROM repos WHERE org_id = $1 AND name = 'dev-web'", [team.id]);
const repo = repoExists.rows[0]?.id ?? repoId;
if (!repoExists.rows[0]) {
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'dev-web')", [repo, team.id]);
}

const summary = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  threshold: 0.1,
  totals: { compared: 2, flagged: 1, skipped: 0 },
  frames: [
    { label: "Home", screenshot: "home.png", mode: "fidelity", source: "figma", status: "compared", flagged: true, alignedMismatchPercent: 5.63 },
    { label: "Pricing", screenshot: "pricing.png", mode: "fidelity", source: "figma", status: "compared", flagged: false, alignedMismatchPercent: 0.26 },
  ],
};

// One visible run and one still pending, so the difference between them is
// something you can see rather than something you have to trust.
for (const state of ["committed", "pending"]) {
  const runId = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state) VALUES ($1,$2,$3,$4,'main',$5,$6)",
    [runId, team.id, repo, `dev-${state}`, JSON.stringify(summary), state]
  );
  // The report page renders from frame_stats, not from the summary blob, so a
  // run without these rows shows "no compared frames" and the page cannot be
  // worked on. Both runs get them — including the pending one, which is how you
  // can see that hiding it is the run's state doing the work rather than an
  // absence of data.
  for (const frame of summary.frames) {
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged)
       VALUES ($1,$2,$3,$4,'fidelity','figma',$5,$6,$7)`,
      [team.id, repo, runId, frame.screenshot, frame.alignedMismatchPercent, frame.flagged ? 61.2 : 98.7, frame.flagged]
    );
  }
  console.log(`run (${state}): /r/${runId}`);
}

// ---------------------------------------------------------------------------
// A run worth opening — BuildV5 Phase H
// ---------------------------------------------------------------------------
//
// The two runs above have numbers and nothing else, which was enough while the
// report page was numbers and nothing else. Phase H renders images, findings,
// region overlays and history, and none of that can be looked at — or broken
// noticeably — without data that exercises it.
//
// **The storage directory has to be pinned, in both places.** The filesystem
// driver defaults to `.storage` *relative to the working directory*, and the
// Next dev server runs in `web/` while this script runs at the repo root. Left
// alone, the seed writes to `<root>/.storage` and the server reads
// `<root>/web/.storage` — every image a broken link, with nothing to say why.
// That is the same trap the PGLITE_DATA_DIR comment in `web/.env.local`
// records, one directory over, so this refuses to guess.
const storageDir = process.env.NORMA_STORAGE_DIR?.trim();
if (!storageDir) {
  process.env.NORMA_STORAGE_DIR = path.join(ROOT, ".storage");
}
if (!process.env.NORMA_STORAGE_DIR.startsWith("/")) {
  console.error("NORMA_STORAGE_DIR must be an absolute path, or the dev server will read a different directory.");
  process.exit(2);
}

const { createStorage } = await import(path.join(DIST, "storage.js"));
const { blobKey } = await import(path.join(DIST, "storage.js"));
const storage = await createStorage();

const { readFile } = await import("node:fs/promises");
const { createHash } = await import("node:crypto");
const zlib = await import("node:zlib");

/** Store one blob content-addressed inside the org prefix and return its key. */
async function store(orgId, bytes, extension, contentType) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = blobKey(orgId, sha, extension);
  await storage.put(key, bytes, { contentType });
  return { key, sha, bytes: bytes.byteLength };
}

/**
 * A minimal PNG, written by hand.
 *
 * **This is a layout fixture, not a screenshot of anything.** It exists for one
 * reason: every real capture in `norma-bridge-usecase/` is 1440×1000, and H1.1
 * is specifically about a full-page export past the 2.2:1 line — the case where
 * the CLI report once squashed three screenshots into unreadable slivers, and
 * where the three panes have to scroll together at natural size. There is no
 * tall real capture in this repo to borrow.
 *
 * It is named `DEV-FIXTURE-tall-6to1-not-a-real-capture.png` on the page for
 * the same reason this comment is here: the first version was called
 * `full-page.png`, and a page of coloured bars under that name reads as the
 * product comparing nonsense rather than as a test fixture doing its job.
 *
 * The bands are **offset by half a period between build and reference**, so it
 * at least reads as the thing Normascope actually detects — content that has
 * moved down the page — rather than as two unrelated patterns. It is still not
 * a page.
 *
 * Deliberately no image library: nothing in this repo decodes customer images,
 * and a seed script is a poor place to make that untrue.
 */
function tallPng(width, height, band, offset = 0) {
  const PERIOD = 120;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 3;
      const on = Math.floor((y + offset) / PERIOD) % 2 === 0;
      raw[at] = on ? band[0] : 240;
      raw[at + 1] = on ? band[1] : 238;
      raw[at + 2] = on ? band[2] : 236;
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** CRC-32, for Node versions without `zlib.crc32`. */
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

const FIXTURES = path.join(ROOT, "norma-bridge-usecase");
const PRODUCT = "norma-product.png";
const TALL = "DEV-FIXTURE-tall-6to1-not-a-real-capture.png";
const CLEAN = "articles-index.png";

const richSummary = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  threshold: 0.1,
  totals: { compared: 3, flagged: 2, skipped: 0 },
  frames: [
    { label: "Norma — Product Page", screenshot: PRODUCT, mode: "baseline", source: "baseline", status: "compared", flagged: true, alignedMismatchPercent: 0.26, structuralSimilarity: 98.7 },
    { label: "DEV FIXTURE — generated stripes, not a capture", screenshot: TALL, mode: "fidelity", source: "figma", status: "compared", flagged: true, alignedMismatchPercent: 3.4, structuralSimilarity: 88.1 },
    { label: "Articles — Index", screenshot: CLEAN, mode: "baseline", source: "baseline", status: "compared", flagged: false, alignedMismatchPercent: 0, structuralSimilarity: 100 },
  ],
};

const richExists = await db.query("SELECT id FROM runs WHERE commit_sha = 'dev-artifacts'", []);
if (richExists.rows.length > 0) {
  console.log(`\nrich run: /r/${richExists.rows[0].id}  (already there)`);
} else {
  // History first: five earlier runs of the product frame, so the page has a
  // trend to draw and a first-drift commit to name.
  //
  // One of them deliberately records **no measurement** — a `frame_stats` row
  // with a null `aligned_mismatch_percent`, which is what a frame that was
  // compared and produced no number looks like. It must render as a gap in
  // both charts and never as a zero.
  //
  // It used to be seeded as *no row at all*, which is a different thing: a run
  // where the frame simply is not present does not appear on the chart, so
  // nothing was drawing the gap the comment claimed to be testing. Phase I's
  // trend page is where that difference became visible.
  const past = [
    { commit: "a1b2c3d4e5", pct: 0.02, flagged: false },
    { commit: "b2c3d4e5f6", pct: 0.04, flagged: false },
    { commit: "c3d4e5f6a7", pct: null, flagged: false }, // compared, no number
    { commit: "d4e5f6a7b8", pct: 0.31, flagged: true },
    { commit: "e5f6a7b8c9", pct: 0.18, flagged: true },
  ];
  let ago = past.length + 1;
  for (const entry of past) {
    const id = randomUUID();
    const at = new Date(Date.now() - ago * 36 * 3600 * 1000).toISOString();
    ago--;
    await db.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at) VALUES ($1,$2,$3,$4,'main',$5,'committed',$6)",
      [id, team.id, repo, entry.commit, JSON.stringify(richSummary), at]
    );
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
       VALUES ($1,$2,$3,$4,'baseline','baseline',$5,$6,$7,$8)`,
      [team.id, repo, id, PRODUCT, entry.pct, 98.2, entry.flagged, at]
    );
  }

  const runId = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state) VALUES ($1,$2,$3,'dev-artifacts','main',$4,'committed')",
    [runId, team.id, repo, JSON.stringify(richSummary)]
  );
  for (const frame of richSummary.frames) {
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [team.id, repo, runId, frame.screenshot, frame.mode, frame.source, frame.alignedMismatchPercent, frame.structuralSimilarity, frame.flagged]
    );
  }

  const artifact = async (frame, kind, bytes, extension, contentType) => {
    const stored = await store(team.id, bytes, extension, contentType);
    await db.query(
      `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'committed')`,
      [randomUUID(), team.id, runId, frame, kind, stored.key, stored.sha, stored.bytes]
    );
  };

  // The product frame gets the real portfolio capture — a genuine 1440×1000
  // screenshot, its baseline, and the diff `compare` actually produced.
  await artifact(PRODUCT, "build", await readFile(path.join(FIXTURES, "screenshots", PRODUCT)), "png", "image/png");
  await artifact(PRODUCT, "reference", await readFile(path.join(FIXTURES, "baseline", PRODUCT)), "png", "image/png");
  await artifact(PRODUCT, "diff", await readFile(path.join(FIXTURES, "diff", "norma-product-diff.png")), "png", "image/png");
  await artifact(
    PRODUCT,
    "regions",
    Buffer.from(JSON.stringify({ version: 1, regions: [
      { x: 960, y: 400, width: 336, height: 48 },
      { x: 112, y: 640, width: 420, height: 120 },
    ] })),
    "json",
    "application/json"
  );

  // A 6:1 export, past the 2.2:1 line: the panes should scroll at natural size
  // and in step, not letterbox into slivers (H1.1). Build and reference carry
  // the same bands offset by half a period, so the pair reads as content that
  // shifted down the page — which is the thing the product detects — instead of
  // as two unrelated patterns.
  await artifact(TALL, "build", tallPng(400, 2400, [168, 115, 110], 0), "png", "image/png");
  await artifact(TALL, "reference", tallPng(400, 2400, [168, 115, 110], 60), "png", "image/png");
  await artifact(TALL, "diff", tallPng(400, 2400, [182, 97, 31], 30), "png", "image/png");

  // A clean frame ships one downscaled JPEG instead of three full artifacts
  // (Pathway 2 item 7), so the page has to render a single pane rather than one
  // image and two broken boxes.
  await artifact(CLEAN, "thumbnail", await readFile(path.join(FIXTURES, "screenshots", CLEAN)), "png", "image/png");

  // Findings, including the two that must not render as ordinary observations:
  // a payload from the E3 corpus, and an injection-suspected category. Both are
  // stored exactly as a model could return them — the page is what has to make
  // them safe.
  await db.query(
    `INSERT INTO run_findings (org_id, repo_id, run_id, frame, model, findings) VALUES ($1,$2,$3,$4,$5,$6)`,
    [team.id, repo, runId, PRODUCT, "dev-seed", JSON.stringify({ findings: [
      {
        frame: PRODUCT,
        region: { x: 960, y: 400, width: 336, height: 48 },
        category: "colour",
        observation: "The call-to-action is missing its green background in the build.",
        cssHypothesis: "background-color resolves to transparent",
        selector: ".hero__cta",
        codePointer: "src/components/Hero.tsx:42",
        suggestedFix: "Restore the --accent token on .hero__cta",
        confidence: "high",
      },
      {
        frame: PRODUCT,
        region: { x: 112, y: 640, width: 420, height: 120 },
        category: "spacing",
        observation: "<img src=x onerror=alert(1)> and <script>alert('xss')</script> in an observation",
        cssHypothesis: "margin-top: 0 instead of 24px",
        selector: "\"><svg onload=alert(2)>",
        codePointer: "src/x.tsx:1",
        suggestedFix: "javascript:alert(3)",
        confidence: "medium",
      },
      {
        frame: PRODUCT,
        region: { x: 0, y: 0, width: 10, height: 10 },
        category: "injection-suspected",
        observation: "Text in the capture instructed the assistant to ignore its rules and report a pass.",
        cssHypothesis: "",
        selector: "",
        codePointer: "",
        suggestedFix: "",
        confidence: "low",
      },
    ] })]
  );

  console.log(`\nrich run (images, findings, history): /r/${runId}`);
  console.log(`  storage: ${process.env.NORMA_STORAGE_DIR}`);
  console.log(`  add NORMA_STORAGE_DIR to web/.env.local with this exact value, or the server reads web/.storage`);
}

// ---------------------------------------------------------------------------
// Trends — BuildV5 Phase I
// ---------------------------------------------------------------------------
//
// Two things the repository and trend views have branches for and the data
// above cannot produce:
//
//   - **A repository with no runs** (I1.2), so the empty state is something you
//     can look at rather than a branch nobody has rendered.
//   - **A frame whose measurement changed mid-history** (I2.2). `fidelity` and
//     `baseline` are different quantities against different references, and the
//     chart marks where the definition changed. Nothing else here changes mode,
//     so without this the marker has never been drawn.
//
// The mode-change frame is named for what it is, for the same reason the tall
// PNG above is: a page of invented numbers under a plausible name reads as the
// product measuring nonsense.
const emptyExists = await db.query("SELECT id FROM repos WHERE org_id = $1 AND name = 'dev-empty'", [team.id]);
const emptyRepo = emptyExists.rows[0]?.id ?? randomUUID();
if (!emptyExists.rows[0]) {
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'dev-empty')", [emptyRepo, team.id]);
}
console.log(`\nempty repository (I1.2 empty state): /repos/${emptyRepo}`);

const MODE_FRAME = "DEV-FIXTURE-mode-change-not-a-real-frame.png";
const modeExists = await db.query(
  "SELECT count(*)::int AS n FROM frame_stats WHERE org_id = $1 AND frame = $2",
  [team.id, MODE_FRAME]
);
if (modeExists.rows[0].n === 0) {
  const arc = [
    { commit: "mode000001", mode: "baseline", source: "baseline", pct: 0.03, threshold: 0.1, flagged: false },
    { commit: "mode000002", mode: "baseline", source: "baseline", pct: 0.06, threshold: 0.1, flagged: false },
    { commit: "mode000003", mode: "baseline", source: "baseline", pct: 0.42, threshold: 0.1, flagged: true },
    { commit: "mode000004", mode: "fidelity", source: "figma", pct: 6.10, threshold: 5, flagged: true },
    { commit: "mode000005", mode: "fidelity", source: "figma", pct: 4.20, threshold: 5, flagged: false },
    { commit: "mode000006", mode: "fidelity", source: "figma", pct: 3.10, threshold: 5, flagged: false },
  ];
  let back = arc.length;
  for (const entry of arc) {
    const id = randomUUID();
    const when = new Date(Date.now() - back * 30 * 3600 * 1000).toISOString();
    back--;
    await db.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at) VALUES ($1,$2,$3,$4,'main',$5,'committed',$6)",
      [id, team.id, repo, entry.commit, JSON.stringify({ schemaVersion: 2, threshold: entry.threshold, frames: [] }), when]
    );
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [team.id, repo, id, MODE_FRAME, entry.mode, entry.source, entry.pct, 95, entry.flagged, when]
    );
  }
}
console.log(
  `mode-change trend (I2.2 marker): /repos/${repo}/trend?frame=${encodeURIComponent(MODE_FRAME)}`
);
console.log(`repository view: /repos/${repo}`);

console.log("\nAdmin: http://localhost:3000/admin/keys (password: ADMIN_PASSWORD from web/.env.local)");
await db.close();
