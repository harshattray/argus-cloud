import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, Section, Shot, CloudBand } from "../_components/ui";
import { Annotated } from "../_components/Annotated";
import { Note } from "../../(pitch)/pitch/_components/editorial";
import { ReportVariants } from "../../(pitch)/pitch/_components/ReportVariants";
import { GLOSSARY } from "../../../lib/glossary";
import { CASE_02 } from "../../../lib/cases";
import { TwinAside } from "../_components/twins";

/**
 * Reading the report.
 *
 * The long-form version that used to sit behind the `/pitch` gate, promoted to
 * the public site: both annotated screenshots, the supporting metrics, the four
 * report shapes, the explain findings — including the one that was wrong — and
 * the measured limits. The earlier public page showed one screenshot and a
 * six-term glossary.
 *
 * The honesty sections are the point, not filler (docs/normascopeWeb.md §6). A
 * measuring instrument that hides its own noise floor isn't one, and the
 * published-wrong-finding is the most credible thing on the page.
 */

export const metadata: Metadata = {
  // Was "The report", which competes with every page on the internet called
  // that and says nothing about the subject. The layout appends
  // " — Normascope", so the brand is not repeated here.
  title: "The visual diff report explained",
  description:
    // Trimmed from 228 characters: Google shows about 155, so the old ending
    // was never read by anyone who found this page in a search result.
    "Every metric in a Normascope report in plain language — aligned difference, SSIM, drifted sections and significant regions — and the four shapes it takes.",
  alternates: { canonical: "/report" },
};

