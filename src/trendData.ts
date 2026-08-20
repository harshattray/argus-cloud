import type { Db } from "./db.js";
import { frameHistory, type FrameHistory } from "./enrichment.js";

/**
 * Everything the repository view and the frame trend chart render
 * (`BuildV5.md` Phase I, I1–I3).
 *
 * Three rules shape this file.
 *
 * **First drift is not computed here.** `frameHistory()` in `enrichment.ts`
 * already computes it, the prompt already uses it, and the report page already
 * shows it. Phase I's gate (I2.1) says outright that two implementations of
 * "first drift" which disagree is a bug in one of them — so this module asks
 * that function and then finds where its answer *lands* on the chart. The
 * tempting shortcut is to scan the points on screen for the first flagged one;
 * that is a different query over a truncated window and it silently disagrees
 * the moment a frame has more history than the chart shows. `test/trends.test.mjs`
 * T2.1b runs that shortcut through the same harness to prove it.
 *
 * **A page costs a fixed number of queries.** I1.1 asks for a 40-run repository
 * to paginate with one query per page rather than one per row. Flagged counts
 * come back as an aggregate on the runs query, and every frame's sparkline
 * comes back from a single windowed query, so the count does not move with the
 * size of the repository.
 *
 * **Nothing here answers a question about the organization.** The security
 * protocol for I3 is that a trend response carries no org metadata beyond the
 * repository asked for — no repo list, no run totals for other repositories, no
 * plan state. Every query takes `orgId` in its WHERE clause, and an unknown or
 * another tenant's repository is `null`, which every caller renders as the same
 * "not found" a nonexistent one gets.
 */

/** Runs listed per page of the repository view. */
export const RUNS_PAGE_SIZE = 20;

/** Trend points returned when the caller does not ask for a number. */
export const DEFAULT_TREND_POINTS = 30;

/**
 * Hard server-side ceiling on trend points (I3.2). A caller asking for 100,000
 * gets this, not an error: the request is answerable, just not at that size.
 */
export const MAX_TREND_POINTS = 200;

/**
 * Frames listed on the repository view. A repo with 500 frames is a scroll, not
 * a signal — and it is also a read nobody bounded.
 *
 * The cap binds **in the database, in name order**, not after reading every
 * frame in the repository. That ordering is the honest trade and the page says
 * so: sorting by "worst first" cannot be the thing that truncates, because
 * working out which frames are worst is exactly what reading them all is for.
 */
export const MAX_FRAMES_LISTED = 60;

/** Points in each frame's sparkline on the repository view. */
export const SPARK_POINTS = 12;

export interface Repo {
  id: string;
  name: string;
}

export interface RunSummaryRow {
  runId: string;
  commitSha: string;
  branch: string;
  createdAt: string;
  /** Frames with a `frame_stats` row in this run. */
  compared: number;
  flagged: number;
}

export interface FrameSummary {
  frame: string;
  /** Newest first is how it is read; `points` below is oldest first, as it is drawn. */
  mode: string;
  source: string;
  flagged: boolean;
  alignedMismatchPercent: number | null;
  /** Oldest → newest. `null` is a run that recorded no measurement — a gap, never a zero. */
  points: (number | null)[];
  /**
   * What each point *was*, in the same order — commit, date and the threshold
   * that run was judged at.
   *
   * Carried so a sparkline dot can say which run it is. Reading the shape and
   * then having to match an x-position against a table to find out which commit
   * caused it is not answering the question the picture raises, and the answer
   * is already in this query.
   */
  runsAt: SparkPoint[];
  /**
   * Indices where the measurement changed definition, so the sparkline breaks
   * there rather than drawing a stroke between two incomparable numbers. The
   * large chart does the same thing from `FrameTrend.transitions`; a small chart
   * that lies where the large one does not is still a lie.
   */
  breaks: number[];
  threshold: number | null;
  runs: number;
}

/** One point's identity on the repository view's sparkline. */
export interface SparkPoint {
  runId: string;
  commitSha: string;
  createdAt: string;
  threshold: number | null;
  flagged: boolean;
}

export interface RepoOverview {
  repo: Repo;
  runs: RunSummaryRow[];
  totalRuns: number;
  page: number;
  pageSize: number;
  /** Capped at `MAX_FRAMES_LISTED`, taken in name order, shown worst first. */
  frames: FrameSummary[];
  /** True when the repository has more frames than `MAX_FRAMES_LISTED`. */
  framesTruncated: boolean;
}

