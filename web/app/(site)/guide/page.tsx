import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CloudBand, Eyebrow, Section, Shot } from "../_components/ui";
import { CopyLine } from "../_components/CopyLine";
import {
  FlowAutoCapture,
  FlowCI,
  FlowChooseWorkflow,
  FlowExplain,
  FlowThreeCommands,
} from "./flows";

export const metadata: Metadata = {
  // The layout already appends " — Normascope", so the old title rendered the
  // brand twice. The three words after the colon are what people actually
  // search for when they are stuck.
  title: "User guide: setup, commands, troubleshooting",
  description:
    "What each command does, what must happen before and after it, which workflow to choose, and what to check when a run does not behave as expected.",
  alternates: { canonical: "/guide" },
};

/* ── Small presentational pieces ─────────────────────────────────────────── */

/**
 * How every code block on this page behaves.
 *
 * From `sm` up it scrolls inside itself, which keeps configuration readable at
 * its natural line lengths. Below `sm` it wraps instead, because a horizontal
 * scroller nested inside a vertically-scrolling page is close to invisible on a
 * phone — twelve of the blocks here ran past the viewport by up to 255px, and a
 * reader has no way to tell a cut line from a short one. Wrapped JSON is uglier
 * than scrolled JSON; unreadable JSON is worse than both.
 *
 * ASCII diagrams opt out with `CODE_SCROLL` — wrapping destroys the drawing.
 */
const CODE_WRAP = "max-w-full overflow-x-auto whitespace-pre-wrap wrap-anywhere sm:whitespace-pre sm:wrap-normal";
const CODE_SCROLL = "max-w-full overflow-x-auto";

/** A block of commands or configuration. Scrolls at `sm` and up, wraps below. */
const Code = ({ children, className = "" }: { children: string; className?: string }) => (
  <pre
    className={`${CODE_WRAP} rounded-xl bg-ink px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80 ${className}`}
  >
    <code>{children}</code>
  </pre>
);

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-black/8 bg-white/65 p-5 md:p-6 ${className}`}>{children}</div>
);

const Label = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <p className={`eyebrow mb-3 ${dark ? "text-white/40" : "text-clay"}`}>{children}</p>
);

/** A numbered list. The guide uses these constantly, so they get one shape. */
const Steps = ({ items, dark = false }: { items: readonly string[]; dark?: boolean }) => (
  <ol className="space-y-3">
    {items.map((item, i) => (
      <li key={item} className="flex gap-3">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
            dark ? "bg-white/10 text-white/70" : "bg-clay/15 text-clay-deep"
          }`}
        >
          {i + 1}
        </span>
        <p className={`text-[14px] leading-relaxed ${dark ? "text-white/60" : "text-text/65"}`}>{item}</p>
      </li>
    ))}
  </ol>
);

/* ── Content, taken from USER-GUIDE.md ───────────────────────────────────── */

const REFERENCES = [
  ["A Figma frame", "design fidelity"],
  ["An approved browser capture", "visual regression, or baseline mode"],
  ["A local PNG directory", "no design service at all"],
  ["A second URL or environment", "staging against production"],
] as const;

const PIPELINE = `your UI
  │
  ├─ manual screenshot ───────┐
  └─ \`auto\` / \`check\` capture ─┤
                               ▼
                    \`compare\` against reference
                               │
                    diff + report + optional JSON
                               │
                    optional \`explain\` (AI hypothesis)`;

const WORKFLOWS = [
  ["First-time project setup", "npx norma-scope init", "Figma or configured source"],
  ["I want to take screenshots myself", "init, then compare", "Figma, images, or URL"],
  ["My app is already running and routes are configured", "doctor, then check", "Figma or configured source"],
  ["I want to compare two browser builds", "configure URL source, then auto + compare", "second URL"],
  ["I want to catch regressions after approving a good build", "baseline, then compare", "committed baseline"],
  ["I want design exports committed and CI to work without Figma calls", "snapshot, then compare", "committed snapshot"],
  ["I need a CI or PR result", "compare --json, then comment", "configured source"],
  ["I need to understand why a frame differs", "explain", "existing comparison"],
  ["I changed the design and need fresh Figma exports", "compare --fresh", "Figma"],
  ["My local generated files are stale or confusing", "clean", "none"],
] as const;

const INIT_BEFORE = [
  "Have the Figma file URL and a Figma personal access token ready, if you are using Figma.",
  "Run the command from the project root — the directory containing the app source.",
  "If you want automatic capture, know the URL where the app will run. The app does not need to be running during init.",
] as const;

const FRAME_JSON = `{
  "label": "Pricing page",
  "screenshot": "pricing-page.png",
  "figmaFrameId": "123:456",
  "width": 1440,
  "height": 2400,
  "route": "/pricing",
  "capture": "fullPage"
}`;

const DOCTOR_RESULT = [
  ["Pass", "The check is usable."],
  ["Warn", "The workflow may still run, but inspect the message."],
  ["Fail", "Fix this before interpreting visual results."],
] as const;

const MANUAL_STEPS = [
  "npx norma-scope init",
  "Build or change the UI",
  "Open the page at the design frame's width",
  "Capture the full page or exact target region",
  "Save it as .bridge/screenshots/<expected-name>.png",
  "npx norma-scope compare",
  "Open .bridge/reports/report.html",
] as const;

const AUTO_BEFORE = [
  "Ensure .bridge/config.json has app.baseUrl.",
  "Give each automatic frame a route.",
  "Add selector, capture, viewport, waitForSelector or waitMs only when needed.",
  "Start the app yourself. Normascope does not start the development server.",
] as const;

const AUTO_CONFIG = `{
  "app": { "baseUrl": "http://localhost:3000" },
  "frames": [
    {
      "label": "Dashboard",
      "screenshot": "dashboard.png",
      "figmaFrameId": "123:456",
      "width": 1440,
      "height": 1800,
      "route": "/dashboard",
      "capture": "fullPage",
      "waitForSelector": "[data-testid='dashboard-ready']"
    }
  ]
}`;

const CAPTURE_MODES = [
  ["selector", "captures the first matching element"],
  ["viewport", "captures the visible browser viewport"],
  ["fullPage", "captures the entire page"],
] as const;

