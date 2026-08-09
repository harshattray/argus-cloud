/**
 * The CLI surface, transcribed from normascope101.md §13 and §6.
 *
 * Doctrine (docs/normascopeWeb.md §6): never describe behaviour the tool does
 * not have. Every line here traces to the 101 or to COMMANDS.md. If a flag
 * changes upstream, this file changes with it — the site is not allowed to
 * drift from the product.
 */

export type Group = "Setup" | "Capture" | "Compare" | "Share" | "AI" | "Utility";

export interface Command {
  name: string;
  cmd: string;
  group: Group;
  oneLine: string;
  when: string;
  reads: string;
  writes: string;
  detail: string[];
}

export const GROUPS: { label: Group; color: string }[] = [
  { label: "Setup", color: "text-sky-600" },
  { label: "Capture", color: "text-emerald-600" },
  { label: "Compare", color: "text-pink-600" },
  { label: "Share", color: "text-orange-600" },
  { label: "AI", color: "text-violet-600" },
  { label: "Utility", color: "text-text/40" },
];

export const COMMANDS: Command[] = [
  {
    name: "init",
    cmd: "npx norma-scope init",
    group: "Setup",
    oneLine: "Set up this project",
    when: "Once per project, or again if you switch design sources",
    reads: "your answers, the design source's API",
    writes: ".bridge/config.json, the .bridge/ folders, .gitignore entries, a pre-commit hook",
    detail: [
      "Asks for your design file and token, then lists the frames in it so you can pick the ones you care about.",
      "Saves each frame's real design dimensions — capturing your app at a different size than the design is the number one cause of a scary score that means nothing.",
      "Creates the .bridge/ folders, adds the throwaway ones to .gitignore, and installs a pre-commit hook (backing up any existing hook first).",
      "Prints the exact filename and pixel size it expects for every screenshot.",
      "Figma-first, but you can hand-edit the config afterwards to point at an image folder or a URL instead.",
    ],
  },
  {
    name: "doctor",
    cmd: "npx norma-scope doctor",
    group: "Setup",
    oneLine: "Tell me what's broken before I start",
    when: "After init, and any time something looks wrong",
    reads: "config, token, design file, your app URL",
    writes: "nothing — diagnosis only",
    detail: [
      "Nine checks in order: config parses, token exists, token is valid, design file reachable, every frame ID exists, app URL responds, a browser is available.",
      "Then per frame: does the route load, and does the selector actually match something.",
      "It only diagnoses. It never edits your files.",
    ],
  },
  {
    name: "auto",
    cmd: "npx norma-scope auto",
    group: "Capture",
    oneLine: "Take the screenshots for me",
    when: "When your app is running and you want fresh captures",
    reads: "config + your running app",
    writes: ".bridge/screenshots/*.png",
    detail: [
      "Launches headless Chromium — your installed Chrome or Edge when available, so usually nothing to download.",
      "Visits baseUrl + route for each frame at the design's own dimensions, waits for the page to settle, then captures a CSS selector, the viewport, or the full page.",
      "Always at 1× scale, so a Retina laptop doesn't silently produce 2× images.",
      "A frame with no route is skipped politely — that's a “you take this photo yourself” frame. An unreachable app is a warning, and still exits 0.",
      "It is the camera, not the judge: auto never compares anything and never prints a score.",
    ],
  },
  {
    name: "compare",
    cmd: "npx norma-scope compare",
    group: "Compare",
    oneLine: "How different is it?",
    when: "Runs on every commit via the hook — or by hand any time",
    reads: ".bridge/screenshots/ + the reference your source points at",
    writes: ".bridge/diff/, report.html, and summary.json with --json",
    detail: [
      "Anti-aliasing-aware pixel diff, so subpixel font rendering stops drowning out real bugs.",
      "Band alignment: both images are sliced into horizontal bands and each is searched ±120px for the offset that best matches, so one shifted section doesn't paint the whole page red.",
      "Reports both numbers — aligned (the honest one) and unaligned (the raw one, kept for diagnosis).",
      "SSIM as a second opinion, and mismatched pixels clustered into significant regions with coordinates.",
      "Writes a self-contained report.html with side-by-side images, the diff overlay, a lightbox and the section table.",
    ],
  },
  {
    name: "compare --target",
    cmd: "npx norma-scope compare --target mock.png --url http://localhost:3000",
    group: "Compare",
    oneLine: "Zero-config: this picture versus this URL",
    when: "The fastest possible answer — no init, no config, no account",
    reads: "the mock PNG and the --url you pass",
    writes: "screenshot, diff, report.html, and summary.json — always",
    detail: [
      "No config file needed. It captures the URL and diffs it against your mock.",
      "The mock must live inside your project folder — a deliberate guardrail, because AI agents drive this command.",
      "Without --selector it captures the full page; with one it captures just that element.",
      "Its threshold is fixed at 5%. The configurable threshold belongs to the configured flow.",
      "This is the whole product in one command: change some CSS, run it again, watch the number move.",
    ],
  },
  {
    name: "check",
    cmd: "npx norma-scope check",
    group: "Compare",
    oneLine: "auto, then compare",
    when: "The daily driver once your app runs locally",
    reads: "—",
    writes: "everything auto and compare write",
    detail: [
      "Runs auto and then compare back to back.",
      "Exactly equivalent to running the two separately — one command instead of two.",
    ],
  },
  {
    name: "baseline",
    cmd: "npx norma-scope baseline",
    group: "Capture",
    oneLine: "This is correct now — tell me if it ever changes",
    when: "Once the UI is in a state you're happy with",
    reads: ".bridge/screenshots/",
    writes: ".bridge/baseline/ plus a manifest — commit it",
    detail: [
      "Copies the current captures into the baseline folder and records a hash.",
      "From then on, baseline-mode frames compare against those instead of a design — classic visual regression, no designer required.",
      "Baseline frames never touch the design source at all.",
      "When a change is intended, run baseline again to approve the new look.",
      "Mixing modes in one config is fine — some frames against a design, others against yesterday.",
    ],
  },
  {
    name: "snapshot",
    cmd: "npx norma-scope snapshot",
    group: "Share",
    oneLine: "Commit design exports so CI needs no token",
    when: "Before wiring up CI",
    reads: "the design file",
    writes: ".bridge/design/ — commit it",
    detail: [
      "Writes committable design exports, so CI then runs with zero design-source API calls and zero tokens.",
      "snapshot --check warns you if the live design has drifted from the committed snapshot, and still exits 0.",
      "Backed by a degradation ladder so an outage never fails your build — and every rung down prints an honest message.",
      "Not applicable to the images or url sources: those are already local and reproducible.",
    ],
  },
  {
    name: "comment",
    cmd: "npx norma-scope comment",
    group: "Share",
    oneLine: "Render the PR comment markdown",
    when: "In any CI system, after compare --json",
    reads: ".bridge/reports/summary.json",
    writes: "markdown on stdout",
    detail: [
      "Prints the same per-frame table the GitHub Action posts, so you can pipe it anywhere — Slack, a CI summary, or a manual paste.",
      "The Action posts it as one sticky comment, finding its own previous comment by a hidden marker and editing it in place instead of spamming the PR.",
      "If a baseline summary from the main branch is available, the comment gains a delta column — not just “8.4%” but “8.4% (+2.1% since main)”.",
    ],
  },
  {
    name: "explain",
    cmd: "npx norma-scope explain",
    group: "AI",
    oneLine: "Why did it drift?",
    when: "Opt-in, off by default, on your own API key",
    reads: "screenshots, diffs, captured DOM context, your API key",
    writes: "findings in the terminal and in the report",
    detail: [
      "Needs \"explain\": { \"enabled\": true } in your config, the optional @anthropic-ai/sdk installed, and your own ANTHROPIC_API_KEY.",
      "The SDK is an optional dependency — roughly 13 MB — so only people who actually run an analysis download it.",
      "Before anything leaves your machine the payload is scanned for secrets. A hit blocks the analysis and names the file; it does not silently redact.",
      "Findings are hypotheses with a selector, a CSS hypothesis and a suggested fix — labelled “generated, verify before applying”, and never auto-applied.",
      "It can only ever describe. It can never change a score or fail a build.",
      "explain <frame> analyses one frame, --all every compared frame, --deep the stronger model.",
    ],
  },
  {
    name: "clean",
    cmd: "npx norma-scope clean",
    group: "Utility",
    oneLine: "Delete screenshots, diffs, reports and cache",
    when: "Switching design sources, or reclaiming disk space",
    reads: "—",
    writes: "empties screenshots/, diff/, reports/ and the cache",
    detail: [
      "Each folder is recreated empty, so compare works immediately without re-running init.",
      "config.json, baseline/ and design/ are left alone.",
      "The next compare after a clean re-fetches from the design source to rebuild the cache.",
    ],
  },
];

