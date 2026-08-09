/**
 * The showcase evidence set.
 *
 * Every number in this file came out of `norma-scope` running against a real
 * site, recorded in `argus-cloud/test-run/`. The regression and fidelity cases
 * were measured on 0.7.5; the MCP and pull-request cases on 0.7.3–0.7.4, which
 * predate the fixes and are unaffected by them (protocol, comment rendering).
 *
 * Doctrine, same as `run-data.ts`: never fabricate a number, never round one to
 * make it prettier, and never add a row that did not come out of a real run.
 * If a figure appears on the site it must be traceable to a case folder here.
 */

export const CLI_VERSION = "0.7.5";
export const MCP_VERSION = "0.2.2";

/* ─────────────────── case 01 — design fidelity, Bose ─────────────────── */

export const CASE_01 = {
  id: "case-01",
  slug: "fidelity-bose",
  question: "Does the build match the design?",
  title: "A third-party site against its own Figma file",
  /** Neither asset is ours — that is the point of the case. */
  site: "alina-kabanets.github.io/bose-landing-page",
  figmaFrame: "Bose (1260) · 1260×4596",
  measuredOn: "2026-08-05",
  aligned: 36.41,
  unaligned: 36.89,
  raw: 39.02,
  ssim: 62.2,
  regions: 10,
  driftedSections: 3,
  threshold: 5,
  alignment: "banded",
  /** The two genuine defects visible in the overlay. */
  defects: [
    "The shipped page uses entirely different photography from the design — the hero portrait, the three category blocks and the closing image are all different shots.",
    "The implementation's hero renders taller than the design's, so every section below it sits out of registration.",
  ],
  report: "/cases/case-01/report.html",
  images: {
    build: "/cases/case-01/build.png",
    design: "/cases/case-01/design.png",
    diff: "/cases/case-01/bose-full-page-diff.png",
  },
} as const;

/* ───────────── case 02 — visual regression, five real commits ────────── */

export interface Scenario {
  id: string;
  commit: string;
  intent: string;
  flagged: number;
  peak: number;
  note: string;
}

export const CASE_02_THRESHOLD = 0.5;
export const CASE_02_FRAMES = [
  "Norma — Hero",
  "Norma — Engine",
  "Norma — Try It",
  "Norma — Pull Requests",
  "Norma — Commands",
  "Articles — Index",
  "Lab — Index",
] as const;

export const SCENARIOS: Scenario[] = [
  {
    id: "s1",
    commit: "py-20 md:py-32 → py-12 md:py-20",
    intent: "Tighten the vertical rhythm.",
    flagged: 2,
    peak: 23.05,
    note: "Try It reads 8.30% aligned but 25.4% unaligned across 6 drifted sections — the gap between those two numbers is the diagnosis. Most of the change is content translating downward, not content changing.",
  },
  {
    id: "s2",
    commit: "max-w-6xl → max-w-5xl",
    intent: "Narrow the container.",
    flagged: 4,
    peak: 12.73,
    note: "Five characters, four of seven frames flagged, ten significant regions on the hero alone. No developer eyeballs a five-character diff and predicts that blast radius.",
  },
  {
    id: "s3",
    commit: "rounded-2xl pl-7 pr-5 py-5 → rounded-lg pl-5 pr-4 py-3",
    intent: "Restyle the install button.",
    flagged: 1,
    peak: 3.41,
    note: "Exactly one frame flagged, 7 regions, 1 drifted section — the button plus the reflow it causes below it. The other six frames stay at 0.00%. Precision, not just detection.",
  },
  {
    id: "s4",
    commit: "aspect-[4/3] → aspect-square",
    intent: "Square off the images.",
    flagged: 1,
    peak: 4.07,
    note: "The subtlest geometric change, localised to 2 regions. Commands registers 0.25% — real, below threshold, correctly not flagged.",
  },
  {
    id: "s5",
    commit: "paper: '#eee7e4' → '#e6ddd6'",
    intent: "Warm the paper background one step.",
    flagged: 5,
    peak: 97.36,
    note: "One hex. No layout, no markup, nothing moves — and five of seven frames flagged, four of them above 84%. This is the scenario the 0.7.5 sensitivity fix exists for: before it, this commit scored 0.00% and passed clean.",
  },
  {
    id: "s6",
    commit: "(no change)",
    intent: "The control.",
    flagged: 0,
    peak: 0.41,
    note: "Nothing changed. Nothing flagged. The six static frames read exactly 0.00%; the hero reads 0.41% because it holds a live CSS animation.",
  },
];

/**
 * The full measurement matrix — aligned mismatch % per frame per scenario.
 * `null` where a frame measured exactly 0. Bold on the site = flagged.
 */