const COMPARE_VARIANTS = `# Fetch updated Figma exports instead of using cache
npx norma-scope compare --fresh

# Include full-resolution images in the HTML report
npx norma-scope compare --full

# Write machine-readable output for CI or integrations
npx norma-scope compare --json

# Exit 1 when a compared frame exceeds threshold
npx norma-scope compare --strict

# Combine flags
npx norma-scope compare --fresh --json --strict`;

const READING = [
  "Lower aligned mismatch percentage is better.",
  "SSIM and significant regions provide additional context.",
  "A dimension warning usually means an incorrect capture size, scaling, or capture mode.",
  "A skipped frame is not a passing comparison. Investigate its skip reason.",
  "A difference is evidence, not a decision. Confirm whether the change was intended.",
] as const;

const SOURCES = [
  ["Figma", `{ "source": { "type": "figma" } }`, "The reference is a design frame."],
  ["Images", `{ "source": { "type": "images", "dir": "test/visual-reference" } }`, "Use this when there is no Figma dependency."],
  ["URL", `{ "source": { "type": "url", "baseUrl": "https://production.example.com" } }`, "Use this for staging against production, or preview against production."],
] as const;

const URL_CONFIG = `{
  "source": {
    "type": "url",
    "baseUrl": "https://shop.example.com"
  },
  "app": {
    "baseUrl": "http://localhost:3000"
  },
  "frames": [
    {
      "label": "Product page",
      "screenshot": "product-page.png",
      "route": "/products/red-shoes",
      "capture": "fullPage",
      "viewport": {
        "width": 1440,
        "height": 900
      }
    }
  ]
}`;

const URL_RESULT = `local capture:     http://localhost:3000/products/red-shoes
reference capture: https://shop.example.com/products/red-shoes`;

const URL_WHAT_HAPPENS = [
  "auto opens the local baseUrl plus the route.",
  "auto saves the local screenshot as .bridge/screenshots/product-page.png.",
  "compare opens the source baseUrl plus the same route.",
  "compare captures production as the reference image.",
  "compare diffs local against production.",
  "compare writes .bridge/diff/product-page-diff.png and .bridge/reports/report.html.",
] as const;

const URL_CHECKS = [
  "Open both URLs yourself.",
  "Check that the same product, price, images, and availability are displayed.",
  "Check that the same cookie banner, navigation, and logged-in state are visible.",
  "Check that both pages finished loading before capture.",
  "Only then decide whether the difference is a CSS or layout regression.",
] as const;

const BASELINE_STEPS = [
  'Configure the frame with "mode": "baseline".',
  "Capture the known-good build manually or with auto.",
  "Run npx norma-scope baseline.",
  "Review the committed baseline files.",
  "On later changes, run npx norma-scope compare.",
] as const;

const CI_NOTES = [
  "CI must have the required design token unless you use committed snapshots or local images.",
  "Automatic capture requires a running preview server and routes that CI can reach.",
  "If CI needs a hard failure, use --strict. The default pre-commit flow is intentionally non-blocking.",
  "A skipped frame should be treated as a coverage problem even if the process exits successfully.",
] as const;

const EXPLAIN_BEFORE = [
  "Run compare first, so a current comparison exists.",
  "Enable explanation in .bridge/config.json.",
  "Install the optional SDK if required.",
  "Set ANTHROPIC_API_KEY in the environment. Never put it in the config and never commit it.",
  "Review SECURITY-LLM.md before sending project context to an external provider.",
] as const;

const STUCK = [
  [
    "“No app.baseUrl configured”",
    "You ran auto or check without an automatic capture URL. Add app.baseUrl, or use the manual screenshot workflow.",
  ],
  [
    "“No screenshot found”",
    "The frame has no PNG at the exact configured path. Either start the app and run auto, or place a correctly named PNG in .bridge/screenshots/.",
  ],
  [
    "Every frame is skipped by auto",
    "Check that each intended frame has a route. Frames without routes are intentionally manual. Then run doctor.",
  ],
  [
    "The diff percentage is unexpectedly huge",
    "Check, in order: the filename matches the config; the width and scale match the design; you captured the full page when the reference is full page; the correct route, authentication state, fonts and data loaded; the Figma cache is current; the selector or viewport is the intended region. Do not lower the threshold until capture dimensions and state are correct.",
  ],
  [
    "compare says the design is unavailable",
    "Run doctor. Check the token, file and frame access, network, and cache. If the design was previously cached, the comparison may still be able to use it. For stable CI, use snapshot or an image source.",
  ],
  [
    "explain does nothing or reports no frames",
    "Run a new compare, confirm at least one frame was compared, enable explanation, install the optional SDK, and export ANTHROPIC_API_KEY. Use explain --all to analyse non-flagged frames deliberately.",
  ],
  [
    "The report is too large",
    "Open the normal report first; it uses thumbnails. Use compare --full only when full-resolution embedding is worth the larger file. The full-resolution PNGs stay in the local output directories.",
  ],
  [
    "I expected a non-zero exit but got zero",
    "Most commands are intentionally diagnostic and non-blocking. Use --strict for measured comparison regressions. Skipped frames are not measured regressions, so enforce capture coverage separately in CI.",
  ],
] as const;

