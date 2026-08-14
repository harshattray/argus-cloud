import type { Metadata } from "next";
import Link from "next/link";
import {
  CloudBand,
  Eyebrow,
  Section,
  Shot,
  Spark,
  Wordmark,
} from "../_components/ui";
import { CopyLine } from "../_components/CopyLine";
import { AlignmentExplainer } from "../../(pitch)/pitch/_components/AlignmentExplainer";
import { ThresholdSlider } from "../../(pitch)/pitch/_components/ThresholdSlider";
import { TwinAside } from "../_components/twins";

export const metadata: Metadata = {
  title: "How Normascope works",
  description:
    "Learn how Normascope captures your UI, compares it with a design or approved build, and turns the result into a report you can trust.",
  alternates: { canonical: "/how-it-works" },
};

const SOURCES = [
  {
    number: "01",
    title: "A design",
    body: "Compare your running UI with a design reference. Use this when the question is: does the build match what we intended?",
    tone: "clay",
  },
  {
    number: "02",
    title: "An approved build",
    body: "Approve a known-good browser capture, then compare future changes against it. This is visual regression testing without a design file.",
    tone: "emerald",
  },
  {
    number: "03",
    title: "Another environment",
    body: "Compare a local or staging build with another reachable URL. Both pages are captured at the same dimensions before scoring.",
    tone: "violet",
  },
] as const;

