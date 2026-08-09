import Link from "next/link";
import type { Metadata } from "next";
import { NPM_URL, NPM_PACKAGE, SITE_URL, TAGLINE } from "../../../../lib/site";
import { FRAMES, HERO_FRAME, RUN_DATE } from "../../../../lib/run-data";
import { Label, Spark, Wordmark, Section, TerminalBar } from "../_components/primitives";
import { CopyCommand } from "../_components/CopyCommand";
import { HeroPreview } from "../_components/HeroPreview";
import { AlignmentExplainer } from "../_components/AlignmentExplainer";
import { ThresholdSlider } from "../_components/ThresholdSlider";
import { WaitlistForm } from "../_components/WaitlistForm";
import { AgentLoop } from "../_components/AgentLoop";
import { PrComment } from "../_components/PrComment";

export const metadata: Metadata = {
  title: "Normascope — visual verification for teams and AI agents",
  description:
    "Normascope verifies that what you shipped matches what you intended — design fidelity, visual regression, and agent verification in one local CLI. Deterministic, non-blocking, no LLM in the diff.",
  alternates: { canonical: "/" },
};

/** Published version, read at build time and revalidated hourly. Falls back to
 *  rendering nothing rather than a stale or invented number. */
async function npmVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Normascope",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cross-platform",
  description: TAGLINE,
  url: SITE_URL,
  downloadUrl: NPM_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const MODES = [
  {
    n: "01",
    mode: "Design fidelity",
    q: "Does the build match the design?",
    tag: "Figma · images · URLs",
    href: "/modes#fidelity",
  },
  {
    n: "02",
    mode: "Visual regression",
    q: "Did anything change I didn't mean to?",
    tag: "Baseline mode",
    href: "/modes#baseline",
  },
  {
    n: "03",
    mode: "Agent verification",
    q: "Did the agent build what I asked?",
    tag: "MCP · zero-config",
    href: "/agents",
  },
];

const NEVERS = [
  { n: "01", text: "It will not block your commit or your build unless you explicitly pass --strict." },
  { n: "02", text: "It will not auto-fix anything. Findings are hypotheses with a verify-before-applying label." },
  { n: "03", text: "It will not upload your code. Bring-your-own-key analysis goes straight to the provider, never proxied." },
  { n: "04", text: "It will not send secrets. The scanner blocks and names the file rather than quietly redacting." },
  { n: "05", text: "It will not let an AI decide pass or fail. The deterministic diff is the only gate, permanently." },
  { n: "06", text: "It will not pretend. Rate-limited, offline, dimensions mismatched — it says so and degrades honestly." },
];

/** The s2 container-width scenario, verbatim from the case-02 matrix. The
 *  three zeroes are load-bearing: they are the claim competitors can't make. */
const S2_RESULTS = [
  { frame: "Norma — Try It", value: 12.73, flagged: true },
  { frame: "Norma — Pull Requests", value: 9.71, flagged: true },
  { frame: "Norma — Hero", value: 8.27, flagged: true },
  { frame: "Norma — Commands", value: 0.73, flagged: true },
  { frame: "Norma — Engine", value: 0, flagged: false },
  { frame: "Articles — Index", value: 0, flagged: false },
  { frame: "Lab — Index", value: 0, flagged: false },
];

const CLOUD_TEASERS = [
  { head: "Hosted reports", body: "Upload a run, get a shareable link — revocable and expiring." },
  { head: "Trends", body: "Per-frame history with a marker on the commit where drift first crossed your threshold." },
  { head: "History-aware findings", body: "Findings gain firstDriftCommit and recurrence — “this broke three times before”." },
  { head: "Prepaid credits", body: "Balance is the cap. Cache hits are free, failed analyses cost nothing, and there is no overage code path." },
  { head: "Agent budgets", body: "Per-key monthly budgets, so an agent can't run up a bill and exhaustion never reddens CI." },
];

