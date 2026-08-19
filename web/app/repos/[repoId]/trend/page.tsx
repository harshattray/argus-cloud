import Link from "next/link";
import {
  frameTrend,
  MAX_TREND_POINTS,
  repoOrg,
  repoViewOpen,
  trendLimit,
  type FrameTrend,
} from "argus-cloud/trendData.js";
import { getDb } from "../../../../lib/db";
import { readTheme } from "../../../../lib/theme";
import { CloudFooter, CloudMasthead } from "../../../_components/cloud/cloud-shell";
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
  searchParams: Promise<{ frame?: string; limit?: string }>;
}) {
  const { repoId } = await params;
  const { frame, limit } = await searchParams;
  const theme = await readTheme();

  if (!repoViewOpen() || !frame) {
    return <NotFound theme={theme ?? undefined} />;
  }
  const db = await getDb();
  const owner = await repoOrg(db, repoId);
  if (!owner) {
    return <NotFound theme={theme ?? undefined} />;
  }
  const trend = await frameTrend(db, {
    orgId: owner.orgId,
    repoId: owner.id,
    frame,
    limit: trendLimit(limit),
  });
  if (!trend) {
    return <NotFound theme={theme ?? undefined} />;
  }

  const latest = trend.points[trend.points.length - 1];
  const modes = [...new Set(trend.points.map((p) => `${p.mode}/${p.source}`))];
  const path =
    `/repos/${owner.id}/trend?frame=${encodeURIComponent(frame)}` +
    (limit ? `&limit=${encodeURIComponent(limit)}` : "");

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
            <h2 className={styles.sectionTitle}>History</h2>
            <p className={styles.sectionNote}>
              Computed from runs we hold. A local run only knows about itself.
            </p>
          </div>
          <dl className={styles.facts}>
            <Fact term="First drifted at">
              {trend.firstDriftCommit === null ? (
                <span className={styles.muted}>never exceeded the threshold</span>
              ) : (
                <code>{trend.firstDriftCommit.slice(0, 10)}</code>
              )}
            </Fact>
            <Fact term="Times flagged">
              {trend.recurrence} run{trend.recurrence === 1 ? "" : "s"}
            </Fact>
            <Fact term="Runs shown">{trend.points.length}</Fact>
            <Fact term="Measured">{trend.points.length - trend.skipped}</Fact>
          </dl>
          <Caveats trend={trend} modes={modes} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Aligned mismatch over commits</h2>
            <p className={styles.sectionNote}>Oldest first.</p>
          </div>
          <div className={styles.chartWrap}>
            <TrendChart trend={trend} />
            <ul className={styles.legend}>
              <li>
                <span className={`${styles.swatch} ${styles.swatchTrend}`} /> aligned mismatch
              </li>
              <li>
                <span className={`${styles.swatch} ${styles.swatchThreshold}`} /> threshold, as each
                run set it
              </li>
              {trend.transitions.length > 0 && (
                <li>
                  <span className={`${styles.swatch} ${styles.swatchTransition}`} /> measurement
                  changed
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Runs</h2>
            <p className={styles.sectionNote}>Newest first.</p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.runs}>
              <thead>
                <tr>
                  <th>Commit</th>
                  <th>When</th>
                  <th>Measured as</th>
                  <th className={styles.num}>Aligned mismatch</th>
                  <th className={styles.num}>Threshold</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trend.points
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.runId}>
                      <td>
                        {p.commitSha ? (
                          <code>{p.commitSha.slice(0, 10)}</code>
                        ) : (
                          <span className={styles.muted}>none</span>
                        )}
                      </td>
                      <td>
                        <time dateTime={p.createdAt}>
                          {p.createdAt.replace("T", " ").slice(0, 16)}
                        </time>
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
        </section>

        <CloudFooter>
          Deterministic comparison by <b>Normascope</b>. First drift and recurrence come from the
          runs this organization has uploaded — the same numbers the hosted explanation reads.
        </CloudFooter>
      </main>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{term}</dt>
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
  if (trend.firstDriftCommit !== null && trend.firstDriftIndex === null) {
    lines.push(
      `This frame first drifted at ${trend.firstDriftCommit.slice(0, 10)}, which is older than the ${trend.limit} runs shown — so there is no marker on the chart. Raise the window with ?limit= (up to ${MAX_TREND_POINTS}) to bring it into view.`
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
