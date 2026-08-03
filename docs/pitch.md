# Normascope — The Pitch

*Internal sales/marketing source document. Describes the product as it exists at Build 3.5 completion; features arriving with Build 4.0 are tagged **[4.0]**. Everything here must stay true to the docs' honesty rules: no "semantic understanding" claims, findings are hypotheses, non-blocking by default.*

---

## The one-liner

**Normascope verifies that what you shipped matches what you intended.**

The intent can be a design file, yesterday's approved build, or the mock your AI agent was handed. Normascope photographs your running UI, compares honestly, tells you *where* it drifted — **[4.0]** and *why*, in CSS terms — and posts the result where your team already works: the pull request.

## The 30-second version

Every frontend team has the same silent failure mode: the UI changes when nobody meant it to. A refactor nudges a hero section 24px. A dependency bump breaks the pricing grid on one page nobody looked at. The design said 32px gaps; production has 16px, and the designer finds out in a customer demo. Today you catch these with eyeballs — the most expensive, least reliable QA tool there is.

Normascope catches them in CI. Every PR gets one sticky comment: which frames changed, by how much, where exactly — with a full visual report one click away, viewable by your designer *without a GitHub account*. It never blocks a merge; it makes drift visible and lets your team decide. Free to run locally forever; the team loop is $29/month flat.

---

## Three doors, one engine

### 1. Visual regression — *"catch unintended UI changes in every PR"*

Approve a baseline once (`norma baseline` — it's a folder of PNGs, committed to your repo like any other code). From then on, every PR is compared against it. Changed a button component? The comment shows every page that moved, sorted by how much. Nothing changed? Green line, zero noise.

**Why it's not just Percy-but-cheaper:** the comparison engine is alignment-aware and anti-aliasing-aware. A section that shifted 40px down reads as "one section drifted," not "94% of the page is different." Font-rendering noise doesn't cry wolf. We built the trust layer first, because a visual diff nobody believes is a Slack channel everybody mutes.

### 2. Design fidelity — *"ship what was designed"*

The mode nobody else has. Point a frame at its design — a Figma frame, a folder of exported PNGs from any tool, even another URL (staging vs prod) — and Normascope answers the question that today takes a design-review meeting: **does the build match?** Per-section scores, a structural-similarity second opinion, and a report your designer reads on their phone.

### 3. Agent verification — *"give your coding agent eyes"*

AI coding agents ship frontends fast — and blind. They diff text, not pixels. Normascope's MCP server plugs into Claude Code, Cursor, or any MCP-capable agent: the agent builds, calls `compare` against the mock it was handed (`--target mock.png`), gets a structured verdict, fixes, and repeats until it's actually right. Your agent stops declaring victory on UIs it has never seen.

---

## Feature highlights (benefit first)

- **One sticky PR comment, never spam.** Updated in place on every push. Flagged frames first, deltas against the base branch ("hero: 2.1% → 6.4% ▲"), link to the full report.
- **A report you can send to anyone.** Self-contained, designer-readable, side-by-side build/design/diff with a region overlay showing exactly *where*. On Normascope Cloud, it's a stable private link — no GitHub account needed; designers join the org with magic-link email sign-in, and seats are unlimited at the flat price (viewers cost us ~nothing to serve, so we don't meter them — per-seat charges on viewers would just push teams back to forwarding screenshots).
- **Trends that answer "since when?"** Per-frame history: the commit where drift first crossed the threshold, charted. Stop archaeologizing through old deploys. *(Cloud)*
- **[4.0] Explain: from "12% drift" to "the gap is 16px, should be 32px, look at `.pricing-grid`."** AI-generated findings grounded in the captured DOM and computed styles — with a selector, a CSS hypothesis, and a suggested fix. Labeled as hypotheses, never auto-applied. On Cloud, findings are *history-aware*: "this same region regressed in March; that fix was X."
- **Your screenshots never leave your machines** unless you opt into Cloud. Capture and comparison run locally and in your CI. The code is open — audit it.
- **Rate-limit-proof and offline-proof.** Design snapshots are committed to your repo; CI makes **zero** external API calls. A Figma outage cannot break your pipeline. A design update is a reviewable PR, not an invisible upstream change.
- **Never blocks a merge.** Warnings, not walls — strict mode exists, but *you* turn it on, per repo, when you're ready.
- **Five-minute setup.** `npx norma-scope init`, drop the Action in a workflow, done. No SDK, no code changes, no instrumentation.

