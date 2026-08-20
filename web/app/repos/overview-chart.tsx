import type { FrameOverview } from "argus-cloud/trendData.js";
import styles from "./trends.module.css";

/**
 * The whole retained history of one frame, compressed to a shape you can aim at.
 *
 * **It is a different chart from `TrendChart`, not a smaller one**, and the
 * difference is the x-axis. The detail chart is spaced by *run index*, which is
 * right when you are reading commits in order — but it means two hundred runs in
 * an afternoon and two hundred across a quarter draw identically. Over ninety
 * days that is not a rendering choice, it is a false picture, and the one
 * question this chart exists to answer — *when did this start* — is exactly the
 * question that spacing cannot answer. So this one is spaced by time.
 *
 * **What each bucket draws, and why none of it is invented:**
 *
 *   - a **band** from the bucket's lowest recorded value to its highest. Both
 *     ends are measurements. The band is the honest statement "runs in this
 *     period ranged between these two", which is more than a single line can
 *     say and less than a line pretends to.
 *   - a **line** through each bucket's last value, so the trend reads left to
 *     right without implying the intermediate runs sat on it.
 *   - a **tick** on buckets whose runs disagreed about crossing the threshold.
 *     That is the fact a coarse chart loses first: one flagged run inside an
 *     otherwise clean afternoon disappears into a band that looks tall for
 *     ordinary reasons.
 *
 * Nothing here is an average. `frameOverview` keeps recorded values only, and
 * `test/overview.test.mjs` O2.4b prints what a mean would have drawn instead —
 * 24% for a bucket whose real peak was 97.4%.
 *
 * **Server-rendered.** The brush that sits on top of it is a client component;
 * this is inert SVG underneath, so the chart is in the first byte whether or not
 * anything hydrates.
 */

const W = 720;
const H = 120;
const PAD = { left: 46, right: 16, top: 12, bottom: 22 };

export function OverviewChart({ overview }: { overview: FrameOverview }) {
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
  const from = new Date(overview.from).getTime();
  const to = new Date(overview.to).getTime();
  const span = Math.max(1, to - from);

  // Headroom, and never a zero-height axis for a frame that has always sat at 0.
  const thresholds = overview.buckets.map((b) => b.threshold).filter((v): v is number => v !== null);
  const top = Math.max(overview.peak ?? 0, ...thresholds, 0) * 1.15 || 1;

  const x = (at: string) => PAD.left + ((new Date(at).getTime() - from) / span) * inner.w;
  const y = (v: number) => PAD.top + inner.h - (v / top) * inner.h;
  // `bucketCount`, never `buckets.length`: only buckets holding runs come back,
  // so the array is shorter than the division of time whenever history is
  // sparse — and sizing a bar by the array made six runs in one afternoon fill a
  // quarter of a 90-day chart.
  const width = Math.max(1.2, inner.w / overview.bucketCount);

  const measured = overview.buckets.filter((b) => b.last !== null);
  /*
   * One measured bucket draws no line — a path of a single `M` renders nothing,
   * and it should: a line needs two points, and interpolating one run into a
   * stroke would be inventing the second.
   *
   * That is why the same chart reads as a bar for one repository and a
   * sparkline for another. Six runs in one afternoon land in one bucket and
   * come out as a single band with no line through it; four runs across a
   * fortnight come out as four bands so short they read as the line joining
   * them. Same rule, two pictures, and the page says which one you are looking
   * at rather than leaving the reader to work it out.
   */
  const line = measured
    .map((b, i) => `${i === 0 ? "M" : "L"}${x(b.from).toFixed(1)},${y(b.last as number).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      className={styles.overview}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={describe(overview)}
    >
      <line className={styles.axis} x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
      {/*
        The label is the peak, at the peak's own height — not the top of the
        axis, which is `peak × 1.15` and is a rendering constant.

        It printed `top` and it was wrong in the way this repo cares about
        most: a frame peaking at 87.6% put "100.74%" beside the chart, which is
        an impossible aligned-mismatch figure that no run measured. Doctrine 2
        says every number a customer reads traces to a recording. Headroom is
        allowed to be invented; a number on the page is not.
      */}
      {overview.peak !== null && (
        <text
          className={styles.axisLabel}
          x={PAD.left - 6}
          y={y(overview.peak) + 4}
          textAnchor="end"
        >
          {overview.peak.toFixed(2)}%
        </text>
      )}

      {/* The min–max band. Drawn first, so the line and the ticks sit on it. */}
      {overview.buckets.map((b) =>
        b.lo === null || b.hi === null ? null : (
          <rect
            key={`b-${b.index}`}
            className={b.flagged > 0 ? `${styles.ovBand} ${styles.over}` : styles.ovBand}
            x={x(b.from)}
            y={y(b.hi)}
            width={width}
            /* A bucket whose runs all measured the same thing has zero height and
               would vanish; 1.2 units keeps it visible as a mark rather than
               inflating what it claims. */
            height={Math.max(1.2, y(b.lo) - y(b.hi))}
          />
        )
      )}

      {line && <path className={styles.ovLine} d={line} />}

      {/* Buckets whose runs disagreed about crossing the line. */}
      {overview.buckets.map((b) =>
        b.crossing ? (
          <line
            key={`c-${b.index}`}
            className={styles.ovCrossing}
            x1={x(b.from) + width / 2}
            x2={x(b.from) + width / 2}
            y1={PAD.top}
            y2={y(0)}
          />
        ) : null
      )}

      {/* Time, not commits — the whole reason this chart exists. */}
      {dateTicks(from, to).map((t) => (
        <text
          key={t.at}
          className={styles.axisLabel}
          x={x(new Date(t.at).toISOString())}
          y={H - PAD.bottom + 14}
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}
    </svg>
  );
}

/**
 * Five evenly spaced date labels across the range.
 *
 * Deliberately not "one per bucket thinned down": the labels are about *time*,
 * and the buckets are an artifact of how wide the chart happens to be. Spacing
 * the labels by time keeps them meaningful if the bucket count ever changes.
 */
function dateTicks(from: number, to: number): { at: number; label: string }[] {
  const days = (to - from) / (24 * 3600 * 1000);
  const out: { at: number; label: string }[] = [];
  for (let i = 0; i <= 4; i++) {
    const at = from + ((to - from) * i) / 4;
    const d = new Date(at);
    out.push({
      at,
      // Under a fortnight the day alone is ambiguous across months, and over a
      // quarter the day is noise. Neither case wants a year nobody asked about.
      label: days <= 14
        ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
        : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    });
  }
  return out;
}

/** The chart in one sentence, for a screen reader and for anyone with images off. */
function describe(o: FrameOverview): string {
  const parts = [
    `${o.frame}: ${o.totalRuns} run${o.totalRuns === 1 ? "" : "s"} over ${o.days} days,`,
    o.peak === null ? "none of which measured anything." : `peaking at ${o.peak.toFixed(2)}%.`,
  ];
  const crossings = o.buckets.filter((b) => b.crossing).length;
  if (crossings > 0) {
    parts.push(`${crossings} period${crossings === 1 ? "" : "s"} contain both flagged and clean runs.`);
  }
  parts.push("Shaded bands show the range of values recorded in each period; nothing is averaged.");
  return parts.join(" ");
}
