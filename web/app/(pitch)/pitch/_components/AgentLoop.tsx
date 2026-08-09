/** The loop that makes MCP useful: the agent gets a number, not an opinion.
 *  That exact loop is in the CLI's test suite (T6.4). */
export function AgentLoop() {
  const nodes = [
    { step: "Build", sub: "agent writes code", color: "border-violet-500/50 bg-violet-500/10 text-violet-300" },
    { step: "Capture", sub: "norma-scope auto", color: "border-sky-500/50 bg-sky-500/10 text-sky-300" },
    { step: "Score", sub: "aligned % · SSIM", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" },
    { step: "Read", sub: "summary.json", color: "border-amber-500/50 bg-amber-500/10 text-amber-300" },
    { step: "Fix", sub: "agent edits", color: "border-pink-500/50 bg-pink-500/10 text-pink-300" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-5">The agent loop</p>
      <div className="flex items-center gap-0 overflow-x-auto pb-2 scrollbar-none">
        {nodes.map((node, i) => (
          <div key={node.step} className="flex items-center shrink-0">
            <div className={`rounded-xl border px-4 py-3 ${node.color} text-center min-w-[80px]`}>
              <p className="title-sm">{node.step}</p>
              <p className="text-[10px] opacity-70 mt-0.5 whitespace-nowrap">{node.sub}</p>
            </div>
            {i < nodes.length - 1 && (
              <div className="flex items-center mx-1" aria-hidden>
                <div className="w-6 h-px bg-white/15" />
                <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                  <path d="M1 1l4 4-4 4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center ml-2 shrink-0" aria-hidden>
          <div className="w-4 h-px bg-white/10" />
          <div className="border border-white/10 rounded-full px-2 py-1">
            <span className="text-[9px] text-white/25 font-mono">repeat</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-white/30 leading-relaxed mt-4">
        Agent writes CSS → captures → compares → sees 25% → fixes → compares → sees 0%. It converges,
        because for the first time it has something to converge on.
      </p>
    </div>
  );
}
