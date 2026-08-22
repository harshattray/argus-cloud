// Defined terms on the Cloud pages, the glossary behind them, and the per-point
// tooltips on the two charts.
//
// Run: npm test
// Run one suite:  node test/explainers.test.mjs
//
// **What this suite can and cannot prove.** Nothing here renders React, so it
// cannot show that a bubble appears in the right place — that was checked in a
// browser against both themes and is recorded in `FinishedSPEC.md`. What it
// checks is everything that can break *silently*:
//
//   - a page asking for a definition that does not exist. The component throws,
//     but only when that page renders, so a typo in a rarely-visited branch
//     ships and is found by a customer.
//   - two popovers sharing an element id. `popovertarget` resolves by id, so the
//     second term on a page would open the first one's definition — a wrong
//     answer, confidently given, with nothing in any log.
//   - the typography reset, in both directions. The trigger has to inherit its
//     surroundings (it is a word in a sentence) and the bubble has to reset them
//     (it is a paragraph in the top layer). Getting the second wrong shipped a
//     definition in capitals; getting the first wrong would make every defined
//     term look unlike the text around it.
//   - a frame label reaching an id. Labels are upload-supplied.
//   - `fill: none` on a chart's hover target, which is invisible *and* untouchable
//     — the tooltip would then open only on the 3.5px dot.
//
// One counter-test, in the sense of CLAUDE.md rule 3:
//
//   X2.4b — the id scheme without its scope, i.e. `x-<term>`. Every check about
//           uniqueness still passes when there is one frame, and collides the
//           moment a run has two — which is the ordinary case.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/**
 * Comments stripped — a regex will happily match the prose above a rule.
 * (`cloudShell` §3t makes the same point about CSS.)
 *
 * It applies to source as much as to stylesheets, and X4.3 proved it: the
 * component's doc comment *explains why it does not use `useState`*, so a check
 * that grepped the raw file for `useState` failed against a file that does not
 * use it. A test can be wrong about the thing it is testing.
 */
const decomment = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every `.tsx` under a directory, recursively. */
async function tsxUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await tsxUnder(full)));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// ═══ X1 — the glossary is a lookup table, so its keys have to behave ═══
//
// `glossary.ts` is TypeScript and the suite runs against `dist/`, which does not
// build `web/`. The entries are parsed out of the source instead of imported:
// less precise than running the module, and it is the ids and the prose that
// matter here, both of which are literals.

const glossarySrc = await readFile(path.join(WEB, "lib/glossary.ts"), "utf-8");
const entries = [...glossarySrc.matchAll(/^\s{4}id:\s*"([^"]+)",\n\s{4}term:\s*"([^"]+)",\n\s{4}def:\s*"((?:[^"\\]|\\.)*)",/gm)].map(
  (m) => ({ id: m[1], term: m[2], def: m[3] })
);

