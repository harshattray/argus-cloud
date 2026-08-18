"use client";

import { useState } from "react";
import { Screenshot } from "../../../_components/Screenshot";

/**
 * The four shapes a report takes.
 *
 * People arrive at a report having run one of four different things, and the
 * file they get looks meaningfully different in each case. Rather than
 * describing that in prose, this lets them find the one in front of them by its
 * tells — the middle image's label and the frame's mode line are the two
 * reliable identifiers, so both are called out explicitly for every variant.
 */

interface Variant {
  id: string;
  name: string;
  when: string;
  command: string;
  /** The two reliable identifiers, plus whatever else distinguishes it. */
  tells: { label: string; value: string }[];
  body: string;
  threshold: string;
  /** A real capture of this variant, cropped to the part that identifies it. */
  shot: { src: string; alt: string };
}

const VARIANTS: Variant[] = [
  {
    id: "fidelity",
    name: "Design check",
    when: "Your frames are compared against a design.",
    command: "norma-scope check",
    tells: [
      { label: "Middle image reads", value: "Figma design · Reference (images) · Reference (url)" },
      { label: "Mode line reads", value: "fidelity · figma" },
      { label: "Typical threshold", value: "5%" },
    ],
    body: "The reference is a design export or a second website. Scores sit higher than you might expect and that's normal — a browser and a design tool draw text differently, so the engine uses a forgiving colour tolerance here to stop every letter edge counting as a defect.",
    threshold: "5",
    shot: {
      src: "/screens/report-fidelity-frame.png",
      alt:
        "A design-check frame in a report, whose mode line reads fidelity dot figma and whose middle image is labelled Figma design.",
    },
  },
  {
    id: "baseline",
    name: "Regression check",
    when: "Your frames are marked as baseline mode.",
    command: "norma-scope baseline",
    tells: [
      { label: "Middle image reads", value: "Approved baseline" },
      { label: "Mode line reads", value: "baseline" },
      { label: "Typical threshold", value: "0.5% or lower" },
    ],
    body: "The reference is a screenshot you approved. Both sides come from the same browser on the same machine, so there's no rendering gap to forgive — the engine is much more sensitive here, and an unchanged page reads exactly 0.00%. Set your threshold low to match.",
    threshold: "0.5",
    shot: {
      src: "/screens/report-flagged-light.png",
      alt:
        "A regression-check frame in a report, whose mode line reads baseline and whose middle image is labelled Approved baseline.",
    },
  },
  {
    id: "findings",
    name: "With findings",
    when: "You ran explain before your last comparison.",
    command: "norma-scope explain",
    tells: [
      { label: "Extra block", value: "Between the numbers and the images" },
      { label: "Always labelled", value: "Generated — verify before applying" },
      { label: "Changes the score", value: "Never" },
    ],
    body: "Everything from whichever mode you're in, plus a findings block on each analysed frame. Findings are hypotheses with a confidence badge, a suggested fix and a selector. They can't move a number or fail a build.",
    threshold: "—",
    shot: {
      src: "/screens/report-explain-findings.png",
      alt:
        "The explain findings block from a real run: two findings with low confidence badges, each with a hypothesis, a suggested fix and a CSS selector.",
    },
  },
  {
    id: "target",
    name: "Quick check",
    when: "You pointed it at a picture and a URL, with no setup.",
    command: "norma-scope compare --target mock.png --url …",
    tells: [
      { label: "Frames in the report", value: "Exactly one, named after your file" },
      { label: "Mode line reads", value: "fidelity · url" },
      { label: "Threshold", value: "Fixed at 5%" },
    ],
    body: "No config file is involved at all. This is the sixty-second version and the one an AI agent drives — it captures the URL, diffs it against the image you handed it, and writes the same report as everything else.",
    threshold: "5",
    shot: {
      src: "/screens/report-target-frame.png",
      alt:
        "A zero-config report: a single frame named after the mock file, with a mode line reading fidelity dot url.",
    },
  },
];