export const MATRIX: { frame: string; values: (number | null)[] }[] = [
  { frame: "Norma — Hero", values: [0.4, 8.27, 3.41, 4.07, 87.6, 0.41] },
  { frame: "Norma — Engine", values: [null, null, null, null, 95.82, null] },
  { frame: "Norma — Try It", values: [8.3, 12.73, null, null, 3.26, null] },
  { frame: "Norma — Pull Requests", values: [23.05, 9.71, null, null, 0.11, null] },
  { frame: "Norma — Commands", values: [null, 0.73, null, 0.25, 84.96, null] },
  { frame: "Articles — Index", values: [null, null, null, null, 97.36, null] },
  { frame: "Lab — Index", values: [null, null, null, null, null, null] },
];

/** Which cells are above the 0.5% threshold — drives the emphasis styling. */
export const isFlagged = (v: number | null) => v !== null && v > CASE_02_THRESHOLD;

/**
 * What the sensitivity split changed. Left column is 0.7.4 (one shared colour
 * tolerance), right is 0.7.5 (0.15 fidelity / 0.03 baseline).
 */
export const SENSITIVITY_BEFORE_AFTER = [
  { what: "s5 Articles (colour token)", before: "0.00% clean", after: "97.36% flagged" },
  { what: "s1 Pull Requests", before: "15.16%", after: "23.05%" },
  { what: "s2 Try It", before: "4.18%", after: "12.73%" },
  { what: "s2 Hero", before: "3.43%", after: "8.27%" },
  { what: "s3 Hero", before: "1.62%", after: "3.41%" },
  { what: "s4 Hero", before: "0.84%", after: "4.07%" },
  { what: "Lab — Index (control)", before: "0.00%", after: "0.00%" },
];

/** The measured colour-detection floor. Honesty bounds the claim. */
export const COLOUR_FLOOR = [
  { from: "#eee7e4", to: "#efeae7", delta: "(1, 3, 3)", result: "0 of 7 flagged" },
  { from: "#eee7e4", to: "#ece5e1", delta: "(2, 2, 3)", result: "0 of 7 flagged" },
  { from: "#eee7e4", to: "#e9e0da", delta: "(5, 7, 10)", result: "0 of 7 flagged" },
  { from: "#eee7e4", to: "#e6ddd6", delta: "(8, 10, 14)", result: "5 of 7 flagged" },
];

export const CASE_02 = {
  id: "case-02",
  slug: "regression-portfolio",
  question: "Did anything change that I didn't mean to change?",
  title: "Five one-line commits, each caught and localised",
  threshold: CASE_02_THRESHOLD,
  frameCount: 7,
  viewport: "1440px, 1× scale",
  reports: {
    s2: "/cases/case-02/s2/report.html",
    s5: "/cases/case-02/s5/report.html",
  },
  images: {
    geometry: "/cases/case-02/s2/norma-hero-diff.png",
    recolour: "/cases/case-02/s5/articles-index-diff.png",
  },
} as const;

/* ──────────────────────────── case 04 — MCP ───────────────────────────── */

export const AGENT_LOOP = [
  { step: "Agent edits the UI", detail: "max-w-6xl → max-w-5xl in Norma.tsx" },
  { step: "Agent calls compare", detail: "4 of 7 frames flagged (threshold 0.5%)" },
  { step: "Agent reads the worst frame and reverts", detail: "Norma — Try It, 4.18%, 6 regions" },
  { step: "Agent calls compare again", detail: "0 of 7 frames flagged" },
];

export const AGENT_SCORES = [
  { frame: "Norma — Hero", score: "3.42%", ssim: "88.2", flagged: true },
  { frame: "Norma — Engine", score: "0%", ssim: "100", flagged: false },
  { frame: "Norma — Try It", score: "4.18%", ssim: "77.6", flagged: true },
  { frame: "Norma — Pull Requests", score: "3.57%", ssim: "84.1", flagged: true },
  { frame: "Norma — Commands", score: "0.51%", ssim: "97.8", flagged: true },
  { frame: "Articles — Index", score: "0%", ssim: "100", flagged: false },
  { frame: "Lab — Index", score: "0%", ssim: "100", flagged: false },
];

/** Verbatim from `.bridge/.mcp-audit.log` during the live run. */
export const AUDIT_REFUSALS = [
  {
    time: "2026-08-05T08:39:37.505Z",
    tool: "compare",
    target: "http://169.254.169.254/latest/meta-data/",
    reason: "link-local/metadata range is blocked even when configured",
  },
  {
    time: "2026-08-05T08:39:37.506Z",
    tool: "compare",
    target: "../../../../etc/passwd",
    reason: "target path escapes the project",
  },
];

