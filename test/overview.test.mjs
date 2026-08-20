// The overview: the whole retained history of one frame, compressed to a shape.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/overview.test.mjs
//
// **What this suite is for.** Downsampling is the one place in this product
// where the honest implementation and the cheap one produce charts that look
// equally plausible and disagree about whether anything happened. An average
// hides a one-run spike behind fifty clean runs; "every nth run" skips it
// outright. Either way the picture is calm and the customer's site was broken.
//
// So the bucket contract is: **five recorded facts, no derived ones.** Lowest,
// highest, first, last, and whether runs inside the bucket disagreed about
// crossing the threshold. Every one of those is a value some run wrote down.
//
// Two counter-tests, in the sense of CLAUDE.md rule 3:
//
//   O2.4b — the same data bucketed by mean. The spike vanishes, and the check
//           prints the number the reader would have seen instead.
//   O2.5b — the same data sampled every nth run. Whether the spike survives is
//           decided by where the sampling window happens to land.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const WEB = path.join(ROOT, "web");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const {
  frameOverview,
  overviewRanges,
  overviewRange,
  parseSpan,
  OVERVIEW_BUCKETS,
  MAX_INTERACTIVE_POINTS,
  DETAIL_SIZES,
} = await import(path.join(DIST, "trendData.js"));

/** Comments say what the code should do; these checks are about what it does. */
const decomment = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const orgId = randomUUID();
await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1,'overview-suite','team')", [orgId]);
const repoId = randomUUID();
await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,'ov')", [repoId, orgId]);

const NOW = new Date("2026-08-20T12:00:00.000Z");
const daysAgo = (d) => new Date(NOW.getTime() - d * 24 * 3600 * 1000);

/** One run of one frame, at a given time, with a given measurement. */
async function run(frame, at, pct, { threshold = 0.5 } = {}) {
  const runId = randomUUID();
  await db.query(
    `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at)
     VALUES ($1,$2,$3,$4,'main',$5,'committed',$6)`,
    [runId, orgId, repoId, runId.slice(0, 10), JSON.stringify({ threshold }), at.toISOString()]
  );
  await db.query(
    `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged, created_at)
     VALUES ($1,$2,$3,$4,'baseline','baseline',$5,$6,$7,$8)`,
    [orgId, repoId, runId, frame, pct, pct === null ? null : 100 - pct, pct !== null && pct > threshold, at.toISOString()]
  );
  return runId;
}

// ═══ O1 — the ladder, and what its largest step means ═══
{
  check("O1.1", overviewRanges(90).join(",") === "7,30,90",
    `a 90-day plan gets ${overviewRanges(90).join(" / ")} — the last one *is* all retained`);

  // The dead-option rule. "All retained" printed beside a 90 that means the same
  // thing is a control where one choice does nothing.
  check("O1.2", new Set(overviewRanges(90)).size === overviewRanges(90).length,
    "no step is offered twice, so no option returns the same chart as its neighbour");

  // FUTURENORMA §3 plans a tier ladder after validation. A hard-coded 90 would
  // be wrong and quietly lossy the day a plan carries more.
  check("O1.3", overviewRanges(365).join(",") === "7,30,365",
    `a 365-day plan gets ${overviewRanges(365).join(" / ")} — the ladder follows retention, it is not written down`);
  check("O1.4", overviewRanges(14).join(",") === "7,14",
    "and a plan retaining less than 30 days never offers 30, because there is nothing there");

  check("O1.5", overviewRange("30", 90) === 30, "an offered range is honoured");
  check("O1.6", overviewRange("45", 90) === 90, "an unoffered one rounds up to the next real step, never erroring");
  check("O1.7", overviewRange("99999", 90) === 90, "and nothing exceeds retention");
  check("O1.8", overviewRange(undefined, 90) === 30, "the default is 30 days");
  check("O1.9", overviewRange("banana", 90) === 30, "junk falls back rather than emptying the chart");
}

