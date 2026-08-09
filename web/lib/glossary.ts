/**
 * Every word a reader can hit inside a report, defined without jargon.
 *
 * Rule for this file: define the term the way you would say it out loud to
 * someone who has never used a visual diff. If a definition needs a second
 * sentence to explain the first, the first sentence is wrong.
 */

export interface GlossaryEntry {
  term: string;
  def: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Frame",
    def: "One page, or one section of a page, that you're keeping an eye on.",
  },
  {
    term: "Aligned diff",
    def: "The main number. How much is genuinely different, after sliding shifted sections back into place.",
  },
  {
    term: "Unaligned diff",
    def: "The same comparison before that sliding. When it's much bigger than the aligned number, something moved rather than broke.",
  },
  {
    term: "Raw diff",
    def: "The rawest count, including the fuzzy edges around text. Usually safe to ignore.",
  },
  {
    term: "SSIM",
    def: "How similar the structure is, from 0 to 100. High means the layout is intact and this is a paint difference; low means something structural broke.",
  },
  {
    term: "Significant region",
    def: "A cluster of differences — one spot on the page worth looking at, with coordinates.",
  },
  {
    term: "Drifted section",
    def: "A horizontal band that had to slide to line up. Usually means something above it got taller or shorter.",
  },
  {
    term: "Alignment: banded",
    def: "Normascope found matching bands and lined them up. “None” means it compared the images whole, usually because they're very different sizes.",
  },
  {
    term: "Threshold",
    def: "Your setting: how much difference is acceptable before a frame gets flagged.",
  },
  {
    term: "Flagged / Needs attention",
    def: "Over your threshold. Not a failure — information. Nothing is blocked.",
  },
  {
    term: "Clean",
    def: "Under your threshold. A clean report is a real result, not an empty one.",
  },
  {
    term: "Fidelity mode",
    def: "The frame was compared against a design — a Figma frame, a folder of PNGs, or another URL.",
  },
  {
    term: "Baseline mode",
    def: "The frame was compared against a screenshot you approved earlier.",
  },
  {
    term: "Reference",
    def: "Whatever the frame is being compared to. The middle image in every row.",
  },
  {
    term: "Your build",
    def: "The screenshot of your app as it is right now.",
  },
  {
    term: "Diff overlay",
    def: "The picture with everything unchanged ghosted back and everything different painted in.",
  },
  {
    term: "Skipped",
    def: "The frame wasn't compared — usually no screenshot, or no route to capture it from. Never an error, never a failure.",
  },
];
