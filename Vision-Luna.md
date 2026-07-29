# Vision Luna — The Next Ceiling for Normascope

## Executive answer

No: Build 3.5 + Build 4.0 are not the potential maximum of this tool.

They define a strong and credible first product: a source-agnostic visual
verification engine, a CI/PR team loop, an agent-readable MCP surface, hosted
reports and trends, and a metered explanation layer. That is enough to earn
trust and reach first revenue.

It is not yet a category maximum because the product still stops at:

```text
intent/design + rendered page → diff → explanation
```

The more significant product is:

```text
intent/design + code + rendered behavior
    → evidence graph → diagnosis → safe repair proposal
    → verified patch → organizational learning
```

That is Luna: a quality-control plane for the gap between what a team meant
to build and what users actually receive.

## What the current plan gets right

The current architecture has unusually good foundations for a larger product:

- Deterministic comparison remains the only gate. The LLM explains; it does
  not decide whether a build passes.
- The source adapter, snapshot, baseline, alignment, and SSIM work make the
  core useful without requiring a Figma account.
- The Action, reports, trends, MCP tools, and hosted history create several
  paths into the same evidence.
- The Build 4.0 security doctrine correctly treats screenshots, DOM, code,
  prompts, and model output as untrusted.
- Prepaid credits, hard caps, result caching, usage events, and a circuit
  breaker are the right constraints for a one-person-operable product.
- History-aware hosted findings are the beginning of a data advantage that a
  local BYO-key run cannot reproduce.

These choices should remain non-negotiable. Luna should extend the trust
model, not replace it with an autonomous black box.

## The current ceiling

Build 3.5 and Build 4.0 together make Normascope a trusted visual regression
and explanation product. Its immediate ceiling is therefore:

1. It detects that pixels or structure drifted.
2. It explains a likely cause with a selector, code pointer, or hypothesis.
3. It stores enough history to identify recurrence and first drift.
4. It reports the result to developers, designers, CI, and agents.

That is valuable, but the core unit is still a frame and a run. The product
does not yet understand a whole product's intent, user journeys, component
contracts, semantic accessibility, responsive behavior, or whether a proposed
change actually fixed the underlying regression. The explicitly deferred
items in Build 4.0—auto-fix PRs, conversational follow-up, design-token
extraction, source-map mapping, and additional CI providers—are signals of
this unfinished surface, not the end state.

There is also an execution reality: according to `docs/CHECKPOINT.md`, Phase
A and Phase C are green, Phase B has not yet been calibrated with a real API
key, Phase D and Phase E have not started, and Build 3.5 Stage 4's hosted
foundation is still prerequisite debt. The current plan must reach a live,
measured product before Luna-scale expansion is attempted.

## The significant product: Luna

### 1. Build an evidence graph, not only a run history

Represent relationships among:

- design frames, snapshots, and versions;
- routes, components, DOM regions, selectors, and source locations;
- commits, pull requests, builds, deployments, and incidents;
- visual, layout, accessibility, responsive, and interaction observations;
- previous findings, accepted fixes, rejected hypotheses, and verified outcomes.

The graph lets the system answer questions that a pixel diff cannot:

- Where did this regression first appear, and what changed with it?
- Which component or token causes the same drift across 18 routes?
- Is this a new defect or a known intentional exception?
- Did the last suggested fix reduce the measured problem without creating a
  second one?

This is the most defensible long-term asset: structured, tenant-isolated
evidence of how visual quality changes over time.

### 2. Turn intent into executable contracts

Designs are not the only source of intent. Luna should accept lightweight
contracts from designs, component metadata, product requirements, and user
journeys:

- required content and landmarks;
- spacing, typography, color, and token constraints;
- responsive invariants and allowed breakpoints;
- interaction states: loading, empty, error, hover, focus, keyboard, and
  reduced motion;
- accessibility expectations;
- approved differences and their scope.

