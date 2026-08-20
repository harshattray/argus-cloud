/**
 * Every word a reader can hit inside a report, defined without jargon.
 *
 * Rule for this file: define the term the way you would say it out loud to
 * someone who has never used a visual diff. If a definition needs a second
 * sentence to explain the first, the first sentence is wrong.
 *
 * **Two readers, one file.** `/report` on the marketing site prints `GLOSSARY`
 * as a list; the Cloud pages pop the same definitions up beside the number they
 * describe, through `<Explainer term="…">`. That is CLAUDE.md rule 1 applied to
 * prose: a definition written twice is a definition that will disagree with
 * itself, and the version a prospect reads before signing up is exactly the one
 * that must match the version they read afterwards.
 *
 * `id` is the lookup key *and* the anchor an `<Explainer>` builds its element id
 * from, so it has to stay a valid HTML id fragment: lower-case, hyphens, no
 * spaces. Renaming one silently breaks a popover rather than failing a build,
 * which is what `explainers` in `test/reportPage.test.mjs` is for.
 */

export interface GlossaryEntry {
  /** Stable key. Also the id fragment for the popover — keep it `[a-z-]`. */
  id: string;
  term: string;
  def: string;
}

/**
 * The report vocabulary. Shared by the marketing `/report` page and the hosted
 * report, because they describe the same artifact.
 */
export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "frame",
    term: "Frame",
    def: "One page, or one section of a page, that you're keeping an eye on.",
  },
  {
    id: "aligned-diff",
    term: "Aligned diff",
    def: "The main number. How much is genuinely different, after sliding shifted sections back into place.",
  },
  {
    id: "unaligned-diff",
    term: "Unaligned diff",
    def: "The same comparison before that sliding. When it's much bigger than the aligned number, something moved rather than broke.",
  },
  {
    id: "raw-diff",
    term: "Raw diff",
    def: "The rawest count, including the fuzzy edges around text. Usually safe to ignore.",
  },
  {
    id: "ssim",
    term: "SSIM",
    def: "How similar the structure is, from 0 to 100. High means the layout is intact and this is a paint difference; low means something structural broke.",
  },
  {
    id: "significant-region",
    term: "Significant region",
    def: "A cluster of differences — one spot on the page worth looking at, with coordinates.",
  },
  {
    id: "drifted-section",
    term: "Drifted section",
    def: "A horizontal band that had to slide to line up. Usually means something above it got taller or shorter.",
  },
  {
    id: "alignment-banded",
    term: "Alignment: banded",
    def: "Normascope found matching bands and lined them up. “None” means it compared the images whole, usually because they're very different sizes.",
  },
  {
    id: "threshold",
    term: "Threshold",
    def: "Your setting: how much difference is acceptable before a frame gets flagged.",
  },
  {
    id: "flagged",
    term: "Flagged / Needs attention",
    def: "Over your threshold. Not a failure — information. Nothing is blocked.",
  },
  {
    id: "clean",
    term: "Clean",
    def: "Under your threshold. A clean report is a real result, not an empty one.",
  },
  {
    id: "fidelity-mode",
    term: "Fidelity mode",
    def: "The frame was compared against a design — a Figma frame, a folder of PNGs, or another URL.",
  },
  {
    id: "baseline-mode",
    term: "Baseline mode",
    def: "The frame was compared against a screenshot you approved earlier.",
  },
  {
    id: "reference",
    term: "Reference",
    def: "Whatever the frame is being compared to. The middle image in every row.",
  },
  {
    id: "build",
    term: "Your build",
    def: "The screenshot of your app as it is right now.",
  },
  {
    id: "diff-overlay",
    term: "Diff overlay",
    def: "The picture with everything unchanged ghosted back and everything different painted in.",
  },
  {
    id: "skipped",
    term: "Skipped",
    def: "The frame wasn't compared — usually no screenshot, or no route to capture it from. Never an error, never a failure.",
  },
];

/**
 * Words that only exist once runs are kept somewhere.
 *
 * **Deliberately a second list, not more rows in the first.** `/report` on the
 * marketing site documents the local HTML report, and a local run has no history,
 * no credits and no share links. Printing "First drifted at" in that glossary
 * would describe a thing the reader cannot get from the thing being described.
 *
 * They are looked up through the same `explainer()` as the list above, so a
 * Cloud page never has to know which of the two a word came from.
 */
