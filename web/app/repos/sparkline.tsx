import styles from "./trends.module.css";

/**
 * A frame's recent shape, small enough to sit in a table row (Phase I, I1).
 *
 * **A skipped run is a gap, never a zero.** A frame that recorded no measurement
 * has no number; plotting it at 0 would draw a pass that never happened, and a
 * chart that invents passes is worse than no chart. The line is broken into runs
 * of consecutive measured points — I2.3 asks for exactly this of the large
 * chart, and it would be strange for the small one to lie where the large one
 * does not.
 *
 * Server-rendered inert SVG, like the report page's history strip, so it needs
 * no nonce and arrives in the first byte of HTML.
 *
 * **Hovering a dot names its run — through `<title>`, not a drawn card.** The
 * trend chart draws its own tooltip; this cannot, and the reason is one
 * attribute: `preserveAspectRatio="none"`. This chart is 200 units wide and
 * stretches to whatever the row gives it, so every drawn shape is horizontally
 * scaled by an amount only the browser knows. A card composed here would arrive
 * with its text smeared to that ratio.
 *
 * A `<title>` is rendered by the browser as an ordinary tooltip, outside the
 * SVG's coordinate system entirely, so it is immune to that — and it costs no
 * layout, no script and no risk in a 40px-tall graphic. It is slower to appear
 * than a CSS tooltip, which is the trade.
 */

const CHART = { width: 200, height: 40, padX: 3, padY: 5 };

export function Sparkline({
  points,
  breaks = [],
  threshold,
  frame,
  labels = [],
}: {
  /** Oldest → newest. `null` is a run with no measurement. */
  points: (number | null)[];
  /** Indices where the measurement changed definition — the line breaks there. */
  breaks?: number[];
  threshold: number | null;
  frame: string;
  /**
   * One line per point, in the same order, shown when that dot is hovered.
   *
   * Optional and defaulted, because the two callers know different amounts: the
   * repository view has each run's commit and date, and the report page's
   * history strip has its own. A missing entry means the dot has no tooltip,
   * which is what this chart did before and is never worse than a wrong one.
   */
  labels?: (string | undefined)[];
}) {
  const measured = points.filter((p): p is number => p !== null);
  if (measured.length < 2) {
    return null;
  }
  // The threshold is part of the scale so the line is visible against it, and
  // never zero-height for a frame that has always sat at 0.
  const top = Math.max(...measured, threshold ?? 0) || 1;
  const innerW = CHART.width - CHART.padX * 2;
  const innerH = CHART.height - CHART.padY * 2;
  const x = (i: number) =>
    CHART.padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => CHART.padY + innerH - (v / top) * innerH;

  const thresholdY = threshold === null ? null : y(threshold);

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${frame}: aligned mismatch across ${points.length} runs, oldest first, from ${measured[0].toFixed(2)}% to ${measured[measured.length - 1].toFixed(2)}%`}
    >
      {thresholdY !== null && (
        <line
          className={styles.sparkThreshold}
          x1={CHART.padX}
          x2={CHART.width - CHART.padX}
          y1={thresholdY}
          y2={thresholdY}
        />
      )}
      {segments(points, breaks).map((seg) => (
        <path
          key={seg.join(",")}
          className={styles.sparkLine}
          d={seg.map((i, n) => `${n === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(points[i] as number).toFixed(1)}`).join(" ")}
        />
      ))}
      {points.map((value, i) =>
        value === null ? null : (
          <g key={i}>
            {/* A 1.8px dot is not a hover target. The transparent circle over it
                is, and it is what carries the title. */}
            <circle className={styles.sparkHit} cx={x(i)} cy={y(value)} r={7}>
              {labels[i] && <title>{labels[i]}</title>}
            </circle>
            <circle
              className={
                threshold !== null && value > threshold ? `${styles.sparkDot} ${styles.over}` : styles.sparkDot
              }
              cx={x(i)}
              cy={y(value)}
              r={1.8}
            />
          </g>
        )
      )}
    </svg>
  );
}

/**
 * Indices of the measured points, split into runs of consecutive ones.
 *
 * Shared by both charts so "a gap is a gap" is decided once. A single measured
 * point between two nulls is its own segment of length 1 and draws no line —
 * the dot still marks it, which is the honest rendering of one measurement
 * surrounded by silence.
 *
 * `breakBefore` splits the line at indices where the number stopped meaning the
 * same thing — a `fidelity` → `baseline` change, say. I2.2 asks for the two
 * segments to be *visually distinguished*, and a stroke drawn from the last
 * baseline run to the first fidelity run reads as a jump in quality when it is
 * only a change of reference. Marking the boundary and still connecting across
 * it says two different things at once.
 */
export function segments(points: (number | null)[], breakBefore: number[] = []): number[][] {
  const breaks = new Set(breakBefore);
  const out: number[][] = [];
  let current: number[] = [];
  points.forEach((value, i) => {
    if (value === null || breaks.has(i)) {
      if (current.length > 0) {
        out.push(current);
      }
      current = [];
      if (value === null) {
        return;
      }
    }
    current.push(i);
  });
  if (current.length > 0) {
    out.push(current);
  }
  return out.filter((seg) => seg.length > 1);
}
