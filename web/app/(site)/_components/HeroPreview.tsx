/** Browser chrome for the mockup. Local to this file so the lean site's kit
 *  stays independent of the pitch tree's components. */
const WindowBar = () => (
  <div className="flex items-center gap-1.5 border-b border-black/5 bg-white/60 px-2.5 py-1.5" aria-hidden>
    <span className="h-2 w-2 shrink-0 rounded-full bg-text/20" />
    <span className="h-1 w-7 rounded-full bg-black/10" />
    <span className="ml-auto h-1 w-3 rounded-full bg-black/10" />
    <span className="h-1 w-3 rounded-full bg-black/10" />
  </div>
);

/**
 * The hero's showcase anchor — a schematic of the comparison running, in pure
 * CSS/SVG so it costs no JavaScript. Carried over from the portfolio's product
 * page. Every animation is disabled under `prefers-reduced-motion`, which
 * settles the badge on its final state rather than hiding it.
 */
export function HeroPreview() {
  return (
    <div className="rounded-2xl bg-white shadow-2xl shadow-black/15 border border-black/5 p-3">
      <div className="relative aspect-[4/3] rounded-lg bg-[#fafafa] border border-black/5 overflow-hidden flex flex-col">
        <style>{`
          @keyframes ns-ants { to { stroke-dashoffset: -14; } }
          @keyframes ns-ants-down { to { stroke-dashoffset: -12; } }
          @keyframes ns-scan {
            0%   { top: -14%; opacity: 0; }
            12%  { opacity: .9; }
            88%  { opacity: .9; }
            100% { top: 104%; opacity: 0; }
          }
          @keyframes ns-badge-a { 0%,25% { opacity: 1; } 31%,100% { opacity: 0; } }
          @keyframes ns-badge-b { 0%,31% { opacity: 0; } 37%,54% { opacity: 1; } 60%,100% { opacity: 0; } }
          @keyframes ns-badge-c { 0%,60% { opacity: 0; } 66%,100% { opacity: 1; } }
          @keyframes ns-dot { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
          @media (prefers-reduced-motion: reduce) {
            .ns-scan-line { display: none !important; }
            .ns-badge-a, .ns-badge-b { opacity: 0 !important; }
            .ns-badge-c { opacity: 1 !important; }
          }
        `}</style>

        <WindowBar />

        <div className="relative flex-1 overflow-hidden">
          <svg viewBox="0 0 100 74" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
            <rect x="22" y="10" width="56" height="19" rx="4" fill="rgba(16,185,129,0.07)" stroke="rgb(52,211,153)" strokeWidth="1.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" style={{ animation: "ns-ants 1.1s linear infinite" }} />
            <text x="25" y="15" fill="rgb(5,150,105)" fontSize="3.1" fontWeight="700" letterSpacing="0.8">REFERENCE</text>
            <rect x="25" y="18" width="31" height="2.3" rx="1.15" fill="rgba(16,185,129,0.28)" />
            <rect x="25" y="22" width="45" height="2" rx="1" fill="rgba(16,185,129,0.16)" />
            <rect x="25" y="25.2" width="20" height="1.5" rx="0.75" fill="rgba(16,185,129,0.13)" />

            <line x1="50" y1="29" x2="50" y2="44" stroke="rgb(245,158,11)" strokeWidth="1.4" strokeDasharray="1.5 2.5" vectorEffect="non-scaling-stroke" style={{ animation: "ns-ants-down 0.7s linear infinite" }} />
            <rect x="52" y="34" width="15" height="5" rx="2.5" fill="rgb(255,251,235)" stroke="rgb(251,191,36)" strokeWidth="0.6" />
            <text x="54" y="37.3" fill="rgb(180,83,9)" fontSize="2.5" fontWeight="700">Δ 18px</text>

            <rect x="22" y="44" width="56" height="19" rx="4" fill="rgba(244,63,94,0.08)" stroke="rgb(244,63,94)" strokeWidth="1.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" style={{ animation: "ns-ants 1.1s linear infinite" }} />
            <text x="25" y="49" fill="rgb(225,29,72)" fontSize="3.1" fontWeight="700" letterSpacing="0.8">BUILD</text>
            <rect x="25" y="52" width="31" height="2.3" rx="1.15" fill="rgba(244,63,94,0.3)" />
            <rect x="25" y="56" width="45" height="2" rx="1" fill="rgba(244,63,94,0.16)" />
            <rect x="25" y="59.2" width="20" height="1.5" rx="0.75" fill="rgba(244,63,94,0.13)" />
          </svg>

          <div
            className="ns-scan-line absolute inset-x-0 h-8 pointer-events-none"
            style={{
              animation: "ns-scan 3.8s ease-in-out infinite",
              background:
                "linear-gradient(to bottom, rgba(16,185,129,0) 0%, rgba(16,185,129,0.14) 50%, rgba(16,185,129,0) 100%)",
            }}
            aria-hidden
          >
            <div className="absolute bottom-0 inset-x-0 h-px bg-emerald-400/70" />
          </div>

          <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[94px] h-[22px] text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 border border-amber-300 rounded-full overflow-hidden">
            <span className="ns-badge-a absolute inset-0 flex items-center justify-center gap-1" style={{ animation: "ns-badge-a 5.4s ease-in-out infinite" }}>
              <span className="w-1 h-1 rounded-full bg-amber-500" style={{ animation: "ns-dot 0.9s ease-in-out infinite" }} />
              Scanning
            </span>
            <span className="ns-badge-b absolute inset-0 flex items-center justify-center gap-1" style={{ animation: "ns-badge-b 5.4s ease-in-out infinite" }}>
              <span className="w-1 h-1 rounded-full bg-amber-500" style={{ animation: "ns-dot 0.9s ease-in-out infinite" }} />
              Measuring
            </span>
            <span className="ns-badge-c absolute inset-0 flex items-center justify-center" style={{ animation: "ns-badge-c 5.4s ease-in-out infinite" }}>
              18.4% shifted
            </span>
          </span>
        </div>
      </div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-text/35 text-center pt-2.5 pb-1">
        Diff overlay · live preview
      </p>
    </div>
  );
}
