# Build 4.0 — Explain + Metered Intelligence (Stage 5)

## Instructions for Claude

This document supersedes the previous BuildV4.md and follows the BuildHorizons.md stage order. **Hard prerequisite: the Build 3.5 Definition of Done is complete** — trusted diff, source adapters, baseline mode, Action, MCP server, and Normascope Cloud are live. Names per RebrandV1.md: Normascope / Normascope Cloud, npm `norma-scope`, bin `norma`, `normascope-mcp`; private cloud repo `github.com/harshattray/argus-cloud`. Repo/branch workflow per Build 3.5's topology section (stage branches, PR gates, dogfooded Action).

Execute phases strictly in order; a phase is complete only when its Test Plan passes and its Security Protocol has recorded evidence. Three hard rules:

1. **Never fabricate economics.** Every cost figure in the final report comes from measured `usage` fields on real API responses, priced against the live pricing page at run time. Figures in this document are planning targets that Phase B replaces.
2. **Never fabricate security posture.** The suites in Phase E must actually run; anything not exercisable is an open risk in the report, never an assumed pass.
3. **Never commit or print a key** — Anthropic, MoR, or otherwise. External needs (an `ANTHROPIC_API_KEY` for calibration, MoR sandbox for packs) → build against recorded fixtures and hand the user a numbered list.

**What this document produces:** the LLM layer — grounded findings that explain *why* a frame drifted — on three surfaces (free BYO-key CLI, hosted credits, MCP tool for agents), with unit economics that cannot lose money and security treated as a first-class deliverable.

---

## Mandate and rank order

**Point at the cause, not just the pixels.** Deterministic diffing remains the sole source of scores and pass/fail; the LLM layer explains — it never gates. Constraints in rank order:

1. **Security** — page content, DOM, and screenshots are untrusted input to the model; model output is untrusted input to us. Both boundaries enforced, not assumed.
2. **Unit economics** — prepaid only, hard caps at every level, a measured-COGS pricing floor, a kill switch. If we can't measure a cost, we don't sell the thing that incurs it.
3. **Utility** — findings must be grounded ("computed 24px on `.pricing-card`, design implies 32px"), not vibes.

## Product shape

### Three surfaces, one engine

| Surface | Who pays the LLM bill | Notes |
|---|---|---|
| `norma explain [frame\|--all] [--deep]` — free CLI | User's own `ANTHROPIC_API_KEY` (env only) | Free-forever holds; their key, their bill |
| Hosted (Normascope Cloud): Explain button + CI auto-explain (top-N flagged, batch) | **Prepaid credits** | Server-side provider key |
| MCP `explain` tool | BYO key locally; org credits when configured with an org API key | Agents are the machine-scale credit customer |

**Why BYO exists / guardrails (settled, keep):** the gate is unenforceable (readable JS), BYO users are the funnel, credits sell the loop not LLM calls. CI/PR integration of findings is **hosted-only** — the Action has no code path accepting a user provider key. The line: local/single-player free; team, hosted, and metered intelligence paid.

**Gating doctrine:** gates live only on substrates we control (servers, data, network) — never as client-side locks, which are readable-JS theater that annoy legitimate users, stop nobody determined, and hand a community fork its reason to exist. The durable way to widen the paid/free gap is **data enrichment, not padlocks**: hosted findings are *history-aware* (see Phase D) — enriched with trend context, first-drift attribution, and cross-frame correlation from the org's stored runs. A BYO user structurally cannot have this: the history lives in our database. That gap grows with every uploaded run — a data moat.

### What an analysis is

Deterministically assembled (same inputs → byte-identical request): cropped image pairs for the top significant regions/sections (downscaled, budgeted) + diff metadata (section table, offsets, scores) + DOM subtree with computed styles for flagged regions (captured at `auto` time into `.bridge/context/`, local until sent) + optional user-configured code-pointer globs (paths + small excerpts, never whole repos). Output: **structured findings only**, enforced via the API's JSON-schema output:

```json
{ "findings": [ {
  "frame": "pricing-page.png",
  "region": { "x": 0, "y": 640, "width": 1260, "height": 320 },
  "category": "spacing | color | typography | missing-element | layout | injection-suspected",
  "observation": "Card grid gap is ~16px in the build vs 32px in the design.",
  "cssHypothesis": ".pricing-grid { gap: 16px } — design implies gap: 32px",
  "selector": ".pricing-grid",
  "codePointer": "src/components/pricing/Grid.tsx",
  "suggestedFix": "gap: 32px",
  "confidence": "high | medium | low"
} ] }
```

