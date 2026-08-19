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

      {points.map((p, i) =>
        p.alignedMismatchPercent === null ? null : (
          <circle
            key={`d-${i}`}
            className={p.flagged ? `${styles.dot} ${styles.over}` : styles.dot}
            cx={x(i)}
            cy={y(p.alignedMismatchPercent)}
            r={3.5}
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