export default async function HomePage() {
  const version = await npmVersion();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Hero ── */}
      {/* `isolate` keeps the -z-10 wash inside this section's stacking context;
          without it the wash paints behind the layout's paper background. */}
      {/* Padding lives on the outer element and the max-width on the inner one,
          matching `Section` exactly — the two must agree or the hero sits 32px
          right of every section below it. */}
      <div className="relative isolate w-full overflow-hidden px-4 md:px-8">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="w-full h-full bg-gradient-to-br from-[#e8c9bf]/70 via-[#f3e3d8]/50 to-[#d8c3e0]/40" />
          <div className="absolute top-[-100px] right-[-80px] w-[28rem] h-[28rem] bg-clay rounded-full blur-3xl opacity-35" />
          <div className="absolute bottom-[-80px] left-[-60px] w-96 h-96 bg-[#fbc3bd] rounded-full blur-3xl opacity-40" />
        </div>

        <div className="max-w-6xl mx-auto pt-14 pb-10">
          <div className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-10">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <Spark className="w-2.5 h-2.5 text-clay" />
                <span className="text-[10px] font-black tracking-[0.25em] uppercase text-clay">
                  Free · local · open
                </span>
                {version && (
                  <span className="inline-flex items-center gap-1.5 ml-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />v{version}
                  </span>
                )}
              </div>

              <h1 className="mb-2">
                <Wordmark size="xl" />
                <span className="sr-only">Normascope</span>
              </h1>

              <p className="text-xl text-text/65 mt-7 max-w-2xl leading-relaxed">
                Verify that what you shipped matches what you intended. One local CLI —
                deterministic, non-blocking, no LLM in the diff.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-5">
                <CopyCommand command="npx norma-scope init" size="lg" />
                <a
                  href={NPM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-text/60 hover:text-text transition-colors uppercase tracking-widest"
                >
                  View on npm
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="hidden lg:block w-[380px] shrink-0">
              <HeroPreview />
            </div>
          </div>

          {/* Capability strip — the fold shows the whole tool, not one line of it */}
          <div className="mt-14 pt-9 border-t border-clay/15">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 md:gap-4">
              {MODES.map((item) => (
                <Link
                  key={item.n}
                  href={item.href}
                  className="group rounded-xl border border-clay/15 bg-white/45 backdrop-blur-sm px-4 py-4 hover:bg-white/70 hover:border-clay/30 transition-colors"
                >
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[10px] font-black text-clay/50 tabular-nums">{item.n}</span>
                    <span className="title-sm text-text">{item.mode}</span>
                  </div>
                  <p className="text-sm text-text/55 leading-snug mb-3">{item.q}</p>
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-clay">
                    {item.tag}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text/35">
                One CLI, everywhere your team works
              </span>
              <span className="text-text/20">·</span>
              {["Terminal", "Git hook", "PR comment", "GitHub Action", "MCP server", "Auto-capture"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  {i > 0 && <Spark className="w-1.5 h-1.5 text-clay/40" />}
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-clay/80">{s}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Blast radius ──
          The single most persuasive block on the site: a five-character commit
          against seven real frames. It works because of the three silent rows,
          not the four loud ones — anyone can show you a tool going off. */}
      <Section tone="paper" measure="wide" id="blast-radius">
        <Label>One commit, seven frames</Label>
        <h2 className="display-md mb-5 max-w-2xl">One line changed. Four pages moved.</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          A real commit against a real site. Five characters, the kind of change that passes code
          review without a comment — and a blast radius no developer eyeballs and predicts.
        </p>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14 items-start">
          <div className="lg:col-span-5 min-w-0">
            <div className="overflow-hidden rounded-xl border border-black/10 bg-[#111] font-mono text-[13px]">
              <div className="border-b border-white/10 px-4 py-2 text-[11px] text-white/35">
                Norma.tsx
              </div>
              <div className="px-4 py-3 leading-relaxed">
                <p className="text-[#e08a7a]">- max-w-6xl</p>
                <p className="text-[#8fbf9f]">+ max-w-5xl</p>
              </div>
            </div>

            <div className="mt-7 flex items-baseline gap-3">
              <span className="numeric text-4xl font-bold text-[#b6611f]">4</span>
              <span className="text-[15px] leading-snug text-text/55">
                of seven frames flagged,
                <br />
                from 0.73% to 12.73%
              </span>
            </div>

            <p className="mt-6 text-[14.5px] leading-relaxed text-text/55">
              And three frames measured <strong className="text-text/80">exactly 0.00%</strong>. A
              visual tool that cries wolf is worse than no tool — the silent rows are how you know
              this one doesn&rsquo;t.
            </p>

            <Link
              href="/pitch/proof#regression"
              className="mt-6 inline-block text-[13px] font-semibold text-clay underline decoration-1 underline-offset-4 hover:text-clay-deep"
            >
              See all five commits, and the full matrix →
            </Link>
          </div>

          <div className="lg:col-span-7 min-w-0">
            <ul>
              {S2_RESULTS.map((r) => (
                <li
                  key={r.frame}
                  className="flex items-center gap-4 border-b border-black/8 py-3 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-text/70">
                    {r.frame}
                  </span>
                  {/* Fixed track with a left-aligned fill, so every bar starts
                      at the same x and length reads as magnitude. Sizing the
                      bar itself inside a flex row would right-align them and
                      the chart would read backwards. */}
                  <span aria-hidden className="hidden w-40 shrink-0 sm:block">
                    <span
                      className="block h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(3, (r.value / 12.73) * 100)}%`,
                        background: r.flagged ? "#b6611f" : "rgba(17,17,17,0.12)",
                      }}
                    />
                  </span>
                  <span
                    className={`numeric w-16 text-right font-mono text-[13.5px] ${
                      r.flagged ? "font-bold text-[#b6611f]" : "text-text/35"
                    }`}
                  >
                    {r.value.toFixed(2)}%
                  </span>
                  <span
                    className={`w-14 text-right text-[10px] font-bold uppercase tracking-wider ${
                      r.flagged ? "text-[#b6611f]" : "text-[#3e7d52]"
                    }`}
                  >
                    {r.flagged ? "flagged" : "clean"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── The proof ── */}
      <Section id="proof" tone="sand" measure="wide">
        <Label>The number you can trust</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          Most visual diffs cry wolf.<br className="hidden md:block" /> Here is ours, on a real page.
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          This is an actual Normascope run against a production site on {RUN_DATE} — not a mockup, not a
          staged example. One section moved, and that single fact is the difference between a number that
          panics you and a number that helps you.
        </p>

        <AlignmentExplainer />

        <p className="text-sm text-text/45 leading-relaxed mt-5 max-w-2xl">
          SSIM rides along as a second opinion: high mismatch with high structural similarity means
          restyling, low similarity means something structural broke. Mismatched pixels are then clustered
          into regions, so you get{" "}
          <strong className="text-text/70">&ldquo;{HERO_FRAME.significantRegions} significant regions&rdquo;</strong>{" "}
          with coordinates, instead of a percentage you can&apos;t act on.
        </p>

        <div className="mt-7 flex flex-wrap gap-4 items-center">
          <Link
            href="/pitch/engine"
            className="inline-flex items-center gap-2 rounded-xl bg-[#111] text-white px-5 py-3 text-sm font-bold hover:bg-black transition-colors"
          >
            How the engine works
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
            </svg>
          </Link>
          <a
            href="/run/report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-text/55 hover:text-text underline underline-offset-4 decoration-clay/40"
          >
            Open the real report from this run
          </a>
        </div>
      </Section>

      {/* ── Terminal ── */}
      <Section tone="paper">
        <Label>What you see</Label>
        <h2 className="display-md mb-9">
          One line per frame,<br className="hidden md:block" /> right in your terminal
        </h2>

        <div className="rounded-2xl overflow-hidden shadow-2xl border border-black/10">
          <TerminalBar />
          <div className="bg-[#1a1a1a] px-5 md:px-7 py-6 font-mono text-[11px] md:text-[13px] leading-relaxed overflow-x-auto">
            <p className="text-white/50">Normascope</p>
            <p className="text-white/20">══════════════════════════════════════════════════</p>
            {FRAMES.map((f) => (
              // `whitespace-pre` — the padEnd alignment is the point, and
              // `nowrap` would collapse the runs of spaces that create it.
              <p key={f.slug} className="text-white/70 whitespace-pre">
                {"  "}
                {f.screenshot.padEnd(20)}→{" "}
                <span className={f.flagged ? "text-amber-400" : "text-emerald-400"}>
                  {`${f.aligned.toFixed(2)}% aligned (${f.unaligned.toFixed(2)}% unaligned) · SSIM ${f.ssim}`}
                </span>{" "}
                <span className="text-white/30">[{f.mode}]</span>{" "}
                <span className={f.flagged ? "text-amber-400" : "text-emerald-400"}>{f.flagged ? "⚠" : "✓"}</span>
              </p>
            ))}
            <p className="text-white/20 mt-3">{"  "}Report saved to .bridge/reports/report.html</p>
            <p className="text-white/20">══════════════════════════════════════════════════</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { term: "Aligned %", def: "The main number. Sections are matched up first, so positional drift doesn't inflate the score." },
            { term: "Unaligned %", def: "The naive diff, kept for diagnosis. The gap between the two tells you how much was pure movement." },
            { term: "SSIM", def: "Structural similarity, 0–100. High means a styling difference; low means something structural broke." },
            { term: "Drifted sections", def: "How many bands had to slide to match. Moved-but-identical is usually fine." },
          ].map((item) => (
            <div key={item.term} className="flex gap-3">
              <span className="shrink-0 font-mono text-[11px] font-bold text-text/45 mt-0.5 w-28">{item.term}</span>
              <p className="text-xs text-text/45 leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Threshold ── */}
      <Section tone="sand">
        <Label>Your call, not ours</Label>
        <h2 className="display-md mb-5">
          You decide how wrong<br className="hidden md:block" /> is too wrong
        </h2>
        <p className="text-base text-text/60 leading-relaxed mb-9">
          Drag the threshold and watch the same three real frames change verdict. Nothing about the
          measurement moves — only the line you drew.
        </p>
        <ThresholdSlider />
      </Section>

      {/* ── Pull requests ── */}
      <Section tone="paper" measure="wide">
        <Label>Pull requests</Label>
        <div className="flex flex-col lg:flex-row-reverse lg:items-start gap-12 lg:gap-16">
          <div className="lg:w-80 shrink-0">
            <h2 className="display-md mb-6">
              Every PR gets a visual diff table
            </h2>
            <p className="text-base text-text/55 leading-relaxed mb-5">
              Add one step to your workflow. The comment is sticky — it finds its own previous comment and
              edits it in place on every push, instead of piling up.
            </p>
            <div className="flex flex-col gap-2.5 text-sm">
              {[
                { dot: "bg-emerald-500", text: "Non-blocking by default — strict: true opts in" },
                { dot: "bg-sky-500", text: "No token in CI — commit a snapshot instead" },
                { dot: "bg-violet-500", text: "Any CI works via compare --json + norma-scope comment" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${item.dot} shrink-0 mt-1.5`} />
                  <span className="text-text/55 leading-relaxed">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <PrComment />
          </div>
        </div>
      </Section>

      {/* ── Agents ── */}
      <Section tone="ink" measure="wide">
        <Label dark>Agent verification</Label>
        <div className="flex flex-col lg:flex-row lg:items-start gap-12 lg:gap-16">
          <div className="lg:w-80 shrink-0">
            <h2 className="display-md text-white mb-6">
              Your coding agent ships blind
            </h2>
            <p className="text-base text-white/45 leading-relaxed mb-5">
              AI agents diff text, not pixels — so they declare victory on interfaces they have never seen.
              The MCP server gives an agent a measurable signal instead of &ldquo;looks good to me&rdquo;.
            </p>
            <p className="text-sm text-white/30 leading-relaxed mb-6">
              Default-deny origin policy: cloud metadata addresses, private ranges and file:// are refused
              even when an agent asks, and every refused attempt is logged.
            </p>
            <Link
              href="/pitch/agents"
              className="inline-flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white uppercase tracking-widest transition-colors"
            >
              The five tools
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <TerminalBar />
              <div className="bg-[#1a1a1a] px-5 md:px-7 py-6 font-mono text-[12px] md:text-[13px] leading-loose overflow-x-auto">
                <p className="text-white/40 mb-1"># no init · no config file · no design token</p>
                <p className="text-white/80"><span className="text-emerald-400">$</span> npx norma-scope compare \</p>
                <p className="text-white/60 pl-6">--target ./design/hero-mock.png \</p>
                <p className="text-white/60 pl-6">--url http://localhost:3000</p>
                <p className="text-white/20 mt-4">══════════════════════════════════════</p>
                <p className="text-white/70 mt-2">{"  "}localhost:3000 → <span className="text-amber-400">18.4% aligned · SSIM 78 · 3 regions</span></p>
                <p className="text-white/30 mt-2">{"  "}report → .bridge/reports/report.html</p>
                <p className="text-white/30">{"  "}json{"   "}→ .bridge/reports/summary.json</p>
              </div>
            </div>
            <AgentLoop />
          </div>
        </div>
      </Section>

      {/* ── Cloud tease ── */}
      <Section id="cloud" tone="sand" measure="wide">
        <Label>Normascope Cloud</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-[380px] shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-clay/30 bg-clay/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-clay mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-clay" />
              Private preview
            </span>
            <h2 className="display-md mb-5">
              The part a laptop can&apos;t do
            </h2>
            <p className="text-base text-text/60 leading-relaxed mb-4">
              Everything above is free and local, forever. Cloud adds one thing: memory. Because it keeps
              every run you have uploaded, it can say what your laptop structurally cannot — that this exact
              section broke three times before, and when it started.
            </p>
            <p className="text-sm text-text/45 leading-relaxed">
              Anyone can call the same model with the same prompt. Nobody without the history can tell you
              it has happened before.
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <ul className="grid sm:grid-cols-2 gap-3 mb-7">
              {CLOUD_TEASERS.map((item) => (
                <li key={item.head} className="rounded-xl border border-black/8 bg-white/60 px-4 py-4">
                  <p className="title-sm text-text mb-1.5">{item.head}</p>
                  <p className="text-xs text-text/50 leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ul>

            <div id="waitlist" className="rounded-2xl border border-black/10 bg-white px-5 py-5 scroll-mt-20">
              <p className="title-sm text-text mb-1">Register your interest</p>
              <p className="text-sm text-text/50 mb-4">
                Cloud opens to a small group first. Leave your email and we&apos;ll come to you — no
                newsletter, no drip sequence.
              </p>
              <WaitlistForm source="home" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Nevers ── */}
      <Section tone="paper">
        <Label>Design principles</Label>
        <h2 className="display-md mb-4">
          What Normascope deliberately<br className="hidden md:block" /> doesn&apos;t do
        </h2>
        <p className="text-base text-text/55 leading-relaxed mb-9 max-w-2xl">
          Being clear about the edges is part of trusting a tool.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {NEVERS.map((p) => (
            <div key={p.n} className="flex gap-4 py-4 border-t border-black/8">
              <span className="text-[10px] font-black text-text/20 tabular-nums pt-0.5">{p.n}</span>
              <p className="text-sm text-text/60 leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center text-center gap-5">
          <h3 className="display-sm">Try it on your next commit</h3>
          <CopyCommand command="npx norma-scope init" />
        </div>
      </Section>
    </>
  );
}
