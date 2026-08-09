# Normascope — showcase test runs

Evidence for normascope.com. Every number here came out of `norma-scope` on a
real site; nothing is mocked, hand-drawn, or retouched. Cases 01-02 are measured
on **0.7.5**, now live on npm; cases 03-05 on 0.7.3-0.7.4, noted per case.

Five cases, one per surface the product ships on:

| Case | Question | Headline |
|---|---|---|
| [case-01-fidelity-bose](case-01-fidelity-bose/) | *Does the build match the design?* | **36.4%** off its own Figma frame, 10 regions, 3 drifted sections |
| [case-02-regression-portfolio](case-02-regression-portfolio/) | *Did anything change that I didn't mean to change?* | 5 realistic one-line commits, each caught and localised — **0.73% to 97.36%** |
| [case-03-explain-ai](case-03-explain-ai/) | *Why did it drift?* | real API run, **$0.38** for 7 frames — with 2 wrong findings, reported honestly |
| [case-04-mcp-agent](case-04-mcp-agent/) | *Can an agent check its own work?* | live MCP loop: **4 flagged → fix → 0 flagged**, plus 2 security refusals |
| [case-05-pr-github-action](case-05-pr-github-action/) | *What does my team see on a PR?* | real branch pushed, sticky comment showing **4 of 6** frames flagged |

Four findings came out of this. **All four are fixed and shipped in
`norma-scope@0.7.5`**, verified against the published package:

- **[finding-peer-dependency-install](finding-peer-dependency-install/)** —
  `npm install norma-scope` fails outright on npm 10 in any project that uses
  `@anthropic-ai/sdk` outside `^0.112.3`. A shipped install blocker, invisible
  on npm 11. **Fixed and published**, with a regression test.
- **[finding-capture-viewport](finding-capture-viewport/)** — `init` persisted
  the design frame's *height* as the browser viewport, so any page using `vh`
  units captured wrong. Root cause of the Bose case reading 79.7% instead of
  36.4%. **Fixed and published.**
- **[finding-baseline-sensitivity](finding-baseline-sensitivity/)** — baseline
  mode reported 0.00% on colour and font-weight changes, inheriting a tolerance
  meant for Figma rasterisation. **Fixed and published**; case-02's numbers are
  re-measured on the fix, and `s5-design-token-drift` went from 0.00% to 97.36%.
- **[finding-git-stderr-leak](finding-git-stderr-leak/)** — `fatal: not a git
  repository` printed mid-run on every successful run outside a repo.
  **Fixed and published.**

`norma-scope@0.7.5` is live. `normascope-mcp@0.2.2` — which carries the peer
fix plus the MCP `compare` capture fix — is **not yet published**; npm still has
0.2.0.

---

## Case 01 — design fidelity, third-party site

A public Bose landing-page implementation diffed against the Figma file it
was built from. Neither the site nor the design is ours, which is the point:
this is what accumulated drift looks like on somebody else's real project.

```
Bose — Landing Page (desktop)   36.41% aligned  ·  SSIM 62  ·  10 regions  ·  3 drifted sections
```

The diff overlay shows the two real defects: the shipped page uses
**different photography** from the design throughout, and the hero is tall
enough to push every section below it out of registration.

### The capture bug this case uncovered — now fixed

Getting this number required fixing the tool first. `init` persisted each Figma
frame's dimensions as the capture viewport, so a 1260×4596 design frame set a
**4596px-tall browser window**. The Bose hero is `height: 100vh`, so it rendered
4596px tall and the page ballooned to **8554px** against a 4596px design. That
scored **79.7%** with a size warning and section alignment switched off — a
number that reads as "tool misconfigured", because it was.

A viewport is a window, not an artboard. In 0.7.5 the design's *width* still
sets the capture width (it makes columns line up) but the height is a normal
900px window. The page then renders 4858px — 5.7% off the design, inside
tolerance — banded alignment engages, and the score becomes the **36.4%** above.

Fixed in `src/init.ts` and `src/auto.ts`, with `doctor` now warning on any
configured viewport taller than a real screen, since existing configs carry the
bad value explicitly and upgrading alone cannot repair them. `COMMANDS.md`'s
worked example and `init` step 7 are corrected. Full write-up:
[finding-capture-viewport](finding-capture-viewport/).

---

## Case 02 — visual regression, our own site

`harshaattray.com` (the `/@norma` product page, plus `/articles` and `/lab` as
controls) captured as **7 section-level frames**, approved as a baseline, then
subjected to five separate commits. Each commit is the kind of one-line change
that passes code review without comment.

| Scenario | The commit | Frames flagged | Peak |
|---|---|---|---|
| [s1-vertical-rhythm](case-02-regression-portfolio/scenarios/s1-vertical-rhythm/) | `py-20 md:py-32` → `py-12 md:py-20` | 2 of 7 | **23.05%** |
| [s2-container-width](case-02-regression-portfolio/scenarios/s2-container-width/) | `max-w-6xl` → `max-w-5xl` | 4 of 7 | **12.73%** |
| [s3-cta-button](case-02-regression-portfolio/scenarios/s3-cta-button/) | install button padding + radius | 1 of 7 | **3.41%** |
| [s4-image-aspect-ratio](case-02-regression-portfolio/scenarios/s4-image-aspect-ratio/) | `aspect-[4/3]` → `aspect-square` | 1 of 7 | **4.07%** |
| [s5-design-token-drift](case-02-regression-portfolio/scenarios/s5-design-token-drift/) | `paper: '#eee7e4'` → `'#e6ddd6'` | 5 of 7 | **97.36%** |
| [s6-control-no-change](case-02-regression-portfolio/scenarios/s6-control-no-change/) | nothing | 0 of 7 | 0.41% |

