import Link from "next/link";
import { planLimitsFor } from "argus-cloud/plans.js";
import {
  DETAIL_SIZES,
  frameOverview,
  frameRuns,
  frameTrend,
  MAX_INTERACTIVE_POINTS,
  MAX_TREND_POINTS,
  occupiedSpans,
  overviewRange,
  overviewRanges,
  parseSpan,
  pageNumber,
  repoOrg,
  repoViewOpen,
  detailCapped,
  trendLimit,
  windowOptions,
  type FrameOverview,
  type FrameRunPage,
  type FrameTrend,
} from "argus-cloud/trendData.js";
import { getDb } from "../../../../lib/db";
import { readTheme } from "../../../../lib/theme";
import { CloudFooter, CloudMasthead } from "../../../_components/cloud/cloud-shell";
import { CloudEmpty, CloudTwin } from "../../../_components/cloud/empty-state";
import { Explainer } from "../../../_components/cloud/explainer";
import { Brush } from "../../brush";
import { OverviewChart } from "../../overview-chart";
import { TrendChart } from "../../trend-chart";
import styles from "../../trends.module.css";

/**
 * One frame's trend — `BuildV5.md` Phase I, I2.
 *
 * The frame label is a query parameter rather than a path segment on purpose: a
 * label is whatever the customer named a frame, and `Home / Nav` in a path
 * segment is either a 404 or a directory traversal argument nobody needs to
 * have. A query parameter has one meaning.
 *
 * **The page states what it does not know.** First drift older than the window,
 * a frame that has never drifted, runs that measured nothing, a metric that
 * changed definition mid-history — each of those has its own sentence here,
 * because a chart that quietly omits any of them is a chart that reads as more
 * certain than the data is.
 *
 * **"Nothing to draw" is four different answers and they are not interchangeable
 * (2026-08-20).** This page used to conflate them, and two of the four were
 * bugs:
 *
 *   1. *This frame is not here, or is not yours.* A real dead end, and the only
 *      one that gets the bare `NotFound` page.
 *   2. *The chosen range holds no runs.* The overview section was rendered as
 *      `{overview && …}`, so choosing 7d on a repository whose last run was a
 *      fortnight ago deleted the section — and with it the range control that
 *      had just been used. It keeps its heading and its buttons now.
 *   3. *The brushed selection holds no runs.* `frameTrend` returns null for an
 *      empty span exactly as it does for an absent frame, so a drag across the
 *      blank part of the overview — which is most of it — took the whole page
 *      to "Not found", with no masthead, no breadcrumb and no way back. The
 *      span is dropped and said out loud instead.
 *   4. *Every run in the range measured nothing.* Already handled, in words.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Frame trend — Normascope Cloud",
  robots: { index: false, follow: false },
};

/**
 * The dead end, and only the dead end.
 *
 * It answers exactly one question now — *is this frame here, and is it yours* —
 * having previously also been the answer to "did your drag select a period with
 * no runs in it", which is not a dead end at all and had no business losing the
 * masthead over.
 *
 * **`back` is passed whenever the repository is known.** The two cases that
 * cannot pass it are the feature flag being off and a repository that does not
 * resolve, and in neither of those is there a page to offer. Everything else
 * gets a way out, because a page with no navigation and no link is the same
 * mistake the site's 404 exists to avoid.
 */
function NotFound({ theme, back }: { theme?: string; back?: string }) {
  return (
    <div className={styles.page} data-theme={theme}>
      <main className={styles.notFound}>
        <CloudTwin pose="lantern" className={styles.notFoundTwin} />
        <h1>Not found</h1>
        <p>This frame has no history here, or you don&apos;t have access to it.</p>
        {back && (
          <Link className={styles.notFoundBack} href={back}>
            ← Back to the repository
          </Link>
        )}
      </main>
    </div>
  );
}

