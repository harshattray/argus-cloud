#!/usr/bin/env node
//
// The demo organization — a full, working Cloud tenant to test features against
// and to show people.
//
//   npm run seed:demo                                   # PGlite, the dev default
//   DATABASE_URL="$(scripts/test-db.sh start)" npm run seed:demo
//   npm run seed:demo -- --reset                        # delete and rebuild it
//
// ── Why this is separate from `seed-dev.mjs` ─────────────────────────────────
//
// `seed-dev` exists so a developer can *see the pages work*: one org per plan,
// a pending run, a deliberately broken frame label, an XSS payload in a
// finding. It is a workbench, and its data is shaped to exercise edge cases.
//
// This is the opposite. One organization, coherent history, numbers that make
// sense next to each other, and nothing designed to break anything. It is the
// tenant you point at when you want to answer "what does this product do".
//
// ── The honesty rule, which is not optional ──────────────────────────────────
//
// **Every number here is invented, and the surfaces say so.** The organization
// is named `DEMO — Northwind Retail (sample data)`, its repositories carry a
// `demo-` prefix, and the frames are named for real pages of a shop that does
// not exist. Nothing in here is presented as a customer, a measurement, or a
// result.
//
// That is FUTURENORMA Doctrine 2 applied to a sales surface: every figure that
// reaches a customer traces to a recorded `usage` object times a live price, or
// it is labelled as not being a measurement. A demo tenant dressed as a real
// one is fabricated evidence, and it is fabricated evidence in the room where
// it does the most damage.
//
// So this script will happily drive a feature walkthrough — trends that move,
// history that goes back months, findings, share links, a credit balance that
// has been spent down — and it will not let anyone mistake it for proof. When
// there is real evidence to show, it is Argus's own dogfooded history uploaded
// to a deployed instance (FUTURENORMA §4, Step 4's note), not this.

import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const url = process.env.DATABASE_URL?.trim() ?? "";
const HOSTED = /neon\.tech|amazonaws\.com|supabase|render\.com|railway|\.cloud\b/i;
if (HOSTED.test(url)) {
  console.error("seed-demo refuses to run against a hosted database.");
  console.error(`  DATABASE_URL points at: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}`);
  console.error("  Unset it for PGlite, or use scripts/test-db.sh for a local server.");
  console.error("  Seeding a demo tenant into production would put invented numbers in the real ledger.");
  process.exit(2);
}

// Same trap as seed-dev: `createDb()` falls back to an *in-memory* PGlite when
// PGLITE_DATA_DIR is unset, and that variable lives in web/.env.local, which
// Next loads and a repo-root script does not. Without this the script prints
// URLs for a database that ceases to exist when the process ends.
if (!url) {
  process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR?.trim() || path.join(ROOT, ".pgdata");
}
if (!process.env.NORMA_STORAGE_DIR?.trim()) {
  process.env.NORMA_STORAGE_DIR = path.join(ROOT, ".storage");
}

const reset = process.argv.includes("--reset");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));
const { grantCredits, balance: creditBalance } = await import(path.join(DIST, "ledger.js"));
const { createStorage, blobKey } = await import(path.join(DIST, "storage.js"));

const db = await createDb();
await migrate(db);
const storage = await createStorage();

// ---------------------------------------------------------------------------
// Names. All of them announce themselves.
// ---------------------------------------------------------------------------

const ORG_NAME = "DEMO — Northwind Retail (sample data)";
const REPOS = ["demo-storefront", "demo-checkout", "demo-design-system"];

console.log(url ? `database: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}` : `database: PGlite at ${process.env.PGLITE_DATA_DIR}`);

const existing = (await db.query("SELECT id FROM orgs WHERE name = $1", [ORG_NAME])).rows[0];
if (existing && !reset) {
  console.log(`\nThe demo organization already exists: ${existing.id}`);
  console.log("Re-run with --reset to delete and rebuild it.");
  await printLinks(existing.id);
  await db.close();
  process.exit(0);
}
if (existing) {
  // Everything cascades from orgs (migration 001), which is exactly the
  // property `retention.ts` relies on for org deletion. One statement.
  await db.query("DELETE FROM orgs WHERE id = $1", [existing.id]);
  console.log("\nremoved the previous demo organization");
}