export interface TrendPoint {
  runId: string;
  commitSha: string;
  createdAt: string;
  alignedMismatchPercent: number | null;
  flagged: boolean;
  mode: string;
  source: string;
  threshold: number | null;
}

export interface Transition {
  /** Index in `points` of the first point measured the new way. */
  index: number;
  from: string;
  to: string;
}

export interface FrameTrend {
  frame: string;
  /** Oldest → newest, which is the direction a trend is read and drawn. */
  points: TrendPoint[];
  /**
   * Straight from `frameHistory()`. Never recomputed from `points`.
   *
   * Null means the commit was not recorded, **not** that the frame never
   * drifted — `firstDriftAt` is the field that answers that. See the note on
   * `FrameHistory.firstDriftCommit`.
   */
  firstDriftCommit: string | null;
  /** When it first exceeded threshold, or null if it never has. */
  firstDriftAt: string | null;
  /**
   * Where `firstDriftCommit` lands in `points`, or null when it is older than
   * the window. Null is not "it never drifted" — that is `firstDriftCommit`
   * being null — and the page has to say which of the two it is looking at.
   */
  firstDriftIndex: number | null;
  recurrence: number;
  transitions: Transition[];
  /** Runs in the window that recorded no measurement for this frame. */
  skipped: number;
  /** True when the frame has more history than the window shows. */
  truncated: boolean;
  limit: number;
}

/** Clamp a caller-supplied trend size to something the server chose (I3.2). */
export function trendLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_TREND_POINTS;
  }
  return Math.min(MAX_TREND_POINTS, Math.floor(n));
}

/** Clamp a caller-supplied page number. Page 1 is the first page. */
export function pageNumber(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.floor(n);
}

/**
 * The repository, by id or by name, inside one organization.
 *
 * Both are accepted because both callers are real: the web pages hold an id
 * from a link, and a CI job knows the name it uploaded under. `repos` is
 * `UNIQUE (org_id, name)`, so a name is unambiguous within the tenant, and the
 * `org_id` predicate is what makes another tenant's id or name a miss rather
 * than a lookup.
 */
export async function resolveRepo(
  db: Db,
  args: { orgId: string; repo: string }
): Promise<Repo | null> {
  const row = (
    await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM repos WHERE org_id = $1 AND (id = $2 OR name = $2) LIMIT 1",
      [args.orgId, args.repo]
    )
  ).rows[0];
  return row ?? null;
}

/**
 * Whether the caller may see a repository-wide view at all.
 *
 * **There is no session layer yet, so this is the whole of it.** A share token
 * is a capability for exactly one run (`share_links.run_id`), which is the right
 * shape for the report page and the wrong shape here: a repository view lists
 * other runs, other frames and other commits, so honouring a run's token on it
 * would widen every share link ever issued into a tenant-wide read. Step 6
 * brings GitHub OAuth and magic links, and this function is what it replaces.
 *
 * Until then `/repos/` answers only behind `NORMA_DEV_OPEN`, the same local
 * door `reportData.authorize` opens, and 404s in production — where the variable
 * is unset — rather than being reachable by anyone who can guess a repository id.
 */
export function repoViewOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NORMA_DEV_OPEN === "1";
}

/**
 * The organization a repository belongs to.
 *
 * Only for the `repoViewOpen` page path, which has a repository id from a URL
 * and no session to say whose it is — the same way the report page takes the
 * org from the run row. Every query after this one is scoped by the org it
 * returns, so the API path (which has a real key) and the page path meet at the
 * same org-scoped functions.
 */
