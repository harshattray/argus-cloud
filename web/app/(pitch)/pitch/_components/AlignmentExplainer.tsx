"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { HERO_FRAME, imagePaths, RUN_DATE, RUN_VIEWPORT } from "../../../../lib/run-data";

/**
 * The site's central argument (docs/normascopeWeb.md §8.1).
 *
 * Every number and every image here is from the real run recorded in
 * lib/run-data.ts. Do not substitute illustrative values — the entire point of
 * this component is that it is not an illustration.
 */

type Mode = "naive" | "aligned";

const paths = imagePaths(HERO_FRAME);

/** Schematic of one page whose middle band has slid down. Under `naive` every
 *  row below the shift counts as wrong; under `aligned` the band is slid back
 *  and only the genuine difference remains. */
function Schematic({ mode }: { mode: Mode }) {
  const naive = mode === "naive";
  const shift = naive ? 10 : 0;

  return (
    <svg viewBox="0 0 120 90" className="w-full h-full" role="img" aria-label={
      naive
        ? "Schematic: the shifted section and everything below it counted as different"
        : "Schematic: the shifted section slid back into place, leaving one small real difference"
    }>
      <rect x="0" y="0" width="120" height="90" rx="4" className="fill-black/[0.02]" />

      {/* header — never moves */}
      <rect x="8" y="7" width="104" height="12" rx="2" className="fill-emerald-500/15 stroke-emerald-500/40" strokeWidth="0.6" />
      <rect x="12" y="11" width="34" height="4" rx="2" className="fill-emerald-600/40" />

      {/* the band that moved */}
      <g style={{ transform: `translateY(${shift}px)`, transition: "transform 600ms cubic-bezier(0.4,0,0.2,1)" }}>
        <rect
          x="8"
          y="24"
          width="104"
          height="22"
          rx="2"
          className={naive ? "fill-rose-500/20 stroke-rose-500/60" : "fill-emerald-500/15 stroke-emerald-500/40"}
          strokeWidth="0.6"
          style={{ transition: "fill 400ms, stroke 400ms" }}
        />
        <rect x="12" y="29" width="58" height="4" rx="2" className={naive ? "fill-rose-600/40" : "fill-emerald-600/40"} />
        <rect x="12" y="36" width="80" height="3" rx="1.5" className={naive ? "fill-rose-600/25" : "fill-emerald-600/25"} />
      </g>

      {/* content below the shift */}
      <g style={{ transform: `translateY(${shift}px)`, transition: "transform 600ms cubic-bezier(0.4,0,0.2,1)" }}>
        <rect
          x="8"
          y="50"
          width="104"
          height="16"
          rx="2"
          className={naive ? "fill-rose-500/20 stroke-rose-500/60" : "fill-emerald-500/15 stroke-emerald-500/40"}
          strokeWidth="0.6"
          style={{ transition: "fill 400ms, stroke 400ms" }}
        />
        <rect x="12" y="55" width="44" height="4" rx="2" className={naive ? "fill-rose-600/40" : "fill-emerald-600/40"} />
      </g>

      {/* the one genuine difference — present in both readings */}
      <rect x="86" y="54" width="20" height="8" rx="1.5" className="fill-amber-400/50 stroke-amber-500" strokeWidth="0.7"
        style={{ transform: `translateY(${shift}px)`, transition: "transform 600ms cubic-bezier(0.4,0,0.2,1)" }} />

      {/* shift measurement */}
      {naive && (
        <g>
          <line x1="4" y1="24" x2="4" y2="34" className="stroke-amber-500" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
          <text x="6" y="31" className="fill-amber-600" fontSize="4.5" fontWeight="700">shift</text>
        </g>
      )}
    </svg>
  );
}

