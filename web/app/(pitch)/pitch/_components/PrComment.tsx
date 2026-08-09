import { GITHUB_ACTION } from "../../../../lib/site";

/**
 * The sticky PR comment, rebuilt in GitHub's own chrome. This is a mockup by
 * necessity — a screenshot of a real PR would carry someone's repository — but
 * the shape, the columns and the delta behaviour are exactly what the Action
 * posts.
 */
export function PrComment() {
  const rows = [
    { frame: "hero-section", mode: "fidelity", aligned: "2.1%", delta: "+0.3%", flagged: false },
    { frame: "primary-button", mode: "fidelity", aligned: "18.4%", delta: "+12.1%", flagged: true },
    { frame: "nav-bar", mode: "baseline", aligned: "0.3%", delta: "−0.1%", flagged: false },
    { frame: "pricing-page", mode: "fidelity", aligned: "1.8%", delta: "+0.2%", flagged: false },
  ];

  return (
    <div className="rounded-2xl bg-white shadow-2xl border border-black/8 overflow-hidden">
      <div className="bg-[#f6f8fa] border-b border-black/8 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#57606a" className="shrink-0" aria-hidden>
            <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Z" />
          </svg>
          <span className="text-xs font-semibold text-[#24292f] truncate">feature/hero-redesign</span>
          <span className="text-[#57606a] text-xs shrink-0">into</span>
          <span className="text-xs font-semibold text-[#24292f] shrink-0">main</span>
        </div>
        <span className="text-[11px] font-medium text-[#57606a] shrink-0">3 commits</span>
      </div>

      <div className="px-5 py-4 border-b border-black/6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-clay to-violet-600 flex items-center justify-center shrink-0" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L13.6 9.4L21 12L13.6 14.6L12 22L10.4 14.6L3 12L10.4 9.4L12 2Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="text-[13px] font-semibold text-[#24292f]">normascope-bot</span>
            <span className="text-[12px] text-[#57606a] ml-2">commented 2 minutes ago</span>
          </div>
          <span className="ml-auto text-[10px] font-bold text-[#57606a] bg-[#f6f8fa] border border-black/10 rounded-full px-2 py-0.5 shrink-0">
            updated
          </span>
        </div>

        <div className="flex items-center justify-between mb-3 gap-3">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-clay">Normascope</span>
          <div className="flex items-center gap-3 text-[11px] text-[#57606a]">
            <span><span className="font-bold text-[#24292f]">4</span> checked</span>
            <span className="text-amber-600 font-bold">1 flagged</span>
            <span className="text-emerald-600 font-bold">3 clean</span>
          </div>
        </div>

        <div className="rounded-lg border border-black/8 overflow-hidden text-[12px]">
          <div className="grid grid-cols-[1fr_72px_64px_56px_40px] bg-[#f6f8fa] border-b border-black/8 text-[10px] font-bold text-[#57606a] uppercase tracking-wide">
            <div className="px-3 py-2">Frame</div>
            <div className="px-2 py-2">Mode</div>
            <div className="px-2 py-2">Aligned</div>
            <div className="px-2 py-2">Δ</div>
            <div className="px-2 py-2">St.</div>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.frame}
              className={`grid grid-cols-[1fr_72px_64px_56px_40px] border-b border-black/5 last:border-0 ${
                row.flagged ? "bg-amber-50" : i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
              }`}
            >
              <div className="px-3 py-2.5 font-mono text-[11px] text-[#24292f] truncate">{row.frame}</div>
              <div className="px-2 py-2.5 text-[10px] text-[#57606a]">{row.mode}</div>
              <div className={`px-2 py-2.5 font-bold font-mono ${row.flagged ? "text-amber-600" : "text-[#24292f]"}`}>
                {row.aligned}
              </div>
              <div className={`px-2 py-2.5 font-mono text-[11px] ${row.flagged ? "text-amber-500" : "text-[#57606a]"}`}>
                {row.delta}
              </div>
              <div className={`px-2 py-2.5 font-bold ${row.flagged ? "text-amber-600" : "text-emerald-600"}`}>
                {row.flagged ? "⚠" : "✓"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#57606a]">Full report + diff overlays attached as a workflow artifact</p>
          <span className="text-[10px] font-mono text-[#57606a]/60 shrink-0">commit abc123f</span>
        </div>
      </div>

      <div className="bg-[#f6f8fa] px-5 py-3">
        <p className="text-[10px] font-bold text-[#57606a] uppercase tracking-widest mb-2">
          One step in your workflow
        </p>
        <div className="font-mono text-[11px] text-[#24292f]/70 leading-relaxed overflow-x-auto">
          <span className="text-[#cf222e]">- </span>
          <span className="text-[#0550ae]">uses</span>: {GITHUB_ACTION}@main
          <br />
          {"  "}
          <span className="text-[#0550ae]">with</span>:
          <br />
          {"    "}
          <span className="text-[#0550ae]">base-url</span>:{" "}
          <span className="text-[#116329]">{"${{ steps.deploy.outputs.preview-url }}"}</span>
        </div>
      </div>
    </div>
  );
}