The output is not a vague natural-language brief. It is a versioned,
machine-checkable contract that deterministic checks and evidence collection
can execute. This expands the product from “does this screenshot match?” to
“does this implementation satisfy the intended experience?”

### 3. Add behavior and journey verification

A page can pass a screenshot check while its important behavior is broken.
The next major verification layer should capture a user journey as an
evidence bundle: states visited, network outcomes, focus movement, keyboard
path, responsive viewport, console errors, and screenshots at meaningful
checkpoints.

The first version should remain deterministic and bounded. It should not try
to be a general browser-testing platform. Start with a small set of journeys
that connect directly to visual evidence: navigation, form submission,
loading/error states, modal/focus behavior, and responsive transitions.

### 4. Make repair a controlled experiment

Auto-fix should not mean “let the model edit the repository.” The safe Luna
loop is:

1. Produce a grounded hypothesis with evidence and confidence.
2. Generate a minimal patch in an isolated worktree.
3. Run the relevant visual, behavioral, accessibility, and existing test
   checks.
4. Compare before/after evidence and check for collateral regressions.
5. Open a PR only when the result meets an explicit confidence policy.
6. Learn from human accept, edit, or reject decisions.

The first repair domain should be narrow and high-signal—spacing, tokens,
simple CSS values, or a clearly mapped component prop. The system should
decline ambiguous fixes. Every generated patch must be reversible, attributed,
and reviewable.

### 5. Become history-aware at the organization level

The current plan starts this with first-drift attribution and recurrence.
Luna can grow it into quality intelligence:

- regression risk by component, route, team, and release;
- recurring defects and the cost of repeated review cycles;
- drift budgets for critical surfaces;
- change-impact predictions before a merge;
- intentional-change memory so approved differences do not keep resurfacing;
- a “quality debt” queue ordered by user impact and recurrence, not raw pixel
  count.

This creates value even when no new LLM call is made. The durable moat is the
organization's verified history and decisions, not a proprietary prompt.

## What to build, in order

### Horizon 0 — Finish the trustable wedge

Complete the work already committed before expanding the surface:

- run Phase B calibration and derive prices from real usage;
- build the missing Stage 4 web/auth/report substrate;
- complete Phase D hosted explain, batch CI, and MCP org-key paths;
- execute Phase E security and live end-to-end evidence;
- get one or two paying teams through the complete loop;
- measure explanation usefulness: accepted, edited, rejected, and repeated
  findings.

The key product question is not “can the model explain a diff?” It is “does
the explanation reliably shorten the time from red build to verified fix?”

### Horizon 1 — Evidence graph + contracts

Add a schema-versioned evidence model and contract compiler. Begin with
component/route identity, token references, approved exceptions, and
first-drift/recurrence links. Add contract checks that use existing capture
and diff infrastructure.

Success means one finding can be traced from intent to rendered region to
commit, and one accepted exception stops producing noise without disabling
the entire check.

### Horizon 2 — Verified repair loop

Add isolated patch proposals and verification. Limit the first release to
high-confidence CSS/token changes. Keep the Action green when the service is
unavailable, keep all edits opt-in, and require a normal human-reviewed PR.

Success means the system can resolve a meaningful class of regressions with a
measurably higher first-review acceptance rate than ungrounded suggestions.

### Horizon 3 — Product quality control plane

Add journey evidence, responsive/state matrices, quality debt, impact
prediction, and integrations beyond GitHub. At this point the product is no
longer just a visual diff service; it is the evidence layer connecting design,
code, CI, agents, and production quality.

## Strategic boundaries

Luna should not become an unfocused “AI QA” bundle. Keep these boundaries:

- Deterministic measurements own pass/fail; probabilistic systems produce
  hypotheses, prioritization, and bounded proposals.
- No autonomous production changes. Generated patches go through normal
  review and verification.
- No broad repository upload. Use explicit, minimal, secret-scanned context.
- No credit model that makes core CI availability depend on billing or model
  uptime.