export function AlignmentExplainer() {
  const [mode, setMode] = useState<Mode>("naive");
  const groupId = useId();
  const naive = mode === "naive";
  const score = naive ? HERO_FRAME.unaligned : HERO_FRAME.aligned;

  return (
    <div className="rounded-2xl border border-black/8 bg-white/60 overflow-hidden">
      {/* control + readout */}
      <div className="px-5 md:px-7 py-5 border-b border-black/6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div
          role="radiogroup"
          aria-label="Diff method"
          className="inline-flex shrink-0 rounded-xl bg-black/6 p-1"
        >
          {(["naive", "aligned"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              id={`${groupId}-${m}`}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                mode === m ? "bg-[#111] text-white shadow-sm" : "text-text/55 hover:text-text"
              }`}
            >
              {m === "naive" ? "Naive diff" : "Aligned diff"}
            </button>
          ))}
        </div>

        <div className="flex items-baseline gap-3 sm:ml-auto">
          <span
            className={`font-mono font-bold numeric leading-none text-4xl md:text-5xl transition-colors ${
              naive ? "text-rose-500" : "text-emerald-600"
            }`}
            aria-live="polite"
          >
            {score.toFixed(2)}%
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-text/40">
            {naive ? "reported wrong" : "actually wrong"}
          </span>
        </div>
      </div>

      {/* schematic + explanation */}
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 px-5 md:px-7 py-6 border-b border-black/6">
        <div className="aspect-[4/3] max-h-52 mx-auto md:mx-0 w-full">
          <Schematic mode={mode} />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-sm text-text/70 leading-relaxed">
            {naive ? (
              <>
                A section got taller, so <strong className="text-text">everything below it shifted down</strong>.
                A straight pixel comparison scores every one of those rows as different, and reports{" "}
                <strong className="text-rose-600">{HERO_FRAME.unaligned}%</strong> — which reads like the page is
                broken.
              </>
            ) : (
              <>
                Normascope slices both images into horizontal bands and searches ±120px for the offset that best
                matches each one. With the moved bands slid back into place, the honest number is{" "}
                <strong className="text-emerald-700">{HERO_FRAME.aligned}%</strong> — one small genuine difference,
                exactly where the amber block is.
              </>
            )}
          </p>
          <p className="text-xs text-text/40 leading-relaxed mt-3">
            Both numbers are reported, always. A wide gap between them is itself the signal:{" "}
            <em>something moved</em> rather than <em>something broke</em>.
          </p>
        </div>
      </div>

      {/* the real artefacts */}
      <div className="px-5 md:px-7 py-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text/35">
            The actual run
          </span>
          <span className="text-[11px] text-text/35 font-mono">
            {HERO_FRAME.label} · {RUN_VIEWPORT.width}×{RUN_VIEWPORT.height} · {RUN_DATE}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { src: paths.baseline, label: "Approved baseline", tone: "text-emerald-700" },
            { src: paths.build, label: "This build", tone: "text-rose-600" },
            { src: paths.diff, label: "Diff overlay", tone: "text-amber-700" },
          ].map((shot) => (
            <figure key={shot.label} className="min-w-0">
              <div className="relative aspect-[1440/1000] rounded-lg overflow-hidden border border-black/8 bg-white">
                <Image
                  src={shot.src}
                  alt={`${HERO_FRAME.label} — ${shot.label}`}
                  fill
                  sizes="(max-width: 768px) 30vw, 220px"
                  className="object-cover object-top"
                />
              </div>
              <figcaption
                className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-center mt-1.5 ${shot.tone}`}
              >
                {shot.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { k: "Aligned", v: `${HERO_FRAME.aligned}%` },
            { k: "Unaligned", v: `${HERO_FRAME.unaligned}%` },
            { k: "SSIM", v: HERO_FRAME.ssim.toFixed(1) },
            { k: "Drifted sections", v: HERO_FRAME.driftedSections },
          ].map((stat) => (
            <div key={stat.k} className="rounded-lg border border-black/8 bg-black/[0.015] px-3 py-2.5">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-text/35">{stat.k}</dt>
              <dd className="font-mono font-bold text-text/80 mt-0.5 tabular-nums">{stat.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
