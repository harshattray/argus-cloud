# Build 3.5 — Normascope: Reposition to First Revenue (Stages 0–4)

## Instructions for Claude

This document supersedes the previous (Figma-first) BuildV3.5.md and follows the BuildHorizons.md stage order. Execute stages **strictly in order**. A stage is complete only when **every test case in its Test Plan passes and every item in its Security Protocol has recorded evidence** (command output, logs, screenshots). Never fabricate a result — a test that cannot run is a listed blocker, not a pass. Steps needing external accounts (MoR, DB host, R2, mail domain, trademark filing) are built against local substitutes (Docker Postgres, MinIO, filesystem driver, MoR sandbox) with a numbered handover list of what the user must provide.

Names are settled (RebrandV1.md — identity decision): brand **Normascope** for free and paid alike (paid tier = **Normascope Cloud**), npm `norma-scope`, bin `norma`, packages `normascope-action` / `normascope-mcp`. The private cloud repo exists: **`github.com/harshattray/argus-cloud`** (repo name is internal; the product name stays Normascope Cloud). The old BuildV3.md remains a reference for verbose GitHub-Action detail; where anything conflicts, **this document wins**.

## Repo topology & workflow (binding)

- **This repo (`Argus` / npm `norma-scope`)** holds Stages 0–3: CLI, GitHub Action, and the MCP server (`normascope-mcp` as a workspace package here — public code, one issue tracker, shared fixtures; not a separate repo).
- **`argus-cloud` (private)** holds Stage 4 and everything paid — it never ships to npm, and no paid logic ever lands in the public repo (open-core boundary).
- **Planning docs live in `argus-cloud/docs/`**: BuildHorizons.md, BuildV3.5.md, BuildV4.md, RebrandV1.md, roadmapV1.md, pitch.md. They are gitignored in the public repo by design (pricing, margins, and strategy must not be public) — committing them to the private repo is their version control and backup. Keep them updated there as stages complete; the copies in the public working tree are working copies.
- **Branching:** one branch per stage in whichever repo the stage touches (`stage-1-trust-track`, `stage-2-team-loop`, …), merged to main via PR **at the stage gate** — the gate checklist becomes the PR description with test evidence attached. Main stays releasable at all times.
- **Dogfood from Stage 2:** once the Action exists, install it on this repo — every later stage's PR gets Normascope's own sticky visual-diff comment. That is both continuous QA and the first case-study material.

**What this document produces:** a repositioned, source-agnostic verification CLI with a diff teams can trust; a GitHub Action posting sticky PR comments in both comparison modes; a free MCP server giving coding agents eyes; and a paid hosted product with billing — first revenue. All LLM features are Build 4.0.

## Operating principles (binding on every stage)

- CLI free forever, open, never obfuscated; cloud repo private, closed-source. New user-visible value accrues server-side; trust features accrue CLI-side.
- Non-blocking by default; strictness always opt-in; the never-throw contract holds (setup problems warn and exit 0).
- Local-first: nothing leaves the user's machine without explicit opt-in.
- **No Stripe** (India constraint): merchant of record (Paddle or Lemon Squeezy). Razorpay INR deferred.
- Deterministic comparison: same inputs → same outputs, byte-identical.
- One-person-operable, evidenced by runbooks.

---

## Stage 0 — Reposition (half a day; RebrandV1.md is the spec)

**Build:** no rename — the Normascope name stays for everything. Rewrite the README around the three-door positioning (visual regression / design fidelity / agent verification; Figma listed only as a source integration; Bose retitled as a fidelity-mode case study); establish tier naming (Normascope / Normascope Cloud) in all copy; register + park the domain; add the parent-company line. **Commit the six planning docs to `argus-cloud/docs/`** — their private version-controlled home.

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| R1 | README review | Leads with the three doors in order; headline is the verify-what-you-intended line |
| R2 | `grep -i figma README.md` | Figma appears only in the sources/integrations section — not in headline, tagline, or the first screen of copy |
| R3 | Tier naming | "Normascope Cloud" used consistently for the paid tier in README + Build docs; no second brand anywhere |
| R4 | Domain | Registered, parked page up |
| R5 | Planning docs | All six docs committed and pushed to `argus-cloud/docs/`; `git log` in argus-cloud shows them |

**Security protocol:** none new. **Gate:** R1–R4 green.

---

## Stage 1 — The Trustworthy, Source-Agnostic Engine

### 1.1 Trust Track (aligned + SSIM diff)

