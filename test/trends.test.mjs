// Trends — `BuildV5.md` Phase I (I1–I3), FUTURENORMA §4 Step 4.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/trends.test.mjs
//
// **What this suite can and cannot prove.** The repository view and the trend
// chart are React server components, and nothing here renders them. What is
// checked is everything they are a view onto: who may open a repository-wide
// view at all, how many queries a page of forty runs costs, where the
// first-drift annotation lands, what a skipped run becomes, and what the API
// refuses. The pages themselves were opened in a browser against a real build —
// see `FinishedSPEC.md` §3u. Neither kind of evidence substitutes for the other.
//
// Three counter-tests, in the sense of CLAUDE.md rule 3 — each is the naive
// implementation run through the same harness, to show the real check goes red:
//
//   T2.1b — first drift found by scanning the visible points for the first
//           flagged one, instead of asking `enrichment.ts`. It disagrees the
//           moment a frame has more history than the chart shows, which is
//           exactly the case Phase I's gate names.
//   T2.3b — a sparkline that treats "no measurement" as 0. It draws a pass that
//           never happened, on the run where a capture broke.
//   T1.1b — flagged counts fetched per run instead of as an aggregate. Correct,
//           and forty round trips at forty runs.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { frameHistory } = await import(path.join(DIST, "enrichment.js"));
const {
  assembleTrend,
  frameTrend,
  MAX_TREND_POINTS,
  DEFAULT_TREND_POINTS,
  MAX_FRAMES_LISTED,
  pageNumber,
  repoOrg,
  repoOverview,
  repoViewOpen,
  resolveRepo,
  SPARK_POINTS,
  trendLimit,
} = await import(path.join(DIST, "trendData.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

/**
 * A `Db` that counts the statements run through it.
 *
 * I1.1's pass condition is about the *number* of queries, not the answer, and
 * there is no way to check that from the outside. Wrapping the seam is the
 * cheapest honest way to assert it.
 */
function counting(inner) {
  const counter = { n: 0, statements: [], rows: 0 };
  return [
    {
      async query(text, params) {
        counter.n++;
        counter.statements.push(text.trim().split("\n")[0]);
        const result = await inner.query(text, params);
        // Rows as well as statements: a cap applied in JS after reading the
        // whole repository is four queries and an unbounded read, which the
        // statement count alone cannot tell from a bounded one.
        counter.rows += result.rows.length;
        return result;
      },
      exec: (t) => inner.exec(t),
      transaction: (fn) => inner.transaction(fn),
      close: () => inner.close(),
    },
    counter,
  ];
}

// `NORMA_DEV_OPEN` opens every repository view. It must be shut here or the
// access checks below pass for the wrong reason.
delete process.env.NORMA_DEV_OPEN;

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
  const summary = { schemaVersion: 2, threshold: opts.threshold ?? 0.1, frames: [] };
  if (opts.threshold === null) {
    delete summary.threshold;
  }
  if (opts.rawThreshold !== undefined) {
    summary.threshold = opts.rawThreshold;
  }
  await db.query(
    `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()))`,
    [
      id, orgId, repoId,
      opts.commit ?? "c0ffee1234",
      opts.branch ?? "main",
      JSON.stringify(summary),
      opts.state ?? "committed",
      opts.at ?? null,
    ]
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

const BASE = Date.now() - 90 * 24 * 3600 * 1000;
const at = (n) => new Date(BASE + n * 3600 * 1000).toISOString();

const orgA = await makeOrg(`trend-a-${randomUUID().slice(0, 8)}`);
const orgB = await makeOrg(`trend-b-${randomUUID().slice(0, 8)}`);

// ═══ T0 — a repository-wide view is not a share link ═══
{
  check("T0.1", repoViewOpen({}) === false, "no NORMA_DEV_OPEN: the repository view is closed");
  check("T0.2", repoViewOpen({ NORMA_DEV_OPEN: "0" }) === false, "NORMA_DEV_OPEN=0 is closed");
  check("T0.3", repoViewOpen({ NORMA_DEV_OPEN: "1" }) === true, "NORMA_DEV_OPEN=1 opens it locally");
  // Production is the case that matters: the variable is unset on Vercel, so
  // these pages 404 rather than being reachable by guessing a repository id.
  check("T0.4", repoViewOpen({ VERCEL: "1" }) === false, "a deployment with no dev flag stays closed");

  const repo = await makeRepo(orgA, "access-repo");
  const owner = await repoOrg(db, repo);
  check("T0.5", owner?.orgId === orgA, "the page path takes the org from the repository row, not from the URL");
  check("T0.6", (await repoOrg(db, randomUUID())) === null, "an unknown repository id resolves to nothing");
}

// ═══ T1 — the repository view (I1.1, I1.2) ═══
{
  const repo = await makeRepo(orgA, "forty");
  for (let i = 0; i < 40; i++) {
    const when = at(i);
    const runId = await makeRun(orgA, repo, { commit: `run${String(i).padStart(6, "0")}`, at: when });
    await addStat(orgA, repo, runId, "hero.png", { pct: 0.05 + i * 0.01, flagged: i > 20, at: when });
    await addStat(orgA, repo, runId, "footer.png", { pct: 0.01, flagged: false, at: when });
  }
  // One pending run, which must not appear anywhere: migration 017's promise.
  const pending = await makeRun(orgA, repo, { commit: "pendingrun", state: "pending", at: at(41) });
  await addStat(orgA, repo, pending, "hero.png", { pct: 99, flagged: true, at: at(41) });

  const [wrapped, counter] = counting(db);
  const page1 = await repoOverview(wrapped, { orgId: orgA, repo });
  check("T1.1", page1.runs.length === 20 && page1.totalRuns === 40,
    `page 1 holds 20 of 40 runs (got ${page1.runs.length} of ${page1.totalRuns})`);
  // Four: resolve the repo, count the runs, read the page, read every frame's
  // sparkline. None of them multiplies by the number of rows (I1.1).
  check("T1.1a", counter.n === 4, `a page of 40 runs costs ${counter.n} queries, not one per row`);

  // T1.1b — the naive shape, through the same harness. It answers identically
  // and costs a query per run, which is what I1.1 forbids and what nothing
  // would have caught if the count above were not asserted.
  {
    const [naiveDb, naiveCounter] = counting(db);
    const rows = (await naiveDb.query(
      `SELECT id FROM runs WHERE org_id = $1 AND repo_id = $2 AND state = 'committed'
       ORDER BY created_at DESC LIMIT 20`,
      [orgA, repo]
    )).rows;
    for (const row of rows) {
      await naiveDb.query("SELECT COUNT(*) AS n FROM frame_stats WHERE run_id = $1 AND flagged", [row.id]);
    }
    check("T1.1b", naiveCounter.n === 21 && naiveCounter.n > counter.n,
      `counter-test: per-run counting costs ${naiveCounter.n} queries for the same page`);
  }

  check("T1.2", page1.runs.every((r) => r.commitSha !== "pendingrun"),
    "a pending run is not listed (migration 017)");
  check("T1.3", page1.runs[0].createdAt > page1.runs[1].createdAt, "runs are newest first");
  check("T1.4", page1.runs[0].compared === 2 && page1.runs[0].flagged === 1,
    `compared and flagged come back as counts (got ${page1.runs[0].compared}/${page1.runs[0].flagged})`);

  const page2 = await repoOverview(db, { orgId: orgA, repo, page: 2 });
  check("T1.5", page2.runs.length === 20, "page 2 holds the remaining 20");
  const ids = new Set(page1.runs.map((r) => r.runId));
  check("T1.6", page2.runs.every((r) => !ids.has(r.runId)), "the two pages do not overlap");

  const page3 = await repoOverview(db, { orgId: orgA, repo, page: 3 });
  check("T1.7", page3.runs.length === 0 && page3.totalRuns === 40,
    "a page past the end is empty, and still reports the true total");

  check("T1.8", page1.frames.length === 2, `both frames are listed (got ${page1.frames.length})`);
  check("T1.9", page1.frames[0].frame === "hero.png",
    "the flagged frame sorts first — a repository view is read worst-first");
  check("T1.10", page1.frames[0].points.length === SPARK_POINTS,
    `each sparkline is capped at ${SPARK_POINTS} points (got ${page1.frames[0].points.length})`);
  check("T1.11", page1.frames[0].points[0] < page1.frames[0].points[SPARK_POINTS - 1],
    "sparkline points arrive oldest first, which is how they are drawn");
  check("T1.12", page1.frames[0].threshold === 0.1, "the sparkline carries the latest run's threshold");

  // I1.2 — an empty repository.
  const empty = await makeRepo(orgA, "empty-repo");
  const none = await repoOverview(db, { orgId: orgA, repo: empty });
  check("T1.13", none.totalRuns === 0 && none.runs.length === 0 && none.frames.length === 0,
    "a repository with no runs reports zero of everything rather than failing");

  // I3.1 at the query layer: the org predicate, not the caller's manners.
  check("T1.14", (await repoOverview(db, { orgId: orgB, repo })) === null,
    "org B asking for org A's repository gets nothing (I3.1)");
  check("T1.15", (await resolveRepo(db, { orgId: orgB, repo: "forty" })) === null,
    "and the same by name, because names are unique per org, not globally");
  check("T1.16", (await resolveRepo(db, { orgId: orgA, repo: "forty" }))?.id === repo,
    "a repository resolves by name for a caller that owns it");
  check("T1.17", (await resolveRepo(db, { orgId: orgA, repo }))?.name === "forty",
    "and by id");
}

// ═══ T2 — the frame trend (I2.1, I2.2, I2.3) ═══
{
  const repo = await makeRepo(orgA, "trend-repo");
  const frame = "product.png";
  // Twelve runs; the frame crosses the threshold at run 7 (1-indexed), which is
  // I2.1's fixture exactly.
  const series = [
    { commit: "r01aaaaaaa", pct: 0.01, flagged: false },
    { commit: "r02bbbbbbb", pct: 0.02, flagged: false },
    { commit: "r03ccccccc", pct: 0.03, flagged: false },
    { commit: "r04ddddddd", pct: null, flagged: false },  // measured nothing
    { commit: "r05eeeeeee", pct: 0.04, flagged: false },
    { commit: "r06fffffff", pct: 0.09, flagged: false },
    { commit: "r07ggggggg", pct: 0.42, flagged: true },   // first drift
    { commit: "r08hhhhhhh", pct: 0.38, flagged: true },
    { commit: "r09iiiiiii", pct: 0.05, flagged: false },
    { commit: "r10jjjjjjj", pct: 0.06, flagged: false },
    { commit: "r11kkkkkkk", pct: 0.51, flagged: true },
    { commit: "r12lllllll", pct: 0.47, flagged: true },
  ];
  let n = 0;
  for (const entry of series) {
    const when = at(200 + n);
    const runId = await makeRun(orgA, repo, { commit: entry.commit, at: when });
    await addStat(orgA, repo, runId, frame, { pct: entry.pct, flagged: entry.flagged, at: when });
    n++;
  }

  const trend = await frameTrend(db, { orgId: orgA, repoId: repo, frame });
  check("T2.1", trend.points.length === 12, `all twelve runs are in the window (got ${trend.points.length})`);
  check("T2.2", trend.points[0].commitSha === "r01aaaaaaa", "points are oldest first");

  // I2.1 — the annotation lands on run 7, and the commit is the one
  // `enrichment.ts` names. The gate is the agreement, so both halves are checked.
  const history = await frameHistory(db, { orgId: orgA, repoId: repo, frame, limit: 100 });
  check("T2.3", trend.firstDriftCommit === history.firstDriftCommit,
    `the chart's first-drift commit is enrichment's (${trend.firstDriftCommit})`);
  check("T2.4", trend.firstDriftIndex === 6,
    `the annotation lands on run 7 of 12 (0-indexed ${trend.firstDriftIndex})`);
  check("T2.5", trend.points[trend.firstDriftIndex].commitSha === "r07ggggggg",
    "and the annotated point is that commit");
  check("T2.6", trend.recurrence === 4, `recurrence counts every flagged run (got ${trend.recurrence})`);

  // I2.3 — a skipped run is a gap, not a zero.
  check("T2.7", trend.points[3].alignedMismatchPercent === null,
    "a run that measured nothing keeps a null, not a zero");
  check("T2.8", trend.skipped === 1, `the page is told how many runs measured nothing (got ${trend.skipped})`);

  // T2.3b — the naive rendering, through the same harness. Nulls coerced to 0
  // put a 0.00% pass on the chart at r04, on a run where nothing was measured.
  {
    const naive = trend.points.map((p) => Number(p.alignedMismatchPercent ?? 0));
    check("T2.3b", naive[3] === 0 && trend.points[3].alignedMismatchPercent !== 0,
      "counter-test: coercing a skip to a number draws a 0.00% pass that never happened");
  }

  // T2.1b — the naive first drift: scan the visible points for the first
  // flagged one. Identical here, and wrong as soon as the window truncates.
  {
    const visible = trend.points.find((p) => p.flagged)?.commitSha ?? null;
    check("T2.9", visible === trend.firstDriftCommit,
      "on a full window, scanning the points happens to agree");

    const narrow = await frameTrend(db, { orgId: orgA, repoId: repo, frame, limit: 3 });
    const naiveNarrow = narrow.points.find((p) => p.flagged)?.commitSha ?? null;
    check("T2.1b", naiveNarrow === "r11kkkkkkk" && narrow.firstDriftCommit === "r07ggggggg",
      `counter-test: scanning a 3-run window calls first drift ${naiveNarrow}; enrichment says ${narrow.firstDriftCommit}`);
    check("T2.10", narrow.firstDriftIndex === null && narrow.firstDriftCommit !== null,
      "first drift older than the window has no marker — and that is not 'never drifted'");
    check("T2.11", narrow.truncated === true, "a truncated window says so, so the page can print it");
    check("T2.12", trend.truncated === false, "a complete window does not claim to be truncated");
  }

  // A frame that has never drifted: no commit, and so no marker either. The
  // page prints a different sentence for this than for the case above.
  {
    const quiet = "quiet.png";
    for (let i = 0; i < 3; i++) {
      const when = at(300 + i);
      const runId = await makeRun(orgA, repo, { commit: `q0${i}zzzzzzz`, at: when });
      await addStat(orgA, repo, runId, quiet, { pct: 0.001, flagged: false, at: when });
    }
    const calm = await frameTrend(db, { orgId: orgA, repoId: repo, frame: quiet });
    check("T2.13", calm.firstDriftCommit === null && calm.firstDriftIndex === null,
      "a frame that never drifted has neither a commit nor a marker");
    check("T2.14", calm.recurrence === 0, "and no recurrence");
  }

  check("T2.15", (await frameTrend(db, { orgId: orgA, repoId: repo, frame: "never-seen.png" })) === null,
    "a frame with no rows at all is null, which the page renders as not found");
  check("T2.16", (await frameTrend(db, { orgId: orgB, repoId: repo, frame })) === null,
    "org B cannot read org A's frame trend (I3.1)");
}

// ═══ T3 — mode transitions (I2.2) and thresholds that moved ═══
{
  const repo = await makeRepo(orgA, "mode-repo");
  const frame = "home.png";
  const plan = [
    { commit: "m01aaaaaaa", mode: "baseline", source: "baseline", pct: 0.02, threshold: 0.1 },
    { commit: "m02bbbbbbb", mode: "baseline", source: "baseline", pct: 0.03, threshold: 0.1 },
    { commit: "m03ccccccc", mode: "fidelity", source: "figma", pct: 4.10, threshold: 5 },
    { commit: "m04ddddddd", mode: "fidelity", source: "figma", pct: 3.80, threshold: 5 },
  ];
  let i = 0;
  for (const entry of plan) {
    const when = at(400 + i);
    const runId = await makeRun(orgA, repo, { commit: entry.commit, at: when, threshold: entry.threshold });
    await addStat(orgA, repo, runId, frame, {
      pct: entry.pct, flagged: false, mode: entry.mode, source: entry.source, at: when,
    });
    i++;
  }
  const trend = await frameTrend(db, { orgId: orgA, repoId: repo, frame });
  check("T3.1", trend.transitions.length === 1, `one transition is marked (got ${trend.transitions.length})`);
  check("T3.2", trend.transitions[0].index === 2,
    `the marker sits on the first point measured the new way (got index ${trend.transitions[0].index})`);
  check("T3.3", trend.transitions[0].from === "baseline/baseline" && trend.transitions[0].to === "fidelity/figma",
    "and it names both sides, so the two segments can be told apart");

  // The threshold moved with the mode. One flat line at today's value would put
  // the two baseline runs — which passed at 0.1% — under a 5% line, and redraw
  // history as calmer than it was.
  check("T3.4", trend.points[0].threshold === 0.1 && trend.points[3].threshold === 5,
    "each point carries the threshold its own run was judged against");

  // An uploaded summary is customer JSON: `threshold` can be anything.
  const junkRun = await makeRun(orgA, repo, { commit: "m05junkkkk", at: at(410), rawThreshold: "not-a-number" });
  await addStat(orgA, repo, junkRun, frame, { pct: 1, flagged: false, mode: "fidelity", source: "figma", at: at(410) });
  const withJunk = await frameTrend(db, { orgId: orgA, repoId: repo, frame });
  check("T3.5", withJunk.points[4].threshold === null,
    "a junk threshold draws no line rather than throwing on a SQL cast");

  // The repository view's sparkline breaks at the same place. A small chart
  // that joins two incomparable numbers is still joining them.
  const overview = await repoOverview(db, { orgId: orgA, repo });
  const row = overview.frames.find((f) => f.frame === frame);
  check("T3.4a", JSON.stringify(row.breaks) === "[2]",
    `the sparkline breaks where the measurement changed (got ${JSON.stringify(row.breaks)})`);
  check("T3.4b", row.mode === "fidelity" && row.source === "figma",
    "and the row describes how the frame is measured now, not how it started");

  const blankRun = await makeRun(orgA, repo, { commit: "m06blankkk", at: at(411), rawThreshold: "" });
  await addStat(orgA, repo, blankRun, frame, { pct: 1, flagged: false, mode: "fidelity", source: "figma", at: at(411) });
  const withBlank = await frameTrend(db, { orgId: orgA, repoId: repo, frame });
  check("T3.6", withBlank.points[5].threshold === null,
    "and a blank one is not read as 0, which would be 'flag on any difference'");
}

// ═══ T4 — caps and clamps (I3.2) ═══
{
  check("T4.1", trendLimit("100000") === MAX_TREND_POINTS,
    `limit=100000 is capped at ${MAX_TREND_POINTS} (I3.2)`);
  check("T4.2", trendLimit(null) === DEFAULT_TREND_POINTS, "no limit is the default, not unbounded");
  check("T4.3", trendLimit("0") === DEFAULT_TREND_POINTS && trendLimit("-5") === DEFAULT_TREND_POINTS,
    "zero and negative fall back to the default");
  check("T4.4", trendLimit("abc") === DEFAULT_TREND_POINTS, "nonsense falls back to the default");
  check("T4.5", trendLimit("7.9") === 7, "a fractional limit is floored, not rejected");
  check("T4.6", pageNumber("0") === 1 && pageNumber("-3") === 1 && pageNumber("x") === 1,
    "page numbers below the first page are the first page");

  // The cap has to bind on the query, not only on the parser.
  const repo = await makeRepo(orgA, "cap-repo");
  const frame = "wide.png";
  for (let i = 0; i < 12; i++) {
    const when = at(500 + i);
    const runId = await makeRun(orgA, repo, { commit: `c${String(i).padStart(9, "0")}`, at: when });
    await addStat(orgA, repo, runId, frame, { pct: 0.2, flagged: false, at: when });
  }
  const huge = await frameTrend(db, { orgId: orgA, repoId: repo, frame, limit: 100000 });
  check("T4.7", huge.limit === MAX_TREND_POINTS && huge.points.length === 12,
    `an absurd limit returns the ${MAX_TREND_POINTS}-point ceiling, and there were only 12 runs`);
  const five = await frameTrend(db, { orgId: orgA, repoId: repo, frame, limit: 5 });
  check("T4.8", five.points.length === 5 && five.truncated === true,
    "a smaller window returns exactly that many points and admits there are more");
  check("T4.9", five.points[4].commitSha === "c000000011",
    "and the window is the newest runs, not the oldest");
}

// ═══ T5 — placement rules, on fixed histories ═══
{
  const row = (id, commit, pct, flagged, mode = "baseline", source = "baseline") => ({
    runId: id, commitSha: commit, alignedMismatchPercent: pct, flagged,
    createdAt: new Date().toISOString(), mode, source, threshold: 0.1,
  });
  // `assembleTrend` takes history newest-first, as `frameHistory` returns it.
  const [rA, rB, rC] = ["run-a", "run-b", "run-c"];
  const history = {
    trend: [row(rC, "ccc", 0.4, true), row(rB, "bbb", 0.3, true), row(rA, "aaa", 0.01, false)],
    firstDriftCommit: "bbb",
    firstDriftRunId: rB,
    firstDriftAt: new Date().toISOString(),
    recurrence: 2,
    lastObservation: null,
  };
  const t = assembleTrend("f.png", history, false, 30);
  check("T5.1", t.points.map((p) => p.commitSha).join(",") === "aaa,bbb,ccc",
    "assemble reverses newest-first history into oldest-first points");
  check("T5.2", t.firstDriftIndex === 1, "and finds the named run's position");

  const orphan = assembleTrend(
    "f.png",
    { ...history, firstDriftCommit: "zzz", firstDriftRunId: "run-older-than-the-window" },
    true,
    30
  );
  check("T5.3", orphan.firstDriftIndex === null && orphan.firstDriftCommit === "zzz",
    "a first drift outside the window keeps the commit and drops the marker");

  // Two runs on the same commit — a re-run. Matching on the commit could land
  // on either; matching on the run id names exactly one, and it is the one
  // `enrichment.ts` chose.
  const dup = assembleTrend(
    "f.png",
    {
      ...history,
      trend: [row("rerun", "bbb", 0.5, true), row(rB, "bbb", 0.3, true), row(rA, "aaa", 0.01, false)],
    },
    false,
    30
  );
  check("T5.4", dup.firstDriftIndex === 1,
    "when a commit was run twice the marker lands on the run enrichment named, not on whichever came first");

  /*
   * T5.5 — "no commit recorded" is not "never drifted", and they used to be the
   * same null.
   *
   * `firstDriftCommit` is null whenever the SHA is unrecorded, which is *every*
   * run uploaded from a laptop (`upload` reads it from GITHUB_SHA). Reading that
   * as "never exceeded the threshold" put exactly that sentence on the trend
   * page beside "Times flagged: 4 runs". Found by seeding real captures, none of
   * which recorded a SHA — not by a test.
   */
  const noSha = assembleTrend(
    "f.png",
    {
      ...history,
      trend: [row(rC, "", 0.4, true), row(rB, "", 0.3, true), row(rA, "", 0.01, false)],
      firstDriftCommit: null,
    },
    false,
    30
  );
  check("T5.5", noSha.firstDriftCommit === null && noSha.firstDriftAt !== null,
    "a drift with no recorded commit keeps the fact that it drifted");
  check("T5.5b", noSha.firstDriftIndex === 1,
    "and still places the marker, because the run id is known even when the commit is not");

  const never = assembleTrend(
    "f.png",
    { ...history, firstDriftCommit: null, firstDriftRunId: null, firstDriftAt: null },
    false,
    30
  );
  check("T5.6", never.firstDriftAt === null && never.firstDriftIndex === null,
    "a frame that never drifted has no date and no marker — the answer the page prints as \'never\'");

  // The counter-test for this pair: the old single-field reading, run over the
  // same two histories. It cannot tell them apart.
  const oldReading = (trend) => (trend.firstDriftCommit === null ? "never drifted" : "drifted");
  check("T5.6b",
    oldReading(noSha) === oldReading(never) &&
      (noSha.firstDriftAt === null) !== (never.firstDriftAt === null),
    `the one-field reading calls both "${oldReading(noSha)}"; the two-field one separates them`);
}

// ═══ T6 — the frame list is bounded ═══
{
  const repo = await makeRepo(orgA, "many-frames");
  const runId = await makeRun(orgA, repo, { commit: "manyframes", at: at(600) });
  for (let i = 0; i < MAX_FRAMES_LISTED + 5; i++) {
    await addStat(orgA, repo, runId, `frame-${String(i).padStart(3, "0")}.png`, {
      pct: i / 100, flagged: i % 3 === 0, at: at(600),
    });
  }
  const [wrapped, counter] = counting(db);
  const overview = await repoOverview(wrapped, { orgId: orgA, repo });
  check("T6.1", overview.frames.length === MAX_FRAMES_LISTED,
    `the frame list is capped at ${MAX_FRAMES_LISTED} (got ${overview.frames.length})`);
  check("T6.2", overview.framesTruncated === true, "and the page is told it is looking at a subset");
  check("T6.3", counter.n === 4, `still four queries for a ${MAX_FRAMES_LISTED + 5}-frame repository (got ${counter.n})`);

  // The cap has to bind in the **database**, not in JavaScript after the whole
  // repository has been read. The statement count cannot tell those apart —
  // both are four queries — so this counts rows.
  //
  // The ceiling is tight on purpose. This repository has exactly one run, so
  // each frame contributes exactly one row: (cap + 1) frame rows — one rank
  // past the cap is fetched deliberately, which is how "there are more" is
  // answered without a second COUNT — plus the repo row, the count row and the
  // one run row. A loose ceiling here would pass with the cap removed, which is
  // the whole thing being asserted.
  const ceiling = MAX_FRAMES_LISTED + 1 + 3;
  check("T6.3a", counter.rows <= ceiling,
    `the frame query is bounded server-side: ${counter.rows} rows read, ceiling ${ceiling}`);

  // The cap binds in the database, by name — so the frames read are the first
  // `MAX_FRAMES_LISTED` alphabetically, and `frame-060` onwards are not read at
  // all. The page says this rather than claiming "the worst 60", which the
  // query cannot deliver without reading every frame first.
  const names = overview.frames.map((f) => f.frame).sort();
  check("T6.4", names[0] === "frame-000.png" && names[names.length - 1] === `frame-${String(MAX_FRAMES_LISTED - 1).padStart(3, "0")}.png`,
    `the cap takes the first ${MAX_FRAMES_LISTED} frames by name (got ${names[0]}…${names[names.length - 1]})`);
  check("T6.5", overview.frames[0].flagged === true,
    "and within what was read, the worst still sorts first");

  // The offset clamp: a page far past the end must not become a huge OFFSET.
  const far = await repoOverview(db, { orgId: orgA, repo, page: 999999999 });
  const onePast = Math.ceil(far.totalRuns / far.pageSize) + 1;
  check("T6.6", far.runs.length === 0 && far.page === onePast,
    `page 999999999 is clamped to ${far.page}, one past the last real page (${onePast}) — and is still empty, not the first page`);
}

await db.close();
console.log(failures === 0 ? "\nAll trend checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
