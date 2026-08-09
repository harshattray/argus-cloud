import type { ReactNode } from "react";

/**
 * Diagrams for the Cloud page.
 *
 * Every one of these is a **drawing**, never a screenshot, and each is captioned
 * as such where it is used. The hosted report page is still being built, and
 * docs/normascopeWeb.md §10 forbids showing screenshots of an unbuilt surface —
 * but it does not forbid showing the *shape* of what is coming, which is the
 * only way to make a waitlist page worth anything.
 *
 * They are pure SVG with no client JavaScript, so they cost nothing to ship and
 * they scale with the container rather than with a viewport breakpoint.
 */

/** Twelve commits of one frame's aligned score. Illustrative numbers. */
const SERIES = [0.0, 0.0, 0.12, 0.09, 0.3, 0.42, 0.94, 1.3, 1.15, 2.6, 3.4, 8.3];
const THRESHOLD = 0.5;
const FIRST_BREACH = SERIES.findIndex((v) => v > THRESHOLD);

/** Map a series onto a plot box, sharing the maths between both charts. */
function plot(width: number, height: number, pad: { x: number; top: number; bottom: number }) {
  const max = 9;
  const plotW = width - pad.x * 2;
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.x + (i / (SERIES.length - 1)) * plotW;
  const y = (v: number) => pad.top + (1 - Math.min(v, max) / max) * plotH;
  return { x, y, plotW, plotH, max };
}

/**
 * The per-frame history strip — the single most valuable thing on the hosted
 * page, and the thing a local run structurally cannot draw.
 */
export const HistoryStrip = ({ className = "" }: { className?: string }) => {
  const W = 340;
  const H = 96;
  const { x, y } = plot(W, H, { x: 10, top: 12, bottom: 16 });
  const line = SERIES.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(SERIES.length - 1).toFixed(1)} ${H - 16} L${x(0).toFixed(1)} ${H - 16} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="A frame's difference score rising across twelve commits, crossing the threshold line at the seventh and ending well above it.">
      <path d={area} fill="#b6611f" fillOpacity="0.09" />
      <line
        x1="10"
        x2={W - 10}
        y1={y(THRESHOLD)}
        y2={y(THRESHOLD)}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <path d={line} fill="none" stroke="#b6611f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* First breach — the commit the whole feature exists to name. */}
      <circle cx={x(FIRST_BREACH)} cy={y(SERIES[FIRST_BREACH])} r="3.5" fill="#b6611f" />
      <circle
        cx={x(FIRST_BREACH)}
        cy={y(SERIES[FIRST_BREACH])}
        r="7"
        fill="none"
        stroke="#b6611f"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <circle cx={x(SERIES.length - 1)} cy={y(SERIES[SERIES.length - 1])} r="3.5" fill="#b6611f" />
    </svg>
  );
};

/** The repo-level trend chart, with its axes and annotations spelled out. */
export const TrendChart = ({ className = "" }: { className?: string }) => {
  const W = 520;
  const H = 220;
  const pad = { x: 16, top: 26, bottom: 34 };
  const { x, y } = plot(W, H, pad);
  const line = SERIES.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(SERIES.length - 1).toFixed(1)} ${H - pad.bottom} L${x(0).toFixed(1)} ${H - pad.bottom} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="A trend chart of one frame's aligned difference across twelve commits. The score sits near zero for the first six, crosses the threshold at the seventh — which is marked as the first breach — and climbs steeply to 8.3 percent by the twelfth."
    >
      {/* Gridlines */}
      {[0, 3, 6, 9].map((v) => (
        <g key={v}>
          <line
            x1={pad.x}
            x2={W - pad.x}
            y1={y(v)}
            y2={y(v)}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
          <text x={pad.x} y={y(v) - 5} fill="currentColor" fillOpacity="0.3" fontSize="9" fontFamily="monospace">
            {v}%
          </text>
        </g>
      ))}

      <path d={area} fill="#b6611f" fillOpacity="0.1" />

      {/* Threshold */}
      <line
        x1={pad.x}
        x2={W - pad.x}
        y1={y(THRESHOLD)}
        y2={y(THRESHOLD)}
        stroke="#b6611f"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text
        x={W - pad.x}
        y={y(THRESHOLD) - 6}
        textAnchor="end"
        fill="#b6611f"
        fillOpacity="0.75"
        fontSize="9"
        fontFamily="monospace"
      >
        your threshold · 0.5%
      </text>

      <path d={line} fill="none" stroke="#b6611f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {SERIES.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === SERIES.length - 1 ? 4 : 2.2} fill="#b6611f" />
      ))}

      {/* First breach marker */}
      <line
        x1={x(FIRST_BREACH)}
        x2={x(FIRST_BREACH)}
        y1={pad.top - 8}
        y2={H - pad.bottom}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <text
        x={x(FIRST_BREACH) + 6}
        y={pad.top - 12}
        fill="currentColor"
        fillOpacity="0.55"
        fontSize="9.5"
        fontFamily="monospace"
      >
        first exceeded · a1b2c3
      </text>

      {/* X axis */}
      <line
        x1={pad.x}
        x2={W - pad.x}
        y1={H - pad.bottom}
        y2={H - pad.bottom}
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="1"
      />
      <text x={pad.x} y={H - 14} fill="currentColor" fillOpacity="0.35" fontSize="9.5" fontFamily="monospace">
        12 commits ago
      </text>
      <text
        x={W - pad.x}
        y={H - 14}
        textAnchor="end"
        fill="currentColor"
        fillOpacity="0.35"
        fontSize="9.5"
        fontFamily="monospace"
      >
        today · 8.3%
      </text>
    </svg>
  );
};

