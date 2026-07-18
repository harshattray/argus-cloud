# Normascope — Horizons Build Plan (H1 / H2 / H3: build, scale, monetize, secure)

## Instructions for Claude

This is the **master sequencing document**. The identity decision is settled per **RebrandV1.md**: the Normascope name stays for everything (a product of the parent company; paid tier = **Normascope Cloud**, never a second brand) — Stage 0 is repositioning only (three-door README, Figma demoted to one source adapter), and Stage 4 files the "Normascope" trademark. The detailed executable specs are **BuildV3.5.md (Stages 0–4: rebrand → trusted source-agnostic engine → team loop → MCP → hosted revenue)** and **BuildV4.md (Stage 5: explain + metered intelligence)** — both restructured to follow this document's stage order natively, each with per-stage test plans and security protocols that must pass before a stage is complete. The old BuildV3.md remains only as verbose GitHub-Action reference material. Execute BuildV3.5.md first, then BuildV4.md. All standing rules carry over: never fabricate economics (measure `usage`, price against the live pricing page), never fabricate security posture (suites must run or gaps are listed as open risks), stop and hand the user a numbered list when a step needs accounts/secrets only they can create, and every stage preserves the never-throw, non-blocking, free-CLI-forever contracts.

---

## The Verdict First: Pivot or Persist?

The question behind this document: *should V3.5/V4 be abandoned in favor of the horizons, since a Figma-tied tool is the smaller game?*

**Answer: re-sequence, don't abandon — because the horizons are built out of V3.5/V4's components.** Tracing the dependencies makes it obvious:

| Horizon capability | What it's made of |
|---|---|
| H1b visual regression | The Trust Track diff (V3.5 Phase D) + the snapshot mechanism (V3.5 Step 18) + the Action/PR loop (V3.0) |
| H1a source adapters | The design-source seam the Figma-resilience work (V3.5 Phase E) already created |
| H2 MCP / agent verification | `summary.json` v2 (V3.0), the findings schema + explain engine (V4), capture (V2) |
| H2 agent credit metering | The entire V4 economics doctrine (prepaid, caps, circuit breaker) |
| Monetizing any of it | The V3.5 cloud (orgs, billing-via-MoR, hosted reports, trends) |

Skipping V3.5/V4 wouldn't be a pivot *to* the horizons; it would be deleting the horizons' parts list. What the instinct gets **right** is the ordering and the framing:

1. **De-Figma before deep-hosting.** The original sequence built a Figma-coupled hosted product first and generalized later. Inverted here: the source-agnostic engine and adapters come first, so everything hosted is born multi-source.
2. **Agent-native comes early**, not as a V5 afterthought — it's cheap and its window is now.
3. **Figma is demoted from identity to adapter #1.** Positioning changes from "compare your build against Figma" to "verify what shipped matches what was intended — design file, yesterday's build, or the mock your AI agent was given." Figma remains a fully supported source; it stops being the headline.

What actually gets dropped: nothing structural. Deferred: Figma webhooks (already a design note), deeper Figma-specific features (none were planned). Everything else survives, re-ordered below.

---

## Operating Principles (unchanged, binding on every stage)

- The CLI is free forever, open, never obfuscated; the cloud repo is private. New user-visible value accrues server-side; trust features accrue CLI-side.
- Non-blocking by default everywhere; strictness is always opt-in.
- Local-first: captures and screenshots stay on user machines unless explicitly uploaded.
- **No Stripe** (India constraint) — merchant of record (Paddle/Lemon Squeezy), Razorpay INR later.
- LLM spend is prepaid-credit-metered with a measured-COGS 3× pricing floor and hard caps — no code path with unbounded bill exposure, theirs or ours.
- One-person-operable is a Definition-of-Done item at every stage.

---

## The Staged Path

| Stage | Name | Repo(s) | Horizon | Revenue state |
|---|---|---|---|---|
| 1 | Trustworthy, source-agnostic engine | `norma-scope` | H1 | Free (building trust) |
| 2 | The team loop | `norma-scope` | — | Free (building funnel) |
| 3 | Agent-native | `norma-scope` (+ `normascope-mcp` workspace package) | H2 | Free (building distribution) |
| 4 | Hosted & paid | `argus-cloud` (private) | H1 | **First revenue** |
| 5 | Explain + agent metering | both | H2 | **Second revenue line** |
| 6 | Platform expansions | as needed | H3 | Demand-gated |