export const CASE_04 = {
  id: "case-04",
  slug: "mcp-agent",
  question: "Can an agent check its own work?",
  title: "A live agent loop over stdio JSON-RPC",
  flaggedBefore: 4,
  flaggedAfter: 0,
  frames: 7,
} as const;

/* ───────────────────── case 05 — the pull request ────────────────────── */

export const STICKY_COMMENT_ROWS = [
  { frame: "Norma — Hero", mode: "baseline", aligned: "3.4%", ssim: "88", flagged: true },
  { frame: "Norma — Engine", mode: "baseline", aligned: "0.0%", ssim: "100", flagged: false },
  { frame: "Norma — Try It", mode: "baseline", aligned: "4.2%", ssim: "78", flagged: true },
  { frame: "Norma — Pull Requests", mode: "baseline", aligned: "3.6%", ssim: "84", flagged: true },
  { frame: "Norma — Commands", mode: "baseline", aligned: "0.5%", ssim: "98", flagged: true },
  { frame: "Lab — Index", mode: "baseline", aligned: "0.0%", ssim: "100", flagged: false },
];

export const CASE_05 = {
  id: "case-05",
  slug: "pr-github-action",
  question: "What does my team see on a PR?",
  title: "A real branch, a real sticky comment",
  flagged: 4,
  compared: 6,
  threshold: 0.5,
  report: "/cases/case-05/report.html",
} as const;

/* ──────────────── what we found in our own tool ──────────────────────── */

/**
 * The four defects the evidence run surfaced, all fixed and published in
 * 0.7.5. This section converts sceptics better than any feature list: a vendor
 * who measures their own tool, finds it blind, fixes it and publishes the
 * before-and-after is making a claim a feature list cannot make.
 */
export const OWN_FINDINGS = [
  {
    head: "Regression mode was blind to colour",
    body: "Both modes shared a colour tolerance meant for Figma's text rasterisation. A whole-section background change plus every heading dropping from weight 900 to 700 — 68% of the frame's pixels — scored 0.00% at SSIM 100. Design tokens, font weights, opacity and shadows were invisible in the mode whose entire job is catching regressions.",
    fix: "Sensitivity is now split per mode. Every number on this site was re-measured afterwards.",
  },
  {
    head: "The capture viewport used an artboard height",
    body: "Setup persisted the design frame's height as the browser viewport height. A design frame is an artboard — routinely thousands of pixels tall — while a viewport is a window. Every vh unit then resolved against a window no user has, so a 100vh hero rendered full-artboard tall and everything below it shifted.",
    fix: "The Bose case read 79.7% with a size warning and no alignment. The same config now reads 36.4% with banded alignment. The 79.7% was the tool measuring its own misconfiguration.",
  },
  {
    head: "The package would not install on npm 10",
    body: "The optional Anthropic SDK peer carried an upper version bound. “Optional” only tells npm the peer may be absent — it does not mean any version satisfies the range. Any project already using the SDK outside that range could not install Normascope at all. npm 11 tolerated it, so it was invisible on a maintainer's machine.",
    fix: "Both manifests now declare a floor with no ceiling, with a regression test that fails if the bound comes back.",
  },
  {
    head: "The agent tool could report a stale all-clear",
    body: "The MCP compare tool did not re-capture. An agent would edit the UI, call compare, and be told 0 of 7 flagged — the score of the app before its edit, presented as the score after. A false all-clear from the tool whose whole job is catching what you cannot see.",
    fix: "compare now captures first in both of its modes. Opting out is possible but has to be asked for explicitly.",
  },
];

/* ───────────────────────────── the case index ─────────────────────────── */

export const CASE_INDEX = [
  {
    n: "01",
    href: "#fidelity",
    question: CASE_01.question,
    headline: "36.4% off its own Figma frame",
    sub: "A third-party site, its published design, and ten significant regions between them.",
  },
  {
    n: "02",
    href: "#regression",
    question: CASE_02.question,
    headline: "5 one-line commits, all caught",
    sub: "0.73% to 97.36%, with the control frames silent at exactly 0.00%.",
  },
  {
    n: "03",
    href: "#agent",
    question: CASE_04.question,
    headline: "4 flagged → fix → 0 flagged",
    sub: "A live agent loop, plus two hostile captures refused and logged.",
  },
  {
    n: "04",
    href: "#pr",
    question: CASE_05.question,
    headline: "4 of 6 frames flagged",
    sub: "The sticky comment a real branch actually produced.",
  },
];