Threshold was 0.5%. Every scenario reverts cleanly; the working tree was
verified clean after each.

### Why this is the better sales story

**Blast radius is the product.** `max-w-6xl → max-w-5xl` is five characters and
lights up four of seven frames. `aspect-[4/3] → aspect-square` is a bigger
visual change but touches one. A developer cannot eyeball that difference;
the report states it.

**Both classes of change are covered, and they look nothing alike.** The four
geometric commits produce small red boxes on a ghosted page. The design-token
commit — one hex in `tailwind.config.js` — floods the whole background red and
leaves the text untouched, at **97.36% mismatch but SSIM 99.9**. That divergence
is the signature of a recolour: nothing structural moved, every pixel changed.

**The controls stay silent.** `/lab` sits at exactly 0.00% through all five
regressions — including the token change, because it is dark-themed and never
touches `paper`. A visual-diff tool that cries wolf is worse than no tool, and
this run is the evidence that it doesn't.

**The noise floor is real, small, and bounded.** The hero holds a live
`animate-pulse` badge and a rotating "Scanning / Measuring" label, so it does
not sit at a hard zero: across unmodified runs it measures 0.00%–0.41%. Not
identical run to run — don't claim it is. The six frames without animation stay
at exactly 0.00%. The margin narrowed with the sensitivity fix — 0.41% against a
0.5% threshold is thin — and freezing animations at capture time would put that
frame at a hard zero too. Worth doing before launch.

### Reproducing

`config.json`, `baseline/`, and a `change.patch` per scenario are all here.
With the portfolio dev server on `:5173`:

```bash
node bin/bridge.js check --json
```

---

## Case 03 — `explain`

A real `explain` run against the s2 regression, billed to a live key:
**$0.38 for 7 frames**, because triage skipped 3 below-threshold frames
outright and killed a 4th at the cheap haiku stage before the expensive model
saw it.

It localised the drift, and on the /@norma page it flagged the *decorative
mock diff UI* (text reading "18.4% SHIFTED", "Δ18px") as
`injection-suspected` — the documented threat model firing unprompted on real
page content.

It also produced **two confidently wrong findings** (a Poppins font-loading
hypothesis and a capture-viewport hypothesis, neither real) and never named
the actual one-line cause. The case file states this plainly. Sell `explain`
as a ranked starting point, not as "it tells you what broke" — the tool's own
wording, *"hypotheses, never gates"*, is the wording to use.

---

## Case 04 — MCP

The agent loop, run live over stdio: agent edits → `capture` → `compare` →
**4 of 7 flagged** → agent fixes → **0 flagged**. Raw JSON-RPC transcripts
included.

Both security guardrails verified against real attacks: a capture of the AWS
metadata endpoint (`169.254.169.254`) and a `../../../../etc/passwd`
traversal. Both refused, both written to `.bridge/.mcp-audit.log` with a named
reason. That audit trail is the answer to "why not just let the agent run a
screenshot script".

Two defects fell out: `compare` doesn't capture (an agent calling it alone
after an edit gets a stale clean score — we hit this), and `normascope-mcp`'s
`^0.7.0` floor lets a stale 0.7.0 reject valid baseline-only configs.

---

## Case 05 — the PR

Branch `demo/normascope-visual-verification` is **pushed** to
`harshattray/my-website`. The PR itself is **not open** — no `gh` and no token
on this machine — and nothing was merged. One click opens it:
https://github.com/harshattray/my-website/pull/new/demo/normascope-visual-verification

The workflow deliberately does **not** use the stock composite Action, and the
reason generalises: committed baselines are captured on macOS, CI runs on
Linux, and diffing across the two produces huge mismatches unrelated to the
change. It runs two passes in one runner — base sha, then head sha — so both
captures share hardware, OS, browser and fonts. Worth folding back into
`action.yml`.

---

## Recommended framing for normascope.com

Lead with **s2-container-width**. Five characters, four frames, a report that
names each one. It is the most honest illustration of the thing a human is
worst at.

Use **case-01** as the second beat: same tool, someone else's site, a design
it was supposed to match, 36% apart.

Show the **control row** somewhere. "Two of these seven frames changed. Five
did not, and we can prove it" is the claim competitors can't make casually.

Do not lead with the raw percentage alone. 15.16% sounds either alarming or
trivial depending on the reader; "one commit, two sections, here is the
overlay" does not.

---

## Provenance

- `norma-scope` v0.7.5 (branch `fix/optional-peer-install`, unpublished) for
  cases 01-02; v0.7.3-0.7.4 for cases 03-05, which predate the fixes and are
  unaffected by them (`explain` economics, MCP protocol, PR comment rendering)
- Case 01: `https://alina-kabanets.github.io/bose-landing-page/` vs Figma
  `OMjQNb3hg1LKMV4OwyQ3Ao` frame `26:51`, fetched live 2026-08-05
- Case 02: `Downloads/Projects/portfolio` at commit `f165935`, branch
  `normascope-cloud-rename`, dev server on `:5173`, Chrome via
  `playwright-core`, 1440px viewport, 1x scale. Runs were executed from a
  scratch directory *inside* the repo so each report resolves the real branch
  and commit; the repo's own committed `.bridge/` was left untouched
- Every scenario patch was applied, verified live in the browser, captured,
  then reverted with `git checkout`
- Case 03: `norma-scope explain` against a live Anthropic key, models
  `claude-haiku-4-5` (triage) and `claude-sonnet-5` (analysis)
- Case 04: `normascope-mcp` v0.2.0 over stdio JSON-RPC, protocol `2024-11-05`
- Case 05: branch pushed to `harshattray/my-website`; local working tree and
  branch were restored afterwards, and the two pre-existing uncommitted items
  in that repo were left untouched and out of the commits
