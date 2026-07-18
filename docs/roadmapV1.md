# Normascope — Roadmap V1: Beyond Figma

*Strategy document, not a build spec. Build specs (BuildV3 → V4) execute the committed path; this maps where the product can go and what would trigger going there.*

---

## The question this answers

Is Normascope a Figma tool? No — and realizing that is the whole roadmap. Figma is where the product started because that's where design intent happens to live today. But strip the branding and look at what has actually been built:

| Asset | What it really is |
|---|---|
| `auto` + Playwright capture | A **"photograph any running UI"** engine — localhost, CI, staging, production |
| Aligned/SSIM diff + significant regions (V3.5 Trust Track) | A **"compare two UIs honestly"** engine — tolerant of noise, honest about drift |
| `explain` + DOM/computed-style capture (V4) | A **"say why they differ, in CSS terms"** engine |
| Action + hosted reports + trends + PR comments | A **team loop** that makes any of the above a shared event |
| `.bridge/design/` snapshots (V3.5 Step 18) | The quiet unlock: the comparison runtime already consumes **plain PNGs from anywhere** — Figma is just one way to fill that directory |

Figma is an *adapter at the edge of the system*, not the system. The Figma-resilience work already reduced it to a sync-time dependency; this roadmap finishes the thought.

## North star

> **Normascope verifies that what shipped matches what was intended — wherever the intent lives.**

Intent can be: a Figma frame. Yesterday's approved build. A staging environment. A folder of mock PNGs from any tool. A design system's tokens. The target mock an AI coding agent was told to build. Each of those is just a different way of producing the "expected" side of a comparison the engine already knows how to run.

---

## Horizon 1 — Unhook the intent source (natural extension of V3.5/V4)

### 1a. Design-source adapters

One config field, several providers:

```json
"source": { "type": "figma" | "images" | "penpot" | "url", ... }
```

- **`images`** — point at a folder of PNGs. Zero API, zero token, zero rate limits. Instantly serves: designers on any tool (Sketch, Illustrator, Affinity), agencies handed static mocks, and anyone Figma-rate-limited to death. Nearly free to build — it's the snapshot directory with a different name.
- **`penpot`** — the open-source Figma alternative. Small user base but API-friendly, philosophically aligned (open-core, self-hosted), and the OSS-community goodwill is worth more than the TAM. Cheap adapter.
- **`url`** — capture a *second URL* as the reference. This quietly creates **environment-vs-environment comparison** (staging vs prod, branch preview vs main) with zero new engine work — capture both sides, diff as usual.