const orgId = randomUUID();
await db.query(
  "INSERT INTO orgs (id, name, plan, subscription_status, subscription_status_at) VALUES ($1,$2,'team','active',now())",
  [orgId, ORG_NAME]
);
console.log(`\norganization: ${ORG_NAME}\n  ${orgId}`);

const repoIds = {};
for (const name of REPOS) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,$3)", [id, orgId, name]);
  repoIds[name] = id;
}

// ---------------------------------------------------------------------------
// Credits: a month's allowance, partly spent, plus a pack.
// ---------------------------------------------------------------------------
//
// The account page and the run report both read a *balance*, and an untouched
// 500 tells you nothing about whether spending works. This grants the real
// monthly allotment and a real pack, then the runs below consume against them.

const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0, 23, 59, 59));
const inAYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
await grantCredits(db, {
  orgId,
  kind: "plan_allotment",
  credits: 500,
  expiresAt: monthEnd,
  sourceRef: `demo-allotment-${orgId}`,
});
await grantCredits(db, {
  orgId,
  kind: "pack_purchase",
  credits: 200,
  expiresAt: inAYear,
  sourceRef: `demo-pack-${orgId}`,
  priceMicrodollars: 12_000_000,
});

// ---------------------------------------------------------------------------
// The history. Twelve weeks, three repositories, six frames.
// ---------------------------------------------------------------------------
//
// Shapes chosen so each page has something worth looking at:
//
//   demo-storefront     (threshold 0.1% throughout)
//     home              a regression that appears, persists, and is fixed
//     product-detail    drifts once, gets fixed, drifts again — recurrence
//   demo-checkout       (threshold 0.1% throughout)
//     cart              quiet throughout; the common case, and it must look calm
//     payment           skipped twice — the capture failed, which is a gap
//   demo-design-system  (threshold 0.1% → 5% at week 6, with the measurement)
//     search-results    baseline → fidelity mid-history
//     nav-bar           the same, so the transition is a property of the run
//
// Percentages are invented. They are internally consistent — flagged is
// genuinely `pct > threshold` for that run — so nothing on any page contradicts
// anything else, which is the difference between sample data and noise.

const WEEKS = 12;
const startedAt = Date.now() - WEEKS * 7 * 24 * 3600 * 1000;
const weekAt = (w) => new Date(startedAt + w * 7 * 24 * 3600 * 1000).toISOString();

/** Deterministic pseudo-sha, so re-running --reset gives the same labels. */
const shaFor = (repo, week) =>
  createHash("sha256").update(`${repo}:${week}`).digest("hex").slice(0, 40);

const STOREFRONT = [
  {
    frame: "home.png",
    mode: () => "baseline",
    source: () => "baseline",
    // clean, clean, regression appears at week 4, held, fixed at week 8
    series: [0.01, 0.02, 0.01, 0.44, 0.51, 0.47, 0.39, 0.03, 0.02, 0.02, 0.01, 0.02],
  },
  {
    frame: "product-detail.png",
    mode: () => "baseline",
    source: () => "baseline",
    // two separate regressions — the recurrence story
    series: [0.02, 0.31, 0.28, 0.02, 0.01, 0.02, 0.03, 0.02, 0.36, 0.41, 0.05, 0.04],
  },
];

// A repository of its own, and that is the point rather than tidiness.
//
// **A run carries one threshold for all of its frames** (`summary.threshold`),
// so a team that switches from "does it match last week" to "does it match the
// Figma" moves the threshold for the whole run. Putting that frame in with the
// storefront's meant the storefront's threshold jumped from 0.1% to 5% at week
// 6, which silently un-flagged `home.png`'s regression halfway through — a
// story that contradicted itself in the middle of a demo.
//
// Frames that are measured differently belong to different runs. The schema
// said so; the first cut of this file did not listen.
const DESIGN_SYSTEM = [
  {
    frame: "search-results.png",
    mode: (w) => (w < 6 ? "baseline" : "fidelity"),
    source: (w) => (w < 6 ? "baseline" : "figma"),
    series: [0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 4.9, 4.2, 3.8, 3.1, 2.4, 2.2],
  },
  {
    frame: "nav-bar.png",
    mode: (w) => (w < 6 ? "baseline" : "fidelity"),
    source: (w) => (w < 6 ? "baseline" : "figma"),
    series: [0.01, 0.02, 0.01, 0.02, 0.03, 0.02, 6.4, 5.9, 5.2, 4.4, 3.0, 2.8],
  },
];