const LOOP = [
  {
    number: "01",
    command: "npx norma-scope init",
    title: "Set up the project",
    body: "Choose what you want to compare and which pages or frames to track. Normascope records the workflow in your project so the next run is repeatable.",
  },
  {
    number: "02",
    command: "npx norma-scope doctor",
    title: "Check the setup",
    body: "Before interpreting a diff, make sure the app, routes, references and capture dimensions are reachable and consistent.",
  },
  {
    number: "03",
    command: "npx norma-scope check",
    title: "Capture and compare",
    body: "Normascope photographs the configured pages, aligns the captures, compares them with the reference, and writes a fresh report.",
  },
  {
    number: "04",
    command: "open the report",
    title: "Decide what changed",
    body: "Review the side-by-side images, aligned score, diff overlay and regions worth looking at. A difference is evidence; you decide whether it was intended.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-paper px-4 md:px-8">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute right-[-10rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-[#e5b5a9]/50 blur-3xl" />
          <div className="absolute bottom-[-12rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[#d8c6df]/45 blur-3xl" />
        </div>
        <div className="mx-auto max-w-5xl py-16 md:py-24">
          <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <div className="mb-6 flex items-center gap-2">
                <Spark className="h-2.5 w-2.5 text-clay" />
                <span className="eyebrow text-clay">The Normascope workflow</span>
              </div>
              <h1 className="display-xl mb-7 max-w-3xl">
                From a running UI to a report you can trust.
              </h1>
              <p className="max-w-2xl text-xl leading-snug text-text/70 md:text-2xl">
                Normascope captures what your users would see, compares it with what you intended,
                and shows you the difference without asking you to guess.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <CopyLine command="npx norma-scope init" />
                <Link
                  href="/commands"
                  className="text-[13px] font-bold uppercase tracking-widest text-text/50 underline decoration-1 underline-offset-4 hover:text-text"
                >
                  See every command →
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-[0_20px_60px_rgba(28,27,26,0.12)] backdrop-blur-sm">
                <p className="eyebrow mb-5 text-clay">One honest loop</p>
                <div className="space-y-2.5">
                  {[
                    ["Your UI", "capture"],
                    ["Reference", "design · baseline · URL"],
                    ["Normascope", "align · compare · explain"],
                    ["Your decision", "fix · accept · investigate"],
                  ].map(([head, detail], i) => (
                    <div key={head} className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-clay/12 font-mono text-[11px] font-bold text-clay-deep">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-black/8 bg-white/70 px-3 py-2.5">
                        <p className="text-[13px] font-semibold text-text">{head}</p>
                        <p className="font-mono text-[10.5px] text-text/40">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 border-t border-black/8 pt-4 text-[13px] leading-relaxed text-text/50">
                  Deterministic scoring first. Optional AI explanation second. Human judgment always.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section tone="ink">
        <Eyebrow dark>Start with the question</Eyebrow>
        <h2 className="display-md mb-5 max-w-2xl text-white">
          What should this page be compared with?
        </h2>
        <p className="mb-10 max-w-2xl text-base leading-relaxed text-white/55">
          Normascope is not tied to one kind of reference. Choose the source that matches the way
          your team works today.
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {SOURCES.map((source) => (
            <div key={source.number} className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
              <span
                className={`mb-7 block font-mono text-[12px] font-bold ${
                  source.tone === "clay"
                    ? "text-[#e0aaa0]"
                    : source.tone === "emerald"
                      ? "text-emerald-300"
                      : "text-violet-300"
                }`}
              >
                {source.number}
              </span>
              <h3 className="display-sm mb-3 text-white">{source.title}</h3>
              <p className="text-[14px] leading-relaxed text-white/55">{source.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <Eyebrow>The everyday loop</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">Four steps from setup to signal</h2>
        <p className="mb-12 max-w-2xl text-base leading-relaxed text-text/60">
          You do the setup once. After that, the normal development loop is a capture, a comparison,
          and a report you can inspect before the change reaches users.
        </p>
        <ol className="grid gap-8 md:grid-cols-2">
          {LOOP.map((step) => (
            <li key={step.number} className="relative rounded-xl border border-black/8 bg-white/60 p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <span className="numeric font-mono text-[12px] font-bold text-clay">{step.number}</span>
                <code className="rounded-md bg-ink px-2.5 py-1.5 font-mono text-[11px] text-white/80">
                  {step.command}
                </code>
              </div>
              <h3 className="title-sm mb-2 text-text">{step.title}</h3>
              <p className="text-[14px] leading-relaxed text-text/55">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── The alignment explainer ──
          `normascopeWeb.md` §8.1 calls this the centrepiece of the whole site,
          and it spent its life behind the /pitch password gate while the public
          page explained the same idea in two paragraphs of prose. Real images,
          real numbers: 5.63% naive against 0.26% honest, from the run recorded
          in lib/run-data.ts. */}
      <Section tone="sand">
        <Eyebrow>The honest number</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">
          A section that moved is not a section that broke
        </h2>
        <p className="mb-9 max-w-2xl text-base leading-relaxed text-text/60">
          This is the difference between a tool you trust and one you mute. Switch between the two
          readings — same page, same run, same pixels.
        </p>
        <AlignmentExplainer />
      </Section>

      <Section tone="paper">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <Eyebrow>What the report does</Eyebrow>
            <h2 className="display-md mb-5">It separates movement from breakage.</h2>
            <p className="mb-5 text-[15px] leading-relaxed text-text/60">
              A page can look very different because a section moved, even when the elements inside it
              are still correct. Normascope aligns comparable bands before it scores the real mismatch.
            </p>
            <p className="text-[15px] leading-relaxed text-text/60">
              That gives you two useful signals: the unaligned number shows how much the page moved;
              the aligned number shows how much content genuinely differs.
            </p>
          </div>
          <div className="lg:col-span-7">
            <Shot
              src="/screens/report-overview-light.png"
              alt="Normascope report overview showing frames, scores and clean versus flagged results"
              caption="The report gives every frame a result, a score and a reason to look closer."
            />
          </div>
        </div>
      </Section>

      <Section tone="sand">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <Shot
              src="/screens/report-fidelity-frame.png"
              alt="Normascope frame report showing reference, build and diff views"
              caption="For a flagged frame, move from the number to the exact region that changed."
            />
          </div>
          <div className="lg:col-span-5">
            <Eyebrow>When something differs</Eyebrow>
            <h2 className="display-md mb-5">The report tells you where to look.</h2>
            <ol className="space-y-5">
              {[
                ["Look at the overlay", "See the changed pixels in context, not as an isolated percentage."],
                ["Check the region", "Significant regions group nearby changes into places worth inspecting."],
                ["Decide what it means", "Accept an intentional change, fix a regression, or investigate the capture."],
              ].map(([head, body], i) => (
                <li key={head} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clay/15 font-mono text-[11px] font-bold text-clay-deep">
                    {i + 1}
                  </span>
                  <p className="text-[14px] leading-relaxed text-text/60">
                    <strong className="font-semibold text-text/85">{head}.</strong> {body}
                  </p>
                </li>
              ))}
            </ol>
            <Link
              href="/report"
              className="mt-8 inline-block text-[13.5px] font-semibold text-clay underline decoration-1 underline-offset-4 hover:text-clay-deep"
            >
              Learn how to read the report →
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Threshold ──
          §8.2. The one setting a new user has to form an opinion about, and it
          is learned by dragging it in about three seconds. Same three real
          frames as the explainer above. */}
      <Section tone="paper">
        {/* Holding a tape measure, beside the section about where you set the
            line. The page's own sentence is a camera and a measuring tape; the
            hero has the camera, this has the other half. */}
        <TwinAside
          pose="measure"
          twinClassName="mt-6 ml-auto block w-28 shrink-0 lg:mt-0 lg:w-32"
          className="mb-9"
        >
          <Eyebrow>Your call, not ours</Eyebrow>
          <h2 className="display-md mb-4 max-w-2xl">One setting decides what counts as flagged</h2>
          <p className="max-w-2xl text-base leading-relaxed text-text/60">
            A frame is flagged when its aligned difference is above your threshold. Drag it and
            watch the same three real frames change their minds — at 0.1% one is flagged, at 1% none
            are.
          </p>
        </TwinAside>
        <ThresholdSlider />
        <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-text/50">
          Flagged means &ldquo;look at this&rdquo;, not &ldquo;fail&rdquo;. Nothing breaks a build
          unless you pass <code className="font-mono text-[0.95em] text-clay">--strict</code>.
        </p>
      </Section>

      <Section tone="ink">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <Eyebrow dark>Optional, never in charge</Eyebrow>
            <h2 className="display-md mb-5 text-white">AI can suggest a cause. It never decides the result.</h2>
            <p className="text-[15px] leading-relaxed text-white/55">
              Once you have a comparison, you can ask Normascope to explain a flagged frame. It gives
              hypotheses to verify; the deterministic visual score remains the source of truth.
            </p>
            <p className="mt-4 border-l border-pink-300/40 pl-4 text-[13px] leading-relaxed text-white/40">
              AI explanations are guidance, not instructions or guarantees. They may be inaccurate or
              incomplete. Use, edit, ignore, or discard them as you choose — whether to act is your
              decision alone. Normascope does not automatically apply them or decide pass/fail, and is
              not responsible for outcomes from decisions made using them.
            </p>
          </div>
          <div className="lg:col-span-7">
            <Shot
              src="/screens/report-explain-findings.png"
              alt="Normascope report showing optional AI explanation findings with code pointers"
              caption={<span className="text-white/45">An explanation is a review aid, not an automatic fix.</span>}
              className="[&_figcaption]:text-white/45"
            />
          </div>
        </div>
      </Section>

      <Section tone="sand">
        <div className="mx-auto max-w-3xl text-center">
          <Wordmark size="lg" className="mx-auto mb-7" title="Normascope" />
          <h2 className="display-md mb-5">Start with one page.</h2>
          <p className="mx-auto mb-8 max-w-xl text-[16px] leading-relaxed text-text/60">
            You do not need a perfect test suite or a new platform. Point Normascope at one page your
            team cares about, run the loop, and learn what a trustworthy visual signal feels like.
          </p>
          <CopyLine command="npx norma-scope init" />
        </div>
      </Section>

      <CloudBand
        wall="When the report needs to outlive your laptop."
        answer="Normascope Cloud adds shared links, per-page history and trends when your team is ready for them."
      />

      <Section tone="paper" size="sm">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <Eyebrow>User guide</Eyebrow>
            <h2 className="display-sm">Need the hand-holding version?</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-text/55">
              Follow the commands, examples and troubleshooting steps from first setup to CI.
            </p>
          </div>
          <Link
            href="/guide"
            className="shrink-0 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Open the user guide →
          </Link>
        </div>
      </Section>
    </>
  );
}
