#!/usr/bin/env node
//
// The real organization — genuine runs, genuine images, genuine numbers.
//
//   npm run seed:real                # PGlite, the dev default
//   npm run seed:real -- --reset     # delete and rebuild it
//
// `npm run seed:demo` calls this too, so the ordinary walkthrough has both
// tenants side by side.
//
// ── Why this exists beside `seed-demo.mjs` ───────────────────────────────────
//
// `seed-demo` invents twelve weeks of history so trends, sparklines, gaps and
// recurrence all have something to draw. That is the right shape for showing
// what the product does, and it is the wrong shape for showing that the product
// *works* — every number in it is made up, and it says so on every page.
//
// This is the other half. Four runs that actually happened, against real sites,
// recorded in this repository since July: the portfolio capture in
// `norma-bridge-usecase/` and cases 01, 03 and 05 in `test-run/`. Every
// percentage, SSIM, region count and image below is read out of the summary
// `norma-scope` wrote at the time. Nothing here is authored by this script.
//
// The two organizations are deliberately separate, and it is the same rule that
// names the demo one:
//
//   - the demo org is called `DEMO — … (sample data)` so nobody mistakes an
//     invented figure for a measurement;
//   - this one is called `REAL — …` so nobody stamps "(sample data)" on a
//     figure that *is* a measurement.
//
// Folding these runs into the demo tenant would have put real evidence under a
// label saying it is not evidence, which is FUTURENORMA Doctrine 2 pointed
// backwards.
//
// ── What is deliberately absent: money ───────────────────────────────────────
//
// Case 03 was a real, billed Anthropic call — `terminal-output.txt` records
// 3,753 in / 409 out on Haiku 4.5 and 6 in / 3,772 out / 2,696 cache-read on
// Sonnet 5. Those tokens are real and the findings below came out of them.
//
// **They are still not written to `usage_events`, and that is on purpose.** That
// spend went through the CLI against a personal key, before the hosted meter
// existed. There is no per-frame breakdown, the printed estimate was computed
// against the Sonnet price that has since been corrected (§3), and a hosted
// `usage` row is a claim that *this* system metered *that* call. It did not.
//
// So this organization has a credit grant and an empty ledger. The report pages
// render; the balance is untouched; nothing anywhere implies a hosted call was
// made. Doctrine 2 is that every customer-facing figure traces to a recorded
// usage object times a live price — the way to honour it with data like this is
// to leave the ledger alone, not to reconstruct one.

import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

/**
 * The organization's name.
 *
 * Mirrors the demo tenant's shape — prefix, name, parenthetical — because the
 * two sit next to each other and the prefix is the thing a viewer reads first.
 * It is the top breadcrumb on every repository, trend and run page.
 */
export const REAL_ORG_NAME = "REAL — Normascope's own runs (measured)";

// ---------------------------------------------------------------------------
// The runs, as they were recorded.
// ---------------------------------------------------------------------------
//
// `summary` is the path to the summary.json `norma-scope` wrote. Everything —
// threshold, totals, per-frame percentages, SSIM, mode, source, flagged — is
// read from it. This table says only *where the files are*, never what they say.
//
// `images` maps an artifact kind to the directory holding it, and `{stem}` is
// the screenshot's filename without its extension. A kind with no directory is
// a kind that run did not keep: cases 03 and 05 have the diff overlays and not
// the captures they were made from, so their frames render as a single pane.
// That is what those runs contain, and inventing the missing two would be the
// one thing this file exists not to do.

/**
 * A branch is only ever written where one was actually recorded.
 *
 * Case 05's README names the branch it pushed. Nothing else here does — the
 * bridge capture and case 03 were run from a laptop, and `upload` reads the
 * branch from GITHUB_REF_NAME, so those runs genuinely have none. An earlier
 * draft of this file put `main` on them and `feat/normascope-action` on case 05,
 * both invented and one of them contradicting the README two directories away.
 * A plausible branch name is still a fabricated one; the page renders "—".
 */
const CASE_05_BRANCH = "demo/normascope-visual-verification";

/** The six scenarios of case 02, each a real one-line change measured on its own. */
const SCENARIOS = [
  ["s1-vertical-rhythm", "a vertical-rhythm change"],
  ["s2-container-width", "a container-width change"],
  ["s3-cta-button", "a call-to-action button change"],
  ["s4-image-aspect-ratio", "an image aspect-ratio change"],
  ["s5-design-token-drift", "a design-token change — the 97% one"],
  ["s6-control-no-change", "the control: nothing changed, and nothing flagged"],
];

