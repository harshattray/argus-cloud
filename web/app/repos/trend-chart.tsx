import type { FrameTrend } from "argus-cloud/trendData.js";
import { segments } from "./sparkline";
import styles from "./trends.module.css";

/**
 * A frame's aligned mismatch over commits — `BuildV5.md` Phase I, I2.
 *
 * Four things on this chart are not decoration, and each is here because the
 * obvious version of the chart would be wrong without it:
 *
 *   - **Gaps, not zeros** (I2.3). A run that recorded no measurement breaks the
 *     line. Drawing it at 0 would put a pass on the chart that never happened,
 *     and a skipped frame is the case where that matters most — it is what a
 *     broken capture looks like.
 *   - **A stepped threshold line.** The threshold comes from each run's own
 *     uploaded summary, so it can change. One flat line drawn at today's value
 *     would redraw history: runs that were flagged would sit under the line, and
 *     the "first exceeded" annotation would appear to contradict the picture.
 *   - **Transition markers** (I2.2). `fidelity` and `baseline` are different
 *     measurements against different references. They share this y-axis because
 *     there is only one number, so the chart says where the definition changed
 *     rather than pretending it did not.
 *   - **The first-drift annotation is placed, not computed** (I2.1). The commit
 *     comes from `enrichment.ts` by way of `trendData.ts`; this component only
 *     draws a marker where that commit sits.
 *
 * Inert server-rendered SVG: no client component, no nonce, no hydration.
 */

const W = 720;
const H = 260;
const PAD = { left: 46, right: 16, top: 18, bottom: 30 };
const MAX_X_LABELS = 7;

export function TrendChart({ trend }: { trend: FrameTrend }) {
  const points = trend.points;
  const measured = points
    .map((p) => p.alignedMismatchPercent)
    .filter((v): v is number => v !== null);
  if (measured.length === 0) {
    return null;
  }
  const thresholds = points
    .map((p) => p.threshold)
    .filter((v): v is number => v !== null);

  // Headroom above the highest of the two series so the peak is not welded to
  // the top edge, and never a zero-height axis for a frame that has always sat
  // at 0.
  const top = Math.max(...measured, ...thresholds, 0) * 1.15 || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const slot = points.length > 1 ? innerW / (points.length - 1) : innerW;

  const labelEvery = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));
  const labels = commitLabels(points.map((p) => p.commitSha));

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describe(trend, measured)}
    >
      {/* Runs that measured nothing, banded before anything is drawn over them. */}
      {points.map((p, i) =>
        p.alignedMismatchPercent === null ? (
          <rect
            key={`gap-${i}`}
            className={styles.gapBand}
            x={x(i) - slot / 2}
            y={PAD.top}
            width={slot}
            height={innerH}
          />
        ) : null
      )}

      {/* Axes: only the two that carry meaning. A grid would compete with the
          threshold line, which is the reference the eye should be using. */}
      <line className={styles.axis} x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
      <line className={styles.axis} x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={y(0)} />
      <text className={styles.axisLabel} x={PAD.left - 6} y={PAD.top + 4} textAnchor="end">
        {top.toFixed(2)}%
      </text>
      {/* Above the baseline, not below it — below puts this on top of the
          commit labels, which is where it was until it was looked at. */}
      <text className={styles.axisLabel} x={PAD.left - 6} y={y(0) - 3} textAnchor="end">
        0%
      </text>

      {thresholdPath(points, x, y, slot).map((d) => (
        <path key={d} className={styles.thresholdLine} d={d} />
      ))}

      {segments(
        points.map((p) => p.alignedMismatchPercent),
        trend.transitions.map((t) => t.index)
      ).map((seg) => (
        <path
          key={seg.join(",")}
          className={styles.trendLine}
          d={seg
            .map(
              (i, n) =>
                `${n === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(points[i].alignedMismatchPercent as number).toFixed(1)}`
            )
            .join(" ")}
        />
      ))}

      {/* Where the metric's definition changed (I2.2). */}
      {trend.transitions.map((t) => (
        <g key={`t-${t.index}`}>
          <line
            className={styles.transitionMark}
            x1={x(t.index) - slot / 2}
            x2={x(t.index) - slot / 2}
            y1={PAD.top}
            y2={y(0)}
          />
          <text
            className={styles.transitionLabel}
            x={x(t.index) - slot / 2 + 4}
            y={PAD.top + 10}
          >
            {t.to}
          </text>
        </g>
      ))}

      {/* First exceeded (I2.1) — placed on the commit enrichment named. */}
      {trend.firstDriftIndex !== null && (
        <g>
          <line
            className={styles.driftMark}
            x1={x(trend.firstDriftIndex)}
            x2={x(trend.firstDriftIndex)}
            y1={PAD.top}
            y2={y(0)}
          />
          {points[trend.firstDriftIndex].alignedMismatchPercent !== null && (
            <circle
              className={styles.driftRing}
              cx={x(trend.firstDriftIndex)}
              cy={y(points[trend.firstDriftIndex].alignedMismatchPercent as number)}
              r={6}
            />
          )}
          <text
            className={styles.driftLabel}
            x={x(trend.firstDriftIndex)}
            y={PAD.top - 5}
            textAnchor={trend.firstDriftIndex > points.length / 2 ? "end" : "start"}
          >
            first drift
          </text>
        </g>
      )}

      {/*
        Points last, so nothing is drawn over a tooltip that is open.
        See `PointMarker` for what hovering one says and why it needs no script.
      */}
      {points.map((p, i) =>
        p.alignedMismatchPercent === null ? null : (
          <PointMarker
            key={`d-${i}`}
            point={p}
            label={labels[i]}
            cx={x(i)}
            cy={y(p.alignedMismatchPercent)}
            firstDrift={i === trend.firstDriftIndex}
            /* Flip the card to the left of the point once past the middle, or
               the last few runs open theirs past the right edge of the SVG. */
            flip={points.length > 1 && i / (points.length - 1) > 0.6}
          />
        )
      )}

      {points.map((p, i) =>
        i % labelEvery === 0 || i === points.length - 1 ? (
          <text
            key={`x-${i}`}
            className={styles.axisLabel}
            x={x(i)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
          >
            {labels[i]}
          </text>
        ) : null
      )}
    </svg>
  );
}