// ═══ O2 — a one-run spike survives the compression ═══
//
// The case the whole design exists for: 60 days of a calm frame with a single
// bad run in the middle of it. Bucketed to 180 slices, that run shares a bucket
// with several clean ones.
{
  const frame = "spike.png";
  const values = [];
  for (let d = 60; d >= 0; d--) {
    for (const hour of [2, 8, 14, 20]) {
      // Hours *before* that day's mark, never after: `daysAgo(0)` is `NOW`, so
      // adding hours to it puts runs in the future, which the range correctly
      // refuses. O2.8 asserts that refusal rather than tiptoeing around it.
      const at = new Date(daysAgo(d).getTime() - hour * 3600 * 1000);
      // One run, on one day, at one hour, is 97%. Everything else is quiet.
      const pct = d === 30 && hour === 14 ? 97.4 : 0.02 + (d % 5) * 0.004;
      values.push(pct);
      await run(frame, at, pct);
    }
  }

  const ov = await frameOverview(db, {
    orgId, repoId, frame, days: 90, retentionDays: 90, now: NOW,
  });

  check("O2.1", ov !== null && ov.totalRuns === values.length,
    `every run in the range is accounted for (${ov?.totalRuns} of ${values.length})`);
  check("O2.2", ov.buckets.length <= OVERVIEW_BUCKETS,
    `the response is bounded at ${OVERVIEW_BUCKETS} buckets however much history there is (got ${ov.buckets.length})`);

  // O2.2b — the division of time, which is not the length of the array. Only
  // buckets holding runs are returned, so a renderer sizing a bar by
  // `buckets.length` widens every bar by however sparse the history is. It drew
  // six runs from one afternoon as a block across a quarter of a 90-day chart.
  check("O2.2b", ov.bucketCount === OVERVIEW_BUCKETS && ov.buckets.length < ov.bucketCount,
    `the range was divided into ${ov.bucketCount} buckets and ${ov.buckets.length} of them hold runs — a bar is 1/${ov.bucketCount} wide, not 1/${ov.buckets.length}`);

  const spikeBucket = ov.buckets.find((b) => b.hi !== null && b.hi > 90);
  check("O2.3", spikeBucket !== undefined && Math.abs(spikeBucket.hi - 97.4) < 1e-9,
    `the 97.4% run survives bucketing exactly, not approximately (got ${spikeBucket?.hi})`);
  check("O2.4", ov.peak !== null && Math.abs(ov.peak - 97.4) < 1e-9,
    "and it sets the chart's y-scale, so it cannot be drawn off the top either");

  // O2.4b — the counter-test. Mean over the same bucket.
  {
    const inBucket = [97.4, 0.02, 0.02, 0.02];
    const mean = inBucket.reduce((a, b) => a + b, 0) / inBucket.length;
    check("O2.4b", mean < 25 && spikeBucket.hi > 90,
      `a mean of that bucket reads ${mean.toFixed(2)}% — the reader sees a quiet day; min/max reads ${spikeBucket.hi}%`);
  }

  // O2.5b — the counter-test for "every nth run". Whether the spike is seen at
  // all depends on where the stride lands, which is not a property of the data.
  {
    const spikeAt = values.findIndex((v) => v > 90);
    const strides = [2, 3, 4, 5, 7];
    const seen = strides.filter((n) => spikeAt % n === 0);
    check("O2.5b", seen.length < strides.length,
      `sampled every nth run the spike is visible for stride ${seen.join(", ") || "(none)"} and invisible for the rest — the picture depends on the stride, not the site`);
  }

  check("O2.5", spikeBucket.crossing === true,
    "the bucket says its runs disagreed about crossing the threshold, which is the fact a coarse chart loses first");
  check("O2.6", spikeBucket.lo !== null && spikeBucket.lo < 1,
    `and it keeps the floor too (${spikeBucket.lo}%), so the band shows the spread rather than only the peak`);

  const first = ov.buckets[0];
  check("O2.7", first.first !== null && first.last !== null,
    "every bucket keeps its own first and last, so the line through them is made of real runs");

  // A run dated after `now` is not history. Clock skew on a CI runner is the
  // ordinary way this happens, and it must not stretch the axis into next week.
  await run(frame, new Date(NOW.getTime() + 3 * 3600 * 1000), 42);
  const after = await frameOverview(db, { orgId, repoId, frame, days: 90, retentionDays: 90, now: NOW });
  check("O2.8", after.totalRuns === ov.totalRuns && (after.peak ?? 0) < 98,
    `a run dated after now is excluded — still ${after.totalRuns} runs, peak still ${after.peak}%`);
}

// ═══ O3 — gaps stay gaps ═══
{
  const frame = "gaps.png";
  await run(frame, daysAgo(5), 0.4);
  await run(frame, daysAgo(4), null);
  await run(frame, daysAgo(3), 0.6);

  const ov = await frameOverview(db, { orgId, repoId, frame, days: 7, retentionDays: 90, now: NOW });
  const measured = ov.buckets.filter((b) => b.hi !== null);
  const skipped = ov.buckets.filter((b) => b.skipped > 0);

  check("O3.1", ov.totalRuns === 3, "a skipped run is still a run in the range");
  check("O3.2", skipped.length === 1 && skipped[0].hi === null && skipped[0].lo === null,
    "but it contributes no value, so a bucket of nothing but skips has no floor and no ceiling");
  check("O3.3", measured.every((b) => b.lo !== null && b.lo > 0),
    "and it never drags a bucket's floor to zero — a gap is not a pass");
}