**Build:** `src/align.ts` — per-row luminance profiles (downsampled for tall images), band segmentation at low-variance rows, ordered greedy band matching by normalized cross-correlation, bounded per-band offset search (default ±120px), deterministic fallback to whole-image diff (`alignment: "none"`) below 2 confident matches. Metrics: `alignedMismatchPercent` (primary — drives threshold, terminal, report, trends; unmatched bands always count against it), `structuralSimilarity` (SSIM 0–100, second opinion — evaluate `ssim.js` vs hand-rolled; pure JS, no native deps), unaligned percent retained as diagnostic, per-band `sections` records. Report gains a section table + band-annotated overlay; terminal line: `X% aligned (Y% unaligned) · SSIM · N drifted sections`.

**Test plan** (fixture pages on a local server, reference images seeded into the design store):

| # | Fixture | Pass condition |
|---|---|---|
| T1.1 | Exact match | 0.0% aligned, SSIM ≈ 100, 0 regions |
| T1.2 | Anti-aliased text variant (0.4px subpixel shift) | Below threshold |
| T1.3 | Real layout shift (hero pushed 60px) | Above threshold, ≥1 region covering the shifted band |
| T1.4 | Inserted mid-page banner | Sections below it individually clean; banner reported as added section; total still flags |
| T1.5 | Missing section (adversarial) | Scores **≥** the same build with the section present — alignment never rewards being more wrong |
| T1.6 | Recolored/reflowed section (adversarial) | Not rescued by alignment; flags |
| T1.7 | Garbage pair (unrelated images) | Falls back to `alignment: "none"`, no crash |
| T1.8 | Determinism | Two consecutive runs → byte-identical summary output |
| T1.9 | Real-world (Bose pair or equivalent) | Aligned score materially below the unaligned score, improvement visibly attributable to positional drift in the annotated overlay; record both numbers |

### 1.2 Source resilience: version-keyed cache + snapshots

**Build:** replace the TTL cache with version-keyed caching (cheap metadata call; unchanged version = zero export calls); 429 discipline (`Retry-After` honored, bounded jittered retries, single-flight); degradation ladder in one module (fresh → version-valid cache → stale flagged → committed snapshot → skip with warning — a run never fails); `norma snapshot` writing committable `.bridge/design/` (PNGs + manifest: source ref, version, per-frame hash); `snapshot --check` drift warning; `doctor` shows per-frame design-source state.

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| T2.1 | Mocked source returns 429 + `Retry-After: 3` | Retry waits ≥3s, bounded attempts, then degrades down the ladder — exit 0 |
| T2.2 | Unchanged version, repeat compare | Mock records **zero** export calls |
| T2.3 | Version bumped on mock | Cache invalidated, exactly one refetch |
| T2.4 | Concurrent frames, one compare | Single-flight: one batched fetch |
| T2.5 | Snapshots committed, network to source blocked at OS level | Full `check` pipeline passes end-to-end |
| T2.6 | Live version ≠ manifest version | `snapshot --check` warns, exit 0 |

### 1.3 Source adapters

**Build:** one seam — an adapter produces named PNGs (+ optional dimensions) into the design store. Providers: `figma` (existing code refactored behind the seam, zero behavior change), `images` (a local directory), `url` (capture a second URL as reference → env-vs-env). Config: `"source": { "type": ... }`; `doctor` validates per adapter.

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| T3.1 | `images` adapter, no network | Full pipeline: compare, report, regions — zero API calls of any kind |
| T3.2 | `url` adapter with two local fixture servers (A = reference, B = drifted) | Diff flags exactly the planted differences |
| T3.3 | `figma` adapter regression | The complete 1.1/1.2 suite passes unchanged through the seam |
| T3.4 | `doctor` per adapter | Reports source type, reachability, and health correctly for all three |

### 1.4 Baseline mode (visual regression)

**Build:** `norma baseline` approves current captures into committable `.bridge/baseline/`; per-frame `"mode": "fidelity" | "baseline"`; mixed-mode configs legal; every surface (terminal, report, later PR comment) labels mode + source.

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| T4.1 | Baseline, then unchanged build | 0.0% |
| T4.2 | Introduce a UI change | Baseline-mode frame flags; fidelity-mode frames unaffected |
| T4.3 | Mixed-mode config (some frames fidelity, some baseline) | Both evaluated correctly in one run |
| T4.4 | Labels | Mode and source appear on terminal lines and in the report per frame |

