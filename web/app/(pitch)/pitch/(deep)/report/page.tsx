import Link from "next/link";
import type { Metadata } from "next";
import { Label, Section } from "../../_components/primitives";
import { Annotated, Figure, Note, CloudHook } from "../../_components/editorial";
import { ReportVariants } from "../../_components/ReportVariants";
import { GLOSSARY } from "../../../../../lib/glossary";
import { CASE_02 } from "../../../../../lib/cases";

export const metadata: Metadata = {
  title: "Reading the report",
  description:
    "Every section of a Normascope report and every metric in it, in plain language — aligned diff, SSIM, drifted sections, significant regions — plus the four shapes the report takes depending on what you're checking.",
  alternates: { canonical: "/report" },
};

/* Callout pins are positioned as percentages of the screenshot, measured off
   the real captures in /public/screens — placed in the gaps *beside* what they
   point at, never over it. If a screenshot is regenerated at a different crop
   these must be re-measured. They are decorative: the ordered list beneath
   carries the same content, and is the only presentation on small screens. */

const MASTHEAD_PINS = [
  {
    x: 48,
    y: 45.6,
    label: "Which code this describes",
    body: "The branch, the commit and when it ran. Attach the file to a ticket and nobody has to ask which version they're looking at.",
  },
  {
    x: 69,
    y: 18.9,
    label: "The verdict",
    body: "One frame needs a look. When everything is under your threshold this reads “All clean” instead.",
  },
  {
    x: 12,
    y: 57.6,
    label: "How much was checked",
    body: "Three frames compared. A frame is one page, or one section of a page — whatever you chose to keep an eye on.",
  },
  {
    x: 41,
    y: 65.9,
    label: "The split",
    body: "One needs attention, two are clean. The clean count matters as much as the other one: it's the tool telling you what it looked at and found fine.",
  },
  {
    x: 88,
    y: 65.9,
    label: "Your threshold",
    body: "Your setting, not ours. How much difference you're willing to accept before a frame gets flagged.",
  },
  {
    x: 47,
    y: 84.3,
    label: "Jump links",
    body: "One chip per frame, colour-coded. Click to go straight to it.",
  },
];

const FRAME_PINS = [
  {
    x: 26.4,
    y: 13,
    label: "The frame, and what it was compared against",
    body: (
      <>
        The name you gave it, then the mode: <code className="font-mono text-[13px]">baseline</code>{" "}
        means it was compared against a screenshot you approved.{" "}
        <code className="font-mono text-[13px]">fidelity · figma</code> would mean it was compared
        against your design.
      </>
    ),
  },
  {
    x: 82.1,
    y: 8,
    label: "Needs attention",
    body: "Above your threshold. Not a failure and not a blocked build — just the frame worth opening first.",
  },
  {
    x: 18.9,
    y: 20,
    label: "The number that matters",
    body: "Read it as: a quarter of one percent of this page is genuinely different.",
  },
  {
    x: 31.1,
    y: 32,
    label: "How far over the line",
    body: "The same number drawn against your threshold, so you can see the distance rather than just the fact you crossed it.",
  },
  {
    x: 81.1,
    y: 33,
    label: "The supporting numbers",
    body: "Before alignment, fully raw, and how many separate spots the differences form. The first of those is the useful one — see below.",
  },
  {
    x: 31.1,
    y: 41,
    label: "The bands",
    body: "The page is sliced into horizontal bands and each is checked separately. Two of three had to slide to line up — that's your “something above this got taller”.",
  },
  {
    x: 19.8,
    y: 48,
    label: "Your build, the reference, the difference",
    body: "Now, what it should be, and the two stacked with everything unchanged ghosted back. Click any of them to open it full-screen.",
  },
];