{
  check("X1.1", entries.length >= 30, `the glossary parsed (${entries.length} entries)`);

  const ids = entries.map((e) => e.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  check("X1.2", dupes.length === 0, `every id is unique${dupes.length ? ` — collides: ${dupes.join(", ")}` : ""}`);

  // The id becomes part of an HTML element id and is referenced by value from a
  // `popovertarget` attribute. Anything outside this set is a bug waiting for
  // the one browser that quotes attributes differently.
  const unsafe = ids.filter((id) => !/^[a-z][a-z0-9-]*$/.test(id));
  check("X1.3", unsafe.length === 0, `every id is id-safe lower-kebab${unsafe.length ? ` — bad: ${unsafe.join(", ")}` : ""}`);

  // The file's own rule: "if a definition needs a second sentence to explain the
  // first, the first sentence is wrong." This does not police sentence count —
  // several definitions legitimately add a second clause — it catches the empty
  // and the placeholder.
  const thin = entries.filter((e) => e.def.trim().length < 25);
  check("X1.4", thin.length === 0, `no definition is a stub${thin.length ? ` — thin: ${thin.map((t) => t.id).join(", ")}` : ""}`);

  check(
    "X1.5",
    entries.every((e) => e.term.trim().length > 0),
    "every entry has a visible term, which is the bubble's heading"
  );

  // The two lists are separate on purpose: `/report` on the marketing site
  // prints GLOSSARY and describes the *local* HTML report, which has no history,
  // no credits and no share links. A cloud-only word in that list would define
  // something the page it appears on cannot do.
  const cloudOnly = ["first-drift", "recurrence", "credits", "share-link", "history"];
  const cloudBlock = glossarySrc.slice(glossarySrc.indexOf("CLOUD_GLOSSARY"));
  check(
    "X1.6",
    cloudOnly.every((id) => cloudBlock.includes(`id: "${id}"`)),
    "history, first drift, recurrence, credits and share links live in CLOUD_GLOSSARY, not the marketing one"
  );
}

// ═══ X2 — every term a page asks for exists, and every id is unique ═══

/**
 * Terms reached only through an expression, listed by hand.
 *
 * A static scan cannot resolve `term={frame.flagged ? "flagged" : "clean"}` —
 * and it must not try, because the neighbouring
 * `term={frame.mode === "fidelity" ? "fidelity-mode" : "baseline-mode"}` also
 * contains the string `"fidelity"`, which is not a key and never was. Pulling
 * every quoted string out of a `term={…}` expression would fail on that.
 *
 * `Shot.term` is the same shape one indirection away: the value is a literal in
 * a table, not in the JSX.
 *
 * So they are enumerated. The list is short, it is checked against the glossary
 * below, and X2.6 checks the count of dynamic sites has not grown — because the
 * failure this guards against is somebody adding a *third* expression form and
 * this file quietly not covering it.
 */
const DYNAMIC_TERMS = [
  "fidelity-mode",
  "baseline-mode", // page.tsx — how the frame was measured
];

const pages = await tsxUnder(path.join(WEB, "app"));
const used = [];
let dynamicSites = 0;
for (const file of pages) {
  const src = decomment(await readFile(file, "utf-8"));
  for (const m of src.matchAll(/<Explainer\s[^>]*term="([^"]+)"/g)) {
    used.push({ term: m[1], file: path.relative(ROOT, file) });
  }
  // Components that forward a key to an `<Explainer>` — `CloudMasthead`, `Stat`,
  // `Fact` — all name the prop `explain`, deliberately, so one rule finds them.
  // `Fact` also has a `term` prop, and it is a *label*, not a key; the naming
  // split is what keeps this scan from reading "First drifted at" as an id.
  for (const m of src.matchAll(/\bexplain="([^"]+)"/g)) {
    used.push({ term: m[1], file: path.relative(ROOT, file) });
  }
  // `term={…}` that is not the plain `{explain}` forward — i.e. a key the scan
  // above could not read. Counted, not parsed: see DYNAMIC_TERMS for why.
  dynamicSites += [...src.matchAll(/<Explainer\s[^>]*term=\{(?!explain\})/g)].length;
}

/**
 * The `Shot` table's captions, which reach an Explainer through `term={shot.term}`.
 *
 * Extracted rather than listed, because they *are* literals — just one field
 * away from the JSX. Counting them among the "dynamic" sites was the first
 * attempt and it was regex golf: one entry uses the `regions` shorthand and the
 * pattern quietly matched three of four. A check that silently undercounts is
 * worse than no check, so this reads the keys themselves.
 */
const shotTerms = [
  ...decomment(await readFile(path.join(WEB, "app/r/[runId]/frame-view.tsx"), "utf-8")).matchAll(
    /\bterm:\s*"([a-z][a-z0-9-]*)"/g
  ),
].map((m) => m[1]);

