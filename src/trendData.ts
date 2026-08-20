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

/**
 * Trend points returned when the caller does not ask for a number.
 *
 * **Raised from 30 to 200 on 2026-08-20**, which is `DETAIL_SIZES[0]` and the
 * largest fully-interactive size. Two reasons, and the second is the real one:
 *
 *   - 30 runs is a fortnight for anyone running CI on every pull request, and
 *     the page's own "first drifted at" answer is computed over *all* history —
 *     so the default view routinely stated a drift it could not show.
 *   - the detail ladder offers 200 / 1k / 5k. A default outside its own ladder
 *     means nothing is selected, and the label describing the current size then
 *     appears to describe whichever option the eye lands on.
 *
 * `/api/trends` inherits it. A caller that wants the old size asks for it.
 */
export const DEFAULT_TREND_POINTS = 200;

/**
 * Hard server-side ceiling on trend points (I3.2). A caller asking for 100,000
 * gets this, not an error: the request is answerable, just not at that size.
 *
 * **This is the ceiling on what the *detail* chart reads, not on history.** The
 * overview covers the whole retained window by bucketing; this bounds how many
 * individual runs the exact chart will pull before it says it truncated.
 *
 * Sized from what retention can actually produce rather than picked: the team
 * plan allows 200 runs a day and keeps 90 days, so 18,000 is the most rows one
 * frame can have. 20,000 clears that, which means "All" is genuinely all for
 * every tenant this plan can create — and the cap still exists, so a future plan
 * with longer retention degrades to a truncated read rather than an unbounded
 * one.
 */
export const MAX_TREND_POINTS = 20_000;

/**
 * Detail sizes the page offers: how many individual runs the exact chart reads.
 *
 * They are read caps, not tooltip counts. Past `MAX_INTERACTIVE_POINTS` the
 * chart draws a line and stops drawing per-run marks and cards, because 5,000
 * of those is 40,000 DOM nodes in the first byte and no reader can aim at a
 * 0.14-unit target anyway. Narrowing the range is what gets the detail back,
 * which is what the brush is for.
 *
 * **Fixed steps only — the "all" step is appended by `windowOptions` from the
 * real count.** Defining the last one as `MAX_TREND_POINTS` looked tidy and was
 * wrong: raising the cap to 20,000 silently deleted the 5k step, because the two
 * had become the same number. A ladder of round sizes and a ceiling on reads are
 * different facts and neither should move when the other does.
 */
export const DETAIL_SIZES = [200, 1000, 5000];

/**
 * Above this many runs on one chart, per-run marks and hover cards are dropped
 * and the line is drawn alone.
 *
 * Chosen from geometry rather than taste: the plot is 658 units wide, so 250
 * runs is 2.6 units apart — already below the 8.5 units a dot occupies, and
 * about the point where a hit column stops being aimable. Everything above it is
 * a shape to navigate, not a set of points to inspect.
 */
export const MAX_INTERACTIVE_POINTS = 250;

/** Fixed steps on the overview ladder. The tenant's retention is appended. */
export const OVERVIEW_STEPS = [7, 30];

/**
 * The overview ranges to offer this tenant, largest being its actual retention.
 *
 * **"All retained" is not a constant, and it is not "all history".** Every plan
 * is seeded at 90 days today (`migrations/016`), and the sweep in
 * `retention.ts` cascades `frame_stats` — so 90 days genuinely is everything
 * this organization has. But `plan_limits.retention_days` is a column, and
 * FUTURENORMA §3 plans a tier ladder after validation; a Team plan with 365-day
 * retention would make a hard-coded 90 both wrong and quietly lossy.
 *
 * So the largest step is read, not written. Today it dedupes to `7 / 30 / 90`
 * with the last one labelled "all retained"; at 365 it becomes four real steps.
 * **Offering "All retained" *beside* a 90 that means the same thing would be a
 * control with a dead option** — the failure `windowOptions` already refuses.
 *
 * The label matters as much as the number: a product that says "all history"
 * while deleting at 90 days is promising storage it does not sell.
 */
export function overviewRanges(retentionDays: number): number[] {
  const steps = OVERVIEW_STEPS.filter((d) => d < retentionDays);
  return [...steps, retentionDays];
}

