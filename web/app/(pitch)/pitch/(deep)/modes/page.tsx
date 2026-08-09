import Link from "next/link";
import type { Metadata } from "next";
import { Label, Section, TerminalBar } from "../../_components/primitives";
import { CopyCommand } from "../../_components/CopyCommand";

export const metadata: Metadata = {
  title: "Three modes",
  description:
    "Design fidelity against Figma, images or another URL; visual regression against an approved baseline; and agent verification with zero config. One engine, three sources of truth.",
  alternates: { canonical: "/modes" },
};

const SOURCES = [
  {
    type: "figma",
    label: "Figma",
    tag: "the default",
    tagColor: "text-emerald-700",
    desc: "Frames exported straight from your file, cached locally to protect free-tier quotas. Run compare --fresh when a designer ships changes.",
    code: `{ "source": { "type": "figma" } }`,
  },
  {
    type: "images",
    label: "Image folder",
    tag: "no token needed",
    tagColor: "text-sky-700",
    desc: "Any directory of reference PNGs. No design tool, no network, no account — the designs can come from Sketch, Penpot, or a file someone sent you.",
    code: `{ "source": { "type": "images", "dir": "designs" } }`,
  },
  {
    type: "url",
    label: "Another URL",
    tag: "env vs env",
    tagColor: "text-violet-700",
    desc: "Capture one environment and diff it against another — staging versus production, or this deploy versus the last one.",
    code: `{ "source": { "type": "url", "baseUrl": "https://prod.example.com" } }`,
  },
  {
    type: "baseline",
    label: "Yesterday's own capture",
    tag: "no designer",
    tagColor: "text-rose-700",
    desc: "Set a frame to baseline mode and it compares against the capture you approved, ignoring the design source entirely.",
    code: `{ "mode": "baseline" }`,
  },
];

const LADDER = [
  "fresh fetch",
  "version-keyed cache",
  "org cache",
  "stale cache",
  "committed snapshot",
  "skip frame",
];