## Why teams switch to us

| | Percy / Chromatic | **Normascope** |
|---|---|---|
| Pricing | Per-screenshot metering — bills explode with matrix builds | **$29/mo flat, unlimited screenshots** (they run on *your* CI, so volume costs us nothing — and we pass that on) |
| Where pixels are rendered | Their cloud | **Your machines** — screenshots stay private by default |
| Design-vs-build checking | ✗ | ✅ the only tool with both modes |
| Designer access | Paid per-seat, vendor logins | **Included in the flat price — unlimited magic-link seats, never a per-seat charge** |
| Blocking | Blocks merges by default (review gates) | **Non-blocking by default** |
| AI agent integration | ✗ | ✅ MCP-native |
| Works without vendor uptime | ✗ | ✅ open CLI + committed baselines — CI runs fully offline |
| Explains the *cause* | ✗ | **[4.0]** CSS-level findings with selectors |

## Pricing (simple on purpose)

- **Normascope (free, forever):** the full CLI — capture, both comparison modes, all design sources, reports, the GitHub Action, the MCP server. Runs on your infrastructure; we never see your screenshots. **[4.0]** Even AI findings, free with your own Anthropic API key.
- **Normascope Cloud — $29/mo per organization:** hosted report links, trends & history, team dashboard, unlimited designer seats, org-wide design cache — **for up to 10 repos**. More repos = higher tiers; the price scales with how much of your codebase is verified, never with how many people look. Larger orgs (SSO, audit, retention controls): talk to us. **30-day money-back guarantee** — the free CLI is the trial, and it doesn't expire.
- **[4.0] Review credits (prepaid packs):** hosted AI findings — auto-explained flagged frames in CI, history-aware analysis, agent budgets. Prepaid, capped, no surprise bills — structurally: we can't send you an overage invoice, because there's no such thing.

## Objection handling (for calls/DMs)

- *"Our UI screenshots are sensitive."* They never leave your machines on the free tier — that's architecture, not policy. Cloud uploads are explicit, org-private, hard-deletable, with a published subprocessor list.
- *"We don't use Figma."* Neither does Normascope, necessarily — point it at a folder of PNGs, a URL, or just use baseline mode with no design source at all.
- *"Visual tests are flaky and noisy."* Ours ship with an alignment- and anti-aliasing-aware engine specifically so a real 40px shift and a font-rendering artifact don't score the same. And nothing blocks your merge while you tune thresholds.
- *"What's the lock-in?"* Your baselines and snapshots are PNGs in your repo. The CLI is free and source-available. Cancel Cloud and you lose hosted links and history — never your data or your pipeline.
- *"AI costs will balloon."* Prepaid credits only. When they're gone, analysis pauses and CI stays green. There is no metered-overage code path — we deleted the possibility, not just the default.
- *"Is the AI going to hallucinate CSS?"* Findings are labeled hypotheses, grounded in your page's actual DOM and computed styles, with the selector cited so verification takes seconds. The pass/fail decision is always the deterministic diff — the AI explains; it never judges.

## Who buys, and why (personas)

1. **Frontend teams (5–50 devs) with design-conscious products** — the regression + fidelity combo; the designer seat is the wedge into the design org.
2. **Agencies** — fidelity mode is client-deliverable proof: "here's the report showing we shipped the approved design." The shareable link is the invoice attachment.
3. **Teams building with AI agents** — verification is their bottleneck; the MCP server is the door, agent credit budgets are the expansion.

## Proof points (fill as they land)

- Fidelity case study: the Bose landing-page verification (live public site vs its published design — real numbers, real report).
- Regression case study: first real catch on an external repo (Stage 2 gate produces this).
- Agent case study: an agent iterating a mock to green via MCP (Stage 3 smoke test, recorded).

## The close

> You already review every line of code that ships. Normascope reviews every pixel — in the same PR, without blocking anyone, for less than the cost of one hour of the meeting it replaces.

**CTA:** `npx norma-scope init` — free, five minutes, your machine, and it never expires. When your designer asks for the link: that's Normascope Cloud, backed by a 30-day money-back guarantee.