### Stage 1 — The Trustworthy, Source-Agnostic Engine

**Build** (CLI repo):
1. **Trust Track** — BuildV3.5 Steps 13–16 verbatim (SSIM + section alignment, aligned score primary, adversarial no-false-green validation). This is the foundation for *every* comparison mode; nothing else ships until a faithful implementation scores green.
2. **Figma politeness + snapshots** — BuildV3.5 Steps 17–18 verbatim (version-keyed cache, 429 discipline, committable `.bridge/design/`, zero-Figma-call CI).
3. **NEW: source adapter interface.** One seam: a source produces named PNGs + optional dimensions into the design store. Providers: `figma` (existing code refactored behind the seam), **`images`** (a directory — zero API), `url` (capture a second URL as reference → env-vs-env comparison). `penpot` stub documented, built on demand.
4. **NEW: comparison modes.** `mode: "fidelity"` (vs design source — today's behavior) and `mode: "baseline"` (vs last approved capture): `norma-scope baseline` approves the current build into `.bridge/baseline/` (committable, same mechanics as snapshots); `compare` diffs against it. Reports/terminal label the mode. One config can hold both modes for different frames.

**Verify:** Trust Track acceptance (fixture: exact 0%, AA under threshold, shifted flags with regions); a Figma-free repo (images adapter + baselines) runs the entire pipeline with the network blocked.

**Monetize:** nothing — all free. This stage is credibility.

**Security:** no new surface (all local).

**Gate to Stage 2:** the aligned diff validated on ≥2 real-world pages; `images` adapter exercised end-to-end.

### Stage 2 — The Team Loop

**Build** (CLI repo): BuildV3.md essentially verbatim — `FIGMA_TOKEN`/env handling, `--json` with `summary.json` v2 (**add `mode` and `source` fields to the schema now**, so the Action, comment, and future dashboard are mode-aware from day one), `--strict`, comment renderer, composite Action, artifact-based baselines-for-deltas. PR comment displays mode and design source (incl. snapshot age).

**Monetize:** still free — the Action is the funnel's engine.

**Security:** tokens via CI secrets only, never logged; comment renderer escapes everything (it will later carry LLM text); Action never executes repo-controlled config as code.

**Scale note:** compute runs on users' CI — cost to us stays zero regardless of adoption.

**Gate to Stage 3:** sticky comments live on at least one external repo in both modes.

### Stage 3 — Agent-Native (H2, part 1)

**Build:** a thin new public package, `normascope-mcp`, wrapping the CLI as MCP tools: `capture`, `compare`, `get_summary` (structured v2), `list_frames`. Plus the **target-mock flow** in the CLI proper: `norma-scope compare --target mock.png --url http://localhost:3000` — the "agent was handed an image, did it build it?" loop with zero config ceremony. `explain` becomes an MCP tool in Stage 5.

**Security (new surface — take it seriously):**
- **SSRF is the headline risk.** An agent (possibly steered by injected content) can request captures of arbitrary URLs — internal admin panels, cloud metadata endpoints (`169.254.169.254`), intranet hosts. Controls: capture URLs restricted to configured origins (`app.baseUrl`, explicit allowlist); link-local, metadata, and private ranges blocked by default unless the origin is explicitly configured; every capture URL logged.
- **Filesystem containment:** tools write only inside `.bridge/`; no path parameters that escape it; no arbitrary-file-read tools.
- **Outputs are data:** summaries/findings returned to agents are schema-validated text; document for agent-host authors that Normascope output must be treated as data, not instructions (the V4 injection posture, extended one hop).
- **No secrets in tool output**, ever — including config echoes.

**Monetize:** free — deliberately, for the same reason BYO exists: the server is a thin wrapper over the free CLI, so a paid gate would just hand the registry listing to a weekend community fork of our own tool. The MCP is the *pipe*; the paid things flow through it later: `explain` via prepaid credits and budgeted **agent keys** (Stage 5 — machine-scale consumers are the best credit customers), and hosted org features (cache pull, result upload) that light up when the server is configured with a `NORMASCOPE_API_KEY` (Stage 4+). The line held everywhere: local/single-player free; team, hosted, and metered intelligence paid.

**Gate to Stage 4:** organic usage signals (MCP installs, agent-workflow mentions) — or simply Stage 4 readiness; Stages 3 and 4 can overlap, they touch different repos.

### Stage 4 — Hosted & Paid (first revenue)

**Build** (`argus-cloud`, private): BuildV3.5 Phases A–C verbatim (upload API, hosted reports with sandboxed CSP, auth/orgs/magic-link designer seats, dashboard, trends, MoR billing, deletion/retention, ops/backups/legal) plus Step 19 generalized: the org-scoped, CLI-populated cache stores **design exports and approved baselines** — same mechanism, both artifact types. Launch checklist (Step 20) including the **FSL/BSL license decision and the "Normascope" trademark filing** (one word mark covers both tiers).

**Positioning shift (the pivot made visible):** the paid product launches as *both* design-fidelity **and** visual regression — a direct Percy/Chromatic alternative with the two structural advantages: **flat per-org pricing with unlimited screenshots** (their per-screenshot metering is the single most-resented pricing in the category, and our captures run on customers' machines so volume is free to us) and the fidelity mode nobody else has.

**Monetize:** Free (full CLI, both modes, Action, artifacts) / **Team ~$29/mo per org** (hosted links, trends, dashboard, designer seats, org cache, unlimited screenshots), 14-day no-card trial, MoR checkout. Trends charts must handle both modes.

**Scale:**
- *Tech:* stateless app; R2 for artifacts (zero egress — every report view is egress); `frame_stats` is the only growth table — partition by month when it hurts, not before; background jobs (retention sweep, reconciliation) as scheduled tasks before reaching for a queue.
- *Distribution:* npm + Action marketplace + MCP registries + one honest case study per mode (the Bose-style writeup for fidelity; a real regression catch for baseline mode).
- *Org:* runbook-driven solo operation; first hire trigger = support load exceeding ~1 day/week, and it's a support-minded engineer.

**Security:** the full V3.5 doctrine (private-by-default reports, revocable share links, hashed upload-scoped API keys, sandboxed report CSP, hard deletion, backups drilled, subprocessor/legal pages) + org isolation extended to the baseline cache.

**Gate to Stage 5:** paying orgs exist; support load understood; margin data from real traffic.

### Stage 5 — Explain + Agent Metering (H2 part 2, second revenue line)

**Build:** BuildV4 verbatim (context capture, deterministic assembly + secret-scan blocking, findings schema, BYO-key CLI `explain`, calibration against real `usage` data, credits ledger, MoR packs, hosted Explain + CI batch, security validation suites) with two additions:
1. `explain` exposed as an MCP tool — BYO key locally; hosted key + credits when the MCP server is configured with a `NORMASCOPE_API_KEY`.
2. **Agent keys**: API keys with per-key budgets and rate caps — an "agent seat" is a key with a spending limit. The V4 caps/circuit-breaker doctrine already assumes machine-scale consumers; this is its intended customer.

**Monetize:** credit packs at ≥3× *measured* blended COGS (Haiku triage → Sonnet analysis → Opus deep tiering; batch API for CI; prompt caching); included Team allotment <15% of plan price at worst-case COGS; monthly reconciliation with a reprice runbook. Machine consumers are the best credit customers: high volume, zero support, capped by construction.

**Security:** the full V4 doctrine (both trust boundaries, injection suites incl. in-screenshot instructions, XSS-inert rendering, tenant isolation, server-side-only provider key) + the agent-relay note: findings consumed by agents are data; the `injection-suspected` category surfaces attempts.

**Gate to Stage 6:** explain COGS measured and margin holding; injection suite green in production config.

### Stage 6 — Platform Expansions (H3, each individually demand-gated)

In niche-pain-to-effort order; **none begins without paying demand**, each reuses engine + loop and swaps the capture/spec edge:

1. **Design tokens / brand compliance** — the V4 context capture already collects computed styles; a token spec (colors/typography/spacing rules) checked at capture time turns Normascope into brand police. Sell as a Team add-on or higher tier. Security: token specs are config, not code; no new data flows.
2. **Localization layout QA** — same page × N locales, text-masked layout diff. Small build, real niche.
3. **Email rendering QA** — requires third-party client-rendering infrastructure; a **new data flow** (emails leave the machine) demanding its own disclosure + opt-in. Only with strong demand; priced as its own module (the Litmus-refugee market).
4. **Mobile (RN/Flutter via simulators)** — largest build cost; revisit when the web loop is winning and funded.

---

## Cross-Cutting Maps

### Monetization map

| Layer | Free | Paid |
|---|---|---|
| Engine (capture, all sources, both modes, diff, reports) | ✅ forever | — |
| CI loop (Action, PR comments, artifacts, MCP server) | ✅ | — |
| Hosted loop (links, trends, dashboard, seats, org cache) | — | Team, flat per-org |
| Explain | BYO key, local | Credits (hosted, CI batch, agent keys) |
| H3 modules | — | Per-module add-ons |

All payments via merchant of record (no Stripe anywhere); Razorpay evaluated only if an INR/domestic segment materializes. Two revenue lines (subscription + credits) with independent margin protection: flat plan costs scale with orgs (near-zero marginal cost — compute is at the edge), credits carry the 3×-measured-COGS floor.

**Sustainability math (sanity-checked 2026-07):** fixed floor ≈ $20–30/mo at launch (Vercel Pro; everything else on free tiers), ≈ $60–80/mo on paid DB/mail tiers. Marginal cost per busy Team org (20 CI runs/day, 3.5MB reports, 90-day retention) ≈ $0.07/mo R2 + noise DB — under $1 all-in, because captures/diffs run on customer machines and R2 egress is free. Contribution per $29 org after MoR cut (~$1.95) and worst-case included-LLM allotment (<15% rule): ≈ $22 (~75%). **Break-even ≈ 3–4 Team customers**; margins improve with scale. The binding risks are volume (funnel), storage-abuse caps (--full reports), and founder support time — not unit costs.

### Security map (boundary → controls)

| Boundary | Top risks | Controls |
|---|---|---|
| User machine (CLI) | secrets in `.env.local`; screenshot sensitivity | local-first; nothing leaves without `--upload`/`explain` opt-in; secret scanner blocks outbound context |
| CI | token leakage; strict-mode surprises | secrets-only tokens, never logged; strict opt-in; skips never fail runs |
| MCP / agents | **SSRF via capture**; output-as-instructions relay; runaway loops | origin allowlist + metadata/private-IP block; `.bridge/`-contained writes; schema-validated data-only outputs; per-key budgets |
| Cloud | tenant isolation; report XSS; key theft; data demands | org-scoped everything (incl. caches); sandboxed report CSP; hashed scoped keys; hard deletion + retention; backups drilled |
| LLM provider | prompt injection; secret exfiltration; cost blowout | data-block delimiters + no-tools single-shot; scanner-blocked outbound; prepaid + caps + circuit breaker; server-side-only provider key |
| Payments | card data; fraud | MoR holds all card data (none touches us); prepaid credits remove chargeback-sized exposure |

Four standing test suites, run per release: injection (incl. in-screenshot), secret-scan e2e, tenant isolation probe, SSRF (capture-URL) suite.

---

## What We Are Still Not Doing

Generic screenshot API; test runner; accessibility audits; Figma plugins; auto-fix PRs (V-next, only after findings earn trust); CI blocking by default; hosting anything that makes the free CLI worse. The test stands: if it doesn't reduce to *capture two states, compare honestly, explain the difference, share the result* — it's someone else's product.

## Definition of Done for the Re-Sequencing Itself

1. Positioning (README, marketing copy) says design-fidelity **and** visual regression, source-agnostic; Figma is listed as one supported source, first among equals.
2. A user with no Figma account gets full value (images adapter + baselines) — verified in docs and in a walkthrough.
3. Stages ship in this order; no stage's monetization ships before its trust prerequisites (Stage 1 before regression is sold; V4 calibration before credits are sold).
4. The three earlier Build docs remain the step-level source of truth, consumed in this document's order.