**Stage 1 Security Protocol:**
- S1.1 Grep all terminal/report output from the full suite: no token, key, or secret ever printed.
- S1.2 Path containment: config with `"screenshot": "../../evil.png"` (and traversal variants) → rejected; all writes provably inside `.bridge/`.
- S1.3 Snapshot/baseline manifests contain no secrets and no absolute user paths.

**Stage gate:** T1–T4 suites + S1 protocol green; the aligned diff validated on ≥2 real-world pages; a Figma-free repo (images + baseline) demonstrated end-to-end.

---

## Stage 2 — The Team Loop (Action + PR comments)

**Build:** env-var token precedence (`FIGMA_TOKEN` env over `.env.local`; `NORMA_BASE_URL` override); `--json` writing versioned `summary.json` **v2 including `mode` and `source` per frame** (publish the JSON Schema file in-repo); `--strict` (exit 1 only for *measured* regressions — skips never trigger it; pre-commit untouched); pure comment renderer + `norma comment` command; composite GitHub Action (preinstalled-Chrome path, `doctor` informational, `check --json`, artifact upload, sticky comment upsert via marker, default-branch baseline artifact for the delta column, `snapshot --check` drift warning). Old BuildV3.md is the verbose reference.

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| T5.1 | Validate emitted summary against the published JSON Schema | Valid; `mode`/`source` present per frame |
| T5.2 | Strict matrix: {flagged frame / only skips / all clean} × {--strict, no flag} | Exit codes 1/0/0 with strict; 0/0/0 without |
| T5.3 | Renderer goldens: baseline present, absent, all-skipped, >20 frames (collapse), mixed modes | Byte-stable expected outputs |
| T5.4 | Frame label containing `<script>alert(1)</script>` | Renders inert in comment and report |
| T5.5 | **Live PR (release gate):** two pushes to a real PR | One sticky comment, same comment ID across pushes; artifact holds report + summary; strict toggle flips job status; delta column appears after a default-branch run |
| T5.6 | Raw CI logs from T5.5 | Token appears nowhere |

**Security protocol:** tokens only via CI secrets; renderer escapes all user-influenced strings; the Action never `eval`s repo content; comment size bounded.

**Stage gate:** T5 suite green including the live PR; sticky comments demonstrated in both modes.

---

## Stage 3 — Agent-Native (MCP + target-mock)

**Build:** `normascope-mcp` package exposing `capture`, `compare`, `get_summary`, `list_frames` (typed schemas, structured JSON out); CLI `--target mock.png` flow (compare a URL against a handed mock with zero config ceremony). `explain` joins as a tool in Build 4.0. Free — the pipe is free; paid things flow through it later (Build 4.0 credits; hosted org features when configured with an org API key).

**Test plan:**

| # | Test | Pass condition |
|---|---|---|
| T6.1 | Every tool invoked with valid input | Schema-valid JSON responses |
| T6.2 | **SSRF suite:** capture requests for `http://169.254.169.254/`, `10.x`, `192.168.x`, `file:///etc/passwd`, and an unconfigured public origin | All refused with a clear error; each attempt logged; a configured origin succeeds |
| T6.3 | Path-containment fuzz on all tool string params | No write/read escapes `.bridge/` |
| T6.4 | Agent-loop smoke: scripted client runs mock → compare → apply fix → compare | Second score strictly improves; loop terminates |
| T6.5 | Fixture page containing embedded instructions ("ignore previous instructions…") | `get_summary`/`compare` return it as data; schema intact; no behavioral deviation |

**Security protocol:** default-deny capture origins (configured origins only; link-local/metadata/private ranges blocked even when requested); `.bridge/` containment; README documents that all tool output is data, never instructions, for agent-host authors; no secrets or config echoes in any tool response.

**Stage gate:** T6 green; SSRF suite added to the standing suites; package listed in ≥1 agent-tool registry.

---

## Stage 4 — Hosted & Paid (first revenue; `argus-cloud`, private repo)