export async function repoOrg(
  db: Db,
  repoId: string
): Promise<{ id: string; name: string; orgId: string; orgName: string } | null> {
  const row = (
    await db.query<{ id: string; name: string; org_id: string; org_name: string }>(
      `SELECT repo.id, repo.name, repo.org_id, org.name AS org_name
       FROM repos repo JOIN orgs org ON org.id = repo.org_id
       WHERE repo.id = $1`,
      [repoId]
    )
  ).rows[0];
  return row
    ? { id: row.id, name: row.name, orgId: row.org_id, orgName: row.org_name }
    : null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * One page of a repository: its committed runs, and every frame's recent shape.
 *
 * Four queries, whatever the size of the repository — repo, run count, run page,
 * frame sparklines. `state = 'committed'` appears in each one that touches
 * `runs`, because migration 017's promise is that a declared-but-unfinished run
 * is not queryable, and a trend that plotted pending runs would break it in the
 * most visible place available.
 */
export async function repoOverview(
  db: Db,
  args: { orgId: string; repo: string; page?: number; pageSize?: number }
): Promise<RepoOverview | null> {
  const repo = await resolveRepo(db, { orgId: args.orgId, repo: args.repo });
  if (!repo) {
    return null;
  }
  const pageSize = args.pageSize ?? RUNS_PAGE_SIZE;

  const total = Number(
    (
      await db.query<{ n: string | number }>(
        "SELECT COUNT(*) AS n FROM runs WHERE org_id = $1 AND repo_id = $2 AND state = 'committed'",
        [args.orgId, repo.id]
      )
    ).rows[0]?.n ?? 0
  );

  // `?page=999999999` must not become a nine-billion-row OFFSET scan. Clamped
  // to one past the last real page, which still returns nothing — a page past
  // the end is empty, and it should be empty cheaply. Clamping to the *last*
  // page instead would answer an absurd request with real data, which is worse
  // than answering it with nothing.
  const page = Math.min(pageNumber(args.page), Math.ceil(total / pageSize) + 1);

  // The flagged and compared counts are an aggregate on this one query. Asking
  // per run is the shape I1.1 exists to forbid: correct, invisible at three
  // runs, and forty round trips at forty.
  const runs = (
    await db.query<{
      id: string;
      commit_sha: string;
      branch: string;
      created_at: string | Date;
      compared: string | number;
      flagged: string | number;
    }>(
      `SELECT r.id, r.commit_sha, r.branch, r.created_at,
              COUNT(fs.id) AS compared,
              COUNT(fs.id) FILTER (WHERE fs.flagged) AS flagged
       FROM runs r LEFT JOIN frame_stats fs ON fs.run_id = r.id
       WHERE r.org_id = $1 AND r.repo_id = $2 AND r.state = 'committed'
       GROUP BY r.id
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $3 OFFSET $4`,
      [args.orgId, repo.id, pageSize, (page - 1) * pageSize]
    )
  ).rows;

  // Every frame's last `SPARK_POINTS` runs in one query, for at most
  // `MAX_FRAMES_LISTED` frames.
  //
  // `ROW_NUMBER` truncates each frame's history and `DENSE_RANK` truncates the
  // set of frames, both inside the database. The alternative to the first is a
  // query per frame — I1.1's failure one level down — and the alternative to
  // the second is reading a whole repository to display sixty rows of it.
  //
  // One rank past the cap is fetched so "there are more frames than this"
  // is answerable without a second COUNT.
  const sparkRows = (
    await db.query<{
      frame: string;
      mode: string;
      source: string;
      aligned_mismatch_percent: number | null;
      flagged: boolean;
      threshold: string | null;
      run_id: string;
      commit_sha: string;
      created_at: string | Date;
      rn: string | number;
      fr: string | number;
    }>(
      `SELECT frame, mode, source, aligned_mismatch_percent, flagged, threshold,
              run_id, commit_sha, created_at, rn, fr FROM (
         SELECT fs.frame, fs.mode, fs.source, fs.aligned_mismatch_percent, fs.flagged,
                fs.run_id, r.commit_sha, fs.created_at,
                (r.summary ->> 'threshold') AS threshold,
                ROW_NUMBER() OVER (
                  PARTITION BY fs.frame ORDER BY fs.created_at DESC, fs.id DESC
                ) AS rn,
                DENSE_RANK() OVER (ORDER BY fs.frame ASC) AS fr
         FROM frame_stats fs JOIN runs r ON r.id = fs.run_id AND r.state = 'committed'
         WHERE fs.org_id = $1 AND fs.repo_id = $2
       ) t
       WHERE rn <= $3 AND fr <= $4
       ORDER BY frame ASC, rn DESC`,
      [args.orgId, repo.id, SPARK_POINTS, MAX_FRAMES_LISTED + 1]
    )
  ).rows;
  const framesTruncated = sparkRows.some((row) => Number(row.fr) > MAX_FRAMES_LISTED);

  // `rn DESC` above means each frame arrives oldest → newest, which is the
  // order the sparkline is drawn in, so nothing is reversed here.
  const byFrame = new Map<string, FrameSummary>();
  for (const row of sparkRows) {
    if (Number(row.fr) > MAX_FRAMES_LISTED) {
      continue; // the probe rank, read only to know it exists
    }
    let summary = byFrame.get(row.frame);
    if (!summary) {
      summary = {
        frame: row.frame,
        mode: row.mode,
        source: row.source,
        flagged: false,
        alignedMismatchPercent: null,
        points: [],
        runsAt: [],
        breaks: [],
        threshold: null,
        runs: 0,
      };
      byFrame.set(row.frame, summary);
    }
    const value =
      row.aligned_mismatch_percent === null ? null : Number(row.aligned_mismatch_percent);
    if (summary.runs > 0 && `${summary.mode}/${summary.source}` !== `${row.mode}/${row.source}`) {
      summary.breaks.push(summary.points.length);
    }
    summary.points.push(value);
    summary.runsAt.push({
      runId: row.run_id,
      commitSha: row.commit_sha,
      createdAt: new Date(row.created_at).toISOString(),
      threshold: threshold(row.threshold),
      flagged: row.flagged,
    });
    summary.runs += 1;
    // The last row for a frame is its newest run, so these end up describing
    // the current state rather than whatever came first.
    summary.mode = row.mode;
    summary.source = row.source;
    summary.flagged = row.flagged;
    summary.alignedMismatchPercent = value;
    summary.threshold = threshold(row.threshold);
  }

  // Display order, applied to what was read rather than deciding what is read.
  const frames = [...byFrame.values()].sort(
    (a, b) =>
      Number(b.flagged) - Number(a.flagged) ||
      (b.alignedMismatchPercent ?? -1) - (a.alignedMismatchPercent ?? -1) ||
      a.frame.localeCompare(b.frame)
  );

  return {
    repo,
    runs: runs.map((r) => ({
      runId: r.id,
      commitSha: r.commit_sha,
      branch: r.branch,
      createdAt: iso(r.created_at),
      compared: Number(r.compared),
      flagged: Number(r.flagged),
    })),
    totalRuns: total,
    page,
    pageSize,
    frames,
    framesTruncated,
  };
}

/** Same rule as `enrichment.ts` — an uploaded threshold that is not a number draws no line. */
function threshold(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * One frame's trend, ready to draw.
 *
 * The numbers all come from `frameHistory()`. What is added here is position:
 * where first drift lands among the points on screen, and where the metric's
 * definition changed underneath the line.
 */
export async function frameTrend(
  db: Db,
  args: { orgId: string; repoId: string; frame: string; limit?: number }
): Promise<FrameTrend | null> {
  const limit = trendLimit(args.limit);
  // One extra row, only to answer "is there more history than this?" honestly.
  // It is dropped before anything is drawn.
  const history = await frameHistory(db, { ...args, limit: limit + 1 });
  if (history === null) {
    return null;
  }
  const truncated = history.trend.length > limit;
  const window = history.trend.slice(0, limit);
  return assembleTrend(args.frame, { ...history, trend: window }, truncated, limit);
}

/**
 * Turn one frame's history into chart geometry. Split out from the query so the
 * suite can hand it a fixed history and check the placement rules directly.
 */
export function assembleTrend(
  frame: string,
  history: FrameHistory,
  truncated: boolean,
  limit: number
): FrameTrend {
  const points: TrendPoint[] = history.trend
    .slice()
    .reverse() // `frameHistory` is newest first; a trend is read oldest first
    .map((row) => ({
      runId: row.runId,
      commitSha: row.commitSha,
      createdAt: row.createdAt,
      alignedMismatchPercent: row.alignedMismatchPercent,
      flagged: row.flagged,
      mode: row.mode,
      source: row.source,
      threshold: row.threshold,
    }));

  // The annotation is placed from what `enrichment.ts` named, not by looking for
  // the first flagged point. When the frame first drifted before the window
  // starts there is no point to annotate, and `null` here says so — which is a
  // different fact from "it never drifted", and the page prints them differently.
  //
  // **Matched on the run, not on the commit.** A commit was the obvious key and
  // it is wrong twice: every run of a laptop-uploaded frame has an empty SHA, so
  // the match would land on whichever point came first; and two runs can share a
  // commit legitimately — a re-run — so even with real SHAs it is ambiguous. A
  // run id names exactly one point.
  const found =
    history.firstDriftRunId === null
      ? -1
      : points.findIndex((p) => p.runId === history.firstDriftRunId);

  const transitions: Transition[] = [];
  for (let i = 1; i < points.length; i++) {
    const before = `${points[i - 1].mode}/${points[i - 1].source}`;
    const after = `${points[i].mode}/${points[i].source}`;
    if (before !== after) {
      transitions.push({ index: i, from: before, to: after });
    }
  }

  return {
    frame,
    points,
    firstDriftCommit: history.firstDriftCommit,
    firstDriftAt: history.firstDriftAt,
    firstDriftIndex: found === -1 ? null : found,
    recurrence: history.recurrence,
    transitions,
    skipped: points.filter((p) => p.alignedMismatchPercent === null).length,
    truncated,
    limit,
  };
}
