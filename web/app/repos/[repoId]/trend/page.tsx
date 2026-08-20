import Link from "next/link";
import { planLimitsFor } from "argus-cloud/plans.js";
import {
  DETAIL_SIZES,
  frameOverview,
  frameRuns,
  frameTrend,
  MAX_INTERACTIVE_POINTS,
  MAX_TREND_POINTS,
  overviewRange,
  overviewRanges,
  parseSpan,
  pageNumber,
  repoOrg,
  repoViewOpen,
  trendLimit,
  windowOptions,
  type FrameOverview,
  type FrameRunPage,
  type FrameTrend,
} from "argus-cloud/trendData.js";
import { getDb } from "../../../../lib/db";
import { readTheme } from "../../../../lib/theme";
import { CloudFooter, CloudMasthead } from "../../../_components/cloud/cloud-shell";
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
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Frame trend — Normascope Cloud",
  robots: { index: false, follow: false },
};

function NotFound({ theme }: { theme?: string }) {
  return (
    <div className={styles.page} data-theme={theme}>
      <main className={styles.notFound}>
        <h1>Not found</h1>
        <p>This frame has no history here, or you don&apos;t have access to it.</p>
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

  const [overview, trend] = await Promise.all([
    frameOverview(db, {
      orgId: owner.orgId,
      repoId: owner.id,
      frame,
      days: range,
      retentionDays: plan.retentionDays,
    }),
    frameTrend(db, {
      orgId: owner.orgId,
      repoId: owner.id,
      frame,
      limit: trendLimit(limit),
      span,
    }),
  ]);
  if (!trend) {
    return <NotFound theme={theme ?? undefined} />;
  }

  const runs = await frameRuns(db, {
    orgId: owner.orgId,
    repoId: owner.id,
    frame,
    span,
    page: pageNumber(page),
  });

  const latest = trend.points[trend.points.length - 1];
  const modes = [...new Set(trend.points.map((p) => `${p.mode}/${p.source}`))];
  const base = `/repos/${owner.id}/trend?frame=${encodeURIComponent(frame)}`;
  /** Everything except the table's page, which no other control should reset. */
  const keep =
    (limit ? `&limit=${encodeURIComponent(limit)}` : "") +
    (days ? `&days=${encodeURIComponent(days)}` : "") +
    (span ? `&from=${encodeURIComponent(span.from.toISOString())}&to=${encodeURIComponent(span.to.toISOString())}` : "");
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

        {overview && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                <Explainer term="overview" scope="ov">
                  History at a glance
                </Explainer>
              </h2>
              <p className={styles.sectionNote}>
                {overview.totalRuns} run{overview.totalRuns === 1 ? "" : "s"} over {overview.days} days.
                Drag to inspect a period.
              </p>
            </div>

            <Ranges base={base} limit={limit} days={range} retentionDays={plan.retentionDays} />

            {/*
              The brush sits on top of an inert chart rather than replacing it.
              With JavaScript off — or before it loads — the picture is complete
              and the range links still work; only the drag is missing.
            */}
            <div className={styles.overviewWrap}>
              <OverviewChart overview={overview} />
              <Brush
                from={overview.from}
                to={overview.to}
                href={`${base}${limit ? `&limit=${encodeURIComponent(limit)}` : ""}&days=${range}`}
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

            {span && (
              <p className={styles.caveat}>
                Showing {span.from.toISOString().slice(0, 16).replace("T", " ")} to{" "}
                {span.to.toISOString().slice(0, 16).replace("T", " ")} UTC.{" "}
                <Link href={`${base}&days=${range}`}>Clear the selection</Link> to go back to the
                most recent runs.
              </p>
            )}
          </section>
        )}

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
          <Window repoId={owner.id} frame={frame} trend={trend} keep={keep} />
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
                href={`/repos/${owner.id}/trend/export?frame=${encodeURIComponent(frame)}${span ? `&from=${encodeURIComponent(span.from.toISOString())}&to=${encodeURIComponent(span.to.toISOString())}` : ""}`}
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
/** `1000` reads as a measurement; `1k` reads as a size. */
function sizeLabel(n: number): string {
  return n >= 1000 ? `${n / 1000}k` : String(n);
}

function Window({
  repoId,
  frame,
  trend,
  keep,
}: {
  repoId: string;
  frame: string;
  trend: FrameTrend;
  /** Range and selection, carried through so changing the size keeps them. */
  keep: string;
}) {
  const offered = windowOptions(trend.limit, trend.truncated);
  if (offered.length < 2) {
    return null;
  }
  return (
    <nav className={styles.window} aria-label="Runs shown">
      <span className={styles.windowLabel}>Show</span>
      {offered.map((n) =>
        n === trend.limit ? (
          <span key={n} className={styles.windowOn} aria-current="true">
            {sizeLabel(n)}
          </span>
        ) : (
          <Link
            key={n}
            className={styles.windowOption}
            href={`/repos/${repoId}/trend?frame=${encodeURIComponent(frame)}&limit=${n}${keep.replace(/&limit=[^&]*/, "")}`}
          >
            {sizeLabel(n)}
          </Link>
        )
      )}
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
        runs ·{" "}
        {trend.dense
          ? `line only above ${MAX_INTERACTIVE_POINTS} — select a range to inspect`
          : `${trend.points.length} drawn, fully interactive`}
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
