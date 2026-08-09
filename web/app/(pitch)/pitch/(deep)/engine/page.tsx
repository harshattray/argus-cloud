import Link from "next/link";
import type { Metadata } from "next";
import { Label, Section, Spark } from "../../_components/primitives";
import { Steps, DataTable, CloudHook } from "../../_components/editorial";
import { AlignmentExplainer } from "../../_components/AlignmentExplainer";
import { ClusteringDiagram } from "../../_components/ClusteringDiagram";
import { HERO_FRAME, FRAMES } from "../../../../../lib/run-data";
import { SENSITIVITY_BEFORE_AFTER, CLI_VERSION } from "../../../../../lib/cases";

export const metadata: Metadata = {
  title: "The engine",
  description:
    "How Normascope's diff works: anti-aliasing-aware pixel matching, band alignment, SSIM as a second opinion, and region clustering — so the number means something.",
  alternates: { canonical: "/engine" },
};

const PILLARS = [
  {
    n: "01",
    head: "Anti-aliasing aware",
    body: "Comparing pixels naively flags every slightly-fuzzy letter edge. Normascope detects anti-aliased pixels and excludes them, so text rendering differences between your browser and the design export stop drowning out real bugs.",
    detail: "pixelmatch, includeAA: false, threshold 0.15",
  },
  {
    n: "02",
    head: "Band alignment",
    body: "If your header gets 20px taller, everything below it shifts down. Both images are sliced into horizontal bands — flat, empty rows skipped — and each band is searched ±120px for the vertical offset that best matches, by normalised cross-correlation.",
    detail: "≥0.85 confidence and ≥2 confident bands before realigning",
  },
  {
    n: "03",
    head: "SSIM, as a second opinion",
    body: "Pixel counting can't tell “slightly wrong colour everywhere” from “half the page is missing”. An 8×8 window slides over both images comparing brightness, contrast and structure.",
    detail: "High mismatch + high SSIM = restyling. Low SSIM = something structural broke.",
  },
  {
    n: "04",
    head: "Region clustering",
    body: "“4.2% of pixels differ” is not actionable. Mismatched pixels are binned into a grid, cells above a minimum density are marked hot, and hot cells are flood-filled into clusters.",
    detail: "You get places to look at, with coordinates",
  },
];