const COOKBOOK = [
  {
    tag: "Example A",
    title: "First setup for a pricing page",
    intro:
      "You have a web app in a folder called storefront. Your app runs on port 3000 and the page you care about is /pricing.",
    code: `cd ~/projects/storefront
npx norma-scope init`,
    body: "During the prompts, choose the Figma frame named Pricing Page and enter http://localhost:3000. Then open .bridge/config.json and make sure the frame contains “route”: “/pricing” and “capture”: “fullPage”.",
    then: `npm run dev
npx norma-scope doctor`,
    close: "If doctor reports that the route is reachable, the project is ready for the next example.",
  },
  {
    tag: "Example B",
    title: "Automatic screenshot and compare",
    intro:
      "You changed the pricing page and want Normascope to capture it and compare it with Figma. Keep the app running in one terminal and run the check in another.",
    code: `npm run dev

npx norma-scope check
open .bridge/reports/report.html`,
    close:
      "The report should show the current pricing screenshot, the Figma reference, the diff, and the mismatch score. If no screenshot appears, check that the route is /pricing and that the app is still running.",
  },
  {
    tag: "Example C",
    title: "Manual screenshot of a login modal",
    intro:
      "The login modal appears only after a human clicks Sign in, so automatic capture is not suitable.",
    steps: [
      "Open the login page in your browser.",
      "Click Sign in until the modal is visible.",
      "Set the browser width to the width printed by init.",
      "Use the browser command Capture full size screenshot.",
      "Rename the downloaded file to login-modal.png.",
      "Move it into .bridge/screenshots/.",
    ],
    code: `npx norma-scope compare
open .bridge/reports/report.html`,
    close:
      "If the report says no screenshot found, the filename is probably different from the name in .bridge/config.json. Rename the file; do not invent a new name.",
  },
  {
    tag: "Example D",
    title: "Only compare a screenshot that already exists",
    intro:
      "You already have dashboard.png in .bridge/screenshots/ and do not need a new browser capture.",
    code: `npx norma-scope compare`,
    close: "Do not run auto first. Compare reads the screenshot already on disk.",
  },
  {
    tag: "Example E",
    title: "The designer changed Figma",
    intro: "You compared the page yesterday, but the designer changed the Figma hero section today.",
    code: `npx norma-scope compare --fresh`,
    close:
      "Fresh means “download the current Figma export now”. The ordinary compare command may use the cached export from yesterday.",
  },
  {
    tag: "Example F",
    title: "Fail a pull request when the UI regresses",
    intro: "Run the check in strict mode.",
    code: `npx norma-scope check --strict`,
    close:
      "Exit code 0 means every compared frame stayed within the threshold. Exit code 1 means at least one compared frame exceeded it. If the command succeeds but you expected a failure, look for skipped frames. A skipped frame was not actually tested.",
  },
  {
    tag: "Example G",
    title: "Make a known-good browser page a regression baseline",
    intro:
      "You have approved the current checkout page and want future changes checked against this exact browser rendering. Add mode baseline to the frame in .bridge/config.json, then:",
    code: `npx norma-scope auto
npx norma-scope baseline

# after future code changes
npx norma-scope check --strict`,
    close:
      "Commit the generated baseline files. If a change is intentional, review the report and run baseline again to approve the new version. Do not approve a baseline before looking at the report.",
  },
  {
    tag: "Example H",
    title: "Compare staging with production",
    intro:
      "Production is the reference. Staging is the version you want to test. In .bridge/config.json, use:",
    code: `"source": {
  "type": "url",
  "baseUrl": "https://www.example.com"
},
"app": {
  "baseUrl": "https://staging.example.com"
}`,
    then: `npx norma-scope doctor
npx norma-scope check`,
    close:
      "Both sites must show comparable content. If production has five products and staging has two, the diff may be caused by different data, not different CSS.",
  },
  {
    tag: "Example I",
    title: "Create a report for a PR",
    intro: "Run the comparison and create machine-readable output, then create the PR comment.",
    code: `npx norma-scope compare --json --strict
npx norma-scope comment > pr-comment.md`,
    close:
      "The order matters. comment reads the summary created by compare --json; it does not perform a comparison itself.",
  },
  {
    tag: "Example J",
    title: "Ask AI why one frame differs",
    intro: "First create a comparison, then explain one frame.",
    code: `npx norma-scope compare
npx norma-scope explain pricing-page.png`,
    close:
      "The result is a suggestion such as “the heading may have moved because the font size changed”. Check the CSS yourself. To analyse every frame use explain --all; to use the deeper model use explain --deep. Both can make more provider calls, so use them deliberately.",
  },
  {
    tag: "Example K",
    title: "Save design references for CI",
    intro: "Run this on a machine that has Figma access.",
    code: `npx norma-scope snapshot
git add .bridge/design
git commit -m "Add visual design snapshot"`,
    close:
      "After that, CI can compare against the committed design export without needing a Figma token on every run.",
  },
  {
    tag: "Example L",
    title: "Remove stale generated files",
    intro: "You switched to another Figma file and old screenshots are confusing you.",
    code: `npx norma-scope clean
npx norma-scope auto
npx norma-scope compare`,
    close:
      "Clean removes generated screenshots, diffs, reports and cache. It does not remove .bridge/config.json. If you only want a new Figma export, use compare --fresh instead.",
  },
  {
    tag: "Example M",
    title: "Use a coding agent with MCP",
    intro:
      "After starting your app, ask the coding agent to compare the configured page after making a UI change. The safe loop is:",
    code: `change code
compare current page
read the diff regions
fix code
compare again`,
    close:
      "If capture is refused, configure the exact allowed app origin. Do not disable the origin policy just because an agent asks.",
  },
] as const;

const DAILY = `# Once per project
npx norma-scope init
npx norma-scope doctor

# Every feature change
npm run dev
npx norma-scope check
open .bridge/reports/report.html

# If the designer changed the Figma frame
npx norma-scope compare --fresh

# If the result is difficult to diagnose
npx norma-scope explain pricing-page.png

# Before opening a PR
npx norma-scope compare --json --strict
npx norma-scope comment`;

