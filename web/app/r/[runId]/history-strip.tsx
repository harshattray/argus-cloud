import type { FrameHistory } from "argus-cloud/enrichment.js";
import styles from "./report.module.css";

/**
 * One frame's history (BuildV5 Phase H3) — the moat, rendered as page furniture.
 *
 * **This is the argument for the paid tier.** `enrichment.ts` has computed
 * `firstDriftCommit` and `recurrence` since Build 4.0 and fed them to the model;
 * no page has ever displayed them, and the CLI's own report structurally cannot
 * compute them — a local run only knows about itself. So the one thing a
 * customer can get here and nowhere else was, until now, visible only to a
 * language model.
 *
 * The numbers come from `frameHistory()` in `enrichment.ts` — the same function
 * the prompt uses, and the same one Phase I's trend chart will use. Three
 * readers, one query: BuildV5's I2.1 gate says two implementations of "first
 * drift" that disagree is a bug in one of them, and the cheapest way to keep
 * them agreeing is to have one.
 *
 * Rendered on the server as inert SVG. No client JavaScript, so it survives the
 * strict CSP without a nonce and appears in the first byte of HTML.
 */

const CHART = { width: 420, height: 44, padX: 3, padY: 6 };

export function HistoryStrip({
  history,
  threshold,
  frame,
}: {
  /** Prior committed runs only — the current one is stripped by `priorRuns`. */
  history: FrameHistory;
  threshold: number | null;
  frame: string;
}) {
  const points = history.trend
    .slice()
    .reverse() // oldest → newest reads as a trend
    .map((row) => row.alignedMismatchPercent);

  const measured = points.filter((p): p is number => p !== null);
  const skipped = points.length - measured.length;

  return (
    <section className={styles.history} aria-label={`History for ${frame}`}>
      <div className={styles.historyHead}>
        <span className={styles.historyLabel}>History</span>
      </div>
      <dl className={styles.historyFacts}>
        {history.firstDriftCommit !== null && (
          <div className={styles.historyFact}>
            <dt>First drifted at</dt>
            <dd>
              <code>{history.firstDriftCommit.slice(0, 10)}</code>
            </dd>
          </div>
        )}
        {history.recurrence > 0 && (
          <div className={styles.historyFact}>
            <dt>Times flagged</dt>
            <dd>
              {history.recurrence} run{history.recurrence === 1 ? "" : "s"}
            </dd>
          </div>
        )}
        <div className={styles.historyFact}>
          <dt>Prior runs</dt>
          <dd>{history.trend.length}</dd>
        </div>
      </dl>

      {measured.length >= 2 && <Sparkline points={points} threshold={threshold} frame={frame} />}
      {skipped > 0 && (
        <p className={styles.sparkGapNote}>
          {skipped} run{skipped === 1 ? "" : "s"} skipped this frame — shown as a gap, not a zero.
        </p>
      )}

      {history.lastObservation !== null && (
        <p className={styles.priorFinding}>
          Last time: {history.lastObservation}
        </p>
      )}
    </section>
  );
}

/**
 * Aligned mismatch across the prior runs, oldest first.
 *
 * **A skipped run is a gap, never a zero.** A frame that was not compared has no
 * number; plotting it at 0 would draw a pass that never happened, and a chart
 * that invents passes is worse than no chart. The line is broken into runs of
 * consecutive measured points, which is also what Phase I's gate (I2.3) asks of
 * the trend chart.
 */
function Sparkline({
  points,
  threshold,
  frame,
}: {
  points: (number | null)[];
  threshold: number | null;
  frame: string;
}) {
  const measured = points.filter((p): p is number => p !== null);
  // The threshold is part of the scale so the line is visible against it, and
  // never zero-height for a frame that has always sat at 0.
  const top = Math.max(...measured, threshold ?? 0) || 1;
  const innerW = CHART.width - CHART.padX * 2;
  const innerH = CHART.height - CHART.padY * 2;
  const x = (index: number) =>
    CHART.padX + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => CHART.padY + innerH - (value / top) * innerH;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length > 1) {
    segments.push(current.join(" "));
  }

  const thresholdY = threshold === null ? null : y(threshold);

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${frame}: aligned mismatch across ${points.length} prior runs, oldest first, from ${measured[0]?.toFixed(2)}% to ${measured[measured.length - 1]?.toFixed(2)}%`}
    >
      {thresholdY !== null && (
        <line className={styles.sparkThreshold} x1={CHART.padX} x2={CHART.width - CHART.padX} y1={thresholdY} y2={thresholdY} />
      )}
      {segments.map((d) => (
        <path key={d} className={styles.sparkLine} d={d} />
      ))}
      {points.map((value, index) =>
        value === null ? null : (
          <circle
            key={index}
            className={
              threshold !== null && value > threshold ? `${styles.sparkDot} ${styles.over}` : styles.sparkDot
            }
            cx={x(index)}
            cy={y(value)}
            r={2}
          />
        )
      )}
    </svg>
  );
}