{
  const known = new Set(entries.map((e) => e.id));
  check("X2.1", used.length >= 25, `the Cloud pages ask for ${used.length} definitions`);

  const missing = used.filter((u) => !known.has(u.term));
  check(
    "X2.2",
    missing.length === 0,
    missing.length === 0
      ? "every term a page asks for is in the glossary"
      : `unknown terms: ${missing.map((m) => `${m.term} (${m.file})`).join(", ")}`
  );

  const unknownDynamic = DYNAMIC_TERMS.filter((t) => !known.has(t));
  check(
    "X2.2b",
    unknownDynamic.length === 0,
    unknownDynamic.length === 0
      ? `the ${DYNAMIC_TERMS.length} terms reached through an expression are all defined too`
      : `unknown dynamic terms: ${unknownDynamic.join(", ")}`
  );

  const unknownShots = [...new Set(shotTerms.filter((t) => !known.has(t)))];
  check(
    "X2.2c",
    shotTerms.length >= 4 && unknownShots.length === 0,
    unknownShots.length === 0
      ? `all ${shotTerms.length} image-caption keys are defined`
      : `unknown caption keys: ${unknownShots.join(", ")}`
  );

  // If another computed term appears, this file stops covering it — and the
  // symptom would be a term that throws when somebody opens that one page.
  check(
    "X2.6",
    dynamicSites === 2,
    `${dynamicSites} explainer terms are computed rather than written (expected 2; add them to DYNAMIC_TERMS if this grew)`
  );

  // The other direction is a warning, not a failure: a term can legitimately be
  // defined for the marketing glossary and never popped up on a Cloud page —
  // `unaligned-diff` and `raw-diff` are on `/report` and are not numbers the
  // hosted page shows.
  const reached = new Set([...used.map((u) => u.term), ...DYNAMIC_TERMS]);
  const unused = entries.filter((e) => !reached.has(e.id));
  console.log(`      note: ${unused.length} defined terms are never popped up on a Cloud page (${unused.map((u) => u.id).join(", ") || "none"})`);

  // Element ids must be unique per page, and the component builds them as
  // `x-<scope>-<term>`. Every call that could repeat on one page has to pass a
  // scope — the frame components take an `anchor` for exactly this.
  const componentSrc = await readFile(path.join(WEB, "app/_components/cloud/explainer.tsx"), "utf-8");
  check(
    "X2.3",
    /const id = `x-\$\{scope === undefined \? "" : `\$\{scope\}-`\}\$\{term\}`/.test(componentSrc),
    "the element id is built from scope and term"
  );

  // Anything rendered once per frame must carry a scope, or a two-frame run has
  // duplicate ids. Checked by reading the call sites in the per-frame files.
  const perFrame = ["app/r/[runId]/frame-view.tsx", "app/r/[runId]/history-strip.tsx"];
  let scoped = 0;
  let unscoped = 0;
  for (const rel of perFrame) {
    const src = decomment(await readFile(path.join(WEB, rel), "utf-8"));
    // An `<Explainer …>` opening tag. It wraps its children now, so the old
    // self-closing pattern matched nothing and this check passed vacuously for
    // one commit — which is the failure mode the check itself is about.
    for (const m of src.matchAll(/<Explainer\s[^>]*?>/gs)) {
      if (/scope=/.test(m[0])) scoped++;
      else unscoped++;
    }
  }
  check("X2.4", unscoped === 0 && scoped > 0, `every per-frame explainer carries a scope (${scoped} scoped, ${unscoped} bare)`);

  // X2.4b — the counter-test. Drop the scope and build the ids the naive way.
  // One frame is fine; the second frame collides with the first, and
  // `popovertarget` resolves an id to the *first* match in the document, so the
  // second frame's "?" silently opens the first frame's bubble.
  {
    const terms = ["aligned-diff", "ssim", "baseline-mode"];
    const naive = [];
    for (const frame of ["frame-0", "frame-1"]) {
      for (const t of terms) {
        naive.push(`x-${t}`); // no scope
        void frame;
      }
    }
    const withScope = [];
    for (const frame of ["frame-0", "frame-1"]) {
      for (const t of terms) {
        withScope.push(`x-${frame}-${t}`);
      }
    }
    const naiveUnique = new Set(naive).size === naive.length;
    const realUnique = new Set(withScope).size === withScope.length;
    check(
      "X2.4b",
      !naiveUnique && realUnique,
      `unscoped ids collide across frames (${new Set(naive).size} of ${naive.length} distinct); scoped ids do not (${new Set(withScope).size} of ${withScope.length})`
    );
  }

  // A frame label is upload-supplied: spaces, quotes, `#`, or the same text as
  // another frame. `page.tsx` already refuses to build an anchor out of one, and
  // a popover id is referenced by value from an attribute — the same argument.
  const frameView = await readFile(path.join(WEB, "app/r/[runId]/frame-view.tsx"), "utf-8");
  check(
    "X2.5",
    !/<Explainer[^>]*scope=\{`?\$?\{?frame[.}]/.test(frameView) && /scope=\{anchor\}/.test(frameView),
    "per-frame scopes come from the positional anchor, never from the frame label"
  );
}

// ═══ X2b — the trigger is the term, and there is no icon ═══
//
// The first version appended a circled "?" to every label: 103 of them on a
// seven-frame report. Harsha's verdict was that a page speckled with query
// glyphs reads as a page unsure of itself, and the count scaled with frames
// rather than with ideas. These checks are what stop one creeping back.

{
  const component = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/explainer.tsx"), "utf-8")
  );

  check(
    "X2b.1",
    !/["'>]\s*\?\s*["'<]/.test(component) && !component.includes("aria-hidden"),
    "the component renders no glyph of its own — the trigger's content is whatever it wraps"
  );
  check(
    "X2b.2",
    /<button[^>]*>\s*\{children\}\s*<\/button>/.test(component),
    "the button *is* the term: `children` is its entire content"
  );
  check(
    "X2b.3",
    component.includes("children: ReactNode"),
    "and children are required, so a term cannot be rendered with nothing to click"
  );

  // Every call site passes something to wrap. A self-closing `<Explainer />`
  // would render an empty button — invisible, focusable, and impossible to open
  // with a mouse.
  const selfClosing = [];
  for (const file of pages) {
    const src = decomment(await readFile(file, "utf-8"));
    if (/<Explainer\s[^>]*\/>/s.test(src)) {
      selfClosing.push(path.relative(ROOT, file));
    }
  }
  check(
    "X2b.4",
    selfClosing.length === 0,
    `no call site renders an empty trigger${selfClosing.length ? `: ${selfClosing.join(", ")}` : ""}`
  );

  const css = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));
  const trigger = css.slice(css.indexOf(".explainerTerm {"), css.indexOf(".explainerBubble"));
  check(
    "X2b.5",
    trigger.includes("text-decoration: underline dotted"),
    "the only mark it adds is a dotted underline on the word"
  );
  // The trigger has to *inherit* everything the bubble resets. It is a word in
  // whatever sentence it sits in — a stat label, a table header, body text —
  // and a <button> arrives with its own font, colour and spacing.
  for (const [id, prop] of [
    ["X2b.6", "font: inherit"],
    ["X2b.7", "color: inherit"],
    ["X2b.8", "letter-spacing: inherit"],
    ["X2b.9", "text-transform: inherit"],
  ]) {
    check(id, trigger.includes(prop), `the trigger inherits ${prop.split(":")[0]} from the text it sits in`);
  }
}

// ═══ X3 — the stylesheet, where the failures are invisible ═══

{
  const css = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));
  const bubble = css.slice(css.indexOf(".explainerBubble"));

  // The reset. A popover is in the top layer but inherits down the DOM, and
  // every trigger here hangs off a label styled with uppercase and tracking.
  // Without these the definition renders in the voice of its neighbour.
  for (const [id, prop] of [
    ["X3.1", "text-transform: none"],
    ["X3.2", "letter-spacing: normal"],
    ["X3.3", "text-align: left"],
  ]) {
    check(id, bubble.includes(prop), `the bubble resets ${prop.split(":")[0]}, which it inherits from its label`);
  }

  // X3.1b — the counter-test, evaluated by hand. `.statLabel` is
  // `text-transform: uppercase`, and the trigger is inside it. Without the reset
  // the cascade gives the bubble `uppercase` too.
  const statLabelUpper = /\.statLabel\s*\{[^}]*text-transform:\s*uppercase/.test(
    decomment(await readFile(path.join(WEB, "app/r/[runId]/report.module.css"), "utf-8"))
  );
  check(
    "X3.1b",
    statLabelUpper && bubble.includes("text-transform: none"),
    "a trigger's own label really is uppercase, so the reset is doing work rather than being decorative"
  );

  // Anchored positioning is progressive. The base rules must stand on their own,
  // because a browser without `position-area` applies only those and gets the
  // UA's centred popover — a deliberate fallback, not a broken tooltip.
  //
  // **Find the explainer's own block, not the first one in the file.** This read
  // `indexOf("@supports (position-area: block-end)")` until 2026-08-22, when the
  // account menu became a second anchored popover in this stylesheet and was
  // declared above the explainers. X3.5 then compared the bubble's position
  // against *that* block and reported the explainer's fallback as broken when
  // nothing about the explainer had changed. The assertion is unchanged; only
  // the way it locates the block is.
  //
  // The body is read by balancing braces rather than by slicing to the next
  // `@supports`. Slicing was the first fix and it was still wrong: the whole
  // explainer section sits *between* the two blocks, so the account menu's block
  // "contained" `.explainerBubble` and was picked anyway.
  const bodyOf = (start) => {
    const open = css.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open, i + 1);
    }
    return "";
  };
  const supportsAt =
    [...css.matchAll(/@supports \(position-area: block-end\)/g)]
      .map((m) => m.index)
      .find((start) => bodyOf(start).includes("explainerBubble")) ?? -1;
  check("X3.4", supportsAt !== -1, "the explainer's anchored rules sit behind @supports");
  check(
    "X3.5",
    css.indexOf(".explainerBubble") < supportsAt,
    "the unanchored rules are declared first, so they are a complete fallback on their own"
  );
  check(
    "X3.6",
    css.slice(supportsAt).includes("position-try-fallbacks"),
    "fallback positions exist, so a term at the foot or the right edge does not open off-screen"
  );

  // No `anchor-name`. It would have to be unique per instance, which a CSS
  // module cannot generate without an inline style — and `style-src-attr` is
  // already carrying more than anyone wants (PATHWAYS carried-forward item 2).
  check(
    "X3.7",
    !css.includes("anchor-name"),
    "no anchor-name: the popover's implicit anchor is used, so no per-instance inline style is needed"
  );

  check(
    "X3.8",
    bubble.includes("display: none") && bubble.includes(":popover-open"),
    "the bubble is hidden until opened by the browser, not by JavaScript"
  );
}

// ═══ X4 — what still renders on the server, now that one thing does not ═══
//
// `FinishedSPEC.md` §3v claimed **zero** client JavaScript on this tree. That
// stopped being true on 2026-08-20: Harsha chose a real drag-to-select over the
// zero-JS approximation, so `brush.tsx` is a client component and the doc was
// corrected in the same change rather than left saying something false.
//
// **The guard did not go away, it got narrower**, because the valuable half of
// that property survives: the *charts* are still inert server-rendered SVG. Both
// arrive complete in the first byte, and with JavaScript off or still loading
// the pages are readable and the range links work — only the drag is missing.
//
// **Widened once more on 2026-08-22, and the reason matters.** It read "exactly
// one client component", and `app/repos/error.tsx` turned it red. That was the
// check being wrong rather than the code: Next requires an error boundary to be
// a Client Component — there is no server-rendered form of one — so the rule as
// written forbade having an error boundary at all on this tree.
//
// The rule it was standing in for is *"every client component here is a
// deliberate choice somebody argued for"*, and a count cannot express that. So
// it is an allowlist with a reason per entry. It keeps its teeth: a new client
// component that nobody has justified still fails, and the charts are checked
// separately below and were never part of this relaxation.
const CLIENT_ALLOWED = new Map([
  ["brush.tsx", "drag-to-select; Harsha chose a real drag over the zero-JS approximation (2026-08-20)"],
  ["error.tsx", "the error boundary; Next has no server-rendered form of one (2026-08-22)"],
]);

{
  const tree = await tsxUnder(path.join(WEB, "app/repos"));
  const clientFiles = [];
  for (const file of tree) {
    const src = await readFile(file, "utf-8");
    if (/^\s*["']use client["']/m.test(src)) {
      clientFiles.push(path.relative(ROOT, file));
    }
  }
  const unexplained = clientFiles.filter((f) => !CLIENT_ALLOWED.has(path.basename(f)));
  check(
    "X4.1",
    clientFiles.length > 0 && unexplained.length === 0,
    `every client component on /repos is on the allowlist with a reason${unexplained.length ? ` — unexplained: ${unexplained.join(", ")}` : ` (${clientFiles.join(", ")})`}`
  );
  // Not vacuous, and not a rubber stamp: the allowlist has to name things that
  // are actually there. An entry left behind after a file is deleted would
  // silently widen the rule for whatever takes that filename next.
  check(
    "X4.1a",
    [...CLIENT_ALLOWED.keys()].every((name) => clientFiles.some((f) => path.basename(f) === name)),
    `every allowlist entry names a file that exists (${[...CLIENT_ALLOWED.keys()].join(", ")})`
  );
  for (const [id, rel] of [
    ["X4.1b", "app/repos/trend-chart.tsx"],
    ["X4.1c", "app/repos/overview-chart.tsx"],
    ["X4.1d", "app/repos/sparkline.tsx"],
  ]) {
    const src = await readFile(path.join(WEB, rel), "utf-8");
    check(id, !/^\s*["']use client["']/m.test(src),
      `${rel.split("/").pop()} is still server-rendered, so the picture is in the first byte`);
  }
  // The brush carries no history. The selection becomes a URL the server
  // answers, so nothing about a tenant's runs is serialised into the page for a
  // client to filter.
  //
  // **Loosened once, on 2026-08-20, and this is the reasoning.** It used to
  // forbid the words `points`, `buckets` and `runs` outright, which is a proxy
  // for the rule rather than the rule. The brush now takes one array —
  // `occupied`, pairs of 0–1 fractions saying which parts of its own width have
  // bands drawn under them — so that a drag across blank chart can decline to
  // navigate instead of 404ing the page, which is what most of that chart is.
  //
  // That array discloses nothing. Every position in it is already painted in
  // the inert SVG immediately underneath, at the same bucket resolution, by the
  // server. What must never cross is a *measurement*: a percentage, a commit, a
  // run id, a threshold, a flag or a timestamp. So the check names those.
  {
    const brush = decomment(await readFile(path.join(WEB, "app/repos/brush.tsx"), "utf-8"));
    check("X4.1e",
      !/alignedMismatch|commitSha|runId|threshold|flagged|createdAt|\bpoints\b|\bbuckets\b/.test(brush),
      "and it holds no history — no measurement, commit, run id or time reaches the client here");
    check("X4.1f",
      /occupied: \[number, number\]\[\]/.test(brush),
      "the one array it does take is pairs of numbers — positions already drawn in the SVG under it, which is why a drag can know it has selected nothing");
  }

  const component = await readFile(path.join(WEB, "app/_components/cloud/explainer.tsx"), "utf-8");
  check("X4.2", !/^\s*["']use client["']/m.test(component), "the Explainer itself is a server component");
  check(
    "X4.3",
    !/useState|useEffect|onClick/.test(decomment(component)),
    "it uses the native popover API rather than React state, so it ships no JavaScript"
  );
  check(
    "X4.4",
    component.includes("popoverTarget") && component.includes('popover="auto"'),
    "the browser supplies the top layer, light dismiss and Escape"
  );
}

// ═══ X5 — a bubble is never clipped by the card it sits in ═══
//
// `.card` is `overflow: hidden` and `.tableWrap` scrolls. A positioned <div>
// inside either would be cut off or drag a scrollbar; a popover is in the top
// layer and escapes both. This checks the two facts that make that true, so
// nobody "simplifies" the popover into a div and finds out on a table header.

{
  const surface = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));
  const trends = decomment(await readFile(path.join(WEB, "app/repos/trends.module.css"), "utf-8"));
  check("X5.1", /\.card\s*\{[^}]*overflow:\s*hidden/.test(surface), ".card really does clip its overflow");
  check("X5.2", /\.tableWrap\s*\{[^}]*overflow-x:\s*auto/.test(trends), ".tableWrap really does scroll, and carries explainers in its headers");
  const component = await readFile(path.join(WEB, "app/_components/cloud/explainer.tsx"), "utf-8");
  check("X5.3", component.includes('popover="auto"'), "so the bubble is a popover, which renders outside both");
}

// ═══ X6 — hovering a chart point says which run it is ═══
//
// "Which run is that spike?" is a question about a *point*, and answering it by
// asking someone to match an x-position against the table below is not answering
// it. The two charts answer it differently, and the difference is one attribute.

{
  const chart = decomment(await readFile(path.join(WEB, "app/repos/trend-chart.tsx"), "utf-8"));
  const trends = decomment(await readFile(path.join(WEB, "app/repos/trends.module.css"), "utf-8"));

  check("X6.1", chart.includes("function PointMarker"), "the trend chart draws a card per point");
  check(
    "X6.2",
    /commitSha \? label/.test(chart) && chart.includes("point.threshold") && chart.includes("point.createdAt"),
    "and the card carries the commit, the threshold and the date — the row of the table, at the mark"
  );

  /*
   * The hit target: a full-height column, one slot wide.
   *
   * It was an `r=13` circle, and a circle is wrong twice. Fixed radius means the
   * targets overlap the moment runs are closer together than the diameter, and
   * the one drawn last wins — measured on a 200-run frame, aiming at run 80
   * opened run 83's card. It also started overlapping at *thirty* runs on a
   * narrow card, which is the default window.
   */
  check(
    "X6.3",
    chart.includes("dotHit") && /<rect[\s\S]{0,200}?className=\{styles\.dotHit\}/.test(chart),
    "the hit target is a rect column, not a circle"
  );
  check(
    "X6.3b",
    /width=\{slot\}/.test(chart) && /height=\{plotHeight\}/.test(chart),
    "one slot wide and the full height of the plot, so the columns tile it exactly"
  );
  // X6.3c — the counter-test, by arithmetic. A fixed-radius circle against the
  // spacing each window produces; a column is correct at every one of them.
  {
    const innerW = 720 - 46 - 16;
    const overlapping = [20, 30, 60, 120, 200].filter((n) => innerW / (n - 1) < 26);
    check(
      "X6.3c",
      overlapping.length >= 4 && overlapping.includes(30),
      `a 26-unit circle overlaps at ${overlapping.join(", ")} runs — including the default 30; a column never does`
    );
  }
  check(
    "X6.4",
    /\.dotHit\s*\{[^}]*fill:\s*transparent/.test(trends),
    "it is `fill: transparent`, which paints and therefore takes pointer events"
  );
  check(
    "X6.4b",
    !/\.dotHit\s*\{[^}]*fill:\s*none/.test(trends),
    "and not `fill: none`, which would be untouchable — the tooltip would open only on the dot itself"
  );
  check(
    "X6.5",
    /\.tip\s*\{[^}]*pointer-events:\s*none/.test(trends),
    "the card never takes the pointer: it overlaps its neighbours' hit targets"
  );
  check(
    "X6.6",
    /\.point:hover\s+\.tip/.test(trends),
    "it opens on plain :hover, so the page still ships no JavaScript"
  );

  /*
   * Density. Above `DOT_MIN_SLOT` the plain dots stop being drawn — but the
   * *line* keeps every run, and nothing is averaged or resampled anywhere.
   * A downsampled series would put a number on screen that no run measured.
   */
  check("X6.12", chart.includes("DOT_MIN_SLOT"), "the chart thins its dots by density");
  check(
    "X6.13",
    /showDot=\{slot >= DOT_MIN_SLOT\}/.test(chart),
    "purely from slot width — not from the value, which would drop runs by how bad they were"
  );
  check(
    "X6.14",
    /segments\(\s*points\.map\(\(p\) => p\.alignedMismatchPercent\)/.test(chart),
    "the line is built from every point, so thinning the marks never thins the data"
  );
  check(
    "X6.15",
    !/\baverage|\bmean\(|downsample|bucket|lttb/i.test(chart),
    "nothing is averaged or bucketed — an invented value is worse than a crowded chart"
  );
  // The detail label describes what came back, not what was asked for. Reading
  // it off the requested size told a reader looking at 32 interactive points
  // that they were looking at a line.
  {
    const page = decomment(
      await readFile(path.join(WEB, "app/repos/[repoId]/trend/page.tsx"), "utf-8")
    );
    check(
      "X6.17",
      /trend\.dense[\s\S]{0,200}fully interactive/.test(page) && !/trend\.limit <= MAX_INTERACTIVE_POINTS/.test(page),
      "the interactivity label is driven by the points drawn, not by the size requested"
    );
    check(
      "X6.18",
      page.includes("frameOverview") && page.includes("OverviewChart") && page.includes("<Brush"),
      "the page carries an overview, its chart, and the brush that narrows it"
    );
  }

  check(
    "X6.16",
    chart.includes("dotOnHover"),
    "and a run with no dot still gets a mark when it is hovered, or the card names a point that is not there"
  );

  // Points are drawn last so an open card is not painted over by a later dot.
  const pointsAt = chart.indexOf("<PointMarker");
  check(
    "X6.7",
    pointsAt > chart.indexOf("thresholdPath(points") && pointsAt > chart.indexOf("trend.transitions.map"),
    "points render after the lines and markers, so nothing is drawn over an open card"
  );

  // The sparklines cannot draw a card, and the reason is `preserveAspectRatio`.
  for (const [id, rel] of [
    ["X6.8", "app/repos/sparkline.tsx"],
    ["X6.9", "app/r/[runId]/history-strip.tsx"],
  ]) {
    const src = await readFile(path.join(WEB, rel), "utf-8");
    const stripped = decomment(src);
    const stretched = stripped.includes('preserveAspectRatio="none"');
    check(
      id,
      stretched && stripped.includes("<title>") && stripped.includes("sparkHit"),
      `${rel.split("/").pop()} uses <title>, not a drawn card — its SVG is stretched, so drawn text would smear`
    );
  }

  const report = decomment(await readFile(path.join(WEB, "app/r/[runId]/report.module.css"), "utf-8"));
  for (const [id, css, where] of [
    ["X6.10", trends, "repository view"],
    ["X6.11", report, "report page"],
  ]) {
    check(
      id,
      /\.sparkHit\s*\{[^}]*fill:\s*transparent/.test(css),
      `the ${where}'s sparkline dots have a hit target that actually takes the pointer`
    );
  }
}

console.log(`\n${failures === 0 ? "explainers: all checks green" : `explainers: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