export function ReportVariants({
  /** Where "the evidence page" points. The public site has no such page — it
   *  passes null and the caption simply stops at the claim. */
  evidenceHref = "/pitch/proof",
}: {
  evidenceHref?: string | null;
} = {}) {
  const [active, setActive] = useState(VARIANTS[0].id);
  const variant = VARIANTS.find((v) => v.id === active) ?? VARIANTS[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Report variants"
        className="flex flex-wrap gap-2 border-b border-black/10 pb-4"
      >
        {VARIANTS.map((v) => {
          const selected = v.id === active;
          return (
            <button
              key={v.id}
              role="tab"
              id={`variant-tab-${v.id}`}
              aria-selected={selected}
              aria-controls={`variant-panel-${v.id}`}
              onClick={() => setActive(v.id)}
              className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                selected
                  ? "bg-[#111] text-white"
                  : "border border-black/10 text-text/55 hover:border-black/25 hover:text-text"
              }`}
            >
              {v.name}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`variant-panel-${variant.id}`}
        aria-labelledby={`variant-tab-${variant.id}`}
        className="grid gap-8 pt-7 lg:grid-cols-12 lg:gap-12"
      >
        <div className="lg:col-span-6 min-w-0">
          <p className="eyebrow text-clay mb-3">You get this when</p>
          <p className="display-sm mb-4">{variant.when}</p>
          <p className="text-[15px] leading-relaxed text-text/60 mb-5">{variant.body}</p>
          <code className="inline-block rounded-lg bg-[#111] px-3 py-2 font-mono text-[12.5px] text-white/85">
            <span className="text-emerald-400">$</span> {variant.command}
          </code>
        </div>

        <div className="lg:col-span-6 min-w-0">
          <p className="eyebrow text-text/35 mb-3">How to recognise it</p>
          <dl>
            {variant.tells.map((t) => (
              <div
                key={t.label}
                className="flex flex-col gap-1 border-b border-black/8 py-3 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <dt className="text-[13px] text-text/45 sm:w-44 sm:shrink-0">{t.label}</dt>
                <dd className="font-mono text-[13px] font-medium text-text/80 min-w-0">
                  {t.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* A real capture of this exact variant. Keyed on the variant id so the
            browser treats each as a distinct image and does not cross-fade one
            report into another while decoding. */}
        <figure className="lg:col-span-12 min-w-0">
          <div className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_1px_2px_rgba(28,27,26,0.04),0_14px_38px_rgba(28,27,26,0.09)]">
            {/* The key moves to the wrapper rather than the `<img>`: `Screenshot`
                renders a `<picture>`, and keying the inner element would let
                React keep one `<picture>` while swapping its child, which is the
                cross-fade this key exists to prevent. */}
            <Screenshot key={variant.id} src={variant.shot.src} alt={variant.shot.alt} />
          </div>
          <figcaption className="mt-3 text-[13px] leading-relaxed text-text/50">
            A real {variant.name.toLowerCase()}, from our own runs
            {evidenceHref ? (
              <>
                {" "}
                on the{" "}
                <a href={evidenceHref} className="text-clay underline underline-offset-2">
                  evidence page
                </a>
              </>
            ) : null}
            .
          </figcaption>
        </figure>
      </div>

      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/8 bg-white/55 px-5 py-4">
          <p className="title-sm text-text mb-1.5">Light and dark, automatically</p>
          <p className="text-[14px] leading-relaxed text-text/55">
            The report follows whatever your system is set to. Both are shipped; there is nothing to
            configure.
          </p>
        </div>
        <div className="rounded-xl border border-black/8 bg-white/55 px-5 py-4">
          <p className="title-sm text-text mb-1.5">Clean and flagged</p>
          <p className="text-[14px] leading-relaxed text-text/55">
            With nothing over threshold the top reads &ldquo;All clean&rdquo; and every card goes
            green. That is a result, not an empty page — it&rsquo;s the tool saying it looked and
            found nothing.
          </p>
        </div>
      </div>
    </div>
  );
}
