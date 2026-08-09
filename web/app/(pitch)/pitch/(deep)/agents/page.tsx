import type { Metadata } from "next";
import { Label, Section, TerminalBar, Spark } from "../../_components/primitives";
import { AgentLoop } from "../../_components/AgentLoop";
import { CopyCommand } from "../../_components/CopyCommand";
import { MCP_PACKAGE } from "../../../../../lib/site";

export const metadata: Metadata = {
  title: "AI agents",
  description:
    "Normascope's MCP server gives coding agents five tools — list_frames, capture, compare, get_summary and explain — so an agent can measure its own UI work instead of guessing.",
  alternates: { canonical: "/agents" },
};

const TOOLS = [
  { tool: "list_frames", q: "What pages am I tracking?" },
  { tool: "capture", q: "Take screenshots of the running app" },
  { tool: "compare", q: "How close am I?" },
  { tool: "get_summary", q: "Give me the last scores as JSON" },
  { tool: "explain", q: "Why is it off?" },
];

const GUARDS = [
  {
    head: "Default-deny origins",
    body: "Only origins in your config can be captured. Cloud metadata endpoints, private network ranges and file:// are refused even when an agent asks — and every refused attempt is written to an audit log.",
    proof: "Five hostile URLs, five refusals, all logged (test T6.2)",
  },
  {
    head: "Path containment",
    body: "A target path that escapes the project directory is refused. This is why target mode requires the mock to live inside your project — the guardrail exists precisely because agents drive this command.",
    proof: "Enforced on every target invocation",
  },
  {
    head: "Page content is data",
    body: "Text captured from a page comes back as data and is never treated as instructions. If a page contains something telling a model what to do, it is flagged rather than obeyed.",
    proof: "One of the two trust boundaries in the security model",
  },
];

export default function AgentsPage() {
  return (
    <>
      <Section tone="paper">
        <Label>Agent verification</Label>
        <h1 className="display-lg mb-6">
          Your coding agent<br className="hidden md:block" /> cannot see
        </h1>
        <p className="text-lg text-text/60 leading-relaxed mb-4">
          AI agents ship frontends fast, and blind. They diff text, not pixels — so they finish a UI
          task, declare it done, and have no way to know whether the thing they built looks anything
          like the thing they were asked for.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          Normascope gives them a camera and a measuring tape. The agent builds, compares against the
          mock it was handed, reads a number, fixes, and repeats — converging on the design instead of
          guessing at it.
        </p>
      </Section>

      <Section tone="ink" measure="wide">
        <Label dark>The loop</Label>
        <h2 className="display-md text-white mb-4 max-w-2xl">
          A measurable signal beats &ldquo;looks good to me&rdquo;
        </h2>
        <p className="text-base text-white/45 leading-relaxed max-w-2xl mb-9">
          This is the whole value in one sentence: the agent gets a number it can move, so it can tell
          whether its last edit helped.
        </p>
        <AgentLoop />

        <div className="mt-6 rounded-2xl overflow-hidden border border-white/10">
          <TerminalBar />
          <div className="bg-[#1a1a1a] px-5 md:px-7 py-6 font-mono text-[12px] leading-loose overflow-x-auto">
            <p className="text-white/40"># the agent, iterating</p>
            <p className="text-white/70 mt-2">  compare  →  <span className="text-rose-400">25.4% aligned · SSIM 71</span></p>
            <p className="text-white/30">  … edits .pricing-grid gap</p>
            <p className="text-white/70">  compare  →  <span className="text-amber-400">8.1% aligned · SSIM 88</span></p>
            <p className="text-white/30">  … edits card padding</p>
            <p className="text-white/70">  compare  →  <span className="text-emerald-400">0.4% aligned · SSIM 99</span>  ✓</p>
          </div>
        </div>
      </Section>

      <Section tone="sand" measure="wide">
        <Label>Two ways in</Label>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-black/8 bg-white/60 p-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
              Zero-config CLI
            </span>
            <h3 className="title-sm mt-2 mb-3">No setup at all</h3>
            <p className="text-sm text-text/55 leading-relaxed mb-5">
              Hand it one picture and one URL. No init, no config file, no account — the fastest way to
              give an agent a score to work against.
            </p>
            <div className="rounded-lg bg-[#111] px-4 py-3 font-mono text-[11px] text-white/70 overflow-x-auto">
              <span className="text-emerald-400">$</span> npx norma-scope compare \<br />
              <span className="pl-4">--target mock.png --url http://localhost:3000</span>
            </div>
            <p className="text-xs text-text/40 leading-relaxed mt-3">
              Always writes summary.json — no <span className="font-mono">--json</span> needed. Threshold
              is fixed at 5% in this mode.
            </p>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white/60 p-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">
              MCP server
            </span>
            <h3 className="title-sm mt-2 mb-3">Five tools, natively</h3>
            <p className="text-sm text-text/55 leading-relaxed mb-4">
              Point any MCP-capable agent at the server and it gets structured output plus origin-policy
              enforcement on top of the same engine.
            </p>
            <ul className="flex flex-col gap-2 mb-4">
              {TOOLS.map((t) => (
                <li key={t.tool} className="flex items-baseline gap-3">
                  <code className="font-mono text-xs text-sky-700 font-bold w-28 shrink-0">{t.tool}</code>
                  <span className="text-xs text-text/50 leading-snug">{t.q}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {["Claude Code", "Cursor", "Windsurf"].map((c) => (
                <span
                  key={c}
                  className="text-[10px] font-bold text-sky-800 bg-sky-100 border border-sky-200 rounded-full px-2.5 py-0.5"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-black/8 bg-white/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text/35 shrink-0">
            Same engine
          </span>
          <p className="text-sm text-text/55 leading-relaxed">
            Both call the same comparison code. The MCP server adds the origin policy and structured
            output — it is not a reimplementation, so a score means the same thing either way.
          </p>
        </div>
      </Section>

      <Section tone="paper" measure="wide">
        <Label>Safety</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          An agent will absolutely try to fetch anything
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          Handing a network-capable tool to something that improvises is exactly where visual testing
          becomes a security question. These are the three guarantees.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {GUARDS.map((g) => (
            <div key={g.head} className="rounded-xl border border-black/8 bg-black/[0.02] px-5 py-5">
              <p className="title-sm text-text mb-2">{g.head}</p>
              <p className="text-sm text-text/55 leading-relaxed mb-3">{g.body}</p>
              <p className="flex items-start gap-2 text-[11px] text-clay leading-relaxed">
                <Spark className="w-2 h-2 shrink-0 mt-1" />
                {g.proof}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="sand">
        <Label>Install</Label>
        <h2 className="display-md mb-6">Point your agent at it</h2>
        <p className="text-base text-text/60 leading-relaxed mb-7">
          The MCP server ships as its own package. Configure it as a command in your agent&apos;s MCP
          settings, then ask it something like{" "}
          <em className="text-text/75">&ldquo;use normascope to check my homepage against mock.png&rdquo;</em>.
        </p>
        <CopyCommand command={`npm install ${MCP_PACKAGE}`} />
        <p className="text-xs text-text/40 leading-relaxed mt-5 max-w-2xl">
          To use explain through MCP, install the optional Anthropic SDK where the server runs and set
          your key in the <span className="font-mono">MCP server&apos;s</span> environment — not your
          shell&apos;s.
        </p>
      </Section>
    </>
  );
}