/** Clamp a caller-supplied overview range against that ladder. */
export function overviewRange(raw: string | number | null | undefined, retentionDays: number): number {
  const offered = overviewRanges(retentionDays);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return offered.includes(30) ? 30 : offered[offered.length - 1];
  }
  return offered.find((d) => d >= n) ?? offered[offered.length - 1];
}

/** Buckets across the overview. ~3.6 units each on a 658-unit plot. */
export const OVERVIEW_BUCKETS = 180;

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
  /**
   * True when there are more points here than the page will make interactive.
   * The chart still draws every one of them; it stops drawing marks and cards.
   */
  dense: boolean;
}

/** Clamp a caller-supplied trend size to something the server chose (I3.2). */
export function trendLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_TREND_POINTS;
  }
  return Math.min(MAX_TREND_POINTS, Math.floor(n));
}

/** Detail sizes to show, given what the current read found. */
export const TREND_WINDOWS = DETAIL_SIZES;

/**
 * Which detail sizes to offer, given how many runs are actually in scope.
 *
 * **Driven by the real count, so every option does something.** The first cut
 * keyed off `truncated`, which meant a frame with 47 runs was offered "200 /
 * 1k / 5k" — three buttons that all return the same 47 points. The count comes
 * free: the runs table already does a `COUNT(*)` for its pager.
 *
 * The last option is always **all of them**, which is what the reader actually
 * wants at the top of a ladder — "5k" is an implementation number, and stopping
 * there would leave a busy repository with history it could see no way to reach.
 * Capped at `MAX_TREND_POINTS`, which is sized above what retention can produce,
 * so "all" is the truth rather than a rounding of it.
 *
 * A single option back means there is nothing to choose: the whole history fits
 * in one view, and the page states that instead of drawing a control.
 */
export function windowOptions(total: number): number[] {
  const sizes = DETAIL_SIZES.filter((n) => n < total);
  return [...sizes, Math.min(total, MAX_TREND_POINTS)];
}

/** True when even "all" could not fetch everything — a plan beyond the cap. */
export function detailCapped(total: number): boolean {
  return total > MAX_TREND_POINTS;
}

/**
 * A brushed selection, parsed from the URL.
 *
 * Returned as `null` for anything unusable — absent, unparseable, inverted, or
 * a zero-width span. A bad range must not empty the chart silently; the caller
 * falls back to the whole window, which is what the page showed before anyone
 * dragged anything.
 */
export function parseSpan(
  from: string | undefined,
  to: string | undefined
): { from: Date; to: Date } | null {
  if (!from || !to) {
    return null;
  }
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a.getTime() >= b.getTime()) {
    return null;
  }
  return { from: a, to: b };
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

/** Exact runs listed under the chart. Bounded, because 5,000 rows is not a table. */
export const RUNS_TABLE_PAGE = 25;

export interface FrameRunRow {
  runId: string;
  commitSha: string;
  createdAt: string;
  alignedMismatchPercent: number | null;
  flagged: boolean;
  mode: string;
  source: string;
  threshold: number | null;
}