/**
 * Tooltip geometry, and it is a budget rather than a preference.
 *
 * SVG text cannot be measured on the server, so the box cannot size itself to
 * its contents — which means every line has to fit the *widest* value it can
 * ever hold. The first cut put the verdict, the mode pair and the date on one
 * line: fine at `flagged · baseline/baseline`, and `under threshold ·
 * fidelity/baseline · 2026-08-13` ran straight out through the right-hand edge.
 *
 * Four short lines at 210 wide, with the longest each one can carry:
 *
 *   commit + " · first drift"       26 chars of 11px mono   ≈ 172px
 *   "100.00% · threshold 100%"      24 chars of 12px        ≈ 139px
 *   "under threshold"               15 chars of 11px        ≈  80px
 *   "fidelity/baseline · 2026-08-13" 30 chars of 11px       ≈ 159px
 *
 * against 190px of inner width. Add a field and redo that sum.
 */
const TIP = { w: 210, h: 78, gap: 12, pad: 10, line: 15 };

/**
 * One point on the chart, and what it says when you hover it.
 *
 * **What the reader gets.** The commit, when the run happened, the measurement
 * and the threshold it was judged against, and whether it was flagged. That is
 * the row of the table below, brought to the mark — because "which run is that
 * spike?" is a question about a *point*, and answering it by asking someone to
 * match an x-position against a table is not answering it.
 *
 * **No JavaScript, again.** The card is a sibling of an invisible hit target
 * inside one `<g>`, and `:hover` on the group reveals it. `/repos/` renders
 * entirely on the server (`FinishedSPEC.md` §3v) and this does not change that.
 *
 * Three details that are not arbitrary:
 *
 *   - **The hit target is r=13, the dot is r=3.5.** A 3.5px circle is a hostile
 *     hover target with a mouse and an impossible one with a finger. The target
 *     is transparent and takes the pointer events; the dot takes none.
 *   - **The card flips past the middle of the chart.** SVG has no viewport-aware
 *     positioning, so the side is chosen from the point's index at render time.
 *     Without it the last few runs open their cards past the right edge.
 *   - **Text is `<text>`, not `<foreignObject>`.** Three short lines need no
 *     wrapping, and foreignObject drags HTML layout into an inert graphic for no
 *     gain.
 *
 * **What it is not.** Hover is not available on a touch screen, so this is an
 * enhancement rather than the only route to the information: every point is also
 * a row in the Runs table below, with the same four facts and a link.
 */
