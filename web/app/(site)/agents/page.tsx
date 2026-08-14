import Link from "next/link";
import type { Metadata } from "next";
import { CloudBand, Eyebrow, Section, Spark } from "../_components/ui";
import { CopyLine } from "../_components/CopyLine";
import { AgentLoop } from "../../(pitch)/pitch/_components/AgentLoop";
import { Twin } from "../_components/twins";
import { MCP_PACKAGE } from "../../../lib/site";

/**
 * The agent surface, promoted out of the `/pitch` gate.
 *
 * This is the strongest free-tier story the tool has and it had no public URL
 * at all — the MCP server, its five tools and the origin policy appeared only
 * as prose in §14 of the user guide. Same treatment `/commands` and `/report`
 * already got (`normascopeWeb.md` §9, amended 2026-08-06): the long version was
 * the better page, so the public site carries it and imports the interactive
 * piece rather than transcribing it a second time.
 *
 * Everything here is free and local. The one Cloud mention is the band at the
 * bottom, and it is a tease, not a claim.
 */

export const metadata: Metadata = {
  title: "Coding agents",
  description:
    "Normascope's MCP server gives coding agents five tools — list_frames, capture, compare, get_summary and explain — so an agent can measure its own UI work instead of declaring it done.",
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
      {/* ── Hero ── */}
      <Section tone="paper">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <Eyebrow>Agent verification</Eyebrow>
            <h1 className="display-lg mb-6">
              Your coding agent
              <br className="hidden md:block" /> cannot see
            </h1>
            <p className="mb-4 text-lg leading-relaxed text-text/60">
              Agents ship frontends fast, and blind. They diff text, not pixels — so one finishes a
              UI task, declares it done, and has no way to know whether the thing it built looks
              anything like the thing it was asked for.
            </p>
            <p className="mb-8 text-base leading-relaxed text-text/50">
              Normascope gives it a camera and a measuring tape. The agent builds, compares against
              the mock it was handed, reads a number, fixes, and repeats — converging on the design
              instead of guessing at it.
            </p>
            <CopyLine command={`npm install ${MCP_PACKAGE}`} />
            <p className="mt-4 text-[13px] text-text/45">
              Free, local, and the same engine the CLI runs. No account.
            </p>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-black/8 bg-[#1a1a1a]">
              <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-2.5">
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                ))}
                <span className="ml-2 font-mono text-[11px] text-white/30">the agent, iterating</span>
              </div>
              <div className="overflow-x-auto px-5 py-6 font-mono text-[12px] leading-loose md:px-7">
                <p className="text-white/70">
                  compare → <span className="text-rose-400">25.4% aligned · SSIM 71</span>
                </p>
                <p className="text-white/30">… edits .pricing-grid gap</p>
                <p className="text-white/70">
                  compare → <span className="text-amber-400">8.1% aligned · SSIM 88</span>
                </p>
                <p className="text-white/30">… edits card padding</p>
                <p className="text-white/70">
                  compare → <span className="text-emerald-400">0.4% aligned · SSIM 99</span> ✓
                </p>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-text/45">
              An illustrative run of the loop below. The scores are what the same three commands
              print on any project.
            </p>
          </div>
        </div>
      </Section>

      {/* ── The loop ── */}
      <Section tone="ink">
        <Eyebrow dark>The loop</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl text-white">
          A measurable signal beats &ldquo;looks good to me&rdquo;
        </h2>
        <p className="mb-9 max-w-2xl text-base leading-relaxed text-white/50">
          This is the whole value in one sentence: the agent gets a number it can move, so it can
          tell whether its last edit helped.
        </p>
        <AgentLoop />
      </Section>

      {/* ── Two ways in ── */}
      <Section tone="sand">
        <Eyebrow>Two ways in</Eyebrow>
        <h2 className="display-md mb-9 max-w-2xl">Give it one command, or give it five tools</h2>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/8 bg-white/60 p-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
              Zero-config CLI
            </span>
            <h3 className="title-sm mb-3 mt-2">No setup at all</h3>
            <p className="mb-5 text-sm leading-relaxed text-text/55">
              Hand it one picture and one URL. No init, no config file, no account — the fastest way
              to give an agent a score to work against.
            </p>
            <div className="overflow-x-auto rounded-lg bg-[#111] px-4 py-3 font-mono text-[11px] text-white/70">
              <span className="text-emerald-400">$</span> npx norma-scope compare \<br />
              <span className="pl-4">--target mock.png --url http://localhost:3000</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-text/40">
              Always writes summary.json — no <span className="font-mono">--json</span> needed. The
              threshold is fixed at 5% in this mode.
            </p>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white/60 p-6">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">
              MCP server
            </span>
            <h3 className="title-sm mb-3 mt-2">Five tools, natively</h3>
            <p className="mb-4 text-sm leading-relaxed text-text/55">
              Point any MCP-capable agent at the server and it gets structured output plus
              origin-policy enforcement on top of the same engine.
            </p>
            <ul className="mb-4 flex flex-col gap-2">
              {TOOLS.map((t) => (
                <li key={t.tool} className="flex items-baseline gap-3">
                  <code className="w-28 shrink-0 font-mono text-xs font-bold text-sky-700">
                    {t.tool}
                  </code>
                  <span className="text-xs leading-snug text-text/50">{t.q}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {["Claude Code", "Cursor", "Windsurf"].map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-sky-800"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-black/8 bg-white/40 px-5 py-4 sm:flex-row sm:items-center">
          <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-text/35">
            Same engine
          </span>
          <p className="text-sm leading-relaxed text-text/55">
            Both call the same comparison code. The MCP server adds the origin policy and structured
            output — it is not a reimplementation, so a score means the same thing either way.
          </p>
        </div>
      </Section>

      {/* ── Safety ── */}
      <Section tone="paper">
        <div className="mb-9 flex items-end justify-between gap-10">
          <div>
            <Eyebrow>Safety</Eyebrow>
            <h2 className="display-md mb-5 max-w-2xl">
              An agent will absolutely try to fetch anything
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-text/60">
              Handing a network-capable tool to something that improvises is exactly where visual
              testing becomes a security question. These are the three guarantees.
            </p>
          </div>
          <Twin pose="point" className="hidden w-24 shrink-0 lg:block" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {GUARDS.map((g) => (
            <div key={g.head} className="rounded-xl border border-black/8 bg-black/[0.02] px-5 py-5">
              <p className="title-sm mb-2 text-text">{g.head}</p>
              <p className="mb-3 text-sm leading-relaxed text-text/55">{g.body}</p>
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-clay">
                <Spark className="mt-1 h-2 w-2 shrink-0" />
                {g.proof}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Install ── */}
      <Section tone="sand" size="sm">
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <Eyebrow>Install</Eyebrow>
            <h2 className="display-sm mb-5">Point your agent at it</h2>
            <p className="mb-6 text-[15px] leading-relaxed text-text/60">
              The MCP server ships as its own package. Configure it as a command in your
              agent&rsquo;s MCP settings, then ask it something like{" "}
              <em className="text-text/75">
                &ldquo;use normascope to check my homepage against mock.png&rdquo;
              </em>
              .
            </p>
            <CopyLine command={`npm install ${MCP_PACKAGE}`} />
          </div>
          <div className="lg:col-span-6">
            <p className="mb-4 text-[14px] leading-relaxed text-text/50">
              To use <code className="font-mono text-[0.95em] text-clay">explain</code> through MCP,
              install the optional Anthropic SDK where the server runs and set your key in the MCP
              server&rsquo;s environment — not your shell&rsquo;s.
            </p>
            <Link
              href="/commands"
              className="text-[13.5px] font-semibold text-clay underline decoration-1 underline-offset-4 hover:text-clay-deep"
            >
              Every command and flag →
            </Link>
          </div>
        </div>
      </Section>

      <CloudBand
        wall="An agent runs at machine speed. So does its spending."
        answer="Cloud issues an agent its own key with a monthly credit budget and a rate cap. When it runs out, it gets a clear message and CI stays green."
      />
    </>
  );
}