export interface FrameRunPage {
  rows: FrameRunRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/**
 * A page of one frame's exact runs, newest first, optionally inside a span.
 *
 * **The table needed the same bound as the chart, for the same reason.** It used
 * to render every point the detail chart had read — fine at thirty, and 5,000
 * `<tr>` at the ceiling, which is a slower page than the chart it sits under and
 * no more readable. The chart bounds *interactive marks*; this bounds *rows*.
 *
 * **Browsing is paginated; the complete dataset is an export.** Those are two
 * different jobs and one control cannot do both — a reader scanning for the run
 * that broke something wants twenty-five rows and a pager, and a reader doing
 * arithmetic over a quarter wants the whole thing in a spreadsheet. Paginating
 * the *chart* would be the mistake, because it breaks the shape; paginating a
 * table costs nothing, because a table has no shape to break.
 */
export async function frameRuns(
  db: Db,
  args: {
    orgId: string;
    repoId: string;
    frame: string;
    span?: { from: Date; to: Date } | null;
    page?: number;
    pageSize?: number;
  }
): Promise<FrameRunPage> {
  const pageSize = args.pageSize ?? RUNS_TABLE_PAGE;
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const span = args.span ?? null;
  const params: unknown[] = [args.orgId, args.repoId, args.frame];
  let where = "fs.org_id = $1 AND fs.repo_id = $2 AND fs.frame = $3";
  if (span) {
    params.push(span.from.toISOString(), span.to.toISOString());
    where += ` AND fs.created_at >= $${params.length - 1}::timestamptz AND fs.created_at <= $${params.length}::timestamptz`;
  }

  const total = Number(
    (
      await db.query<{ n: string | number }>(
        `SELECT COUNT(*) AS n FROM frame_stats fs
           JOIN runs r ON r.id = fs.run_id AND r.state = 'committed'
          WHERE ${where}`,
        params
      )
    ).rows[0]?.n ?? 0
  );

  const rows = (
    await db.query<{
      run_id: string;
      commit_sha: string;
      created_at: string | Date;
      aligned_mismatch_percent: number | null;
      flagged: boolean;
      mode: string;
      source: string;
      threshold: string | null;
    }>(
      `SELECT fs.run_id, r.commit_sha, fs.created_at, fs.aligned_mismatch_percent,
              fs.flagged, fs.mode, fs.source, (r.summary ->> 'threshold') AS threshold
         FROM frame_stats fs JOIN runs r ON r.id = fs.run_id AND r.state = 'committed'
        WHERE ${where}
        ORDER BY fs.created_at DESC, fs.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    )
  ).rows;

  return {
    rows: rows.map((r) => ({
      runId: r.run_id,
      commitSha: r.commit_sha,
      createdAt: iso(r.created_at),
      alignedMismatchPercent:
        r.aligned_mismatch_percent === null ? null : Number(r.aligned_mismatch_percent),
      flagged: r.flagged,
      mode: r.mode,
      source: r.source,
      threshold: threshold(r.threshold),
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * One bucket of the overview: a slice of time, and what happened in it.
 *
 * Every number here is a value some run actually recorded. Nothing is averaged.
 */
export interface OverviewBucket {
  /** Bucket index, 0-based, uniform in *time* across the range. */
  index: number;
  /** Wall-clock bounds of the bucket, so the x-axis can be time. */
  from: string;
  to: string;
  runs: number;
  /** Runs in this bucket that recorded no measurement. Gaps, never zeros. */
  skipped: number;
  flagged: number;
  /** The four values the bucket keeps. All recorded, none derived. */
  lo: number | null;
  hi: number | null;
  first: number | null;
  last: number | null;
  /** The lowest threshold any run in the bucket was judged against. */
  threshold: number | null;
  /** True when runs inside this bucket disagree about being over the line. */
  crossing: boolean;
}

export interface FrameOverview {
  frame: string;
  /** Days covered. The largest offered equals the tenant's retention. */
  days: number;
  retentionDays: number;
  from: string;
  to: string;
  buckets: OverviewBucket[];
  /**
   * Buckets the range was divided into — **not** `buckets.length`.
   *
   * Only buckets that hold runs are returned, so the two differ whenever the
   * history is sparse, which is most of the time. A renderer sizing a bar by
   * the array length drew one bucket of six runs as a block covering a quarter
   * of a 90-day chart: correct data, and a picture claiming three weeks of
   * drift where there had been four minutes.
   */
  bucketCount: number;
  /** Runs in the range, counted before bucketing. */
  totalRuns: number;
  /** Highest value anywhere in the range — the y-scale, and a real measurement. */
  peak: number | null;
}

/**
 * The whole retained history of one frame, compressed to something drawable.
 *
 * **Buckets are uniform in time, not in runs.** That is the entire reason this
 * exists beside `frameTrend`: the detail chart is spaced by run index, so two
 * hundred runs in an afternoon and two hundred across a quarter draw
 * identically. Over 90 days that is not a rendering choice, it is a false
 * picture, and an overview whose job is "when did this start" cannot make it.
 *
 * **No bucket can hide a spike, and none invents a number.** Each keeps the
 * lowest and highest values recorded inside it, plus its first and last, plus
 * whether runs inside it disagreed about crossing the threshold. Those are five
 * facts about real runs. An average would be a sixth number that no run
 * measured — cheaper to compute, and forbidden here: Doctrine 2 says a figure
 * that reaches a customer traces to a recording. "Every nth run" is worse
 * again, because the run it skips is exactly the one-run spike somebody needs.
 *
 * **The aggregation happens in the database.** 90 days at the team plan's 200
 * runs/day is up to 18,000 rows for one frame; reading them into the function to
 * bucket them there would make the response size a function of how busy the
 * customer is. This returns at most `buckets` rows however much history exists.
 */
export async function frameOverview(
  db: Db,
  args: {
    orgId: string;
    repoId: string;
    frame: string;
    days: number;
    retentionDays: number;
    buckets?: number;
    now?: Date;
  }
): Promise<FrameOverview | null> {
  const buckets = args.buckets ?? OVERVIEW_BUCKETS;
  const to = args.now ?? new Date();
  const from = new Date(to.getTime() - args.days * 24 * 3600 * 1000);

  const rows = (
    await db.query<{
      b: string | number;
      runs: string | number;
      skipped: string | number;
      flagged: string | number;
      lo: string | number | null;
      hi: string | number | null;
      first_pct: string | number | null;
      last_pct: string | number | null;
      threshold: string | null;
      from_at: string | Date;
      to_at: string | Date;
    }>(
      // `width_bucket` over epoch seconds gives uniform *time* slices. Runs with
      // no measurement are counted but excluded from lo/hi/first/last, so a
      // skipped run never lowers a bucket's floor to zero.
      `SELECT b,
              COUNT(*) AS runs,
              COUNT(*) FILTER (WHERE pct IS NULL) AS skipped,
              COUNT(*) FILTER (WHERE flagged) AS flagged,
              MIN(pct) AS lo,
              MAX(pct) AS hi,
              (ARRAY_AGG(pct ORDER BY created_at ASC, id ASC) FILTER (WHERE pct IS NOT NULL))[1] AS first_pct,
              (ARRAY_AGG(pct ORDER BY created_at DESC, id DESC) FILTER (WHERE pct IS NOT NULL))[1] AS last_pct,
              MIN(threshold) AS threshold,
              MIN(created_at) AS from_at,
              MAX(created_at) AS to_at
         FROM (
           SELECT fs.id,
                  fs.created_at,
                  fs.flagged,
                  fs.aligned_mismatch_percent AS pct,
                  (r.summary ->> 'threshold') AS threshold,
                  width_bucket(
                    EXTRACT(EPOCH FROM fs.created_at)::float8,
                    EXTRACT(EPOCH FROM $4::timestamptz)::float8,
                    EXTRACT(EPOCH FROM $5::timestamptz)::float8,
                    $6
                  ) AS b
             FROM frame_stats fs
             JOIN runs r ON r.id = fs.run_id AND r.state = 'committed'
            WHERE fs.org_id = $1 AND fs.repo_id = $2 AND fs.frame = $3
              AND fs.created_at >= $4::timestamptz AND fs.created_at <= $5::timestamptz
         ) t
        GROUP BY b
        ORDER BY b`,
      [args.orgId, args.repoId, args.frame, from.toISOString(), to.toISOString(), buckets]
    )
  ).rows;

  if (rows.length === 0) {
    return null;
  }

  const width = (to.getTime() - from.getTime()) / buckets;
  const out: OverviewBucket[] = rows.map((row) => {
    const index = Math.max(0, Math.min(buckets - 1, Number(row.b) - 1));
    const runs = Number(row.runs);
    const flagged = Number(row.flagged);
    const num = (v: string | number | null) => (v === null ? null : Number(v));
    return {
      index,
      from: new Date(from.getTime() + index * width).toISOString(),
      to: new Date(from.getTime() + (index + 1) * width).toISOString(),
      runs,
      skipped: Number(row.skipped),
      flagged,
      lo: num(row.lo),
      hi: num(row.hi),
      first: num(row.first_pct),
      last: num(row.last_pct),
      threshold: threshold(row.threshold),
      // Runs inside one bucket that disagree. This is the fact a coarse chart
      // most easily loses: a single flagged run inside an otherwise clean hour.
      crossing: flagged > 0 && flagged < runs,
    };
  });

  const peaks = out.map((b) => b.hi).filter((v): v is number => v !== null);
  return {
    frame: args.frame,
    days: args.days,
    retentionDays: args.retentionDays,
    from: from.toISOString(),
    to: to.toISOString(),
    buckets: out,
    bucketCount: buckets,
    totalRuns: out.reduce((n, b) => n + b.runs, 0),
    peak: peaks.length > 0 ? Math.max(...peaks) : null,
  };
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
  args: {
    orgId: string;
    repoId: string;
    frame: string;
    limit?: number;
    /** A brushed selection. Narrows the points drawn, never first drift. */
    span?: { from: Date; to: Date } | null;
  }
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
    dense: points.length > MAX_INTERACTIVE_POINTS,
  };
}