Rendered as escaped text with a "generated — verify before applying" label. Nothing is ever auto-applied.

### Model policy

One config module, exact IDs, overridable via config/env:

| Pass | Model | Role |
|---|---|---|
| Triage | `claude-haiku-4-5` | Cheap first look: worth a full analysis? which regions? |
| Analysis | `claude-sonnet-5` | Default explainer |
| Deep (opt-in) | `claude-opus-4-8` | `--deep` / "Deep explain"; costs more credits, says so upfront |

Request hygiene: JSON-schema structured output; static system prompt + schema prefix under `cache_control: {type: "ephemeral"}` (cache reads ≈ 0.1× input price); `max_tokens` capped (~4K); CI auto-explain via the **Message Batches API** (50% price); interactive via the standard API.

---

## The Economics Doctrine (never lose money)

**Planning numbers** (replaced by Phase B measurements; re-verify list prices against the live pricing page): Haiku 4.5 $1/$5 per MTok, Sonnet 5 $3/$15, Opus 4.8 $5/$25; vision ≈ (w×h)/750 tokens/image. Budgeted analysis ≈ 15K in / 1.5K out → triage ~$0.01, analysis ~$0.07 (~$0.035 batched), deep ~$0.11. **Blended COGS target ≤ $0.08/review.**

**The rules:**
1. **Prepaid only, never postpaid.** Credits or included allotment; balance *is* the org cap; credits expire in 12 months (stated at purchase).
2. **Pricing floor: pack price ≥ 3× measured blended COGS**; included Team allotment < 15% of plan price at worst-case COGS; violation → reprice before the next pack sells (runbook).
3. **Hard caps, server-enforced:** per-analysis input budget (~25K tokens, deterministic truncation order: fewer crops → smaller crops → trimmed DOM) and output cap; per-run top-5 auto-explain (config); per-org = balance; global daily provider budget with a **circuit breaker** that pauses explain (product unaffected), alerts a human, shows an honest message.
4. **Never pay twice:** result cache keyed (org, frame, build hash, design hash, model, prompt version); hits free, never decremented, never cross-org.
5. **Meter everything:** append-only usage events (tokens incl. cache splits, computed cost, model, batch/interactive, cache-hit); monthly reconciliation of provider spend vs credit revenue, alert < 50% gross margin.
6. **Failed analyses cost the user nothing** (provider error, refusal, schema failure → no charge, logged).
7. **BYO traffic costs us nothing** — direct user→provider, never proxied.
8. **Agent keys**: API keys with per-key budgets and rate caps — an agent seat is a key with a spending limit; exhaustion → clear error, CI stays green.

## The Security Doctrine (paramount)

Threat model in one line each: an attacker controls the page/design/code we photograph (injection, exfiltration, poisoned "fixes"); a stolen key tries to drain credits; a tenant tries to read another tenant; we ourselves might leak secrets outbound.

1. **Page content is data, never instructions** — delimited data blocks; embedded instructions reported as `injection-suspected`; no tools, no agentic loop — one request, one schema-validated response.
2. **Model output is untrusted** — schema-validated, length-capped, HTML-escaped, never executed or auto-applied.
3. **Nothing secret leaves the machine** — outbound context passes a secret scanner (known-token regexes + entropy); a hit **blocks** with the file named, never silently redacts; `.env*`, design-source tokens, and gitignored files unconditionally excluded from code pointers.
4. **Opt-in + exhaustive disclosure** — off by default, per org *and* repo; data-flow page lists exactly what is sent, what never is, and the provider retention posture (verified in Phase E; the chosen models are compatible with minimal-retention configurations).
5. **Keys server-side only** (hosted); BYO key from env, never written or logged.
6. **Tenant isolation** — per-org queues, caps, caches; encrypted at rest; deletion cascades with runs.
7. **Audit everything** — who, which frame, when, tokens, cost.
8. **Agent relay** — findings consumed by agents are data; documented for agent-host authors.

---

## Build Order

### Phase A — The Engine (CLI repo; free surface)

**A1 — Threat model first.** Write `SECURITY-LLM.md`: the two trust boundaries, exact outbound payload inventory, scanner rules, injection countermeasures, and the scenario list Phase E must run 1:1.
*Test:* the document enumerates every field that can leave the machine; Phase E's suite maps to it one-to-one.

**A2 — Context capture.** With `"explain": { "enabled": true }`: after capture, save DOM subtree + computed styles for elements intersecting flagged regions to `.bridge/context/{frame}.json`; deterministic size cap; nothing captured when disabled.