const DIAGRAMS = [
  {
    title: "Choosing a workflow",
    body: "What to run, and in what order, the first time and every time after.",
    chart: <FlowChooseWorkflow />,
  },
  {
    title: "Automatic capture and comparison",
    body: "How a running page becomes a PNG, and how that PNG becomes a report.",
    chart: <FlowAutoCapture />,
  },
  {
    title: "auto, compare and check",
    body: "auto creates screenshots. compare scores screenshots already on disk. check runs both.",
    chart: <FlowThreeCommands />,
  },
  {
    title: "CI and pull requests",
    body: "Where the job fails, and where the comment comes from.",
    chart: <FlowCI />,
  },
  {
    title: "Optional AI explanation",
    body: "What has to be true before anything leaves your machine.",
    chart: <FlowExplain />,
  },
] as const;

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function GuidePage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-paper px-4 md:px-8">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute right-[-9rem] top-[-11rem] h-[30rem] w-[30rem] rounded-full bg-[#e5b5a9]/45 blur-3xl" />
          <div className="absolute bottom-[-10rem] left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[#d8c6df]/40 blur-3xl" />
        </div>
        <div className="mx-auto max-w-5xl py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="min-w-0 lg:col-span-7">
              <Eyebrow>User guide</Eyebrow>
              <h1 className="display-xl mb-7 max-w-3xl">The page to come back to when you&rsquo;re stuck.</h1>
              <p className="max-w-2xl text-xl leading-snug text-text/70 md:text-2xl">
                What each command does, what must happen before and after it, which workflow to
                choose, and what to check when a run does not behave as expected.
              </p>
            </div>
            <div className="min-w-0 lg:col-span-5">
              <div className="rounded-2xl border border-black/10 bg-ink p-6 text-white shadow-[0_20px_60px_rgba(28,27,26,0.16)]">
                <p className="eyebrow mb-5 text-pink-300">The shortest path</p>
                <div className="space-y-3 font-mono text-[13px]">
                  {[
                    "npx norma-scope init",
                    "npx norma-scope doctor",
                    "npx norma-scope check",
                    "open .bridge/reports/report.html",
                  ].map((command, i) => (
                    <div key={command} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-3">
                      <span className="text-pink-300">{i + 1}</span>
                      <code className="text-white/80">{command}</code>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[13px] leading-relaxed text-white/45">
                  This is the default path. The rest of the guide helps you choose a different one
                  when your project needs it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* §1 */}
      <Section tone="ink">
        <Eyebrow dark>1 · The core idea</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl text-white">
          Normascope compares a screenshot of your running UI with a reference image.
        </h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-5">
            <p className="mb-6 text-[15px] leading-relaxed text-white/60">The reference may be:</p>
            <div className="space-y-3">
              {REFERENCES.map(([head, note]) => (
                <div key={head} className="rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3">
                  <p className="text-[14px] font-semibold text-white/85">{head}</p>
                  <p className="text-[13px] text-white/45">{note}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[15px] leading-relaxed text-white/60">
              The comparison is deterministic and local. It produces a diff image, a self-contained
              HTML report, and optionally machine-readable JSON. AI explanation is a separate,
              opt-in step.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <pre className={`${CODE_SCROLL} rounded-xl border border-white/10 bg-white/[0.04] px-5 py-5 font-mono text-[12px] leading-[1.7] text-white/70`}>
              <code>{PIPELINE}</code>
            </pre>
            <p className="mt-3 text-[12px] text-white/35 sm:hidden">
              Swipe the diagram sideways to see the rest.
            </p>
            <p className="mt-5 text-[13.5px] leading-relaxed text-white/45">
              The free local path never requires Normascope Cloud. It does not upload screenshots,
              reports, source files, or API keys.
            </p>
          </div>
        </div>
      </Section>

      {/* §2 */}
      <Section tone="paper">
        <Eyebrow>2 · Which workflow should I use?</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl">Find your situation. Start there.</h2>
        {/* Three columns need about 42rem to stay readable, so below `md` the
            same ten rows are stacked instead. A 672px table in a 375px viewport
            is a table nobody reads: the situation column — the one you scan to
            find yourself — is the first thing pushed off the screen. */}
        <div className="hidden overflow-x-auto rounded-xl border border-black/8 bg-white/65 md:block">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-black/8">
                {["Situation", "Start here", "Reference"].map((head) => (
                  <th key={head} className="eyebrow px-5 py-4 text-text/35">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WORKFLOWS.map(([situation, start, reference]) => (
                <tr key={situation} className="border-b border-black/5 last:border-0">
                  <td className="px-5 py-4 text-[13.5px] leading-relaxed text-text/70">{situation}</td>
                  <td className="px-5 py-4 font-mono text-[12px] font-semibold text-clay-deep">{start}</td>
                  <td className="px-5 py-4 text-[13px] text-text/50">{reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 md:hidden">
          {WORKFLOWS.map(([situation, start, reference]) => (
            <li key={situation} className="rounded-xl border border-black/8 bg-white/65 p-4">
              <p className="mb-3 text-[14px] leading-relaxed text-text/70">{situation}</p>
              <p className="wrap-anywhere font-mono text-[12px] font-semibold text-clay-deep">{start}</p>
              <p className="mt-1.5 text-[12.5px] text-text/45">
                <span className="text-text/30">Reference · </span>
                {reference}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* §3 */}
      <Section tone="sand">
        <Eyebrow>3 · One-time setup: init</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl">Run this once, in the project whose UI you want to verify.</h2>
        <CopyLine command="npx norma-scope init" />

        <div className="mt-10 [&>div]:min-w-0 grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <Label>Before</Label>
            <Steps items={INIT_BEFORE} />
          </Card>
          <Card>
            <Label>During</Label>
            <p className="text-[14px] leading-relaxed text-text/65">
              init asks for the design source and frames to track. It creates .bridge/config.json,
              records frame dimensions, creates local output directories, adds generated paths to
              .gitignore, and installs a non-blocking pre-commit hook.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-text/65">
              If you enter an app URL, init creates starter routes. Treat those routes as
              placeholders: edit them to match the actual pages and selectors in your app.
            </p>
          </Card>
        </div>

        <div className="mt-6 [&>div]:min-w-0 grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <Label>After</Label>
            <p className="mb-4 text-[14px] leading-relaxed text-text/65">
              Inspect .bridge/config.json. A typical automatic frame looks like this:
            </p>
            <Code>{FRAME_JSON}</Code>
            <p className="mt-4 text-[14px] leading-relaxed text-text/65">
              Commit .bridge/config.json. Do not commit .env.local, screenshots, reports, diffs or
              cache files unless your team explicitly chooses to.
            </p>
          </Card>
          <div className="rounded-xl border border-clay/30 bg-clay/[0.07] p-5 md:p-6">
            <Label>Important warning</Label>
            <p className="text-[14px] leading-relaxed text-text/70">
              Running init again replaces .bridge/config.json. It does not merge frame selections.
              Old generated screenshots are not automatically deleted.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-text/70">
              Run <code className="font-mono text-[12.5px] text-clay-deep">npx norma-scope clean</code>{" "}
              before recapturing a completely different project or design file.
            </p>
          </div>
        </div>
      </Section>

      {/* §4 */}
      <Section tone="paper">
        <Eyebrow>4 · Validate setup: doctor</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl">Run this before debugging capture or comparison.</h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <CopyLine command="npx norma-scope doctor" />
            <p className="mt-8 text-[15px] leading-relaxed text-text/65">
              It checks configuration, Figma access, frame IDs, app URL reachability, browser
              availability, routes, selectors and dimensions. It diagnoses; it does not modify your
              files.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-text/65">
              Before you run it: complete init, edit routes and selectors, and start the app if
              automatic capture is configured.
            </p>
            <div className="mt-8 space-y-3">
              {DOCTOR_RESULT.map(([verdict, meaning]) => (
                <div key={verdict} className="rounded-lg border border-black/8 bg-white/65 px-4 py-3">
                  <p className="text-[14px] font-semibold text-text/85">{verdict}</p>
                  <p className="text-[13.5px] leading-relaxed text-text/60">{meaning}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 lg:col-span-6 space-y-6">
            <Card>
              <Code className="mb-4">app.baseUrl is unreachable</Code>
              <p className="text-[14px] leading-relaxed text-text/65">
                Start the app or correct the URL. Do not try to solve this by changing the diff
                threshold.
              </p>
            </Card>
            <Card>
              <Code className="mb-4">selector not found on /pricing</Code>
              <p className="text-[14px] leading-relaxed text-text/65">
                Open the page and verify the selector, or remove the selector and use viewport or
                fullPage capture.
              </p>
            </Card>
          </div>
        </div>
      </Section>

      {/* §5 */}
      <Section tone="ink">
        <Eyebrow dark>5 · Manual screenshot workflow</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl text-white">
          Use this when you need exact control over the captured state.
        </h2>
        <p className="mb-10 max-w-2xl text-base leading-relaxed text-white/55">
          The app needs a special logged-in state, a modal must be opened by hand, or the route is
          difficult to automate.
        </p>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <Steps items={MANUAL_STEPS} dark />
          </div>
          <div className="min-w-0 lg:col-span-6 space-y-5 text-[14px] leading-relaxed text-white/60">
            <p>
              The filename must exactly match the value in .bridge/config.json, for example
              pricing-page.png.
            </p>
            <p>
              Capture at the dimensions printed by init. A Retina 2x screenshot, or a viewport with
              the wrong width, can create a misleadingly large diff.
            </p>
            <p>
              For a full-page browser screenshot, use the browser&rsquo;s &ldquo;Capture full size
              screenshot&rdquo; command. A viewport-only image is appropriate only when the frame is
              intended to represent the viewport.
            </p>
            <p>
              Manual and automatic frames can coexist in the same project. auto skips frames without
              routes; compare then uses the manually supplied PNG for those frames.
            </p>
          </div>
        </div>
      </Section>

      {/* §6 */}
      <Section tone="paper">
        <Eyebrow>6 · Automatic capture: auto</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl">auto captures configured routes from an already-running app.</h2>
        <CopyLine command="npx norma-scope auto" />
        <div className="mt-10 [&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <Label>Before</Label>
            <Steps items={AUTO_BEFORE} />
            <p className="eyebrow mb-3 mt-8 text-clay">Example</p>
            <Code>{AUTO_CONFIG}</Code>
          </div>
          <div className="min-w-0 lg:col-span-6">
            <Label>What happens</Label>
            <p className="text-[14px] leading-relaxed text-text/65">
              Normascope launches a headless browser, navigates to each route, waits for practical
              page settling, waits for configured readiness conditions, captures at 1x scale, and
              writes PNGs to .bridge/screenshots/.
            </p>
            <p className="eyebrow mb-3 mt-8 text-clay">Capture modes</p>
            <div className="divide-y divide-black/8 rounded-xl border border-black/8 bg-white/65 px-5">
              {CAPTURE_MODES.map(([mode, body]) => (
                <div key={mode} className="grid gap-1 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
                  <code className="font-mono text-[12px] font-semibold text-clay-deep">{mode}</code>
                  <p className="text-[13.5px] leading-relaxed text-text/60">{body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[14px] leading-relaxed text-text/65">
              If a frame has no route, it is reported as &ldquo;manual screenshot expected&rdquo;. If
              a route or selector fails, that frame is skipped with a warning. Always inspect the
              output: a successful process does not mean every frame was captured.
            </p>
          </div>
        </div>
      </Section>

      {/* §7 */}
      <Section tone="sand">
        <Eyebrow>7 · Capture and compare together: check</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl">This is the normal automatic development loop.</h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <CopyLine command="npx norma-scope check" />
            <p className="mt-8 mb-4 text-[15px] leading-relaxed text-text/65">It is exactly:</p>
            <Code>{`run \`auto\`
then run \`compare\``}</Code>
            <p className="mt-6 text-[15px] leading-relaxed text-text/65">
              It captures fresh screenshots first, then compares them against the configured
              reference and regenerates the report.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-6 space-y-6">
            <Card>
              <Label>Before</Label>
              <Steps
                items={[
                  "Start the app.",
                  "Run doctor at least once after changing routes or selectors.",
                  "Confirm that protected pages can load in the capture environment. Normascope does not invent a user session.",
                ]}
              />
            </Card>
            <Card>
              <Label>After</Label>
              <Code className="mb-4">{`.bridge/reports/report.html
.bridge/diff/<frame-name>-diff.png`}</Code>
              <p className="text-[14px] leading-relaxed text-text/65">
                Use the report to decide whether a difference is an intended change, a real
                regression, or a capture problem. Use --strict when the command should fail on
                measured regressions.
              </p>
              <Code className="mt-4">npx norma-scope check --strict</Code>
              <p className="mt-4 text-[14px] leading-relaxed text-text/65">
                Skipped frames and setup problems do not become measured regressions. For CI, pair
                strict comparison with doctor, or another check that ensures required frames were
                captured. check does not call an LLM and does not upload anything to Cloud.
              </p>
            </Card>
          </div>
        </div>
      </Section>

      {/* §8 */}
      <Section tone="paper">
        <Eyebrow>8 · Compare existing screenshots</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl">Use compare when screenshots already exist.</h2>
        <p className="mb-10 max-w-2xl text-base leading-relaxed text-text/60">
          That includes screenshots produced manually, or by a separate build system. It loads
          screenshots from .bridge/screenshots/, obtains references according to source, runs the
          diff, writes diff images and generates report.html.
        </p>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-7">
            <Label>Common variants</Label>
            <Code>{COMPARE_VARIANTS}</Code>
            <p className="mt-6 text-[14px] leading-relaxed text-text/65">
              The default cache is deliberately conservative, to protect Figma API quotas. Use
              --fresh when the designer has changed a tracked frame and you need the new export. Do
              not use clean merely to refresh Figma data: clean also removes local screenshots and
              reports.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Label>Interpreting results</Label>
            <ul className="space-y-3">
              {READING.map((item) => (
                <li key={item} className="rounded-lg border border-black/8 bg-white/65 px-4 py-3 text-[13.5px] leading-relaxed text-text/65">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] leading-relaxed text-text/50">
              Every number in the report is explained on the{" "}
              <Link href="/report" className="font-semibold text-clay underline underline-offset-4">
                report guide
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>

      {/* §9 */}
      <Section tone="ink">
        <Eyebrow dark>9 · Design source choices</Eyebrow>
        <h2 className="display-md mb-6 max-w-2xl text-white">
          The source block in .bridge/config.json determines the reference.
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {SOURCES.map(([label, snippet, body]) => (
            <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.05] p-5">
              <p className="mb-3 text-[14px] font-semibold text-white/85">{label}</p>
              <pre className={`mb-3 ${CODE_WRAP} rounded-lg bg-black/40 px-4 py-3 font-mono text-[11.5px] leading-relaxed text-white/75`}>
                <code>{snippet}</code>
              </pre>
              <p className="text-[13.5px] leading-relaxed text-white/50">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-white/55">
          The URL must be reachable from the machine running Normascope, and should be explicitly
          configured before capture.
        </p>

        <div className="mt-14 rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:p-9">
          <Label dark>Important example · compare localhost with live production</Label>
          <h3 className="display-sm mb-5 max-w-2xl text-white">
            Your local product page against the live one.
          </h3>
          <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-white/60">
            This example compares the local product page at
            http://localhost:3000/products/red-shoes with the live product page at
            https://shop.example.com/products/red-shoes. The local page is the version being tested.
            Production is the reference. Normascope captures both pages in the same run and compares
            the screenshots.
          </p>

          <div className="[&>div]:min-w-0 grid items-start gap-8 lg:grid-cols-2">
            <div>
              <p className="eyebrow mb-3 text-white/40">Step 1 · configure both websites</p>
              <p className="mb-4 text-[14px] leading-relaxed text-white/60">In .bridge/config.json, use:</p>
              <pre className={`${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>{URL_CONFIG}</code>
              </pre>
            </div>
            <div>
              <p className="mb-4 text-[14px] leading-relaxed text-white/60">
                The route is shared by both websites. Normascope builds these two URLs:
              </p>
              <pre className={`${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>{URL_RESULT}</code>
              </pre>
              <p className="mt-5 text-[14px] leading-relaxed text-white/60">
                The explicit viewport makes both browser pages use the same 1440 by 900 window.
                fullPage then captures the entire page. Do not use the page&rsquo;s full document
                height as the browser viewport; that can change how 100vh layouts render.
              </p>
            </div>
          </div>

          <div className="mt-10 [&>div]:min-w-0 grid items-start gap-8 lg:grid-cols-3">
            <div>
              <p className="eyebrow mb-3 text-white/40">Step 2 · start the local website</p>
              <p className="mb-3 text-[14px] leading-relaxed text-white/60">In terminal 1:</p>
              <pre className={`${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>{`cd ~/projects/storefront
npm run dev`}</code>
              </pre>
              <p className="mt-4 text-[13.5px] leading-relaxed text-white/50">
                Before continuing, open http://localhost:3000/products/red-shoes in your own browser.
                If the page does not work there, Normascope cannot capture it either.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3 text-white/40">Step 3 · validate both websites</p>
              <p className="mb-3 text-[14px] leading-relaxed text-white/60">In terminal 2:</p>
              <pre className={`${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>npx norma-scope doctor</code>
              </pre>
              <p className="mt-4 text-[13.5px] leading-relaxed text-white/50">
                Doctor should confirm that the local app and the production source are reachable. If
                production is behind a login screen, it may be technically reachable but still
                unsuitable for a meaningful comparison.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3 text-white/40">Step 4 · capture and compare</p>
              <pre className={`${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>npx norma-scope check</code>
              </pre>
              <p className="mt-4 mb-3 text-[13.5px] leading-relaxed text-white/50">What happens:</p>
              <ol className="space-y-2 text-[13px] leading-relaxed text-white/50">
                {URL_WHAT_HAPPENS.map((line, i) => (
                  <li key={line} className="flex gap-2">
                    <span className="font-mono text-white/30">{i + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
              <pre className={`mt-4 ${CODE_WRAP} rounded-xl bg-black/40 px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
                <code>open .bridge/reports/report.html</code>
              </pre>
              <p className="mt-4 text-[13.5px] leading-relaxed text-white/50">
                Read the result as: &ldquo;how different is my local product page from the live
                production product page?&rdquo;
              </p>
            </div>
          </div>

          <div className="mt-10 [&>div]:min-w-0 grid items-start gap-8 lg:grid-cols-2">
            <div>
              <p className="eyebrow mb-4 text-white/40">Step 5 · check differences before blaming CSS</p>
              <Steps items={URL_CHECKS} dark />
              <p className="mt-5 text-[13.5px] leading-relaxed text-white/50">
                A different product price is a data difference, not necessarily a visual
                implementation bug. A missing Add to cart button on localhost is likely a real local
                regression if both pages have the same data.
              </p>
            </div>
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
                <p className="mb-2 text-[14px] font-semibold text-white/85">
                  Authentication and private pages
                </p>
                <p className="text-[13.5px] leading-relaxed text-white/55">
                  The current URL capture flow does not automatically log into either site, and does
                  not transfer browser cookies. This example works best when the product page is
                  public, both environments show stable test data, and neither page has personalised
                  content. For private pages, use a deterministic test route or a manually captured
                  screenshot. Do not put passwords, session cookies or tokens in .bridge/config.json.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
                <p className="mb-3 text-[14px] font-semibold text-white/85">Compare another product</p>
                <p className="mb-3 text-[13.5px] leading-relaxed text-white/55">Change only the route:</p>
                <pre className={`${CODE_WRAP} rounded-lg bg-black/40 px-4 py-3 font-mono text-[11.5px] text-white/75`}>
                  <code>{`"route": "/products/blue-jacket"`}</code>
                </pre>
                <p className="mt-3 mb-3 text-[13.5px] leading-relaxed text-white/55">Then run:</p>
                <pre className={`${CODE_WRAP} rounded-lg bg-black/40 px-4 py-3 font-mono text-[11.5px] text-white/75`}>
                  <code>npx norma-scope check</code>
                </pre>
                <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
                  Both localhost and production must expose the same route. Otherwise the two
                  screenshots are not equivalent pages.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* §10 + §11 */}
      <Section tone="sand">
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <Eyebrow>10 · Baseline regression workflow</Eyebrow>
            <h2 className="display-md mb-6">When the browser output itself is the source of truth.</h2>
            <Steps items={BASELINE_STEPS} />
            <p className="mt-6 text-[14px] leading-relaxed text-text/65">
              baseline approves the current capture into .bridge/baseline/. Future comparisons for
              that frame use this browser capture instead of Figma. Approve only after reviewing the
              report. Baselines should be captured consistently on the same operating system and
              browser family; otherwise font rasterization can create noise.
            </p>
          </div>
          <div>
            <Eyebrow>11 · Committed design snapshots</Eyebrow>
            <h2 className="display-md mb-6">When CI should run without contacting Figma.</h2>
            <Code>{`npx norma-scope snapshot
git add .bridge/design
git commit -m "Record design snapshot"`}</Code>
            <p className="mt-6 text-[14px] leading-relaxed text-text/65">
              Then compare normally. To check whether the live Figma file has moved on:
            </p>
            <Code className="mt-4">npx norma-scope snapshot --check</Code>
            <p className="mt-6 text-[14px] leading-relaxed text-text/65">
              This is an informational drift check. Review and intentionally regenerate the snapshot
              when the design change is accepted.
            </p>
          </div>
        </div>
      </Section>

      {/* §12 */}
      <Section tone="paper">
        <Eyebrow>12 · CI and pull-request workflow</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl">Compare first. Comment second. The order matters.</h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <Code>{`npx norma-scope compare --json --strict
npx norma-scope comment`}</Code>
            <p className="mt-6 text-[15px] leading-relaxed text-text/65">
              compare --json writes .bridge/reports/summary.json. comment renders markdown from the
              most recent summary; it does not run a new comparison.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-text/65">
              The GitHub Action can run the comparison and publish the report and artifacts.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-6 space-y-3">
            {CI_NOTES.map((note) => (
              <div key={note} className="rounded-lg border border-black/8 bg-white/65 px-4 py-3 text-[13.5px] leading-relaxed text-text/65">
                {note}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* §13 + §14 + §15 */}
      <Section tone="ink">
        <Eyebrow dark>13 · AI explanations: explain</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl text-white">
          Optional, and separate from visual scoring.
        </h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <p className="mb-5 text-[14px] font-semibold text-white/70">Before</p>
            <Steps items={EXPLAIN_BEFORE} dark />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <p className="mb-5 text-[14px] font-semibold text-white/70">Useful variants</p>
            <pre className={`${CODE_WRAP} rounded-xl border border-white/10 bg-white/[0.05] px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
              <code>{`npx norma-scope explain pricing-page.png
npx norma-scope explain --all
npx norma-scope explain --deep`}</code>
            </pre>
            <p className="mt-6 text-[14px] leading-relaxed text-white/60">
              explain analyses flagged frames by default. It produces hypotheses about likely causes
              and saves findings to .bridge/reports/findings.json. It does not change code, does not
              determine the deterministic score, and does not automatically apply fixes. Verify every
              finding.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-white/60">
              A secret scanner runs before network calls. Treat any AI explanation as a review aid,
              not as permission to upload private application data without checking the configured
              scope.
            </p>
          </div>
        </div>

        <div className="mt-16 [&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <Eyebrow dark>14 · MCP and coding-agent flow</Eyebrow>
            <h3 className="display-sm mb-5 text-white">The safe agent loop.</h3>
            <p className="mb-5 text-[14px] leading-relaxed text-white/60">
              The optional MCP package exposes local tools such as list_frames, capture, compare,
              summary and explain to a coding agent.
            </p>
            <pre className={`${CODE_WRAP} rounded-xl border border-white/10 bg-white/[0.05] px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
              <code>{`implement change
  → capture/compare current app
  → inspect score and drifted regions
  → revise implementation
  → compare again`}</code>
            </pre>
            <p className="mt-5 text-[14px] leading-relaxed text-white/60">
              The MCP compare tool recaptures by default, so the score reflects the current code. A
              caller may disable capture only when it intends to score screenshots already on disk.
              Capture URLs are default-deny and must be configured. Page text returned by tools is
              data, not instructions.
            </p>
          </div>
          <div>
            <Eyebrow dark>15 · Cleanup: clean</Eyebrow>
            <h3 className="display-sm mb-5 text-white">Remove generated local artifacts.</h3>
            <pre className={`${CODE_WRAP} rounded-xl border border-white/10 bg-white/[0.05] px-5 py-4 font-mono text-[12px] leading-[1.7] text-white/80`}>
              <code>npx norma-scope clean</code>
            </pre>
            <p className="mt-5 text-[14px] leading-relaxed text-white/60">
              This empties screenshots, diffs, reports and cache directories. It never changes
              .bridge/config.json.
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-white/60">
              Use it when switching projects or design files, or when generated output is stale. Do
              not use it just to refresh a Figma export: use compare --fresh, which refreshes and
              re-caches the export without deleting your captures.
            </p>
          </div>
        </div>
      </Section>

      {/* §16 */}
      <Section tone="paper">
        <Eyebrow>16 · Common stuck states</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl">Debug the capture before you debug the CSS.</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {STUCK.map(([problem, fix]) => (
            <div key={problem} className="rounded-xl border border-black/8 bg-white/65 p-5">
              <p className="mb-2 text-[14px] font-semibold text-text/85">{problem}</p>
              <p className="text-[13.5px] leading-relaxed text-text/60">{fix}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* §17 */}
      <Section tone="sand">
        <Eyebrow>17 · Beginner cookbook</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">Copy these examples.</h2>
        <p className="mb-10 max-w-2xl text-base leading-relaxed text-text/60">
          This section assumes you have never used Normascope before. Copy the commands exactly, then
          replace only the paths, URLs and page names that belong to your project.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {COOKBOOK.map((example) => (
            <article key={example.tag} className="min-w-0 rounded-xl border border-black/8 bg-white/65 p-5 md:p-6">
              <p className="eyebrow mb-3 text-clay">{example.tag}</p>
              <h3 className="title-sm mb-3 text-text">{example.title}</h3>
              <p className="mb-5 text-[13.5px] leading-relaxed text-text/60">{example.intro}</p>
              {"steps" in example && example.steps && (
                <ol className="mb-5 space-y-2">
                  {example.steps.map((step, i) => (
                    <li key={step} className="flex gap-2 text-[13.5px] leading-relaxed text-text/60">
                      <span className="font-mono text-text/35">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Code>{example.code}</Code>
              {"body" in example && example.body && (
                <p className="mt-4 text-[13.5px] leading-relaxed text-text/60">{example.body}</p>
              )}
              {"then" in example && example.then && <Code className="mt-4">{example.then}</Code>}
              <p className="mt-4 border-l-2 border-clay/35 pl-3 text-[13px] leading-relaxed text-text/55">
                {example.close}
              </p>
            </article>
          ))}
        </div>
      </Section>

      {/* §18 */}
      <Section tone="paper">
        <Eyebrow>18 · Visual flowcharts</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">The same journeys, drawn.</h2>
        <p className="mb-12 max-w-2xl text-base leading-relaxed text-text/60">
          These diagrams summarise the main user journeys. When a command changes one of these
          journeys, the diagram changes with it.
        </p>
        <div className="space-y-8">
          {DIAGRAMS.map((diagram) => (
            <figure key={diagram.title} className="rounded-2xl border border-black/8 bg-white/70 p-5 md:p-8">
              <figcaption className="mb-6">
                <p className="title-sm text-text">{diagram.title}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-text/55">{diagram.body}</p>
              </figcaption>
              <div className="overflow-x-auto">
                <div className="mx-auto min-w-[30rem] max-w-3xl">{diagram.chart}</div>
              </div>
              {/* The 30rem floor is deliberate — below it the node labels stop
                  being readable — so on a phone the diagram scrolls. Say so:
                  a silently cut diagram reads as a broken one. */}
              <p className="mt-4 text-[12px] text-text/40 sm:hidden">
                Swipe the diagram sideways to see the rest. The caption above describes the whole
                journey.
              </p>
            </figure>
          ))}
        </div>
      </Section>

      {/* §19 */}
      <Section tone="ink">
        <Eyebrow dark>19 · A complete daily example</Eyebrow>
        <h2 className="display-md mb-8 max-w-2xl text-white">The whole workflow, in one place.</h2>
        <div className="[&>div]:min-w-0 grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-7">
            <pre className={`${CODE_WRAP} rounded-xl border border-white/10 bg-white/[0.05] px-5 py-5 font-mono text-[12px] leading-[1.8] text-white/80`}>
              <code>{DAILY}</code>
            </pre>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Shot
              src="/screens/cli-baseline.png"
              alt="Normascope terminal output showing a baseline workflow"
              caption={
                <span className="text-white/45">
                  The CLI is intentionally explicit: it tells you what it is checking and where the
                  result lives.
                </span>
              }
            />
          </div>
        </div>
      </Section>

      <Section tone="paper" size="sm">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="display-md mb-5">Start with one page.</h2>
          <p className="mx-auto mb-8 max-w-xl text-[15px] leading-relaxed text-text/60">
            Pick a page your team knows well, learn the report, then expand the workflow to the rest
            of your app.
          </p>
          <CopyLine command="npx norma-scope init" />
          <p className="mt-8 text-[13px] text-text/45">
            Want the visual explanation first?{" "}
            <Link href="/how-it-works" className="font-semibold text-clay underline underline-offset-4">
              Read How It Works
            </Link>{" "}
            · Every number in the output:{" "}
            <Link href="/report" className="font-semibold text-clay underline underline-offset-4">
              the report guide
            </Link>{" "}
            · Every command and flag:{" "}
            <Link href="/commands" className="font-semibold text-clay underline underline-offset-4">
              Commands
            </Link>
          </p>
        </div>
      </Section>

      {/* The last page on the site to get one, and the one that needed it most.
          Measured on a 375×812 phone before this landed: the guide is 35,764px
          long, and Cloud appeared as a grey chip in a nav strip you have to
          swipe to reach, once as a clause at y=2,110, and then not again until
          the footer mark at y=35,320 — 98.8% of the page with no way to it.
          The header's lockup (see `layout.tsx`) is the other half of the fix;
          this is the half that makes an argument. */}
      <CloudBand
        wall={<>This guide ends at today&rsquo;s run.</>}
        answer={
          <>
            The CLI has no memory of the run before it — deliberately, and that is also its
            ceiling. Cloud keeps every run, gives your team a stable link to any of them, and puts
            a page&rsquo;s own history behind each number: not just what broke, but how long it has
            been breaking.
          </>
        }
      />
    </>
  );
}