const RUNS = [
  {
    repo: "normascope-site",
    dir: "norma-bridge-usecase",
    summary: "reports/summary.json",
    branch: "",
    images: {
      build: "screenshots/{stem}.png",
      reference: "baseline/{stem}.png",
      diff: "diff/{stem}-diff.png",
    },
    note: "The portfolio capture — the run that proved the upload pipeline end to end.",
  },
  {
    repo: "normascope-site",
    dir: "test-run/case-03-explain-ai",
    summary: "summary.json",
    branch: "",
    images: { diff: "diff/{stem}-diff.png" },
    // The one run with real model output attached. `findings.json` is verbatim
    // from the billed call described at the top of this file.
    findings: "findings.json",
    note: "Case 03 — the explain run. Real findings, including the two that were wrong.",
  },
  {
    repo: "normascope-site",
    dir: "test-run/case-05-pr-github-action",
    summary: "summary.json",
    branch: CASE_05_BRANCH,
    images: { diff: "diff/{stem}-diff.png" },
    note: "Case 05 — the same site on a real pushed branch, through the GitHub Action.",
  },
  /*
   * Case 02, in a repository of its own.
   *
   * Six runs, seven frames each, and every one carries all three images — which
   * is why they are here at all: cases 03 and 05 kept only the diff overlays, so
   * a real run report had a single pane where the demo tenant has a triptych.
   *
   * **They are not folded in with the runs above, and the reason is the chart.**
   * Each scenario is an independent one-line change measured against the *same*
   * baseline and then reverted — six experiments, not six commits on a branch.
   * Joined into one repository's history, the trend line would climb to 87% and
   * fall back to 0.4%, which reads as "it broke and somebody fixed it" and is a
   * story about a codebase that never existed. In their own repository the run
   * list is the honest reading: six deliberate changes, each caught.
   *
   * The reference is the case's shared `baseline/`, two directories up from each
   * scenario, because that is where one copy of it lives.
   */
  ...SCENARIOS.map(([slug, what]) => ({
    repo: "normascope-site-scenarios",
    dir: `test-run/case-02-regression-portfolio/scenarios/${slug}`,
    summary: "summary.json",
    branch: "",
    images: {
      build: "screenshots/{stem}.png",
      reference: "../../baseline/{stem}.png",
      diff: "diff/{stem}-diff.png",
    },
    note: `Case 02 ${slug} — ${what}.`,
  })),
  {
    repo: "bose-landing",
    dir: "test-run/case-01-fidelity-bose",
    summary: "summary.json",
    branch: "",
    images: {
      build: "screenshots/{stem}.png",
      reference: "design/{stem}.png",
      diff: "diff/{stem}-diff.png",
    },
    note: "Case 01 — a third-party landing page against its own Figma frame. Not our site, which is the point.",
  },
];

const CONTENT_TYPE = { build: "image/png", reference: "image/png", diff: "image/png" };

const stemOf = (screenshot) => screenshot.replace(/\.[^.]+$/, "");

/**
 * Seed the real organization.
 *
 * Takes an open `db` and `storage` rather than making its own, so `seed-demo`
 * can build both tenants against one connection and one storage root.
 *
 * Returns null when the source files are missing — a checkout without
 * `test-run/` is a normal thing to have, and it must not fail the demo seed.
 */