- No attempt to win by adding every provider and test framework at once.
  Expand only where the same evidence graph becomes more valuable.

## Luna in relation to Roadmap V1

Roadmap V1 is the better execution map. It has the correct sequence:

```text
source-independent verification → regression + fidelity
→ agent-native verification → intent-verification platform
```

Luna should not replace that sequence. It is the architectural north star that
explains why the sequence compounds:

| Roadmap V1 | Luna interpretation |
|---|---|
| H1: images, Penpot, URL, and baselines | Expand the set of intent sources and create comparable evidence |
| H2: MCP and target-mock workflow | Make the evidence loop consumable by coding agents |
| H3: tokens, localization, email, mobile | Turn one visual diff engine into a broader intent-verification graph |
| Hosted reports, trends, and credits | Store history, decisions, and verified outcomes as the product memory |
| Current Build 4.0 explanations | Add grounded diagnosis to deterministic evidence |
| Luna repair loop | Verify proposed changes and learn from the result |

The important distinction is that Roadmap V1 mostly expands the **edges** of
the system—where expected and observed UI come from. Luna adds the **middle
layer**: identity, relationships, contracts, causal history, decisions, and
verified outcomes. Without that layer, the product has many adapters and
features but limited compounding intelligence. With it, every adapter and
every run enriches the same evidence model.

### Where Luna agrees with Roadmap V1

The strongest overlap is the roadmap's central thesis: Figma is an adapter,
not the product; the product is the verification loop. The roadmap is also
right to reject a generic screenshot API, a full test runner, a standalone
accessibility product, and a Figma-plugin business. Those boundaries protect
the wedge.

### Where Luna must be corrected by Roadmap V1

Luna's phrase “behavior and journey verification” can accidentally expand
into the generic test-runner territory the roadmap explicitly rejects. Keep it
bounded: capture a small set of visual/interaction checkpoints that enrich a
Normascope finding. Do not build a competing Playwright or Cypress platform.

Likewise, accessibility should initially mean contract-relevant evidence—such
as focus state, landmarks, and keyboard checkpoints—not a general-purpose
axe replacement. Localization, email, mobile, and additional providers remain
Roadmap V1 demand-gated surfaces, not automatic Luna commitments.

### The correct positioning

Roadmap V1 answers: **which market wedges should be opened, and in what order?**

Luna answers: **what common system should make each wedge more valuable than
the last?**

Therefore Luna belongs after the trustable wedge as a cross-cutting platform
direction, with its first concrete slice being evidence identity/history plus
one narrow, verified repair loop—not a simultaneous expansion into every
Horizon 3 niche.

## The decisive moat

The moat is not image comparison alone and not access to a particular model.
Those capabilities will become easier to reproduce. The moat is a trusted,
longitudinal evidence graph containing:

```text
intended rule → observed evidence → diagnosis → human decision
→ verified change → recurrence or resolution
```

If Normascope accumulates that loop across real teams, it can tell a team not
only that its interface changed, but which changes matter, why they happened,
what fixed them before, and whether the fix held. That is a significant
product beyond Build 4.0.

## Final recommendation

Proceed with Build 3.5 and Build 4.0 as the revenue and trust foundation, but
do not treat Build 4.0 as the product vision. Name the next architectural
direction Luna and make the first post-4.0 investment the evidence graph plus
verified repair experiment.

The practical thesis is:

> Normascope begins by proving that implementation matches intent. Luna wins
> by helping teams preserve intent, repair deviations safely, and learn from
> every verified change.

That is both technically significant and commercially larger, while remaining
consistent with the security, deterministic-gate, open-core, and measured-unit
economics principles already established.

## Source documents

- [Checkpoint](docs/CHECKPOINT.md)
- [Build 3.5](docs/BuildV3.5.md)
- [Build 4.0](docs/BuildV4.md)