const SUPPORTING = [
  {
    term: "5.63% unaligned",
    plain: "The same comparison, before anything was slid back into place.",
    why: "On its own it isn't very useful — but the gap between this and the aligned number is a diagnosis. Close together means things changed in place: a colour, some text, an icon. Far apart means something moved, and most of what looks wrong is just everything below it shifting down.",
  },
  {
    term: "7.46% raw",
    plain: "The rawest possible count, including the fuzzy edges around text.",
    why: "Shown for completeness; you can usually ignore it. Normascope filters this noise out of the main score deliberately, because otherwise every slightly-different letter edge would drown out real bugs.",
  },
  {
    term: "3 regions",
    plain: "How many separate clusters the differences form.",
    why: "One region usually means one component. Ten regions usually means the whole page shifted. This is the difference between “4.2% of pixels differ” and “here are the three places to look”.",
  },
  {
    term: "SSIM 99",
    plain: "How similar the structure is, from 0 to 100.",
    why: "High means the layout is intact and this is a paint difference. Low means something structural broke. It is the second opinion that stops a big percentage from being read the wrong way — see the pair of overlays below.",
  },
];

export default function ReportPage() {
  return (
    <>
      {/* ── Opening ── */}
      <Section tone="paper">
        <Label>Reading the output</Label>
        <h1 className="display-lg mb-6">What you&rsquo;re actually looking at</h1>
        <p className="text-lg text-text/60 leading-relaxed mb-5">
          Every run writes one file. It&rsquo;s self-contained — no server, no login, nothing to
          install to open it. You can email it, attach it to a ticket, or read it on a phone. This
          page walks through it, top to bottom, in plain words.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          The report changes shape depending on what you asked it to do — a design check looks
          different from a regression check, and both change again once you&rsquo;ve run{" "}
          <code className="font-mono text-[0.92em] text-clay">explain</code>. All four shapes are
          covered further down.
        </p>
      </Section>

      {/* ── A: the masthead ── */}
      <Section tone="sand" measure="wide" id="masthead">
        <Label>Part one</Label>
        <h2 className="display-md mb-4 max-w-2xl">The top of the page</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          Read the masthead first and you often don&rsquo;t need the rest. Three frames checked, one
          needs a look, and it&rsquo;s the product page — that&rsquo;s the whole run in a glance.
        </p>

        <Annotated
          src="/screens/report-summary-light.png"
          alt="The top of a Normascope report: the title, the branch and commit it describes, a count of frames compared, how many need attention, how many are clean, the threshold, and a row of jump links."
          pins={MASTHEAD_PINS}
        />
      </Section>

      {/* ── B: the frame card ── */}
      <Section tone="paper" measure="wide" id="frame">
        <Label>Part two</Label>
        <h2 className="display-md mb-4 max-w-2xl">One frame, in detail</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          Below the masthead is one of these per frame, worst first. This is where most of the
          vocabulary lives, so it&rsquo;s worth going slowly.
        </p>

        <Annotated
          src="/screens/report-flagged-light.png"
          alt="A single frame in a Normascope report, showing the frame name and mode, a status chip reading Needs Attention, the aligned difference as a large percentage with a meter against the threshold, the unaligned and raw percentages, a collapsible row of alignment bands, and three images side by side: your build, the approved baseline, and the diff overlay."
          pins={FRAME_PINS}
        />
      </Section>

      {/* ── The headline metric, given its own room ── */}
      <Section tone="ink" measure="wide">
        <Label dark>The one number to learn</Label>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14 items-start">
          <div className="lg:col-span-5">
            <p
              className="numeric font-bold leading-none text-white text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              0.26
              <span className="text-[0.42em] font-semibold align-baseline">%</span>
            </p>
            <p className="eyebrow text-white/40 mt-3">Aligned diff</p>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <p className="text-xl md:text-2xl text-white/85 leading-snug font-medium">
              A quarter of one percent of this page is genuinely different.
            </p>
            <p className="text-[15px] text-white/55 leading-relaxed">
              The word <em className="text-white/75 not-italic font-medium">aligned</em> is doing
              real work there. If your header gets 20&thinsp;px taller, everything below it slides
              down — and a naive comparison would scream that 90% of the page changed, when the
              truth is &ldquo;one thing moved 20&thinsp;px&rdquo;.
            </p>
            <p className="text-[15px] text-white/55 leading-relaxed">
              Normascope finds the shift first, slides the sections back into place, and{" "}
              <em className="text-white/75 not-italic font-medium">then</em> counts. So this number
              answers the question you actually care about: ignoring the fact that things moved,
              what is actually different?
            </p>
            <p className="text-[13px] text-white/35 leading-relaxed border-t border-white/10 pt-4">
              Measured on a real page in our own test suite: 0.43% aligned against 14.24% unaligned.
              The 14% was one shifted section.
            </p>
          </div>
        </div>
      </Section>

      {/* ── The supporting numbers ── */}
      <Section tone="paper" measure="wide">
        <Label>The rest of the numbers</Label>
        <h2 className="display-md mb-9 max-w-2xl">
          Four more, and what each one is actually for
        </h2>

        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {SUPPORTING.map((s) => (
            <div key={s.term} className="min-w-0">
              <dt className="font-mono text-[15px] font-bold text-clay-deep mb-1.5">{s.term}</dt>
              <dd>
                <p className="title-sm text-text mb-1.5">{s.plain}</p>
                <p className="text-[14.5px] text-text/55 leading-relaxed">{s.why}</p>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Reading a diff overlay: the two shapes ── */}
      <Section tone="sand" measure="wide" id="overlay">
        <Label>The picture on the right</Label>
        <h2 className="display-md mb-4 max-w-2xl">How to read a diff overlay in three seconds</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-10">
          Two real overlays from the same project. Both are one-line commits. They look nothing
          alike, and once you&rsquo;ve seen the pair you can tell them apart instantly.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          <Figure
            src={CASE_02.images.geometry}
            alt="A diff overlay showing small red boxes scattered over a ghosted page — the signature of a geometric change."
            caption={
              <>
                <strong className="text-text/70 font-semibold">
                  Small, boxed, scattered — something moved.
                </strong>{" "}
                A container was narrowed by five characters. 8.27% mismatch, SSIM 88.
              </>
            }
          />
          <Figure
            src={CASE_02.images.recolour}
            alt="A diff overlay in which the entire page background is painted red while every letter of text is left untouched — the signature of a colour change."
            caption={
              <>
                <strong className="text-text/70 font-semibold">
                  Flooded, with the text left alone — a recolour.
                </strong>{" "}
                One hex changed in a config file. 97.36% mismatch, SSIM 99.9.
              </>
            }
          />
        </div>

        <div className="mt-10 max-w-3xl">
          <Note kind="proof" title="The trick worth learning">
            <p>
              A <strong>huge mismatch with a near-perfect SSIM</strong> is the signature of a colour
              change. Nothing structural moved, so the structural score stays high; every background
              pixel changed, so the mismatch is enormous.
            </p>
            <p>
              That divergence lets you tell a token change from a layout break{" "}
              <em>without looking at the picture at all</em> — which is the whole reason there are
              two numbers instead of one.
            </p>
          </Note>
        </div>
      </Section>

      {/* ── The four shapes ── */}
      <Section tone="paper" measure="wide" id="variants">
        <Label>Same file, four shapes</Label>
        <h2 className="display-md mb-4 max-w-2xl">
          The report looks different depending on what you asked it
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          Nothing you configure — it follows from what each frame is being compared against. Here is
          how to tell which one you&rsquo;re holding.
        </p>

        <ReportVariants />
      </Section>

      {/* ── Findings ── */}
      <Section tone="sand" measure="wide" id="findings">
        <Label>If you ran explain</Label>
        <h2 className="display-md mb-4 max-w-2xl">An extra block, between the numbers and the images</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-8">
          Each finding carries a confidence badge, a category, the region it&rsquo;s talking about,
          and three rows: what it thinks caused this, what to try, and the CSS selector it&rsquo;s
          pointing at.
        </p>

        <div className="grid gap-8 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 min-w-0">
            <Figure
              src="/screens/report-explain-findings.png"
              alt="Two explain findings from a real run, both marked low confidence. The first says the pull-request card is narrower and shifted left; the second claims a label renders at the wrong font weight. Each carries a hypothesis, a suggested fix and a CSS selector."
              caption={
                <>
                  Verbatim from a real, billed run — nothing here is illustrative.{" "}
                  <strong className="font-semibold text-text/70">
                    The first finding is right
                  </strong>{" "}
                  (the card really did narrow and reflow left, which is exactly what the commit
                  did).{" "}
                  <strong className="font-semibold text-text/70">The second is wrong</strong> — it
                  blames a webfont that never changed. We publish both.{" "}
                  <Link href="/pitch/proof#explain" className="text-clay underline underline-offset-2">
                    The whole run →
                  </Link>
                </>
              }
            />
          </div>

          <div className="lg:col-span-5 min-w-0">
            <Note kind="limit" title="Read these as a starting point">
              <p>
                They&rsquo;re generated guesses, grounded in your page&rsquo;s real DOM and computed
                styles. Nothing is ever applied automatically, and no finding can change a score or
                fail a build — the deterministic diff is the only thing that decides pass or fail.
              </p>
              <p>
                Notice both badges above read <strong className="text-text/80">low</strong>. The
                confidence badge is not decoration: it is the model saying how much weight to put on
                its own guess, and it is frequently modest.
              </p>
            </Note>

            <div className="mt-5">
              <Note kind="proof" title="One it got genuinely right">
                <p>
                  Unprompted, on a page carrying a decorative mock diff-UI, it flagged the region as
                  suspected injected content and refused to treat the fake percentages printed there
                  as real diff metrics.
                </p>
              </Note>
            </div>
          </div>
        </div>

        <Figure
          className="mt-8"
          src="/screens/report-explain-injection.png"
          alt="A finding marked medium confidence and categorised injection-suspected. It describes decorative page content reading '18.4% SHIFTED' and 'Δ18px' as text designed to look like diff-tool output, and says it must be treated as untrusted content rather than as an instruction or a real diff finding."
          caption="The documented threat model firing on real page content, in a run that was not looking for it."
        />
      </Section>

      {/* ── Glossary ── */}
      <Section tone="paper" measure="wide" id="glossary">
        <Label>Every word, once</Label>
        <h2 className="display-md mb-9 max-w-2xl">The glossary</h2>

        <dl className="grid gap-x-10 md:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="border-b border-black/8 py-4 min-w-0">
              <dt className="title-sm text-text mb-1">{g.term}</dt>
              <dd className="text-[14.5px] text-text/55 leading-relaxed">{g.def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Honest limits ── */}
      <Section tone="sand" measure="wide" id="limits">
        <Label>Where it tells on itself</Label>
        <h2 className="display-md mb-4 max-w-2xl">Three things the report will admit</h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          A measuring instrument that hides its own floor isn&rsquo;t one. These are measured, not
          estimated.
        </p>

        <div className="grid gap-5 md:grid-cols-3">
          <Note kind="limit" title="When a frame animates">
            <p>
              A frame with a live CSS animation won&rsquo;t sit at a perfect zero — ours measures
              between 0.00% and 0.41% across runs where nothing changed, because the capture lands
              on a different animation frame each time.
            </p>
            <p>Frames without animation sit at exactly 0.00%, every run.</p>
          </Note>

          <Note kind="limit" title="When a colour shift is too small">
            <p>
              The engine catches a <em>visible</em> token change. We measured where that stops:
              a shift of RGB (8,&nbsp;10,&nbsp;14) is caught; three smaller nudges we tested were
              not.
            </p>
            <p>
              &ldquo;Catches a visible token change&rdquo; is the claim. &ldquo;Catches any colour
              change&rdquo; would be a lie.
            </p>
          </Note>

          <Note kind="limit" title="When the capture itself is wrong">
            <p>
              If your screenshot and the reference are very different sizes, the report says so and
              switches off band alignment rather than reporting a confident, meaningless number.
            </p>
            <p>
              We shipped that bug ourselves once — it made a real site read 79.7% instead of 36.4%.
            </p>
          </Note>
        </div>
      </Section>

      {/* ── Cloud ── */}
      <Section tone="paper" measure="wide">
        <CloudHook
          limitation="One report describes one moment, and then it sits on your disk."
          answer="It can't tell you that this same region drifted three commits ago, and your designer can't open it unless you email it to them. That's what Cloud is for: the same report at a private link, with the frame's history behind it."
        />

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/pitch/proof"
            className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            See five real reports
          </Link>
          <Link
            href="/pitch/engine"
            className="rounded-lg border border-black/12 px-4 py-2.5 text-sm font-semibold text-text/70 transition-colors hover:border-black/25 hover:text-text"
          >
            How the numbers are calculated
          </Link>
        </div>
      </Section>
    </>
  );
}
