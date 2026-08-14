import { GITHUB_ACTION } from "../../../../lib/site";

/**
 * The sticky PR comment, rebuilt in GitHub's own chrome. This is a mockup by
 * necessity — a screenshot of a real PR would carry someone's repository — but
 * the shape, the columns and the delta behaviour are exactly what the Action
 * posts.
 *
 * ── The table drops a column on a phone, and that is a bug fix ──────────────
 *
 * The five columns were fixed at `1fr 72px 64px 56px 40px` — 232px of track
 * plus 40px of card padding plus the frame column, so the card could not be
 * drawn under about 313px wide. On a 320px phone that is 25px more than the
 * column it sits in, and because a grid item's automatic minimum size is its
 * min-content width, the overflow did not clip: it pushed the *document*
 * sideways. Measured at 320×700, the page scrolled to 353px, the header slid
 * off the left edge, and this card painted over the background outside it.
 * `min-w-0` on the column in `(site)/page.tsx` is the other half of that fix.
 *
 * Squeezing all five into 254px was tried first and is the wrong answer: every
 * column then wraps — "ALIGNED" over two lines, `+12.1%` over two, "baseline"
 * over two — and a table nobody can read is not better than one that overflows,
 * it just fails more quietly.
 *
 * So below `sm` the **Mode** column is `display:none` and the grid drops to
 * four tracks. Mode is the one column the surrounding copy does not depend on:
 * that copy is about the *delta*, which is why Δ stays. Nothing wraps at 320px,
 * and from `sm` up the table is exactly what it always was.
 */
const TRACKS =
  "grid grid-cols-[1fr_64px_60px_32px] sm:grid-cols-[1fr_72px_64px_56px_40px]";
/** Mode's cells. Hidden below `sm`, so they surrender their track with them. */
const MODE_CELL = "hidden sm:block px-2";

export function PrComment() {
  const rows = [
    { frame: "hero-section", mode: "fidelity", aligned: "2.1%", delta: "+0.3%", flagged: false },
    { frame: "primary-button", mode: "fidelity", aligned: "18.4%", delta: "+12.1%", flagged: true },
    { frame: "nav-bar", mode: "baseline", aligned: "0.3%", delta: "−0.1%", flagged: false },
    { frame: "pricing-page", mode: "fidelity", aligned: "1.8%", delta: "+0.2%", flagged: false },
  ];

  return (
    <div className="rounded-2xl bg-white shadow-2xl border border-black/8 overflow-hidden">
      <div className="bg-[#f6f8fa] border-b border-black/8 px-4 py-3 sm:px-5 flex items-center justify-between gap-3">
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

      <div className="px-4 py-4 border-b border-black/6 sm:px-5">
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

        {/* Wraps rather than holding one line: the tracked wordmark and the
            three counts together need 1px more than a 320px phone gives the
            card, and a one-pixel overrun on a `justify-between` row is enough
            to force its parent wider. */}
        <div className="flex flex-wrap items-center justify-between mb-3 gap-x-3 gap-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-clay">Normascope</span>
          <div className="flex items-center gap-3 text-[11px] text-[#57606a]">
            <span><span className="font-bold text-[#24292f]">4</span> checked</span>
            <span className="text-amber-600 font-bold">1 flagged</span>
            <span className="text-emerald-600 font-bold">3 clean</span>
          </div>
        </div>

        <div className="rounded-lg border border-black/8 overflow-hidden text-[12px]">
          <div className={`${TRACKS} bg-[#f6f8fa] border-b border-black/8 text-[10px] font-bold text-[#57606a] uppercase tracking-wide`}>
            <div className="px-2 py-2 sm:px-3">Frame</div>
            <div className={`${MODE_CELL} py-2`}>Mode</div>
            <div className="whitespace-nowrap px-2 py-2">Aligned</div>
            <div className="px-2 py-2">Δ</div>
            <div className="px-2 py-2">St.</div>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.frame}
              className={`${TRACKS} border-b border-black/5 last:border-0 ${
                row.flagged ? "bg-amber-50" : i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
              }`}
            >
              <div className="truncate px-2 py-2.5 font-mono text-[11px] text-[#24292f] sm:px-3">{row.frame}</div>
              <div className={`${MODE_CELL} py-2.5 text-[10px] text-[#57606a]`}>{row.mode}</div>
              <div className={`whitespace-nowrap px-2 py-2.5 font-bold font-mono ${row.flagged ? "text-amber-600" : "text-[#24292f]"}`}>
                {row.aligned}
              </div>
              <div className={`whitespace-nowrap px-2 py-2.5 font-mono text-[11px] ${row.flagged ? "text-amber-500" : "text-[#57606a]"}`}>
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

      <div className="bg-[#f6f8fa] px-4 py-3 sm:px-5">
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