/**
 * The credit budget, drawn.
 *
 * The bar is the whole argument: the balance *is* the cap, so there is no
 * region of this diagram to the right of the bar. That is enforced by a CHECK
 * constraint in the schema, not by a policy page.
 */
export const BudgetMeter = ({ className = "" }: { className?: string }) => (
  <div className={className}>
    <div className="mb-2 flex items-baseline justify-between">
      <span className="font-mono text-[12px] text-text/60">ci-agent · monthly budget</span>
      <span className="numeric font-mono text-[12px] font-bold text-text/80">62% used</span>
    </div>
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/8">
      <div className="h-full rounded-full bg-clay" style={{ width: "62%" }} />
    </div>
    <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-text/40">
      <span>spent</span>
      <span className="text-clay-deep">← hard stop, no overage path</span>
    </div>
  </div>
);

/** A pull-request comment, drawn in GitHub's shape rather than screenshotted. */
export const PrComment = ({ className = "" }: { className?: string }) => (
  <div className={`overflow-hidden rounded-xl border border-black/10 bg-white ${className}`}>
    <div className="flex items-center gap-2.5 border-b border-black/8 bg-black/[0.03] px-4 py-2.5">
      <span aria-hidden className="h-5 w-5 shrink-0 rounded-full bg-clay/30" />
      <span className="text-[12px] font-semibold text-text/70">normascope</span>
      <span className="rounded-full border border-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text/40">
        bot
      </span>
      <span className="text-[11px] text-text/35">commented on this pull request</span>
    </div>
    <div className="px-4 py-3.5 text-[13px] leading-relaxed">
      <p className="mb-2.5 font-semibold text-text/85">3 frames compared · 1 needs attention</p>
      <table className="w-full border-collapse text-left font-mono text-[11.5px]">
        <tbody>
          <tr className="border-b border-black/6">
            <td className="py-1.5 text-text/70">Pull Requests</td>
            <td className="py-1.5 text-right font-bold text-[#b6611f]">8.30%</td>
            <td className="py-1.5 pl-3 text-right text-text/40">was 2.10%</td>
          </tr>
          <tr className="border-b border-black/6">
            <td className="py-1.5 text-text/70">Hero</td>
            <td className="py-1.5 text-right text-text/45">0.00%</td>
            <td className="py-1.5 pl-3 text-right text-text/30">no change</td>
          </tr>
          <tr>
            <td className="py-1.5 text-text/70">Commands</td>
            <td className="py-1.5 text-right text-text/45">0.00%</td>
            <td className="py-1.5 pl-3 text-right text-text/30">no change</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 border-l-2 border-clay/50 pl-3 text-[12.5px] leading-relaxed text-text/60">
        <strong className="font-semibold text-text/80">Pull Requests</strong> first exceeded your
        threshold at <code className="font-mono">a1b2c3</code>, 6 commits ago — 3rd time this frame
        has regressed.
      </p>
      <p className="mt-2.5 text-[12px] text-clay-deep underline underline-offset-2">
        Open the full report →
      </p>
    </div>
  </div>
);

/**
 * The comparison table. Honest ticks: the free column is meant to look good,
 * because it is good, and a credible free column is what makes the paid one
 * believable (FUTURENORMA §10).
 */
export const CompareRow = ({
  feature,
  local,
  cloud,
}: {
  feature: ReactNode;
  local: ReactNode | false;
  cloud: ReactNode | false;
}) => (
  <tr className="border-t border-black/8 align-top">
    <td className="py-3.5 pr-4 text-[14px] leading-snug text-text/75">{feature}</td>
    <td className="px-3 py-3.5 text-[13px] leading-snug text-text/50">
      {local === false ? (
        <span className="text-text/25" aria-label="Not available">
          —
        </span>
      ) : (
        local
      )}
    </td>
    {/* The Cloud column is tinted the whole way down. The table is the page's
        central argument and a reader should be able to see which side of it
        they are looking at without reading the header. */}
    <td className="bg-clay/[0.06] px-3 py-3.5 text-[13px] font-medium leading-snug text-clay-deep">
      {cloud === false ? (
        <span className="text-text/25" aria-label="Not available">
          —
        </span>
      ) : (
        <span className="flex gap-2">
          <span aria-hidden className="mt-[3px] shrink-0 text-[11px] text-clay">
            ✦
          </span>
          {cloud}
        </span>
      )}
    </td>
  </tr>
);