| # | Test | Pass |
|---|---|---|
| A2.1 | Two runs, same page | Byte-identical context files |
| A2.2 | `explain` disabled | No context files |
| A2.3 | Pathological DOM (10K nodes) | Capped deterministically, no hang |

**A3 — Context assembly + guards.** Pure module: region/crop selection, downscale, DOM/diff assembly, token-budget enforcement with fixed truncation order, secret scanner, unconditional exclusions.

| # | Test | Pass |
|---|---|---|
| A3.1 | Over-budget input | Truncates in documented order; deterministic |
| A3.2 | Planted secrets (AWS key shape, `FIGMA_TOKEN=...`, high-entropy string) in DOM/code excerpts | Analysis **blocked**, file named, exit 0 |
| A3.3 | `.env.local` matched by a code glob | Excluded regardless of config |
| A3.4 | Same inputs twice | Byte-identical assembled request |

**A4 — Prompt + findings schema.** Strict JSON schema (`additionalProperties: false`), hardened system prompt (data delimiters, ignore-embedded-instructions, `injection-suspected`), structured-output wiring, response validation. Golden tests on recorded fixtures — no live calls in the suite.

| # | Test | Pass |
|---|---|---|
| A4.1 | Recorded valid response | Parses, validates, renders |
| A4.2 | Recorded malformed/oversized response | Rejected cleanly, no charge path signaled, no crash |
| A4.3 | Recorded refusal | Per-frame skip with honest message |

**A5 — `explain` command (BYO).** Requires `explain.enabled` + `ANTHROPIC_API_KEY` (helpful message + exit 0 otherwise); triage → analysis (→ `--deep`); prints findings plus that run's token usage and computed cost; per-frame errors isolated.

| # | Test | Pass |
|---|---|---|
| A5.1 | No key in env | Message names the fix; exit 0 |
| A5.2 | One frame errors mid-run | Other frames complete; summary notes the failure |
| A5.3 | Live run on a flagged fixture frame (needs user key; else blocker) | Grounded finding referencing a real region + selector; usage + cost printed |

**A6 — Findings in the report.** Escaped text, confidence badge, region link, "verify before applying" label.

| # | Test | Pass |
|---|---|---|
| A6.1 | Finding containing `<img onerror=alert(1)>` | Renders inert (source-inspected) |
| A6.2 | Report size | Text findings add negligible bytes; size target holds |

**Phase A security protocol:** A1 doc exists and is the Phase E checklist; scanner block-behavior evidenced (A3.2); no live-call tests in CI suites; key never persisted (grep the tree and any state files).

### Phase B — Calibration (truth in numbers)

With a real key: ≥ 20 analyses across fixtures + a real-world page — mix of triage-only, full, deep, cache-hit, batch. Record every `usage` object; fetch live pricing at run time; produce `calibration.md` (per-pass costs, blended COGS, cache-hit rate, derived pack price at the 3× floor). If blended COGS > $0.08, tune (fewer/smaller crops, tighter DOM budget) and re-measure **before Phase C sets prices**.

| # | Test | Pass |
|---|---|---|
| B1 | Cost math audit | Every figure traceable to a recorded `usage` object × live price |
| B2 | Cache verification | Repeat identical analysis → `cache_read_input_tokens` > 0; cost drop recorded |
| B3 | Batch verification | Batch run bills at the discounted rate in recorded results |
| B4 | Target check | Blended COGS ≤ target, or the tuning loop is documented until it is |

### Phase C — Metering (`argus-cloud`)

Credits ledger (`credit_grants`: plan_allotment | pack_purchase | goodwill, amounts, expiry; `usage_events`: append-only full detail; balance computed, never stored); entitlement middleware; caps from the doctrine; org-scoped result cache; failed-no-charge path; MoR products for packs priced from `calibration.md`; webhook → grant; monthly reconciliation job; **agent keys** with per-key budgets; global circuit breaker + admin spend view.

| # | Test | Pass |
|---|---|---|
| C1 | Ledger: expiry, exact-zero, concurrent decrements (race) | Never negative; expired grants unusable |
| C2 | Per-run cap | 6th flagged frame not auto-analyzed; UI offers manual (paid) trigger |
| C3 | Result cache | Identical re-request: no provider call, no decrement; **cross-org identical content: miss** |
| C4 | Failed analysis (mocked provider 500 / refusal / schema fail) | Zero charge; logged |
| C5 | MoR sandbox: pack purchase → webhook → grant; tampered signature | Grant appears; tampered payload rejected |
| C6 | Circuit breaker: simulated daily-budget breach | Explain paused everywhere, alert fired, uploads/reports/diffs unaffected; honest user message |
| C7 | Agent key exhausts budget mid-run | Clear error; CI job stays green |
| C8 | Reconciliation dry-run on seeded month | Margin report correct; <50% margin alerts |