export async function seedRealRuns(db, storage, { reset = false, log = console.log } = {}) {
  const { grantCredits } = await import(path.join(DIST, "ledger.js"));
  const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));
  const { blobKey } = await import(path.join(DIST, "storage.js"));

  // Read every summary before writing anything. A half-seeded organization is
  // worse than an absent one: it looks complete and its trends are short.
  let sources;
  try {
    sources = await Promise.all(
      RUNS.map(async (run) => ({
        ...run,
        data: JSON.parse(await readFile(path.join(ROOT, run.dir, run.summary), "utf-8")),
      }))
    );
  } catch (err) {
    log(`  real runs: skipped (${err.message})`);
    log("    The captures under norma-bridge-usecase/ or test-run/ are missing.");
    return null;
  }

  const existing = (await db.query("SELECT id FROM orgs WHERE name = $1", [REAL_ORG_NAME])).rows[0];
  if (existing && !reset) {
    log(`\nThe real organization already exists: ${existing.id}`);
    log("  Re-run with --reset to delete and rebuild it.");
    return { orgId: existing.id, rebuilt: false };
  }
  if (existing) {
    await db.query("DELETE FROM orgs WHERE id = $1", [existing.id]);
  }

  const orgId = randomUUID();
  await db.query(
    "INSERT INTO orgs (id, name, plan, subscription_status, subscription_status_at) VALUES ($1,$2,'team','active',now())",
    [orgId, REAL_ORG_NAME]
  );

  // A month's allowance and nothing spent — see the note at the top of the file.
  const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0, 23, 59, 59));
  await grantCredits(db, {
    orgId,
    kind: "plan_allotment",
    credits: 500,
    expiresAt: monthEnd,
    sourceRef: `real-allotment-${orgId}`,
  });

  const repoIds = {};
  for (const name of [...new Set(RUNS.map((r) => r.repo))]) {
    const id = randomUUID();
    await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,$3)", [id, orgId, name]);
    repoIds[name] = id;
  }

  let artifactCount = 0;
  let artifactBytes = 0;
  let findingCount = 0;
  const runLinks = [];

  // Oldest first, so `created_at` ordering matches the order they happened in
  // and the trend chart reads left to right the way the work did.
  for (const source of [...sources].sort((a, b) => a.data.generatedAt.localeCompare(b.data.generatedAt))) {
    const summary = source.data;
    const repoId = repoIds[source.repo];
    const runId = randomUUID();
    const at = summary.generatedAt;

    await db.query(
      `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at)
       VALUES ($1,$2,$3,'',$4,$5,'committed',$6)`,
      // `commit_sha` is empty because none of these runs recorded one — they were
      // run from a laptop, and `upload` reads the SHA from GITHUB_SHA. Writing a
      // plausible hex string here would be the smallest possible fabrication and
      // still a fabrication; the page renders "none" and the explainer says why.
      [runId, orgId, repoId, source.branch, JSON.stringify(summary), at]
    );

    for (const frame of summary.frames) {
      const key = frame.screenshot;
      const compared = frame.status === "compared";
      await db.query(
        `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          orgId,
          repoId,
          runId,
          key,
          frame.mode,
          frame.source,
          compared ? frame.alignedMismatchPercent : null,
          compared ? frame.structuralSimilarity : null,
          Boolean(frame.flagged),
          at,
        ]
      );

      for (const [kind, template] of Object.entries(source.images)) {
        const file = path.join(ROOT, source.dir, template.replace("{stem}", stemOf(key)));
        let bytes;
        try {
          bytes = await readFile(file);
        } catch {
          // A frame whose overlay was not kept. Skipped silently: the run's own
          // summary is still the record, and the page handles a missing pane.
          continue;
        }
        const sha = createHash("sha256").update(bytes).digest("hex");
        await db.query(
          `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,'committed')`,
          [randomUUID(), orgId, runId, key, kind, blobKey(orgId, sha, "png"), sha, bytes.byteLength]
        );
        await storage.put(blobKey(orgId, sha, "png"), bytes, { contentType: CONTENT_TYPE[kind] });
        artifactCount++;
        artifactBytes += bytes.byteLength;
      }
    }

    if (source.findings) {
      findingCount += await attachFindings(db, storage, {
        orgId,
        repoId,
        runId,
        file: path.join(ROOT, source.dir, source.findings),
        blobKey,
      });
    }

    runLinks.push({ runId, repo: source.repo, at, note: source.note });
  }

  const key = await createApiKey(db, orgId, { kind: "upload", label: "REAL — sample upload key" });

  // A share link on the run with findings, so the share view — the one a
  // designer actually receives — is reachable without minting one by hand.
  // `capture-cloud-screens.mjs` photographs it; a walkthrough can open it.
  const shareRun = runLinks.find((r) => r.note.startsWith("Case 03")) ?? runLinks[0];
  const shareToken = randomUUID().replace(/-/g, "");
  await db.query(
    "INSERT INTO share_links (id, org_id, run_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      orgId,
      shareRun.runId,
      createHash("sha256").update(shareToken).digest("hex"),
      new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    ]
  );

  return {
    orgId,
    rebuilt: true,
    repoIds,
    runLinks,
    artifactCount,
    artifactBytes,
    findingCount,
    uploadKey: key.plaintext,
    share: { runId: shareRun.runId, token: shareToken },
  };
}

/**
 * Attach one run's recorded model output, and the regions those findings name.
 *
 * The regions sidecar is *derived from the findings*, not authored: each finding
 * already carries the rectangle the model was shown, and the report page draws
 * boxes from a `regions` artifact. Building it from the findings means the boxes
 * on the diff are exactly the boxes the findings talk about — which is the
 * invariant the sidecar exists to carry, and the one a hand-written fixture
 * would get wrong first.
 *
 * A run whose findings name no region gets no sidecar rather than an empty one.
 */
async function attachFindings(db, storage, { orgId, repoId, runId, file, blobKey }) {
  const recorded = JSON.parse(await readFile(file, "utf-8"));
  let count = 0;
  for (const [frame, entry] of Object.entries(recorded.frames ?? {})) {
    const findings = Array.isArray(entry.findings) ? entry.findings : [];
    if (findings.length === 0) {
      continue;
    }
    await db.query(
      "INSERT INTO run_findings (org_id, repo_id, run_id, frame, model, findings) VALUES ($1,$2,$3,$4,$5,$6)",
      [orgId, repoId, runId, frame, entry.model, JSON.stringify({ findings })]
    );
    count += findings.length;

    const regions = findings.map((f) => f.region).filter((r) => r && typeof r.x === "number");
    if (regions.length === 0) {
      continue;
    }
    const bytes = Buffer.from(JSON.stringify({ version: 1, regions }));
    const sha = createHash("sha256").update(bytes).digest("hex");
    await storage.put(blobKey(orgId, sha, "json"), bytes, { contentType: "application/json" });
    await db.query(
      `INSERT INTO run_artifacts (id, org_id, run_id, frame, kind, storage_key, sha256, bytes, declared_bytes, state)
       VALUES ($1,$2,$3,$4,'regions',$5,$6,$7,$7,'committed')`,
      [randomUUID(), orgId, runId, frame, blobKey(orgId, sha, "json"), sha, bytes.byteLength]
    );
  }
  return count;
}

// ---------------------------------------------------------------------------
// Standalone entry point.
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  const HOSTED = /neon\.tech|amazonaws\.com|supabase|render\.com|railway|\.cloud\b/i;
  if (HOSTED.test(url)) {
    // The same refusal as `seed-demo`, for a different reason. These numbers are
    // real, so they would not corrupt a ledger — but the organization is not a
    // customer, and a tenant nobody signed up for sitting in production is a
    // row somebody will later have to work out the provenance of.
    console.error("seed-real refuses to run against a hosted database.");
    console.error(`  DATABASE_URL points at: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}`);
    process.exit(2);
  }
  if (!url) {
    process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR?.trim() || path.join(ROOT, ".pgdata");
  }
  if (!process.env.NORMA_STORAGE_DIR?.trim()) {
    process.env.NORMA_STORAGE_DIR = path.join(ROOT, ".storage");
  }

  const { createDb, migrate } = await import(path.join(DIST, "db.js"));
  const { createStorage } = await import(path.join(DIST, "storage.js"));
  const db = await createDb();
  await migrate(db);
  const storage = await createStorage();

  const result = await seedRealRuns(db, storage, { reset: process.argv.includes("--reset") });
  if (result?.rebuilt) {
    printRealSummary(result);
  }
  await db.close();
}

/** Shared by this file's own entry point and by `seed-demo`. */
export function printRealSummary(result, log = console.log) {
  log(`\n─── the real tenant ───────────────────────────────────────────`);
  log(`  ${REAL_ORG_NAME}\n  ${result.orgId}`);
  for (const [name, id] of Object.entries(result.repoIds)) {
    log(`  repository   /repos/${id}   (${name})`);
  }
  for (const run of result.runLinks) {
    log(`  run report   /r/${run.runId}   ${run.at.slice(0, 10)}  ${run.note}`);
  }
  log(
    `\n  ${result.runLinks.length} real runs · ${result.artifactCount} images ` +
      `(${(result.artifactBytes / 1024 / 1024).toFixed(1)} MB) · ${result.findingCount} recorded findings`
  );
  log(
    "\n  Every number in this tenant came out of norma-scope on a real site, and\n" +
      "  every image is the file it wrote. Two of case 03's findings are wrong —\n" +
      "  test-run/README.md says which — and they are shown as recorded.\n" +
      "\n  The credit balance is a full 500 and the ledger is empty on purpose: the\n" +
      "  billed call behind those findings went through the CLI, not through this\n" +
      "  system, and a usage row here would claim otherwise."
  );
  log(`\n  upload key (shown once, as in production):\n    ${result.uploadKey}`);
  log(`  share link:\n    /r/${result.share.runId}?share=${result.share.token}`);
  log(
    "\n  A share view carries no breadcrumb by design, so it does not name this\n" +
      "  organization. That is the right behaviour and it costs the 'REAL —' label:\n" +
      "  someone sent this link sees measured numbers with nothing saying so."
  );
}