// ═══ O4 — the range really does bound what is read ═══
{
  const frame = "range.png";
  await run(frame, daysAgo(80), 5);
  await run(frame, daysAgo(20), 4);
  await run(frame, daysAgo(2), 3);

  const week = await frameOverview(db, { orgId, repoId, frame, days: 7, retentionDays: 90, now: NOW });
  const month = await frameOverview(db, { orgId, repoId, frame, days: 30, retentionDays: 90, now: NOW });
  const all = await frameOverview(db, { orgId, repoId, frame, days: 90, retentionDays: 90, now: NOW });

  check("O4.1", week.totalRuns === 1, `7 days holds 1 of the 3 runs (got ${week.totalRuns})`);
  check("O4.2", month.totalRuns === 2, `30 days holds 2 (got ${month.totalRuns})`);
  check("O4.3", all.totalRuns === 3, `90 days — all retained — holds all 3 (got ${all.totalRuns})`);
  check("O4.4", all.retentionDays === 90 && all.days === 90,
    "and the overview carries retention beside the range, so the page can say which is which");

  const empty = await frameOverview(db, { orgId, repoId, frame: "nothing.png", days: 90, retentionDays: 90, now: NOW });
  check("O4.5", empty === null, "a frame with no runs in the range is null, not an empty chart");
}

// ═══ O5 — a brushed span, parsed from a URL a stranger controls ═══
{
  check("O5.1", parseSpan(undefined, undefined) === null, "no span is null");
  check("O5.2", parseSpan("2026-08-01T00:00:00Z", undefined) === null, "half a span is null");
  check("O5.3", parseSpan("banana", "2026-08-02T00:00:00Z") === null, "an unparseable bound is null");
  check("O5.4", parseSpan("2026-08-02T00:00:00Z", "2026-08-01T00:00:00Z") === null,
    "an inverted span is null rather than a silently empty chart");
  check("O5.5", parseSpan("2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z") === null,
    "and a zero-width one is too");

  const ok = parseSpan("2026-08-01T00:00:00Z", "2026-08-05T00:00:00Z");
  check("O5.6", ok !== null && ok.to > ok.from, "a real span parses");
}

// ═══ O6 — the interactivity bound is a stated number, not a feeling ═══
{
  check("O6.1", MAX_INTERACTIVE_POINTS <= 250 && MAX_INTERACTIVE_POINTS >= 150,
    `per-run marks and cards stop at ${MAX_INTERACTIVE_POINTS} points`);
  check("O6.2", DETAIL_SIZES[0] <= MAX_INTERACTIVE_POINTS,
    `the smallest detail size (${DETAIL_SIZES[0]}) is fully interactive, so one option always is`);
  check("O6.3", DETAIL_SIZES.some((n) => n > MAX_INTERACTIVE_POINTS),
    "and at least one is not, which is why the page has to label them differently");
}

// ═══ O7 — a printed number is a number some run recorded ═══
//
// Both charts scale their y-axis to `peak × 1.15`: 15% of empty chart above the
// data so the line is not welded to the top edge. Both then *printed* that
// number as the axis label, so a frame peaking at 87.6% carried "100.74%" — an
// impossible aligned mismatch, since it is a share of compared pixels and
// cannot exceed 100. The runs table three inches below said 84.96% on the
// repository where this was found.
//
// Doctrine 2: every figure a customer reads traces to a recording. Headroom may
// be invented. A number on the page may not.
{
  for (const [id, rel] of [
    ["O7.1", "app/repos/overview-chart.tsx"],
    ["O7.2", "app/repos/trend-chart.tsx"],
  ]) {
    const chart = decomment(await readFile(path.join(WEB, rel), "utf-8"));
    check(id, /peak\.toFixed\(2\)/.test(chart) && !/\{top\.toFixed/.test(chart),
      `${rel.split("/").pop()} labels its axis with a value some run recorded, never with the headroom constant`);
  }
}

await db.query("DELETE FROM orgs WHERE id = $1", [orgId]);
await db.close();

console.log(`\n${failures === 0 ? "overview: all checks green" : `overview: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