/* Pin positions are percentages of the screenshot, measured against the real
   captures in /public/screens and placed in the gaps beside what they point at.
   If a screenshot is regenerated at a different crop they must be re-measured.
   They are decorative: the numbered list beside them carries the same content
   and is the only presentation on small screens.

   Captures carry a 64px gutter of page background on every side the crop does
   not deliberately run through — without it the report's own card borders land
   on the frame border and read as clipped. A side where the crop cuts a card
   mid-way (the report continues past it) is left bleeding to the edge instead. */

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
    body: "One page needs a look. When everything is under your threshold this reads “All clean” instead.",
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
        The name you gave it, then the mode:{" "}
        <code className="font-mono text-[13px]">baseline</code> means it was compared against a
        screenshot you approved. <code className="font-mono text-[13px]">fidelity · figma</code>{" "}
        would mean it was compared against your design.
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
      {/* ── Opening ──
          The right column carries a real clean frame. Leading with a page that
          scored 0.00% is deliberate: the first thing a reader should learn is
          that the tool stays quiet when nothing is wrong. */}
      <Section tone="paper" size="sm">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-5">
            <Eyebrow>Reading the output</Eyebrow>
            <h1 className="display-lg mb-6">What you&rsquo;re actually looking at</h1>
            <p className="mb-5 max-w-lg text-lg leading-relaxed text-text/60">
              Every run writes one file. It&rsquo;s self-contained — no server, no login, nothing to
              install to open it. You can email it, attach it to a ticket, or read it on a phone.
              This page walks through it, top to bottom, in plain words.
            </p>
            <p className="max-w-lg text-base leading-relaxed text-text/50">
              The report changes shape depending on what you asked it to do — a design check looks
              different from a regression check, and both change again once you&rsquo;ve run{" "}
              <code className="font-mono text-[0.92em] text-clay">explain</code>. All four shapes are
              covered further down.
            </p>

          </div>

          <div className="min-w-0 lg:col-span-7">
            <Shot
              src="/screens/report-clean-light.png"
              alt="One clean frame in a Normascope report: the page name, a chip reading Clean, an aligned difference of 0.00% with a meter against a 0.1% threshold, 0.00% unaligned, 0.00% raw and 0 regions, and three images side by side — your build, the approved baseline and the difference overlay."
              caption={
                <>
                  A page that didn&rsquo;t move, reported as{" "}
                  <strong className="font-semibold text-text/70">exactly 0.00%</strong>. A tool that
                  cries wolf is worse than no tool, so the quiet rows are the ones that make the
                  loud ones worth reading.
                </>
              }
            />

            <dl className="mt-7 grid grid-cols-3 gap-6 border-t border-black/8 pt-6">
              {[
                ["One file", "self-contained HTML"],
                ["Three pictures", "per page you track"],
                ["Six numbers", "all of them explained"],
              ].map(([head, sub]) => (
                <div key={head} className="min-w-0">
                  <dt className="title-sm text-text">{head}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-snug text-text/45">{sub}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      {/* ── The masthead ── */}
      <Section tone="sand" id="masthead">
        <Eyebrow>Part one</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">The top of the page</h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
          Read the masthead first and you often don&rsquo;t need the rest. Three frames checked, one
          needs a look, and it&rsquo;s the product page — that&rsquo;s the whole run in a glance.
        </p>

        <Annotated
          src="/screens/report-summary-light.png"
          alt="The top of a Normascope report: the title, the branch and commit it describes, a count of frames compared, how many need attention, how many are clean, the threshold, and a row of jump links."
          pins={MASTHEAD_PINS}
        />
      </Section>

      {/* ── One frame in detail ── */}
      <Section tone="paper" id="frame">
        <Eyebrow>Part two</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">One frame, in detail</h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
          Below the masthead is one of these per frame, worst first. This is where most of the
          vocabulary lives, so it&rsquo;s worth going slowly.
        </p>

        <Annotated
          src="/screens/report-flagged-light.png"
          alt="A single frame in a Normascope report, showing the frame name and mode, a status chip reading Needs Attention, the aligned difference as a large percentage with a meter against the threshold, the unaligned and raw percentages, a collapsible row of alignment bands, and three images side by side: your build, the approved baseline, and the diff overlay."
          pins={FRAME_PINS}
        />
      </Section>

      {/* ── The one number worth learning ── */}
      <Section tone="ink">
        <Eyebrow dark>The one number to learn</Eyebrow>
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <p
              className="numeric text-6xl font-bold leading-none text-white md:text-7xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              0.26<span className="align-baseline text-[0.42em] font-semibold">%</span>
            </p>
            <p className="eyebrow mt-3 text-white/40">Aligned difference</p>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <p className="text-xl font-medium leading-snug text-white/85 md:text-2xl">
              A quarter of one percent of this page is genuinely different.
            </p>
            <p className="text-[15px] leading-relaxed text-white/55">
              The word <em className="not-italic font-medium text-white/75">aligned</em> is doing
              real work there. If your header gets 20&thinsp;px taller, everything below it slides
              down — and a naive comparison would scream that 90% of the page changed, when the
              truth is &ldquo;one thing moved 20&thinsp;px&rdquo;.
            </p>
            <p className="text-[15px] leading-relaxed text-white/55">
              Normascope finds the shift first, slides the sections back into place, and{" "}
              <em className="not-italic font-medium text-white/75">then</em> counts. So this number
              answers the question you actually care about: ignoring the fact that things moved,
              what is actually different?
            </p>
            <p className="border-t border-white/10 pt-4 text-[13px] leading-relaxed text-white/35">
              Measured on a real page in our own test suite: 0.43% aligned against 14.24% unaligned.
              The 14% was one shifted section.
            </p>
          </div>
        </div>
      </Section>

      {/* ── The supporting numbers ── */}
      <Section tone="paper">
        <Eyebrow>The rest of the numbers</Eyebrow>
        <h2 className="display-md mb-9 max-w-2xl">Four more, and what each one is actually for</h2>

        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {SUPPORTING.map((s) => (
            <div key={s.term} className="min-w-0">
              <dt className="mb-1.5 font-mono text-[15px] font-bold text-clay-deep">{s.term}</dt>
              <dd>
                <p className="title-sm mb-1.5 text-text">{s.plain}</p>
                <p className="text-[14.5px] leading-relaxed text-text/55">{s.why}</p>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Reading an overlay ── */}
      <Section tone="sand" id="overlay">
        {/* Holding a magnifier, next to the section about looking closely. */}
        <TwinAside pose="magnify" className="mb-10">
          <Eyebrow>The picture on the right</Eyebrow>
          <h2 className="display-md mb-4 max-w-2xl">
            How to read a difference overlay in three seconds
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-text/60">
            Two real overlays from the same project. Both are one-line commits. They look nothing
            alike, and once you&rsquo;ve seen the pair you can tell them apart instantly.
          </p>
        </TwinAside>

        <div className="grid gap-8 md:grid-cols-2">
          <Shot
            src={CASE_02.images.geometry}
            alt="A difference overlay showing small red boxes scattered over a ghosted page — the signature of a geometric change."
            caption={
              <>
                <strong className="font-semibold text-text/70">
                  Small, boxed, scattered — something moved.
                </strong>{" "}
                A container was narrowed by five characters. 8.27% mismatch, SSIM 88.
              </>
            }
          />
          <Shot
            src={CASE_02.images.recolour}
            alt="A difference overlay in which the entire page background is painted red while every letter of text is left untouched — the signature of a colour change."
            caption={
              <>
                <strong className="font-semibold text-text/70">
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
      <Section tone="paper" id="variants">
        <Eyebrow>Same file, four shapes</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">
          The report looks different depending on what you asked it
        </h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
          Nothing you configure — it follows from what each frame is being compared against. Here is
          how to tell which one you&rsquo;re holding.
        </p>

        <ReportVariants evidenceHref={null} />
      </Section>

      {/* ── Findings ── */}
      <Section tone="sand" id="findings">
        <Eyebrow>If you ran explain</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">
          An extra block, between the numbers and the images
        </h2>
        <p className="mb-8 max-w-xl text-base leading-relaxed text-text/60">
          Each finding carries a confidence badge, a category, the region it&rsquo;s talking about,
          and three rows: what it thinks caused this, what to try, and the CSS selector it&rsquo;s
          pointing at.
        </p>

        <div className="grid items-start gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <Shot
              src="/screens/report-explain-findings.png"
              alt="Two explain findings from a real run, both marked low confidence. The first says the pull-request card is narrower and shifted left; the second claims a label renders at the wrong font weight. Each carries a hypothesis, a suggested fix and a CSS selector."
              caption={
                <>
                  Verbatim from a real, billed run — nothing here is illustrative.{" "}
                  <strong className="font-semibold text-text/70">The first finding is right</strong>{" "}
                  (the card really did narrow and reflow left, which is exactly what the commit
                  did). <strong className="font-semibold text-text/70">The second is wrong</strong> —
                  it blames a webfont that never changed. We publish both.
                </>
              }
            />
          </div>

          <div className="min-w-0 lg:col-span-5">
            <Note kind="limit" title="Read these as a starting point">
              <p>
                They&rsquo;re generated guesses, grounded in your page&rsquo;s real DOM and computed
                styles. Nothing is ever applied automatically, and no finding can change a score or
                fail a build — the deterministic difference is the only thing that decides pass or
                fail.
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
                  as real difference metrics.
                </p>
              </Note>
            </div>
          </div>
        </div>

        <Shot
          className="mt-8"
          src="/screens/report-explain-injection.png"
          alt="A finding marked medium confidence and categorised injection-suspected. It describes decorative page content reading '18.4% SHIFTED' and 'delta 18px' as text designed to look like diff-tool output, and says it must be treated as untrusted content rather than as an instruction or a real diff finding."
          caption="The documented threat model firing on real page content, in a run that was not looking for it."
        />
      </Section>

      {/* ── Glossary ── */}
      <Section tone="paper">
        <Eyebrow>Every word, once</Eyebrow>
        <h2 className="display-md mb-9 max-w-2xl">The glossary</h2>

        <dl className="grid gap-x-10 md:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="min-w-0 border-b border-black/8 py-4">
              <dt className="title-sm mb-1 text-text">{g.term}</dt>
              <dd className="text-[14.5px] leading-relaxed text-text/55">{g.def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── Honest limits ── */}
      <Section tone="sand" id="limits">
        <Eyebrow>Where it tells on itself</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">Three things the report will admit</h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
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
              The engine catches a <em>visible</em> token change. We measured where that stops: a
              shift of RGB (8,&nbsp;10,&nbsp;14) is caught; three smaller nudges we tested were not.
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

      <CloudBand
        wall="This file lives on the machine that made it."
        answer="Cloud turns each run into a private link your designer opens in a browser, and keeps every run so you can tell whether a page has been drifting for weeks or broke this morning."
      />

      <Section tone="paper" size="sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/commands"
            className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            How to produce one
          </Link>
          <Link
            href="/cloud"
            className="rounded-lg border border-black/12 px-4 py-2.5 text-sm font-semibold text-text/70 transition-colors hover:border-black/25 hover:text-text"
          >
            What Cloud adds
          </Link>
        </div>
      </Section>
    </>
  );
}