export default function EnginePage() {
  return (
    <>
      <Section tone="paper">
        <Label>Under the hood</Label>
        <h1 className="display-lg mb-6">
          A visual diff you can<br className="hidden md:block" /> actually believe
        </h1>
        <p className="text-lg text-text/60 leading-relaxed mb-6">
          Most visual testing fails for one reason: the numbers cry wolf, the team stops reading them,
          and the tool becomes a muted Slack channel. Everything below exists to stop that happening —
          it is the trust layer, and it was built first.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          None of it involves a model. The score is pixels and geometry, computed on your machine,
          offline, with no account. The AI layer only ever <em>describes</em>; it can never change a
          score or fail a build.
        </p>
      </Section>

      {/* A sequence, so it is drawn as one — the four parts happen in this
          order and each depends on the one before. A grid of equal cards said
          the opposite. */}
      <Section tone="sand" measure="wide">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <Label>The four parts</Label>
            <h2 className="display-md mb-5">
              What happens when you run <span className="font-mono text-[0.72em]">compare</span>
            </h2>
            <p className="text-[15px] text-text/55 leading-relaxed">
              In this order, and each one depends on the last. Nothing here calls a model — it is
              arithmetic over two images, running on your machine.
            </p>
          </div>

          <div className="lg:col-span-8 min-w-0">
            <Steps
              items={PILLARS.map((p) => ({
                head: p.head,
                body: p.body,
                aside: p.detail,
              }))}
            />
          </div>
        </div>
      </Section>

      {/* The sensitivity split — the most credible thing on this page, because
          it is us documenting our own blind spot. */}
      <Section tone="paper" measure="wide">
        <Label>One tolerance was wrong for two jobs</Label>
        <h2 className="display-md mb-5 max-w-3xl">
          Sensitivity is different in each mode, on purpose
        </h2>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14 items-start">
          <div className="lg:col-span-6 space-y-4 text-[15px] leading-relaxed text-text/60">
            <p>
              A <strong className="text-text/85">design check</strong> compares a browser screenshot
              against a design-tool export — and a browser and a design tool draw text through
              completely different machinery, so every letter edge differs. That needs a forgiving
              colour tolerance.
            </p>
            <p>
              A <strong className="text-text/85">regression check</strong> compares a browser
              screenshot against another browser screenshot. Same engine, same fonts, same machine.
              There is nothing to forgive.
            </p>
            <p>
              Until {CLI_VERSION} both modes shared the forgiving setting, and regression mode paid
              for a problem it does not have. A whole-section background change plus every heading
              dropping two weights —{" "}
              <strong className="text-text/85">68% of the frame&rsquo;s pixels</strong> — scored
              0.00%.
            </p>
          </div>

          <div className="lg:col-span-6 min-w-0">
            <DataTable
              head={["Measurement", "Shared tolerance", "Split per mode"]}
              rows={SENSITIVITY_BEFORE_AFTER.map((s) => ({
                cells: [s.what, s.before, s.after],
                emphasis: [false, false, s.after.includes("flagged")],
              }))}
              caption="The control frame did not move: a five-times tighter tolerance that bought no false positives."
            />
          </div>
        </div>
      </Section>

      <Section tone="paper" measure="wide">
        <Label>Alignment, on a real page</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          The difference between a number that panics you and one that helps
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          This is the single most important thing the engine does, so here it is on real output rather
          than described in the abstract.
        </p>

        <AlignmentExplainer />

        <div className="mt-8 rounded-xl border border-black/8 bg-black/[0.02] px-5 py-5 max-w-3xl">
          <p className="text-sm text-text/60 leading-relaxed">
            The gap between the two numbers is itself a signal, and it is reported on every frame,
            always. A wide gap means <strong className="text-text">something moved</strong>. A narrow
            gap with a high number means <strong className="text-text">something broke</strong>. The
            CLI&apos;s own test suite carries a case that scores{" "}
            <span className="font-mono text-clay">0.43% aligned</span> against{" "}
            <span className="font-mono text-clay">14.24% unaligned</span> — the same page, where the
            14% was one shifted section.
          </p>
        </div>
      </Section>

      <Section tone="sand" measure="wide">
        <Label>From pixels to places</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          &ldquo;{HERO_FRAME.significantRegions} significant regions&rdquo; beats a percentage
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          A percentage tells you something is wrong. It doesn&apos;t tell you where to look. Clustering
          turns scattered mismatched pixels into a small number of places worth opening.
        </p>
        <ClusteringDiagram />
      </Section>

      <Section tone="paper">
        <Label>What the numbers mean</Label>
        <h2 className="display-md mb-8">
          Reading a result
        </h2>

        {/* Scrolls inside its own container rather than clipping — five columns
            do not fit a phone, and `overflow-hidden` alone would hide them. */}
        <div className="rounded-2xl border border-black/8 overflow-x-auto mb-8">
          <table className="w-full text-left min-w-[520px]">
            <thead className="bg-black/[0.04] text-[10px] font-black uppercase tracking-[0.14em] text-text/45">
              <tr>
                <th className="px-4 py-3">Frame</th>
                <th className="px-3 py-3">Aligned</th>
                <th className="px-3 py-3">Unaligned</th>
                <th className="px-3 py-3">SSIM</th>
                <th className="px-3 py-3">Drifted</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {FRAMES.map((f) => (
                <tr key={f.slug} className="border-t border-black/6">
                  <td className="px-4 py-3 text-text/70">{f.screenshot}</td>
                  <td className={`px-3 py-3 font-bold ${f.flagged ? "text-amber-700" : "text-emerald-700"}`}>
                    {f.aligned.toFixed(2)}%
                  </td>
                  <td className="px-3 py-3 text-text/45">{f.unaligned.toFixed(2)}%</td>
                  <td className="px-3 py-3 text-text/60">{f.ssim}</td>
                  <td className="px-3 py-3 text-text/45">{f.driftedSections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4">
          {FRAMES.map((f) => (
            <div key={f.slug} className="flex gap-3">
              <Spark className="w-2.5 h-2.5 text-pink-400 shrink-0 mt-1.5" />
              <p className="text-sm text-text/60 leading-relaxed">
                <span className="font-mono text-text/80">{f.screenshot}</span> — {f.story}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="ink" measure="wide">
        <Label dark>The report</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <h2 className="display-md text-white mb-5">
              One self-contained HTML file
            </h2>
            <p className="text-base text-white/45 leading-relaxed mb-4">
              Reference and capture side by side, the diff overlay, a lightbox, and the per-section
              table. No server, no account, no login — it is a file. This is the thing you send your
              designer.
            </p>
            <p className="text-sm text-white/30 leading-relaxed mb-6">
              Thumbnails are JPEG-compressed and full-resolution images are gated behind{" "}
              <span className="font-mono text-white/50">--full</span>. That change took one real report
              in this project from 30MB to 3.5MB.
            </p>
            <a
              href="/run/report.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-ink px-5 py-3 text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Open a real report
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4">
            {[
              { head: "It degrades honestly", body: "Rate-limited, offline, dimensions mismatched — it says so and reports less, rather than reporting a comfortable number." },
              { head: "It never blocks", body: "The git hook always exits 0. CI stays green unless you explicitly pass --strict." },
              { head: "It runs offline", body: "No servers, no account. Commit a design snapshot and CI makes zero external API calls." },
              { head: "No model in the score", body: "The deterministic diff is the only gate, permanently. Explain describes; it never judges." },
            ].map((c) => (
              <div key={c.head} className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-5">
                <p className="font-black text-white mb-2">{c.head}</p>
                <p className="text-sm text-white/45 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="paper">
        <h2 className="display-sm mb-4">
          Same engine, three jobs
        </h2>
        <p className="text-base text-text/55 leading-relaxed mb-6">
          Everything above is one comparison engine. What changes between design fidelity, visual
          regression and agent verification is only what you point it at.
        </p>
        <Link
          href="/pitch/modes"
          className="inline-flex items-center gap-2 rounded-xl bg-[#111] text-white px-5 py-3 text-sm font-bold hover:bg-black transition-colors"
        >
          The three modes
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
          </svg>
        </Link>
      </Section>
    </>
  );
}