const CHECKOUT = [
  {
    frame: "cart.png",
    mode: () => "baseline",
    source: () => "baseline",
    series: [0.0, 0.0, 0.01, 0.0, 0.0, 0.0, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0],
  },
  {
    frame: "payment.png",
    mode: () => "baseline",
    source: () => "baseline",
    // null = the capture produced no measurement. A gap, never a zero.
    series: [0.02, 0.03, null, null, 0.02, 0.04, 0.03, 0.02, 0.61, 0.58, 0.06, 0.05],
  },
];

/**
 * The threshold each run was judged against.
 *
 * It moves only in `demo-design-system`, and only where that repository's
 * measurement moved — because a threshold applies to a whole run, so changing
 * it changes the verdict for every frame in that run.
 */
const thresholdFor = (repo, week) =>
  repo === "demo-design-system" && week >= 6 ? 5 : 0.1;

async function seedRepo(repoName, frames) {
  const repoId = repoIds[repoName];
  const runIds = [];
  for (let week = 0; week < WEEKS; week++) {
    const runId = randomUUID();
    const at = weekAt(week);
    const threshold = thresholdFor(repoName, week);
    const compared = frames.filter((f) => f.series[week] !== null);
    const flagged = compared.filter((f) => f.series[week] > threshold);
    await db.query(
      `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at)
       VALUES ($1,$2,$3,$4,'main',$5,'committed',$6)`,
      [
        runId,
        orgId,
        repoId,
        shaFor(repoName, week),
        JSON.stringify({
          schemaVersion: 2,
          generatedAt: at,
          threshold,
          totals: { compared: compared.length, flagged: flagged.length, skipped: frames.length - compared.length },
          frames: [],
        }),
        at,
      ]
    );
    for (const frame of frames) {
      const pct = frame.series[week];
      await db.query(
        `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orgId,
          repoId,
          runId,
          frame.frame,
          frame.mode(week),
          frame.source(week),
          pct,
          pct === null ? null : Math.max(80, 100 - pct * 8),
          pct !== null && pct > threshold,
          at,
        ]
      );
    }
    runIds.push({ runId, week, at, threshold });
  }
  return { repoId, runIds };
}

const storefront = await seedRepo("demo-storefront", STOREFRONT);
const checkout = await seedRepo("demo-checkout", CHECKOUT);
await seedRepo("demo-design-system", DESIGN_SYSTEM);

// ---------------------------------------------------------------------------
// The latest storefront run gets images, findings and a share link.
// ---------------------------------------------------------------------------
//
// One run carries the full report experience. The captures are the real
// portfolio screenshots in `norma-bridge-usecase/` — genuine images of a real
// page, standing in for a shop that does not exist. That is the one thing here
// borrowed rather than invented, and it is borrowed for pixels only: no score,
// finding or claim on any demo page comes from that run.

const latest = storefront.runIds[storefront.runIds.length - 1];
const FIXTURES = path.join(ROOT, "norma-bridge-usecase");

async function artifact(runId, frame, kind, bytes, extension, contentType) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = blobKey(orgId, sha, extension);
  await storage.put(key, bytes, { contentType });
  await db.query(
    `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'committed')`,
    [randomUUID(), orgId, runId, frame, kind, key, sha, bytes.byteLength]
  );
}

try {
  await artifact(latest.runId, "home.png", "build", await readFile(path.join(FIXTURES, "screenshots", "norma-product.png")), "png", "image/png");
  await artifact(latest.runId, "home.png", "reference", await readFile(path.join(FIXTURES, "baseline", "norma-product.png")), "png", "image/png");
  await artifact(latest.runId, "home.png", "diff", await readFile(path.join(FIXTURES, "diff", "norma-product-diff.png")), "png", "image/png");
  await artifact(
    latest.runId,
    "home.png",
    "regions",
    Buffer.from(JSON.stringify({ version: 1, regions: [{ x: 960, y: 400, width: 336, height: 48 }] })),
    "json",
    "application/json"
  );
  await artifact(latest.runId, "cart.png", "thumbnail", await readFile(path.join(FIXTURES, "screenshots", "articles-index.png")), "png", "image/png");
  console.log("  images: attached to the most recent demo-storefront run");
} catch (err) {
  console.log(`  images: skipped (${err.message})`);
  console.log("    norma-bridge-usecase/ is missing — every other surface still works.");
}

// Findings on the run that has images. Written the way a model returns them,
// and prefixed so nobody quotes one back as a real diagnosis.
await db.query(
  `INSERT INTO run_findings (org_id, repo_id, run_id, frame, model, findings) VALUES ($1,$2,$3,$4,$5,$6)`,
  [
    orgId,
    storefront.repoId,
    latest.runId,
    "home.png",
    "demo-sample-not-a-real-model-call",
    JSON.stringify({
      findings: [
        {
          frame: "home.png",
          region: { x: 960, y: 400, width: 336, height: 48 },
          category: "colour",
          observation:
            "SAMPLE FINDING (demo data, not a real analysis): the primary call-to-action has lost its filled background and renders as an outline button.",
          cssHypothesis: "background-color is resolving to transparent",
          selector: ".hero__cta",
          codePointer: "src/components/Hero.tsx:42",
          suggestedFix: "Restore the --accent token on .hero__cta",
          confidence: "high",
        },
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// A key, a share link, and some spend on the books.
// ---------------------------------------------------------------------------

const key = await createApiKey(db, orgId, { kind: "upload", label: "DEMO — sample upload key" });
const shareToken = randomUUID().replace(/-/g, "");
await db.query(
  "INSERT INTO share_links (id, org_id, run_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)",
  [
    randomUUID(),
    orgId,
    latest.runId,
    createHash("sha256").update(shareToken).digest("hex"),
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  ]
);

// Spend, so the balance is a number somebody has moved rather than a full 500.
// `usage_events` is the ledger every customer-facing figure traces to, so demo
// spend is recorded there properly instead of being subtracted from a display.
const { recordUsage } = await import(path.join(DIST, "usage.js"));
const { consumeCredits } = await import(path.join(DIST, "ledger.js"));
let analyses = 0;
for (const frame of ["home.png", "product-detail.png"]) {
  for (let n = 0; n < 9; n++) {
    await consumeCredits(db, orgId, 4);
    await recordUsage(db, {
      orgId,
      runId: latest.runId,
      frame,
      model: "claude-sonnet-5",
      pass: "analysis",
      status: "ok",
      creditsCharged: 4,
      costMicrodollars: 8300,
      usage: {
        inputTokens: 2400,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        outputTokens: 519,
      },
    });
    analyses++;
  }
}

const balance = await creditBalance(db, orgId);

await printLinks(orgId);

async function printLinks(id) {
  const repos = (await db.query("SELECT id, name FROM repos WHERE org_id = $1 ORDER BY name", [id])).rows;
  const run = (
    await db.query(
      "SELECT id FROM runs WHERE org_id = $1 AND state = 'committed' ORDER BY created_at DESC LIMIT 1",
      [id]
    )
  ).rows[0];
  console.log("\n─── the demo tenant ───────────────────────────────────────────");
  for (const repo of repos) {
    console.log(`  repository   /repos/${repo.id}   (${repo.name})`);
  }
  if (run) {
    console.log(`  run report   /r/${run.id}`);
  }
  console.log(
    "\n  Every figure in this tenant is invented.\n" +
      "\n  The organization name is the top breadcrumb on the repository, trend and\n" +
      "  run-report pages, so 'DEMO — … (sample data)' is on screen throughout a\n" +
      "  walkthrough. **A share link is the exception**: share views carry no\n" +
      "  breadcrumb by design, so a report opened from one shows no demo label.\n" +
      "  Say it out loud if you send one.\n" +
      "\n  Do not present any of this as a measurement, a customer, or evidence that\n" +
      "  anything works — that is FUTURENORMA Doctrine 2, and the room where it\n" +
      "  matters most is a sales call."
  );
}

console.log(`\n  ${WEEKS} weekly runs per repository, 6 frames, ${analyses} recorded analyses`);
console.log(`  credit balance: ${balance} (500 allowance + 200 pack, spent down)`);
console.log(`\n  upload key (shown once, as in production):\n    ${key.plaintext}`);
console.log(`  share link:\n    /r/${latest.runId}?share=${shareToken}`);
console.log("\n  NORMA_DEV_OPEN=1 must be set for the /repos pages to answer at all.");

await db.close();