export default async function TrendPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{
    frame?: string;
    limit?: string;
    days?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { repoId } = await params;
  const { frame, limit, days, from, to, page } = await searchParams;
  const theme = await readTheme();

  if (!repoViewOpen() || !frame) {
    return <NotFound theme={theme ?? undefined} />;
  }
  const db = await getDb();
  const owner = await repoOrg(db, repoId);
  if (!owner) {
    return <NotFound theme={theme ?? undefined} />;
  }

  // Retention is what "all retained" resolves to, and it is a column rather than
  // a constant — see `overviewRanges`. Read once and handed to both the ladder
  // and the overview, so the label and the query cannot disagree.
  const plan = await planLimitsFor(db, owner.orgId);
  const range = overviewRange(days, plan.retentionDays);
  const span = parseSpan(from, to);

  const where = { orgId: owner.orgId, repoId: owner.id, frame };
  const repoHref = `/repos/${owner.id}`;

  const [overview, selected] = await Promise.all([
    frameOverview(db, { ...where, days: range, retentionDays: plan.retentionDays }),
    frameTrend(db, { ...where, limit: trendLimit(limit), span }),
  ]);

  /*
   * A brushed span holding no runs is not a missing frame, and telling them
   * apart costs one query in the one case where it happens.
   *
   * `frameTrend` returns null for both, because `frameHistory` returns null on
   * an empty result set and cannot know why the set was empty. Asking again
   * without the span is the whole test: history without it means the frame is
   * real and the selection was the empty thing.
   */
  const trend = selected ?? (span ? await frameTrend(db, { ...where, limit: trendLimit(limit) }) : null);
  if (!trend) {
    return <NotFound theme={theme ?? undefined} back={repoHref} />;
  }
  /** The span was asked for, holds nothing, and has been dropped. Said below. */
  const spanEmpty = span !== null && selected === null;
  /** The span actually in force. Everything downstream reads this, not `span`. */
  const shown = spanEmpty ? null : span;

  const runs = await frameRuns(db, { ...where, span: shown, page: pageNumber(page) });

  const latest = trend.points[trend.points.length - 1];
  const modes = [...new Set(trend.points.map((p) => `${p.mode}/${p.source}`))];
  const base = `/repos/${owner.id}/trend?frame=${encodeURIComponent(frame)}`;
  /** Everything except the table's page, which no other control should reset. */
  const keep =
    (limit ? `&limit=${encodeURIComponent(limit)}` : "") +
    (days ? `&days=${encodeURIComponent(days)}` : "") +
    (shown ? `&from=${encodeURIComponent(shown.from.toISOString())}&to=${encodeURIComponent(shown.to.toISOString())}` : "");
  const path = base + keep;

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.sheet}>
        <CloudMasthead
          title={trend.frame}
          crumbs={[
            { label: owner.orgName },
            { label: owner.name, href: `/repos/${owner.id}` },
            { label: trend.frame },
          ]}
          theme={theme}
          path={path}
          meta={
            <>
              {trend.points.length} run{trend.points.length === 1 ? "" : "s"} shown ·{" "}
              {latest.alignedMismatchPercent === null
                ? "latest run measured nothing"
                : `latest ${latest.alignedMismatchPercent.toFixed(2)}%`}
            </>
          }
        />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              <Explainer term="history" scope="trend">
                History
              </Explainer>
            </h2>
            <p className={styles.sectionNote}>
              Computed from runs we hold. A local run only knows about itself.
            </p>
          </div>
          <dl className={styles.facts}>
            {/*
              Three states, not two. "No commit recorded" is not "never
              drifted" — a run uploaded from a laptop has no SHA, so a frame
              flagged four times can have no commit for any of them. Printing
              "never exceeded the threshold" beside "Times flagged: 4 runs" is
              what this used to do, and real captures are what found it.
            */}
            <Fact term="First drifted at" explain="first-drift">
              {trend.firstDriftAt === null ? (
                <span className={styles.muted}>never exceeded the threshold</span>
              ) : trend.firstDriftCommit === null ? (
                <>
                  <time dateTime={trend.firstDriftAt}>{trend.firstDriftAt.slice(0, 10)}</time>{" "}
                  <span className={styles.muted}>· no commit recorded</span>
                </>
              ) : (
                <code>{trend.firstDriftCommit.slice(0, 10)}</code>
              )}
            </Fact>
            <Fact term="Times flagged" explain="recurrence">
              {trend.recurrence} run{trend.recurrence === 1 ? "" : "s"}
            </Fact>
            <Fact term="Runs shown">{trend.points.length}</Fact>
            <Fact term="Measured" explain="skipped">
              {trend.points.length - trend.skipped}
            </Fact>
          </dl>
          <Caveats trend={trend} modes={modes} />
        </section>

        {/*
          Rendered whether or not there is anything in the range. The section
          owns the range control, so hiding the section on an empty range hid
          the only way back to a range that is not empty.
        */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              <Explainer term="overview" scope="ov">
                History at a glance
              </Explainer>
            </h2>
            {/*
              The empty form is the same sentence with the count in it and the
              instruction dropped — there is nothing to drag. It deliberately
              does not repeat the panel's own line below, which said "No runs in
              the last 7 days" in both places until this was noticed on a phone,
              where the two sit four lines apart.
            */}
            <p className={styles.sectionNote}>
              {overview
                ? `${overview.totalRuns} run${overview.totalRuns === 1 ? "" : "s"} over ${overview.days} days. Drag to inspect a period.`
                : `0 runs over ${range} days.`}
            </p>
          </div>

          <Ranges base={base} limit={limit} days={range} retentionDays={plan.retentionDays} />

          {overview ? (
            <>
              {/*
                The brush sits on top of an inert chart rather than replacing
                it. With JavaScript off — or before it loads — the picture is
                complete and the range links still work; only the drag is
                missing.
              */}
              <div className={styles.overviewWrap}>
                <OverviewChart overview={overview} />
                <Brush
                  from={overview.from}
                  to={overview.to}
                  href={`${base}${limit ? `&limit=${encodeURIComponent(limit)}` : ""}&days=${range}`}
                  occupied={occupiedSpans(overview)}
                />
              </div>
              <ul className={styles.legend}>
                <li>
                  <span className={`${styles.swatch} ${styles.swatchBand}`} />{" "}
                  <Explainer term="overview-band" scope="ovlegend">
                    range recorded in each period
                  </Explainer>
                </li>
                <li>
                  <span className={`${styles.swatch} ${styles.swatchTransition}`} />{" "}
                  <Explainer term="overview-crossing" scope="ovlegend">
                    flagged and clean runs in the same period
                  </Explainer>
                </li>
              </ul>
              <OverviewShape overview={overview} />
            </>
          ) : (
            <EmptyRange
              base={base}
              days={range}
              /* Only when nothing is narrowing the page, or "last measured"
                 would name the newest run *in the selection* and read as the
                 newest run there is. */
              lastRunAt={shown ? null : latest.createdAt}
              retentionDays={plan.retentionDays}
            />
          )}

          {spanEmpty && span && (
            <p className={styles.caveat}>
              No runs between {span.from.toISOString().slice(0, 16).replace("T", " ")} and{" "}
              {span.to.toISOString().slice(0, 16).replace("T", " ")} UTC — so that selection has
              been dropped, and everything below is the most recent runs instead.
            </p>
          )}

          {shown && (
            <p className={styles.caveat}>
              Showing {shown.from.toISOString().slice(0, 16).replace("T", " ")} to{" "}
              {shown.to.toISOString().slice(0, 16).replace("T", " ")} UTC.{" "}
              <Link href={`${base}&days=${range}`}>Clear the selection</Link> to go back to the
              most recent runs.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              <Explainer term="aligned-diff" scope="chart">
                Aligned mismatch over commits
              </Explainer>
            </h2>
            <p className={styles.sectionNote}>
              Oldest first, spaced by run.{" "}
              {trend.dense
                ? `Too many runs to mark individually — narrow the range above to inspect them.`
                : "Hover a point for that run."}
            </p>
          </div>
          <Window repoId={owner.id} frame={frame} trend={trend} keep={keep} total={runs.total} />
          <div className={styles.chartWrap}>
            <TrendChart trend={trend} />
            {/*
              The legend defines the strokes; the chart itself answers about
              points, on hover. Two questions, two places: "what is this line"
              is a vocabulary question and belongs to a word, "what is this
              point" is a data question and belongs to the point.
            */}
            <ul className={styles.legend}>
              <li>
                <span className={`${styles.swatch} ${styles.swatchTrend}`} />{" "}
                <Explainer term="aligned-diff" scope="legend">
                  aligned mismatch
                </Explainer>
              </li>
              <li>
                <span className={`${styles.swatch} ${styles.swatchThreshold}`} />{" "}
                <Explainer term="threshold-line" scope="legend">
                  threshold, as each run set it
                </Explainer>
              </li>
              {trend.transitions.length > 0 && (
                <li>
                  <span className={`${styles.swatch} ${styles.swatchTransition}`} />{" "}
                  <Explainer term="measurement-change" scope="legend">
                    measurement changed
                  </Explainer>
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Runs</h2>
            <p className={styles.sectionNote}>
              Newest first · {runs.total} in range ·{" "}
              {/*
                A plain link, not a button: it is a GET of a file. The export is
                the whole span at exact resolution, which is the other half of
                bounding this table — a bounded view is only honest while the
                complete data is still reachable.
              */}
              <a
                className={styles.exportLink}
                href={`/repos/${owner.id}/trend/export?frame=${encodeURIComponent(frame)}${shown ? `&from=${encodeURIComponent(shown.from.toISOString())}&to=${encodeURIComponent(shown.to.toISOString())}` : ""}`}
              >
                Export CSV
              </a>
            </p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.runs}>
              <thead>
                <tr>
                  <th>
                    <Explainer term="commit" scope="trendruns">
                      Commit
                    </Explainer>
                  </th>
                  <th>When</th>
                  <th>
                    <Explainer term="fidelity-mode" scope="trendruns">
                      Measured as
                    </Explainer>
                  </th>
                  <th className={styles.num}>
                    <Explainer term="aligned-diff" scope="trendruns">
                      Aligned mismatch
                    </Explainer>
                  </th>
                  <th className={styles.num}>
                    <Explainer term="threshold" scope="trendruns">
                      Threshold
                    </Explainer>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.rows.map((p) => (
                  <tr key={p.runId}>
                    <td>
                      {p.commitSha ? (
                        <code>{p.commitSha.slice(0, 10)}</code>
                      ) : (
                        <span className={styles.muted}>none</span>
                      )}
                    </td>
                    <td>
                      <time dateTime={p.createdAt}>{p.createdAt.replace("T", " ").slice(0, 16)}</time>
                    </td>
                    <td className={styles.muted}>
                      {p.mode}/{p.source}
                    </td>
                    <td className={styles.num}>
                      {p.alignedMismatchPercent === null ? (
                        <span className={styles.muted}>skipped</span>
                      ) : (
                        <span className={p.flagged ? styles.pillFlagged : styles.pillClean}>
                          {p.alignedMismatchPercent.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className={`${styles.num} ${styles.muted}`}>
                      {p.threshold === null ? "—" : `${p.threshold}%`}
                    </td>
                    <td>
                      <Link href={`/r/${p.runId}`}>Report</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RunsPager base={base} keep={keep} runs={runs} />
        </section>

        <CloudFooter>
          Deterministic comparison by <b>Normascope</b>. First drift and recurrence come from the
          runs this organization has uploaded — the same numbers the hosted explanation reads.
        </CloudFooter>
      </main>
    </div>
  );
}

/**
 * The range holds no runs — said in the place the chart would have been.
 *
 * **It offers the smallest range that would actually help, or none.** A "try a
 * wider range" line that leads to a second empty chart is worse than no line,
 * so the step offered is the smallest one that reaches back past the newest run
 * this frame has. When retention has swept past that run there is no such step,
 * and the sentence says so rather than pointing at a button that does nothing —
 * the same rule `windowOptions` follows for the size ladder.
 */
function EmptyRange({
  base,
  days,
  lastRunAt,
  retentionDays,
}: {
  base: string;
  days: number;
  /** Null when a selection is narrowing the page; see the call site. */
  lastRunAt: string | null;
  retentionDays: number;
}) {
  const ago =
    lastRunAt === null
      ? null
      : Math.max(0, Math.ceil((Date.now() - new Date(lastRunAt).getTime()) / (24 * 3600 * 1000)));
  const wider = overviewRanges(retentionDays).find((n) => n > days && (ago === null || n >= ago));
  return (
    <CloudEmpty pose="hourglass" title={`No runs in the last ${days} days.`}>
      {lastRunAt !== null && (
        <>
          This frame was last measured on {lastRunAt.slice(0, 10)}
          {ago !== null && ago > days ? `, ${ago} day${ago === 1 ? "" : "s"} ago` : ""}.{" "}
        </>
      )}
      {wider !== undefined ? (
        <>
          <Link href={`${base}&days=${wider}`}>Widen the range to {wider}d</Link> to bring it into
          view.
        </>
      ) : (
        <>Nothing has been uploaded for it inside the {retentionDays} days this plan retains.</>
      )}
    </CloudEmpty>
  );
}

/**
 * Why this chart is a block today and a line on the next repository.
 *
 * **The encoding never changes; the data does, and that is not obvious.** Each
 * bucket draws a band from its lowest recorded value to its highest, and a line
 * joins the buckets' last values. Six runs in one afternoon land in a single
 * bucket, so there is one band and no line — a `path` of one `M` draws nothing,
 * correctly, because a line through one point would be inventing the second.
 * Four runs across a fortnight land in four buckets whose bands are a pixel
 * tall, so the line is all you see.
 *
 * Two readers comparing screenshots concluded the product had two charts. It
 * has one, and the case that causes the confusion is cheap to name.
 */
function OverviewShape({ overview }: { overview: FrameOverview }) {
  const measured = overview.buckets.filter((b) => b.last !== null);
  if (measured.length !== 1) {
    return null;
  }
  const only = measured[0];
  const lo = only.lo;
  const hi = only.hi;
  return (
    <p className={styles.caveat}>
      All {overview.totalRuns} run{overview.totalRuns === 1 ? "" : "s"} in this range fall inside
      one period, so the chart is a single band and no line — a line needs two periods to join.
      {lo !== null && hi !== null
        ? lo === hi
          ? ` Every one of them measured ${hi.toFixed(2)}%.`
          : ` The band is their full spread, ${lo.toFixed(2)}% to ${hi.toFixed(2)}%.`
        : ""}{" "}
      Narrow the range, or read the exact runs below.
    </p>
  );
}

/**
 * The overview's range: 7d / 30d / … / retention.
 *
 * **The largest step carries an annotation, not a separate option.** It *is*
 * every run this organization still has, because the sweep deletes past
 * `plan_limits.retention_days` — so "all retained" belongs on that number rather
 * than beside it. A separate "All" entry would be a control where one choice
 * does nothing, and it would also imply storage the plan does not sell.
 *
 * `overviewRanges` builds the ladder from retention rather than from a constant,
 * so a plan with 365 days gets a fourth real step instead of a wrong label.
 */
function Ranges({
  base,
  limit,
  days,
  retentionDays,
}: {
  base: string;
  limit?: string;
  days: number;
  retentionDays: number;
}) {
  const offered = overviewRanges(retentionDays);
  return (
    <nav className={styles.window} aria-label="History range">
      <span className={styles.windowLabel}>Range</span>
      {offered.map((n) => {
        const label = `${n}d`;
        const all = n === retentionDays;
        return n === days ? (
          <span key={n} className={styles.windowOn} aria-current="true">
            {label}
          </span>
        ) : (
          <Link
            key={n}
            className={styles.windowOption}
            href={`${base}${limit ? `&limit=${encodeURIComponent(limit)}` : ""}&days=${n}`}
          >
            {label}
          </Link>
        );
      })}
      <span className={styles.windowLabel}>
        {days === retentionDays
          ? `· all retained (${retentionDays} days)`
          : `· ${retentionDays} days retained`}
      </span>
    </nav>
  );
}

/**
 * A page of exact runs, and the reason the table has pages at all.
 *
 * **Paginating the table is fine; paginating the chart would not be.** A table
 * has no shape to break — twenty-five rows at a time is how anybody reads one —
 * where a chart split across pages destroys the only thing it is for. So the
 * chart narrows by range and the table pages, and the complete dataset is the
 * CSV beside the heading.
 */
function RunsPager({ base, keep, runs }: { base: string; keep: string; runs: FrameRunPage }) {
  if (runs.pages <= 1) {
    return null;
  }
  const at = (n: number) => `${base}${keep}&page=${n}`;
  return (
    <nav className={styles.pager} aria-label="Runs pagination">
      {runs.page > 1 ? (
        <Link href={at(runs.page - 1)}>← Newer</Link>
      ) : (
        <span className={styles.pagerState}>← Newer</span>
      )}
      <span className={styles.pagerState}>
        Page {runs.page} of {runs.pages} · {runs.pageSize} per page · {runs.total} runs
      </span>
      {runs.page < runs.pages ? (
        <Link href={at(runs.page + 1)}>Older →</Link>
      ) : (
        <span className={styles.pagerState}>Older →</span>
      )}
    </nav>
  );
}

/**
 * How many runs the chart draws — `?limit=` given a control.
 *
 * **It existed and was invisible.** The parameter has been server-clamped since
 * I3.2, and the only way to reach it was to edit the URL — which the "first
 * drifted before this window" caveat then told the reader to do, in words, as
 * the remedy for a marker they could not see.
 *
 * **Plain links, no JavaScript**, like everything else on this tree. Each one is
 * a GET of this page at a different size.
 *
 * **The ladder never offers more than there is** — `windowOptions` in
 * `trendData.ts` decides that, and the suite checks it there.
 */
/**
 * `1000` reads as a measurement; `1k` reads as a size.
 *
 * The final step is labelled by what it *is* — every run in scope — rather than
 * by its number, which is an accident of how busy the repository has been.
 */
function sizeLabel(n: number, last: boolean): string {
  if (last) {
    return "All";
  }
  return n >= 1000 ? `${n / 1000}k` : String(n);
}

function Window({
  repoId,
  frame,
  trend,
  keep,
  total,
}: {
  repoId: string;
  frame: string;
  trend: FrameTrend;
  /** Range and selection, carried through so changing the size keeps them. */
  keep: string;
  /** Runs actually in scope. The ladder is built from this, not from a guess. */
  total: number;
}) {
  const offered = windowOptions(total);

  /*
   * Nothing to choose. Every real tenant is here today — the busiest has ten
   * runs of one frame — and drawing three buttons that all return the same
   * chart would be the "control with a dead option" failure, three times over.
   *
   * It says so rather than rendering nothing, because an absent control reads
   * as a missing feature and this is the opposite: you are already looking at
   * the whole thing.
   */
  if (offered.length < 2) {
    return (
      <p className={styles.windowStatic}>
        Showing all {total} run{total === 1 ? "" : "s"} · fully interactive
      </p>
    );
  }
  return (
    <nav className={styles.window} aria-label="Runs shown">
      <span className={styles.windowLabel}>Show</span>
      {offered.map((n, i) => {
        const label = sizeLabel(n, i === offered.length - 1);
        return n === trend.limit ? (
          <span key={n} className={styles.windowOn} aria-current="true">
            {label}
          </span>
        ) : (
          <Link
            key={n}
            className={styles.windowOption}
            href={`/repos/${repoId}/trend?frame=${encodeURIComponent(frame)}&limit=${n}${keep.replace(/&limit=[^&]*/, "")}`}
          >
            {label}
          </Link>
        );
      })}
      {/*
        Each size is labelled with the interaction it gives, because they do not
        give the same one. Presenting "200 / 1k / 5k" as a plain ladder implies
        five thousand hoverable points, and five thousand interactive marks is
        40,000 DOM nodes nobody can aim at. The line stays exact at every size;
        what changes is how much of it can be inspected in place.
      */}
      {/*
        The label describes what is *drawn*, not what was asked for.
        
        It read off `trend.limit` first, and that is the size the reader chose —
        so a 5k selection narrowed by the brush to thirty-two runs still said
        "line only, select a range to inspect" while showing thirty-two dots and
        their cards. `dense` is the count that actually came back.
      */}
      <span className={styles.windowLabel}>
        of {total} ·{" "}
        {trend.dense
          ? `line only above ${MAX_INTERACTIVE_POINTS} — select a range to inspect`
          : `${trend.points.length} drawn, fully interactive`}
        {detailCapped(total) ? ` · capped at ${MAX_TREND_POINTS.toLocaleString("en-GB")}` : ""}
      </span>
    </nav>
  );
}

function Fact({
  term,
  explain,
  children,
}: {
  term: string;
  /** Glossary key. `term` here is the visible label, not a lookup. */
  explain?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt>
        {explain ? (
          <Explainer term={explain} scope="fact">
            {term}
          </Explainer>
        ) : (
          term
        )}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * What the chart cannot show, said in words.
 *
 * The one that matters most is first drift older than the window: the marker is
 * absent, and without this line an absent marker reads as "it never drifted" —
 * which is the opposite of what happened.
 */
function Caveats({ trend, modes }: { trend: FrameTrend; modes: string[] }) {
  const lines: string[] = [];
  if (trend.firstDriftAt !== null && trend.firstDriftIndex === null) {
    const where =
      trend.firstDriftCommit === null
        ? `on ${trend.firstDriftAt.slice(0, 10)}`
        : `at ${trend.firstDriftCommit.slice(0, 10)}`;
    lines.push(
      `This frame first drifted ${where}, which is older than the ${trend.limit} runs shown — so there is no marker on the chart. Show more runs, up to ${MAX_TREND_POINTS}, to bring it into view.`
    );
  }
  if (trend.truncated) {
    lines.push(
      `Only the most recent ${trend.limit} runs are drawn. There are more.`
    );
  }
  if (trend.skipped > 0) {
    lines.push(
      `${trend.skipped} run${trend.skipped === 1 ? "" : "s"} recorded no measurement for this frame. They are gaps in the line, not zeros — a skip is not a pass.`
    );
  }
  if (modes.length > 1) {
    lines.push(
      `The measurement changed during this history (${modes.join(" → ")}). Fidelity compares against a design; baseline compares against an approved capture. The two numbers are not the same quantity, and the chart marks where it changed.`
    );
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <>
      {lines.map((line) => (
        <p key={line} className={styles.caveat}>
          {line}
        </p>
      ))}
    </>
  );
}