export const FLAGS = [
  { flag: "--json", effect: "Also write summary.json (schema v2, published and validated)" },
  { flag: "--full", effect: "Embed full-resolution images in the report" },
  { flag: "--fresh", effect: "Bypass the design cache and refetch" },
  { flag: "--strict", effect: "Exit 1 on a measured regression — the only way a job turns red" },
  { flag: "--all", effect: "Explain every compared frame, not just the flagged ones" },
  { flag: "--deep", effect: "Use the stronger, more expensive model" },
  { flag: "--check", effect: "On snapshot: has the live design drifted from the committed one?" },
  { flag: "--selector", effect: "On target mode: capture one element instead of the full page" },
];

/** normascope101.md §6 — "Which command do I want?" */
export const DECISIONS = [
  { want: "Just tell me if this page matches this picture.", answer: "compare --target x.png --url …" },
  { want: "Do that for five pages, on every commit.", answer: "init, then check" },
  { want: "Nothing loaded, or it says skipped.", answer: "doctor" },
  { want: "There's no designer — I just don't want surprises.", answer: "mode: \"baseline\", then baseline" },
  { want: "CI shouldn't need a design token.", answer: "snapshot, and commit .bridge/design/" },
  { want: "Fail the build on a regression.", answer: "compare --strict" },
  { want: "But why did it move?", answer: "explain" },
];