function PointMarker({
  point,
  label,
  cx,
  cy,
  flip,
  firstDrift,
}: {
  point: FrameTrend["points"][number];
  /** The commit label the x-axis uses, so the card and the axis agree. */
  label: string;
  cx: number;
  cy: number;
  flip: boolean;
  firstDrift: boolean;
}) {
  const pct = point.alignedMismatchPercent as number;
  const tipX = flip ? cx - TIP.gap - TIP.w : cx + TIP.gap;
  // Keep the card inside the plot vertically as well: a point near the top would
  // otherwise open its card above the chart's own frame.
  const tipY = Math.max(PAD.top, Math.min(H - PAD.bottom - TIP.h, cy - TIP.h / 2));
  const textX = tipX + TIP.pad;

  const verdict = point.flagged ? "flagged" : "under threshold";
  const against = point.threshold === null ? "no threshold recorded" : `threshold ${point.threshold}%`;
  const line = (n: number) => tipY + TIP.pad + 9 + TIP.line * n;

  return (
    <g className={styles.point}>
      <circle className={styles.dotHit} cx={cx} cy={cy} r={13} />
      <circle
        className={point.flagged ? `${styles.dot} ${styles.over}` : styles.dot}
        cx={cx}
        cy={cy}
        r={3.5}
      />
      <g className={styles.tip}>
        <rect className={styles.tipBox} x={tipX} y={tipY} width={TIP.w} height={TIP.h} rx={7} />
        <text className={styles.tipCommit} x={textX} y={line(0)}>
          {point.commitSha ? label : "no commit recorded"}
          {firstDrift ? " · first drift" : ""}
        </text>
        <text className={styles.tipValue} x={textX} y={line(1)}>
          {pct.toFixed(2)}% · {against}
        </text>
        <text
          className={point.flagged ? `${styles.tipMeta} ${styles.over}` : styles.tipMeta}
          x={textX}
          y={line(2)}
        >
          {verdict}
        </text>
        <text className={styles.tipMeta} x={textX} y={line(3)}>
          {point.mode}/{point.source} · {point.createdAt.slice(0, 10)}
        </text>
      </g>
    </g>
  );
}

/**
 * The threshold as a step line, broken wherever a run carried no usable
 * threshold.
 *
 * **The riser sits on the boundary between two runs, not on a run.** A
 * threshold is not a measurement taken at a point — it is a rule that applied
 * to a stretch of runs, and the moment it changed is *between* the last run
 * judged the old way and the first run judged the new way. Drawing the riser
 * through the new run's marker also put it half a slot away from the
 * measurement-changed marker, which marks the same boundary; the two disagreed
 * on screen about where one event happened.
 */
function thresholdPath(
  points: FrameTrend["points"],
  x: (i: number) => number,
  y: (v: number) => number,
  slot: number
): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let previous: number | null = null;
  points.forEach((p, i) => {
    if (p.threshold === null) {
      if (current.length > 1) {
        out.push(current.join(" "));
      }
      current = [];
      previous = null;
      return;
    }
    if (previous === null) {
      current.push(`M${x(i).toFixed(1)},${y(p.threshold).toFixed(1)}`);
    } else if (previous !== p.threshold) {
      const edge = x(i) - slot / 2;
      current.push(`L${edge.toFixed(1)},${y(previous).toFixed(1)}`);
      current.push(`L${edge.toFixed(1)},${y(p.threshold).toFixed(1)}`);
      current.push(`L${x(i).toFixed(1)},${y(p.threshold).toFixed(1)}`);
    } else {
      current.push(`L${x(i).toFixed(1)},${y(p.threshold).toFixed(1)}`);
    }
    previous = p.threshold;
  });
  if (current.length > 1) {
    out.push(current.join(" "));
  }
  return out;
}

/**
 * Axis labels: the shortest commit prefix that still tells these runs apart.
 *
 * **Seven characters is a convention, not a guarantee.** Git's own short sha is
 * seven and that is almost always enough for real history — but "almost always"
 * on a chart means every so often two points are labelled identically and the
 * reader has no way to tell which run they are looking at. The fixed slice was
 * caught by a fixture whose commits were `mode000001…mode000006`: all six
 * labels rendered `mode000`, and the chart looked like six readings of one
 * commit.
 *
 * So the length is chosen from the data — never below seven, so real shas keep
 * the familiar form, and never above twelve, because past that the labels
 * collide on the page instead of in the data.
 *
 * Two points that genuinely share a commit — a re-run — get the same label, and
 * should: that is not ambiguity, it is the truth about those two runs.
 */
export function commitLabels(shas: string[]): string[] {
  const distinct = new Set(shas.filter((s) => s !== ""));
  let length = 12;
  for (let n = 7; n <= 12; n++) {
    if (new Set([...distinct].map((s) => s.slice(0, n))).size === distinct.size) {
      length = n;
      break;
    }
  }
  return shas.map((s) => (s ? s.slice(0, length) : "—"));
}

/** The chart in one sentence, for a screen reader and for anyone with images off. */
function describe(trend: FrameTrend, measured: number[]): string {
  const parts = [
    `${trend.frame}: aligned mismatch across ${trend.points.length} runs, oldest first,`,
    `from ${measured[0].toFixed(2)}% to ${measured[measured.length - 1].toFixed(2)}%.`,
  ];
  if (trend.firstDriftCommit !== null) {
    parts.push(`First exceeded the threshold at commit ${trend.firstDriftCommit.slice(0, 10)}.`);
  }
  if (trend.skipped > 0) {
    parts.push(`${trend.skipped} run${trend.skipped === 1 ? "" : "s"} measured nothing and are shown as gaps.`);
  }
  for (const t of trend.transitions) {
    parts.push(`Measurement changed from ${t.from} to ${t.to}.`);
  }
  return parts.join(" ");
}