export default function ModesPage() {
  return (
    <>
      <Section tone="paper">
        <Label>Three doors, one engine</Label>
        <h1 className="display-lg mb-6">
          The same comparison,<br className="hidden md:block" /> three kinds of truth
        </h1>
        <p className="text-lg text-text/60 leading-relaxed mb-4">
          Normascope answers one question — does this match what it should? — and the only thing that
          changes between modes is what &ldquo;should&rdquo; means. A design file, yesterday&apos;s
          approved build, or the mock your agent was handed.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          Modes coexist in one config. Some frames against a design, others against yesterday, in the
          same project and the same run — and every line of output is labelled so you always know
          which is which.
        </p>
      </Section>

      {/* Fidelity */}
      <Section id="fidelity" tone="sand" measure="wide">
        <Label>Mode 01</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <h2 className="display-md mb-5">Design fidelity</h2>
            <p className="text-base text-text/60 leading-relaxed mb-4">
              <strong className="text-text">Does the build match the design?</strong> The mode nobody
              else has. It answers the question that otherwise takes a design-review meeting, with
              per-section scores and a report your designer can read on their phone.
            </p>
            <p className="text-sm text-text/45 leading-relaxed">
              You do not need Figma. The reference is whatever your <span className="font-mono">source</span>{" "}
              block points at.
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="grid sm:grid-cols-2 gap-3">
              {SOURCES.map((s) => (
                <div key={s.type} className="rounded-xl border border-black/8 bg-white/60 px-4 py-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="title-sm text-text">{s.label}</p>
                    <span className={`text-[9px] font-black uppercase tracking-[0.14em] ${s.tagColor} whitespace-nowrap`}>
                      {s.tag}
                    </span>
                  </div>
                  <p className="text-xs text-text/50 leading-relaxed mb-3">{s.desc}</p>
                  <pre className="text-[10px] font-mono text-text/45 bg-black/[0.04] rounded-lg p-2 overflow-x-auto">
                    {s.code}
                  </pre>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-black/8 bg-white/40 px-5 py-4">
              <p className="text-sm font-bold text-text/75 mb-2">The filename ties it together</p>
              <pre className="font-mono text-[11px] text-text/55 leading-relaxed overflow-x-auto">
{`designs/pricing.png               ← the reference  (what it SHOULD look like)
.bridge/screenshots/pricing.png   ← the capture    (what it DOES look like)
.bridge/diff/pricing-diff.png     ← the difference (written for you)`}
              </pre>
            </div>
          </div>
        </div>
      </Section>

      {/* Baseline */}
      <Section id="baseline" tone="ink" measure="wide">
        <Label dark>Mode 02</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <h2 className="display-md text-white mb-5">
              Visual regression
            </h2>
            <p className="text-base text-white/45 leading-relaxed mb-5">
              <strong className="text-white">Did anything change that I didn&apos;t mean to change?</strong>{" "}
              No design file required. Approve a known-good state as the baseline, and every unintended
              change from that point on is flagged.
            </p>
            <p className="text-sm text-white/30 leading-relaxed mb-6">
              The baseline is a folder of PNGs committed to your repo, like any other code. Your
              approved state is reviewable in a pull request, and it is yours — there is nothing to
              cancel and nothing to export.
            </p>
            <CopyCommand command="npx norma-scope baseline" size="sm" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <TerminalBar title="the loop" />
              <div className="bg-[#1a1a1a] px-5 md:px-7 py-6 font-mono text-[12px] leading-loose text-white/60 overflow-x-auto">
                <p><span className="text-emerald-400">$</span> npx norma-scope baseline</p>
                <p className="text-white/30">  ✓  3 frames approved → .bridge/baseline/ <span className="text-white/20">(commit this)</span></p>
                <p className="mt-3"><span className="text-emerald-400">$</span> npx norma-scope check <span className="text-white/20"># next day, after a PR lands</span></p>
                <p className="text-white/30">  nav-bar  →  <span className="text-emerald-400/80">0.3%   ✓  [baseline]</span></p>
                <p className="text-white/30">  hero     →  <span className="text-amber-400/90">12.1%  ⚠  [baseline]  above threshold</span></p>
                <p className="mt-3 text-white/20"># intentional? re-approve in one command:</p>
                <p><span className="text-emerald-400">$</span> npx norma-scope baseline</p>
              </div>
            </div>
            <p className="text-xs text-white/25 mt-3">
              Every line is labelled with its mode and source, so a number is never ambiguous about what
              it was measured against.
            </p>
          </div>
        </div>
      </Section>

      {/* Agents */}
      <Section id="agents" tone="sand" measure="wide">
        <Label>Mode 03</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <h2 className="display-md mb-5">Agent verification</h2>
            <p className="text-base text-text/60 leading-relaxed mb-5">
              <strong className="text-text">Did the agent build what I asked?</strong> AI agents diff
              text, not pixels — so they declare victory on interfaces they have never seen. Zero-config
              target mode gives them a measurable signal instead.
            </p>
            <Link
              href="/pitch/agents"
              className="inline-flex items-center gap-2 text-sm font-bold text-text/60 hover:text-text uppercase tracking-widest transition-colors"
            >
              The MCP server
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="flex-1 min-w-0 rounded-2xl overflow-hidden border border-black/10 shadow-xl">
            <TerminalBar />
            <div className="bg-[#1a1a1a] px-5 md:px-7 py-6 font-mono text-[12px] leading-loose overflow-x-auto">
              <p className="text-white/40 mb-1"># no init · no config file · no account</p>
              <p className="text-white/80"><span className="text-emerald-400">$</span> npx norma-scope compare \</p>
              <p className="text-white/60 pl-6">--target pricing.png --url http://localhost:3000/pricing</p>
              <p className="text-white/20 mt-4">══════════════════════════════════════</p>
              <p className="text-white/70 mt-1">  Normascope — Target</p>
              <p className="text-white/70">  →  <span className="text-amber-400">6.8% aligned (18.2% unaligned) · SSIM 91 · 2 drifted</span>  ⚠</p>
              <p className="text-white/30 mt-2">  Report: .bridge/reports/report.html</p>
              <p className="text-white/20 mt-3">══════════════════════════════════════</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Degradation ladder */}
      <Section tone="paper">
        <Label>Resilience</Label>
        <h2 className="display-md mb-5">
          A design-tool outage cannot break your build
        </h2>
        <p className="text-base text-text/60 leading-relaxed mb-8">
          When a reference can&apos;t be fetched fresh, Normascope walks down a ladder rather than
          failing — and prints an honest message at every rung. Nothing ever silently pretends.
        </p>

        <ol className="flex flex-col gap-2 mb-8">
          {LADDER.map((rung, i) => (
            <li key={rung} className="flex items-center gap-3">
              <span className="shrink-0 w-6 text-[10px] font-black tabular-nums text-text/25">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-mono"
                style={{
                  borderColor: `rgba(17,17,17,${0.12 - i * 0.012})`,
                  color: `rgba(17,17,17,${0.75 - i * 0.09})`,
                }}
              >
                {rung}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-base text-text/55 leading-relaxed">
          Run <span className="font-mono text-sm">snapshot</span> and commit{" "}
          <span className="font-mono text-sm">.bridge/design/</span>, and CI never needs a token or a
          network call at all. A design update then arrives as a reviewable pull request rather than an
          invisible upstream change.
        </p>
      </Section>
    </>
  );
}
