// The real organization — `scripts/seed-real.mjs`.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/realSeed.test.mjs
//
// **Why a seed script has a suite at all.** This one puts *measurements* on a
// page. Every other fixture in this repo is invented and labelled invented; this
// one is the opposite, and FUTURENORMA Doctrine 2 says a figure that reaches a
// customer traces to a recording or it does not get shown. The way that breaks
// is not dramatically — it is one `Math.round`, one plausible commit hash, one
// frame whose image file was renamed and now silently seeds without it. So what
// is checked here is that the script *copies* and never *computes*.
//
// **V2.5b is a counter-test that does not bite, and says so.** The intended
// shape was: write `flagged` as `pct > threshold` instead of copying the
// recorded flag, and watch a row flip. Run against these ten summaries, the two
// rules agree on all 59 rows — no value sits on its threshold, so there is
// nothing for the tie-break to decide. Rather than dress that up, the check
// reports the comparison and asserts the weaker thing it can actually prove:
// that the script reads the recorded field. CLAUDE.md rule 3 says a test that
// has only ever been green may be asserting nothing; the honest response is to
// name which half of this one is real.

import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createFilesystemStorage } = await import(path.join(DIST, "storage/filesystem.js"));
const { seedRealRuns, REAL_ORG_NAME } = await import(path.join(ROOT, "scripts/seed-real.mjs"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const dir = await mkdtemp(path.join(tmpdir(), "real-seed-"));
const storage = createFilesystemStorage({
  root: dir,
  publicBaseUrl: "http://localhost:3000/api/blob",
  signingSecret: "test-secret-for-real-seed",
});
const db = await createDb();
await migrate(db);

const result = await seedRealRuns(db, storage, { reset: true, log: () => {} });

// ═══ V1 — it seeded, from files that are really there ═══
{
  check("V1.1", result !== null && result.rebuilt, "the real organization was built");
  check("V1.2", result.runLinks.length >= 4, `${result.runLinks?.length} runs seeded from recorded captures`);
  check("V1.3", result.artifactCount > 0, `${result.artifactCount} images attached (${(result.artifactBytes / 1024 / 1024).toFixed(1)} MB)`);

  // The captures live in `norma-bridge-usecase/` and `test-run/`, outside any
  // build step, so a rename or a tidy-up there is invisible until a report page
  // shows a frame with no images. `seedRealRuns` skips a missing file silently
  // and by design — a partial checkout must not fail the demo seed — which is
  // exactly why the check belongs here instead.
  const src = await readFile(path.join(ROOT, "scripts/seed-real.mjs"), "utf-8");
  const dirs = [...src.matchAll(/dir:\s*[`"]([^`"$]+)[`"]/g)].map((m) => m[1]);
  const scenarios = [...src.matchAll(/\["(s\d-[a-z-]+)",/g)].map((m) => m[1]);
  const all = [
    ...dirs,
    ...scenarios.map((s) => `test-run/case-02-regression-portfolio/scenarios/${s}`),
  ];
  const missing = [];
  for (const d of all) {
    try {
      await access(path.join(ROOT, d));
    } catch {
      missing.push(d);
    }
  }
  check("V1.4", missing.length === 0, `every source directory exists (${all.length} checked)${missing.length ? ` — missing: ${missing.join(", ")}` : ""}`);
}

// Stop here rather than throwing on `result.orgId`. `seedRealRuns` returns null
// when a capture directory is missing, and every check below reads the database
// it did not write — a TypeError three checks later says less than one line.
if (!result?.rebuilt) {
  console.log("\nrealSeed: 1 FAILED — nothing was seeded, so nothing below could run");
  await db.close();
  await rm(dir, { recursive: true, force: true });
  process.exit(1);
}

const orgId = result.orgId;

// ═══ V2 — every number in the database is the number in the summary ═══
//
// The whole point. `frame_stats` is what the trend chart, the sparkline, the
// repository view and first-drift all read; if a value here were derived rather
// than copied, four surfaces would show a figure with no recording behind it.

{
  const runs = (
    await db.query(
      `SELECT r.id, r.summary, r.commit_sha, r.branch, p.name AS repo
         FROM runs r JOIN repos p ON p.id = r.repo_id
        WHERE r.org_id = $1 ORDER BY r.created_at`,
      [orgId]
    )
  ).rows;

  let rows = 0;
  let mismatched = [];
  let flaggedRecorded = 0;
  let flaggedRecomputed = 0;

  for (const run of runs) {
    const summary = typeof run.summary === "string" ? JSON.parse(run.summary) : run.summary;
    for (const frame of summary.frames) {
      const stat = (
        await db.query(
          "SELECT * FROM frame_stats WHERE run_id = $1 AND frame = $2",
          [run.id, frame.screenshot]
        )
      ).rows[0];
      if (!stat) {
        mismatched.push(`${run.repo}/${frame.screenshot}: no row`);
        continue;
      }
      rows++;
      const same =
        stat.mode === frame.mode &&
        stat.source === frame.source &&
        Number(stat.aligned_mismatch_percent) === frame.alignedMismatchPercent &&
        Number(stat.structural_similarity) === frame.structuralSimilarity &&
        stat.flagged === Boolean(frame.flagged);
      if (!same) {
        mismatched.push(
          `${run.repo}/${frame.screenshot}: ${stat.aligned_mismatch_percent}/${stat.structural_similarity}/${stat.flagged} vs recorded ${frame.alignedMismatchPercent}/${frame.structuralSimilarity}/${frame.flagged}`
        );
      }
      if (frame.flagged) flaggedRecorded++;
      if (frame.alignedMismatchPercent > summary.threshold) flaggedRecomputed++;
    }
  }

  // Exact, not a floor. A floor passes while a whole run quietly stops seeding —
  // which is the failure mode, since `seedRealRuns` skips missing files by
  // design. Update it deliberately when a capture is added.
  check("V2.1", rows === 59, `${rows} frame rows checked against their summaries (expected 59)`);
  check(
    "V2.2",
    mismatched.length === 0,
    mismatched.length === 0
      ? "every percentage, SSIM, mode, source and flag is the recorded one"
      : `${mismatched.length} rows differ from what was recorded: ${mismatched.slice(0, 3).join(" | ")}`
  );

  // A threshold belongs to a run, not to this script. It is read from the
  // summary and written nowhere else; the run's `summary` column is the verbatim
  // file, which is what makes the check above possible at all.
  const thresholds = runs.map((r) => (typeof r.summary === "string" ? JSON.parse(r.summary) : r.summary).threshold);
  check("V2.3", new Set(thresholds).size > 1, `the runs carry the thresholds they were judged at (${[...new Set(thresholds)].join(", ")}%) — not one value chosen here`);

  // No invented provenance. Case 05's README names its branch; nothing else
  // recorded one, and those runs must say so rather than reading "main".
  const branches = runs.map((r) => r.branch);
  check(
    "V2.4",
    branches.filter((b) => b !== "").length === 1 &&
      branches.includes("demo/normascope-visual-verification"),
    `exactly one run carries a branch, and it is the one whose README records it (${branches.filter(Boolean).join(", ") || "none"})`
  );
  check(
    "V2.5",
    runs.every((r) => r.commit_sha === ""),
    "no run carries a commit SHA, because none of these runs recorded one"
  );

  /*
   * V2.5b — the counter-test, and an honest account of how much it proves.
   *
   * Recomputing `flagged` as `pct > threshold` is the obvious shortcut. On this
   * corpus it agrees on every row, because no recorded value sits exactly on its
   * threshold — so the disagreement the check was written to catch does not
   * occur, and pretending otherwise would make this a green light that means
   * nothing.
   *
   * What is asserted instead is the thing that is true and checkable: the script
   * reads the recorded field. If the two rules ever *do* diverge on new data,
   * the printed comparison says so on the next run.
   */
  const seedSrc = await readFile(path.join(ROOT, "scripts/seed-real.mjs"), "utf-8");
  check(
    "V2.5b",
    seedSrc.includes("Boolean(frame.flagged)") &&
      !/aligned\w*\s*>\s*(summary\.)?threshold/.test(seedSrc),
    `the flag is copied, never recomputed — recorded ${flaggedRecorded}, pct > threshold would give ${flaggedRecomputed}` +
      (flaggedRecorded === flaggedRecomputed
        ? " (identical on this corpus, so this asserts the code and not the data)"
        : " (they disagree here, which is the reason to copy)")
  );
}

// ═══ V3 — recorded model output is stored as recorded ═══
{
  const findings = (
    await db.query("SELECT frame, model, findings FROM run_findings WHERE org_id = $1", [orgId])
  ).rows;
  check("V3.1", findings.length > 0, `${findings.length} frames carry recorded findings`);
  check(
    "V3.2",
    findings.every((f) => f.model === "claude-sonnet-5"),
    `the model is the one that was actually called (${[...new Set(findings.map((f) => f.model))].join(", ")})`
  );

  const source = JSON.parse(
    await readFile(path.join(ROOT, "test-run/case-03-explain-ai/findings.json"), "utf-8")
  );
  const forFrame = findings.find((f) => f.frame === "norma-hero.png");
  const parsed = typeof forFrame.findings === "string" ? JSON.parse(forFrame.findings) : forFrame.findings;
  check(
    "V3.3",
    parsed.findings.length === source.frames["norma-hero.png"].findings.length,
    "every finding recorded for a frame is stored, including the ones that turned out wrong"
  );
  check(
    "V3.4",
    parsed.findings.some((f) => f.category === "injection-suspected"),
    "the injection-suspected finding is kept — it is the one the page renders differently"
  );

  // The regions sidecar is derived from the findings rather than authored, so
  // the boxes drawn on the diff are the boxes the findings talk about.
  const regions = (
    await db.query(
      "SELECT frame, storage_key FROM run_artifacts WHERE org_id = $1 AND kind = 'regions'",
      [orgId]
    )
  ).rows;
  check("V3.5", regions.length > 0, `${regions.length} region sidecars, one per frame with located findings`);
  const bytes = await storage.get(regions[0].storage_key);
  const box = JSON.parse(Buffer.from(bytes).toString("utf-8"));
  const recorded = source.frames[regions[0].frame].findings.filter((f) => f.region);
  check(
    "V3.6",
    box.regions.length === recorded.length &&
      box.regions[0].x === recorded[0].region.x &&
      box.regions[0].y === recorded[0].region.y,
    "the sidecar's rectangles are the findings' own rectangles, in order"
  );
}

// ═══ V4 — the ledger is empty, and the two tenants cannot be confused ═══
{
  const usage = (await db.query("SELECT COUNT(*)::int AS n FROM usage_events WHERE org_id = $1", [orgId])).rows[0];
  check(
    "V4.1",
    usage.n === 0,
    "no usage rows: the billed call behind these findings went through the CLI, and a hosted usage row would claim otherwise"
  );

  const org = (await db.query("SELECT name FROM orgs WHERE id = $1", [orgId])).rows[0];
  check("V4.2", org.name === REAL_ORG_NAME && org.name.startsWith("REAL —"), `the organization announces itself: "${org.name}"`);
  check(
    "V4.3",
    !org.name.toLowerCase().includes("sample") && !org.name.toLowerCase().includes("demo"),
    "and never as sample data, because these are measurements"
  );

  // The scenarios are their own repository. Folded in with the site's other
  // runs, the trend line would join six independent experiments into one
  // history that climbs to 87% and falls back — a story about a codebase that
  // never existed. `seed-real.mjs` carries the reasoning.
  const repos = (await db.query("SELECT name FROM repos WHERE org_id = $1 ORDER BY name", [orgId])).rows.map((r) => r.name);
  check(
    "V4.4",
    repos.includes("normascope-site") && repos.includes("normascope-site-scenarios"),
    `case 02's scenarios are kept out of the site's own history (${repos.join(", ")})`
  );

  // At least one run has all three image kinds. Without it the report page's
  // whole argument — the three captures side by side — has no real example, and
  // the only picture anyone could take of a measured run is a lone diff pane.
  const triptych = (
    await db.query(
      `SELECT COUNT(DISTINCT kind) AS kinds FROM run_artifacts
        WHERE org_id = $1 AND kind IN ('build','reference','diff')
        GROUP BY run_id, frame ORDER BY kinds DESC LIMIT 1`,
      [orgId]
    )
  ).rows[0];
  check("V4.5", Number(triptych?.kinds) === 3, `a real frame has build, reference and diff (${triptych?.kinds} kinds)`);
}

// Leave the shared database as it was found. Suites run sequentially against one
// server when DATABASE_URL is set (`scripts/run-tests.mjs`), and this one inserts
// an organization with a fixed, recognisable name — exactly the kind of leftover
// that makes a later suite's count depend on whether this one ran first.
await db.query("DELETE FROM orgs WHERE name = $1", [REAL_ORG_NAME]);
await db.close();
await rm(dir, { recursive: true, force: true });

console.log(`\n${failures === 0 ? "realSeed: all checks green" : `realSeed: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