**Build** (local dev fully on Docker Postgres + MinIO + mail-catcher; production = Neon/Supabase + R2 + Vercel/Fly):
1. Scaffold `argus-cloud` + schema: orgs, users, memberships, api_keys (hashed, upload-scoped, shown once), repos, runs (verbatim summary JSONB), share_links, `frame_stats` **with mode/source/aligned columns from day one**.
2. Upload API: multipart summary+report, size caps, schema-version tolerant, rate-limited, distinct lapsed-plan error.
3. Hosted report page: membership or share-token gated, sandboxing CSP, share links revocable/expiring.
4. Auth: GitHub OAuth + email magic links (designer seats); org create/invite; admin key management.
5. Dashboard + trends: mode-aware charts, threshold line, "first exceeded" annotation, metric-transition markers.
6. Billing via MoR (sandbox-evaluate Paddle vs Lemon Squeezy, pick one): checkout, webhooks → plan state, 14-day no-card trial, 14-day lapse grace — **uploads rejected politely on lapse, CI stays green, nothing deleted on lapse**. Plan limits as config, not code: Team = 10 repos, unlimited seats; the price ladder runs on repos (value axis), never on seats (distribution axis); an org exceeding limits gets a clear upgrade prompt, and a very large org on a starter plan is flagged in the admin view as an enterprise lead, not treated as abuse.
7. Deletion (run/repo/org: objects + rows), 90-day retention sweep with dry-run mode, storage caps, audit log of admin actions.
8. Ops/legal: backups (provider PITR + weekly dump to a second bucket) with a **rehearsed restore**, Sentry + uptime alerts reaching a phone, security headers/CSRF/dependency audit, ToS/Privacy/subprocessors/security-contact/status pages, support email.
9. Org cache: CLI-populated **design exports and baselines** keyed (org, source ref, version, frame, hash) — the design-source token never goes server-side.
10. Launch: FSL/BSL license decision recorded for new CLI releases; **trademark filed for "Normascope"** (word mark, one mark covers both tiers); the paid product launches as **Normascope Cloud** — never a separate brand; marketing site on the parked domain; docs (snapshot workflow as the CI default, both modes, exhaustive what-uploads-and-what-never-does).

**Test plan (grouped; all must pass):**

| Group | Cases | Pass condition |
|---|---|---|
| Upload | happy path; bad key; oversized; malformed summary; lapsed plan; rate limit | Correct status + message each; lapsed error names the fix |
| Report | render; lightbox under CSP; logged-out access; share grant/revoke/expiry | Works; revoked/expired → 404 |
| Auth/tenant | magic-link joins the right org; revoked key stops uploads immediately; **isolation probes** (org B → org A's runs, trends, cache) | Every cross-tenant probe denied |
| Billing (sandbox) | checkout→webhook→active; cancel→grace at both boundaries (simulated clock); tampered webhook signature; trial expiry | State machine exact; tampered payload rejected |
| Data | delete run/repo/org → objects gone **from storage** (check the bucket, not just the DB); retention dry-run lists then live run deletes; timed restore drill from a real dump | Evidence recorded |
| Ops | `curl -I` header check (HSTS, frame-ancestors, nosniff); CSRF negative test; `npm audit` clean; kill the app → uptime alert fires | Evidence recorded |
| Live e2e (release gate) | real accounts: repo → Action `--upload` → hosted link in PR comment → designer opens via magic link (no GitHub account) → merge → trend populates → share link works, then revoked | Full loop demonstrated |

**Security protocol:** keys hashed at rest and never logged; report CSP sandbox verified with an inline-script probe; tenant-isolation probes join the standing suites; backup-restore evidence; audit-log entries for every admin action verified; subprocessor + privacy pages live before the first paying customer.

**Stage gate:** all groups green; first-customer readiness checklist (billing live, legal pages, support email, runbook) complete.

---

## Standing test suites (run before every release from here on)

Diff acceptance (T1.x) · resilience ladder (T2.x) · adapter suite (T3.x) · strict matrix (T5.2) · renderer goldens (T5.3–5.4) · SSRF suite (T6.2) · tenant-isolation probes · billing webhook-signature test.

## Definition of Done (Build 3.5)

1. The three-door positioning is live (README + marketing site); tier naming is Normascope / Normascope Cloud everywhere; "Normascope" trademark filed; license decision recorded.
2. A user with no Figma account gets full value (images adapter + baseline mode), verified by a documented walkthrough.
3. The aligned score is the primary number on every surface and the Trust Track suite — including both adversarial cases — is green.
4. A snapshot-configured repo runs CI with zero design-source API calls; simulated rate limiting degrades down the ladder without ever failing a run.
5. Sticky PR comments work on a real external repo in both modes; strict mode fails jobs only when explicitly enabled and only for measured regressions.
6. The MCP server passes the SSRF and containment suites and is listed in an agent-tool registry.
7. A paying org exists: MoR checkout → hosted reports → designer magic-link seat → trends — with lapse/grace verified and CI never turning red because of billing.
8. Backups restored in a rehearsed drill; alerts reach a phone; ToS/Privacy/subprocessor pages are live.
9. All standing suites are green and every stage's evidence is recorded.
10. One person can operate everything from the runbook.