export const CLOUD_GLOSSARY: GlossaryEntry[] = [
  {
    id: "run",
    term: "Run",
    def: "One upload: everything a single `norma-scope` comparison measured, kept together.",
  },
  {
    id: "history",
    term: "History",
    def: "What this frame did on earlier runs. It is the one thing on this page a local report cannot produce — a run on your laptop only knows about itself.",
  },
  {
    id: "first-drift",
    term: "First drifted at",
    def: "The earliest run we hold where this frame went over the threshold. That commit is usually where the cause is, not the newest one.",
  },
  {
    id: "recurrence",
    term: "Times flagged",
    def: "How many runs have flagged this frame. Once is an incident; five times is something that keeps coming back.",
  },
  {
    id: "prior-runs",
    term: "Prior runs",
    def: "How many earlier runs of this frame the history is drawn from. This run is not counted in it.",
  },
  {
    id: "sparkline",
    term: "The line",
    def: "Aligned mismatch on each run, oldest on the left. A gap means that run measured nothing; a break means the comparison changed and the two stretches are not the same quantity.",
  },
  {
    id: "threshold-line",
    term: "Threshold line",
    def: "The flat line the trend is judged against, drawn as each run set it. It moves when you change the setting, so it is a line and not a fixed height.",
  },
  {
    id: "measurement-change",
    term: "Measurement changed",
    def: "The frame switched between fidelity and baseline here. Those compare against different things, so the numbers either side are not comparable.",
  },
  {
    id: "worst-mismatch",
    term: "Worst aligned mismatch",
    def: "The highest aligned diff of any frame in this run. It tells you how bad the worst one is, not how bad the run is on average.",
  },
  {
    id: "frames-compared",
    term: "Frames compared",
    def: "How many frames this run actually measured. Skipped frames are not in it.",
  },
  {
    id: "flagged-now",
    term: "Frames flagged now",
    def: "Frames whose own most recent run went over the threshold. Not the flagged count of the newest run — those differ whenever a frame was skipped.",
  },
  {
    id: "commit",
    term: "Commit",
    def: "The revision the build was captured from. Empty when the run came from a laptop rather than CI.",
  },
  {
    id: "pending-run",
    term: "Pending run",
    def: "An upload that started and never finished. It is never listed and never counted — a half-uploaded run is not a result.",
  },
  {
    id: "region-box",
    term: "Region box",
    def: "The rectangle a finding is talking about, drawn on the difference image. Click the coordinates to light it up.",
  },
  {
    id: "confidence",
    term: "Confidence",
    def: "How sure the model says it is. Low is not a reason to ignore it and high is not a reason to trust it — it is the model's own guess about its own guess.",
  },
  {
    id: "injection-suspected",
    term: "Injection suspected",
    def: "The model is reporting that the page's own content tried to give it instructions. It is a warning about the content, not a visual finding.",
  },
  {
    id: "explain",
    term: "Explain",
    def: "Sends this frame's images and numbers to a model and asks what changed. Costs credits, never changes the score, and never fails your build.",
  },
  {
    id: "deep-explain",
    term: "Deep explain",
    def: "The same question to a stronger model. Costs more credits and is worth it when the ordinary pass says it cannot tell.",
  },
  {
    id: "credits",
    term: "Credits",
    def: "Your monthly allowance for hosted AI. A price is set by what the call can cost us at worst, so it never moves after you press the button.",
  },
  {
    id: "overview",
    term: "History at a glance",
    def: "Every run we still hold, squeezed into one picture and spaced by date rather than by commit. It is for finding when something started; drag across it to see the actual runs.",
  },
  {
    id: "overview-band",
    term: "Range in a period",
    def: "The lowest and highest a frame measured during that slice of time. Both are real readings — nothing here is an average, so a single bad run cannot be smoothed away.",
  },
  {
    id: "overview-crossing",
    term: "Mixed period",
    def: "Some runs in that slice were over the threshold and some were not. Worth a look: it is usually a flaky capture or a change that landed mid-period.",
  },
  {
    id: "retention",
    term: "All retained",
    def: "Everything still stored for your organization. Runs are deleted after your plan's retention window, so this is all of your history, not all of time.",
  },
  {
    id: "share-link",
    term: "Share link",
    def: "A URL that opens this one report and nothing else. It can be revoked, it can expire, and it does not let the holder see any other run.",
  },
];

const BY_ID = new Map([...GLOSSARY, ...CLOUD_GLOSSARY].map((entry) => [entry.id, entry]));

/**
 * One definition by key.
 *
 * Throws on a key that does not exist rather than rendering an empty bubble.
 * A silent miss is the failure mode this whole file is arranged to avoid: the
 * popover would still open, and it would explain nothing.
 */
export function explainer(id: string): GlossaryEntry {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(`glossary: no entry "${id}"`);
  }
  return entry;
}