### Phase D — Hosted Explain + CI batch + MCP tool

Server-side route (provider key in server env only); interactive Explain on the report page; CI auto-explain of top-N flagged frames via the Batches API, findings attached to the run and summarized (one escaped line) in the PR comment; MCP `explain` tool — BYO key when local, org credits when the server is configured with an org API key.

**Hosted-only enrichment (the durable BYO gap):** before the provider call, hosted analyses inject org-history context the CLI cannot have — this frame's trend line, the commit where drift first exceeded threshold, whether the same region drifted before and what the finding was then. Findings gain optional `firstDriftCommit` and `recurrence` fields (schema-versioned). Token budget for enrichment context is capped (~2K) and included in Phase B calibration so the margin math stays honest.

| # | Test | Pass |
|---|---|---|
| D1 | Interactive Explain | Finding renders on the hosted report; one decrement |
| D2 | CI batch on a PR | Findings attached to the run; PR comment line present and escaped; billed at batch rate in usage events |
| D3 | MCP explain, BYO mode | Direct provider call; no Normascope Cloud server contact |
| D4 | MCP explain, org-key mode | Decrements exactly once; respects per-key budget |
| D5 | Browser dev-tools sweep of hosted flow | Provider key appears in no response, header, or bundle |
| D6 | History enrichment | Hosted finding on a recurring drift carries `firstDriftCommit`/`recurrence`; identical BYO analysis has neither; enrichment tokens appear in usage events within the ~2K cap |

### Phase E — Security validation, live e2e, launch

Run `SECURITY-LLM.md`'s suite 1:1, then the release gate:

| # | Test | Pass |
|---|---|---|
| E1 | Injection fixtures: instructions in visible text, hidden DOM, code comments, and **rendered inside the screenshot** | Findings ignore or flag as `injection-suspected`; schema holds; nothing outside schema reaches storage or render |
| E2 | Secret-scan e2e (planted across DOM/code/styles) | Blocked with file named, every time |
| E3 | XSS corpus through findings → report, dashboard, PR comment | Inert everywhere |
| E4 | Tenant probe | Org B cannot read org A's analyses or cache |
| E5 | SSRF regression | Build 3.5's T6.2 suite still green with explain tools present |
| E6 | Retention posture | Provider account configuration verified and stated on the disclosure page |
| E7 | **Live e2e (release gate):** real repo + sandbox purchase: buy pack → CI auto-explain on a PR → findings in comment + report → exhaust credits → clear message, **CI green** → re-buy → works | Full loop demonstrated |

Docs + launch: data-flow disclosure page; pricing page with per-review cost; BYO instructions; exact model list; honest limitations ("hypotheses, not diagnoses"); version bump, tag, publish.

---

## Standing suites added by Build 4.0 (every release thereafter)

Injection suite (E1) · secret-scan e2e (E2) · XSS corpus (E3) · tenant probe incl. result cache (E4) · circuit-breaker trip (C6) · ledger race test (C1).

## Future work (not in 4.0)

Auto-fix PRs (only after findings earn trust in the wild) · conversational follow-up on findings · design-token extraction · source-map-level code mapping · GitLab/Bitbucket parity.

## Definition of Done (Build 4.0)

1. `explain` works in the free CLI with a BYO key — off by default, never-throw, exhaustive disclosure docs.
2. CI/PR findings integration is hosted-only; the Action accepts no user provider key.
3. Findings are grounded, schema-enforced, escaped, never auto-applied; deterministic diff remains the sole gate.
4. Hosted analyses run only against prepaid credits/allotments; no code path bills anyone open-endedly.
5. Blended COGS is measured and documented; pack prices ≥ 3× it; reconciliation + reprice runbook live.
6. All caps enforced server-side; the circuit breaker has been tripped in a test and degraded gracefully.
7. Agent keys meter machine-scale usage within budgets; exhaustion never reddens CI.
8. Every Phase E suite passed or its gap is a named open risk; the provider key reaches no browser, CLI, log, or repo.
9. Cache hits are free and never cross org boundaries.
10. Everything from Build 3.5 still works unchanged for users who never enable any of this.
