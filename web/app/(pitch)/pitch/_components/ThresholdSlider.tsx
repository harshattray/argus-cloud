"use client";

import { useState } from "react";
import { FRAMES, THRESHOLD } from "../../../../lib/run-data";

/**
 * Threshold, learned by dragging (docs/normascopeWeb.md §8.2). Real frames,
 * real scores — only the threshold is yours to move.
 *
 * A frame is flagged when its *aligned* mismatch exceeds the threshold. At the
 * run's own 0.1% one frame is flagged; at 1% none are.
 */

// Non-linear: almost all the interesting behaviour is under 1%.
const STEPS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5];

export function ThresholdSlider() {
  const [index, setIndex] = useState(STEPS.indexOf(THRESHOLD));
  const threshold = STEPS[index];
  const flagged = FRAMES.filter((f) => f.aligned > threshold);

  return (
    <div className="rounded-2xl border border-black/8 bg-white/60 overflow-hidden">
      <div className="px-5 md:px-7 py-6 border-b border-black/6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <label
              htmlFor="threshold-range"
              className="text-[10px] font-black uppercase tracking-[0.2em] text-text/35 block mb-2"
            >
              Threshold
            </label>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold text-clay numeric leading-none">
                {threshold}%
              </span>
              {threshold === THRESHOLD && (
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-text/30">
                  this run&apos;s setting
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-text/60" aria-live="polite">
            {flagged.length === 0 ? (
              <span className="text-emerald-700 font-bold">All 3 frames pass</span>
            ) : (
              <>
                <span className="text-amber-700 font-bold">
                  {flagged.length} of 3 flagged
                </span>
                <span className="text-text/40"> · {flagged.map((f) => f.short).join(", ")}</span>
              </>
            )}
          </p>
        </div>

        <input
          id="threshold-range"
          type="range"
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-valuetext={`${threshold} percent`}
          className="w-full accent-clay cursor-pointer h-6"
        />
        <div className="flex justify-between text-[10px] font-mono text-text/30 mt-1">
          <span>0%</span>
          <span>1%</span>
          <span>5%</span>
        </div>
      </div>

      <ul className="divide-y divide-black/6">
        {FRAMES.map((frame) => {
          const isFlagged = frame.aligned > threshold;
          return (
            <li
              key={frame.slug}
              className={`flex items-center gap-3 px-5 md:px-7 py-3.5 transition-colors ${
                isFlagged ? "bg-amber-50/70" : ""
              }`}
            >
              <span
                className={`shrink-0 w-5 text-center font-bold ${
                  isFlagged ? "text-amber-600" : "text-emerald-600"
                }`}
                aria-hidden
              >
                {isFlagged ? "⚠" : "✓"}
              </span>
              <span className="font-mono text-[11px] sm:text-xs text-text/70 flex-1 min-w-0 truncate">
                {frame.screenshot}
              </span>
              <span
                className={`font-mono text-xs sm:text-sm font-bold tabular-nums ${
                  isFlagged ? "text-amber-700" : "text-text/60"
                }`}
              >
                {frame.aligned.toFixed(2)}%
              </span>
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-[0.14em] w-16 text-right shrink-0">
                <span className={isFlagged ? "text-amber-700" : "text-emerald-700"}>
                  {isFlagged ? "flagged" : "clean"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="px-5 md:px-7 py-4 bg-black/[0.025] border-t border-black/6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <code className="font-mono text-xs text-text/60">
          {"{ "}
          <span className="text-clay">&quot;threshold&quot;</span>: <span className="text-emerald-700">{threshold}</span>
          {" }"}
        </code>
        <p className="text-[11px] text-text/40 sm:ml-auto">
          Flagged means &ldquo;look at this&rdquo;, not &ldquo;build failed&rdquo; — nothing turns red without{" "}
          <code className="font-mono">--strict</code>.
        </p>
      </div>
    </div>
  );
}