Gate: `images` ships with the first release after V4 (it's days of work). `penpot`/`url` on first real demand signal.

### 1b. Self-baselines → visual regression testing

The snapshot mechanism *is* a baseline store. Add `norma-scope baseline` (capture current build as the approved reference) and compare-against-baseline mode, and Normascope enters the **visual regression market** — Percy, Chromatic, Lost Pixel, Argos, BackstopJS. That market is proven and paying, and the incumbents share two weaknesses Normascope was accidentally built to exploit:

1. **Per-screenshot metered pricing** that teams openly resent (Percy/Chromatic bills explode with matrix builds). Normascope's flat per-org pricing + local-first execution structurally undercuts it — captures run on the user's machines, so volume costs us nothing.
2. **None of them do design-vs-build.** Normascope becomes the only tool answering both "did it change?" (regression) and "is it right?" (design fidelity) with one config, one report, one PR comment.

Honest competition note: this market is crowded and the incumbents have deep CI integrations and years of anti-flake tuning. The wedge is the combination (both comparisons + local-first + non-blocking + flat price), not feature superiority on regression alone. Do not enter it before the Trust Track has proven the diff quality — a flaky diff in regression mode churns users instantly.

Gate: ships only after V3.5 Phase D (alignment/SSIM) has real-world validation. Suggested tag: **V4.5**.

---

## Horizon 2 — Agent-native verification (the bet)

The timing argument: AI coding agents now generate frontends at enormous scale, and the bottleneck has moved from *writing* UI code to *verifying* it looks right. Agents are blind — they diff text, not pixels. Normascope is already, almost accidentally, the missing sensory organ: deterministic scores (`summary.json` v2), structured findings (V4 schema), machine-consumable exit codes (`--strict --json`), and a capture engine that runs wherever the agent runs.

### 2a. MCP server (`normascope-mcp`)

Expose the engine as tools an agent can call: `capture`, `compare`, `explain`, `get_summary`. The loop writes itself: agent builds UI → calls compare against the mock/baseline → receives structured findings ("gap is 16px, expected 32px, selector `.pricing-grid`") → fixes → repeats until under threshold. This is cheap to build (a thin wrapper over the CLI), and it rides the fastest-growing distribution channel in dev tooling — agent tool ecosystems — where being early matters more than being big.

### 2b. Target-mock workflow

The agent-era intent source: a user hands an agent a mock image and says "build this." `norma-scope compare --target mock.png --url localhost:3000` closes that loop with no Figma, no config ceremony. One flag, huge surface area of use.

### 2c. The hosted angle

Agents consume `explain` at machine scale — which is exactly what the V4 economics doctrine was built for: prepaid credits, per-run caps, circuit breakers. Machine customers are the best credit customers (high volume, zero support), and the caps already prevent the failure mode. An "agent seat" is just an API key with a budget.

Gate: MCP server after V4's findings schema stabilizes (an agent-facing schema change is a breaking API). Suggested tag: **V5**. This is the differentiated bet — greenfield, aligned with where the industry is moving, and nobody owns "eyes for coding agents" yet.

---

## Horizon 3 — The intent-verification platform (only if H1/H2 win)

Each of these reuses the engine + loop wholesale and swaps the capture edge. Listed in order of niche-pain-to-effort ratio; none get built without paying demand:

- **Design tokens / brand compliance** — V4 already captures computed styles; checking them against a token spec ("all primaries are `#0F62FE`, spacing is 8px-grid") turns Normascope into brand police across an entire site. Enterprise buyer, recurring pain, and the data is already collected.
- **Localization QA** — same page, N locales, text masked, layout diffed: catches the German-string-broke-the-nav class of bug. Small tool, real niche, no incumbent developers like.
- **Email rendering QA** — Litmus/Email-on-Acid charge heavily for "does this email render right in Outlook." Capture is the hard part (client rendering matrix); everything downstream reuses. Only with strong demand.
- **Mobile (RN/Flutter via simulators)** — big market, heavy capture investment; revisit when the web loop is winning.

---

## What Normascope is *not* becoming

- **Not a generic screenshot API** — commodity, race to the bottom.
- **Not a test runner** — it verifies appearance; Playwright/Cypress own behavior.
- **Not an accessibility auditor** — axe owns it; different buyer, crowded.
- **Not a Figma plugin business** — that would deepen the dependency this roadmap exists to shed.

The through-line for saying no: if a feature doesn't reduce to *capture two states of a UI, compare honestly, explain the difference, share the result*, it's someone else's product.

## Sequencing summary

| Tag | What | Prerequisite | Gate signal |
|---|---|---|---|
| V4.5 | `images` adapter + self-baselines (visual regression) | Trust Track validated in the wild | Snapshot feature adoption; first "can I use it without Figma?" requests |
| V4.5+ | `penpot`, `url` adapters | images adapter | Demand signal (issues/requests) |
| V5 | MCP server + target-mock workflow | V4 findings schema stable | Agent-tooling ecosystem traction (already high) |
| V5.x | Agent credit metering at scale | V4 economics live | First machine-scale credit consumers |
| V6 | Tokens/brand, localization, email, mobile | H1+H2 revenue | Paying demand per surface, individually |

## Why this can win

The moat isn't any single feature — it's the compound: **local-first trust** (code readable, screenshots stay yours), the **non-blocking philosophy** (adoption without fear), a **diff teams can believe** (the entire Trust Track investment), **one engine answering both "did it change" and "is it right"**, and **being agent-native early** while incumbents retrofit. Figma was the first intent source, and it will stay a great one — but the product is the verification loop, and intent sources are plugins.
