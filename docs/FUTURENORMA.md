# FUTURENORMA.md — where we are, what's built, what's left

**Private.** Contains credentials, pricing, margins, and strategy.
Last updated: 2026-07-31.

This is the single orientation document. Read this, then `CHECKPOINT.md` for
phase-level detail and `BuildV4.md` for the spec that defines "done".

---

## 0. TL;DR — read this paragraph if you read nothing else

The **CLI is finished and published** (`norma-scope` v0.7.1 and
`normascope-mcp` v0.2.0, both live on npm under Apache-2.0; 0.7.1 published
2026-07-31). The **explain engine is finished** and its real cost is
**measured, not guessed** ($0.0115/review; $0.0164 at post-intro list prices —
target was ≤$0.08). The **metering core is finished** (credits, caps, breaker,
webhooks, reconciliation). The **hosted surface exists twice**: a full Next.js
app in `argus-cloud/web/` (not deployed), and a **live, access-gated preview at
`harshaattray.com/normascope-cloud`** running inside the portfolio repo so it can be
used today without standing up new infrastructure.

What's genuinely missing before launch: **a payment provider** (MoR account —
Harsha's call), **real multi-tenancy** (the preview is single-tenant on purpose),
**artifact upload** (hosted explain currently reasons over diff metadata, not
image crops), and **its own domain and deployment**.

---

## 1. ⚠️ Where Normascope Cloud lives right now — and where it's going

> **Guideline — this is deliberate and temporary.**
>
> Normascope Cloud is currently deployed as a **protected route inside the
> portfolio repo** (`harshaattray.com/normascope-cloud`, repo
> `github.com/harshattray/my-website`). This is a **testing arrangement only**.
> It exists so the hosted experience can be used and demoed *today* without
> provisioning a separate Vercel project, database, domain, and billing account.
>
> **Before launch, Cloud moves to its own website.** The real product is
> `argus-cloud/web/` (Next.js, already written) deployed to its own Vercel
> project, its own Postgres, and its own domain. The `/normascope-cloud` route is then
> deleted from the portfolio.
>
> **Rules while it lives in the portfolio:**
> - Never link to `/normascope-cloud` from any public page, sitemap, or nav.
> - Never put anything in it that must survive — treat the data as disposable.
> - Keep the daily model-spend cap on (`NORMASCOPE_CLOUD_DAILY_BUDGET_USD`); the API
>   balance is prepaid and small.
> - Don't grow it into the real product. New Cloud features belong in
>   `argus-cloud/web/`; the preview only gets what's needed to *evaluate* them.
> - The preview shares the portfolio's Turso database and R2 bucket. All its tables
>   are prefixed `norma_` and its R2 objects `normascope-cloud-*`, so removing it later
>   is a clean delete.

### Access (single credential, private preview)

| | |
|---|---|
| URL | `https://harshaattray.com/normascope-cloud` |
| Access code | `hKJpzlEAfxfOUW4oEHywLr4z` |
| Stored | Vercel env `NORMASCOPE_CLOUD_PASSWORD` (production), and `.normascope-cloud-password` locally (gitignored) |
| Session | 30-day JWT with role `normascope-cloud`, held in `sessionStorage` |
| Daily model spend cap | `$0.75` (`NORMASCOPE_CLOUD_DAILY_BUDGET_USD`) |

To rotate: `vercel env rm NORMASCOPE_CLOUD_PASSWORD production`, then
`vercel env add`, then redeploy. Old sessions survive until the JWT expires —
to kill them immediately, rotate `JWT_SECRET` instead (this also logs out the
site admin, so rotate deliberately).

### What the preview can do today

Upload a `summary.json` (optionally with `report.html`, stored in R2) → browse
runs → open a run → per-frame scores → **Explain** / **Deep explain** with live
history enrichment and a running spend meter. Verified in production on
2026-07-29 with a real Bose-landing run: findings returned with
`firstDriftCommit` and `recurrence`, result cache hit was free, 2.5MB report
served from R2.

---

## 2. What is built (with evidence)

### Argus — **private repo**, public package `norma-scope` on npm

| Area | State | Evidence |
|---|---|---|
| Diff engine: AA-aware pixelmatch, band alignment, SSIM, region clustering | ✅ Shipped v0.6.0 | T1 suite; 0.43% aligned vs 14.24% unaligned on a real page |
| Source adapters: `figma` / `images` / `url` | ✅ | T3 suite |
| Baseline mode (visual regression, no designer) | ✅ | T4 suite |
| Version-keyed cache, 429 retry, degradation ladder, `snapshot` | ✅ | T2 suite |
| `summary.json` v2 + published JSON Schema | ✅ | ajv-validated in T5 |
| Sticky PR comment + composite GitHub Action, `--strict` | ✅ | Verified live on a real PR |
| MCP server: `list_frames`, `capture`, `compare`, `get_summary`, **`explain`** | ✅ | T6.1–T6.6; SSRF 5/5 refused + logged |
| Explain engine (Build 4.0 Phase A) | ✅ | 25 checks, no live calls in CI |
| Calibration harness (Phase B) | ✅ **and executed** | `docs/calibration.md` |
| Commands | `init` `doctor` `auto` `compare` `check` `comment` `explain` `baseline` `snapshot` `clean` | `normascope101.md` |
| Packaging: esbuild bundle + minify, no `.d.ts` in the tarball, Apache-2.0, SDK optional | ✅ **published** `norma-scope@0.7.1` | Registry reports 48 files / 141,118 B unpacked, `latest` = 0.7.1 — matching the pre-publish `npm pack --dry-run` exactly |
| `normascope-mcp` on npm | ✅ **published** v0.2.0 | Fresh install 2026-07-31 resolves `norma-scope@0.7.1` through its unchanged `^0.7.0` range; handshake reports 0.2.0, five tools listed |

`main` @ `91a63d5`, **published as `norma-scope@0.7.1` on 2026-07-31**. Full
suite: **66 checks green**. Two branches landed in that release, both cut from
`main`, touching disjoint files, fast-forwarded in to keep history linear:

- `report-redesign` → `5d311fb` — HTML report presentation only; same
  `ComponentResult` data, no new metrics, no command or flag change. Carries
  three fixes: full-page captures no longer letterbox into unreadable slivers
  (frames size to the capture's aspect; >2.2:1 scrolls at natural size with the
  three panes synced), the lightbox no longer overflows the viewport for very
  tall images, and `makeThumbnail` stopped discarding dimensions it had already
  parsed.
- `baseline-only-source` → `9c2e067` — a baseline-only config no longer has to
  declare a design source it never reads. `parseConfig` requires `figmaFileKey`
  only when some frame is non-baseline; `doctor` skips both the source check
  **and** the Figma token/file checks for such configs. Adds T4.5–T4.8 (the +4
  above); T4.5/T4.7/T4.8 fail against unfixed source, T4.6 is a regression
  guard. See §5 item 6 for the loose end it leaves behind.

**Neither branch had been tested against the other** — no file overlap, but
`baseline.test.mjs` T4.4 asserts report strings the redesign rewrites. They
were merged onto a scratch branch and the full suite run there first; the
rebased `main` tree was then hash-compared against that verified tree before
pushing. Do this whenever two branches land together.

**A patch bump let the MCP ride along for free.** 0.7.1 rather than 0.8.0 was
deliberate: on 0.x a caret is minor-locked, so `normascope-mcp`'s unchanged
`norma-scope: "^0.7.0"` accepts 0.7.1 but would have rejected 0.8.0. A fresh
MCP install now resolves 0.7.1 with no second publish. The moment a change
warrants a minor, the full publish-order dance below applies again.

⚠️ **The `v0.7.1` git tag exists locally but was never pushed** — `git push`
does not carry tags. `v0.6.0` and `v0.7.0` are on the remote; 0.7.1 is not.
Run `git push origin v0.7.1`.

**Publish order matters, permanently.** `normascope-mcp` depends on
`norma-scope` by name, and npm cannot link a workspace *root* as a dependency —
so it always resolves from the registry, and a `^x.y.z` bump will not install
until that version is published. **Always publish `norma-scope` first**, then
bump the MCP dep and publish `normascope-mcp` second. Two traps that cost real
time on the 0.7.0 release, both now fixed but easy to reintroduce:

- The MCP tsconfig points at `../../src` for typechecking (it had been silently
  validating against the last *published* release — its dynamic import of
  `dist/explain/` was checked against a 0.6.0 copy with no explain module).
  **esbuild honours that same `paths` mapping**, so the moment `norma-scope`
  resolved it inlined a whole copy of the CLI into the server bundle — 77 kB,
  while `package.json` still declared it as a dependency. `norma-scope` is now
  explicitly `external` in the MCP build. Check the bundle stays ~9 kB.
- The MCP handshake version was hardcoded and would have announced 0.1.0 for a
  0.2.0 release. It now reads `package.json`.

### argus-cloud — private repo

| Area | State | Evidence |
|---|---|---|
| Stage 4 substrate schema (orgs, users, memberships, hashed api_keys, repos, runs, share_links, frame_stats) | ✅ | `migrations/001` |
| Credits ledger: grants, expiry, atomic consume/refund, computed balance | ✅ | C1 incl. race test |
| Usage meter (append-only, microdollar costs, cache splits) | ✅ | C-suite |
| Org-scoped result cache (org in key hash *and* row) | ✅ | C3 incl. cross-org miss |
| Circuit breaker + admin spend view | ✅ | C6 |
| Agent keys with per-key monthly budgets | ✅ | C7 |
| MoR webhook handling (HMAC, idempotent) | ✅ | C5 (fixture-level) |
| Monthly reconciliation + <50% margin alert | ✅ | C8 |
| **History enrichment** (trend, `firstDriftCommit`, `recurrence`, 2K cap) | ✅ | 15 checks (D6) |
| **CI batch service** (Batches API, 50% rate, reserve→refund, escaped PR line) | ✅ | 18 checks (D2, fixture-level) |
| **Next.js web surface** (`web/`): upload, explain, ci-explain, share, report page | ✅ built, ❌ **not deployed** | Verified on localhost |
| Credit packs seeded from measured COGS | ✅ | `migrations/005` |

Branch `stage-5-metering` @ `ab40521` — **pushed and fast-forward-merged to
`main` 2026-07-30**. `main` and `origin/main` are both at `ab40521`.
Full suite: **63 checks green**.

### Portfolio repo — the preview

`api/_norma/{login,runs,run,explain}.ts` behind one dispatcher
(`api/norma/[action].ts`), plus `/normascope-cloud` and `/normascope-cloud/run/:id` in the
frontend. Committed @ `b4eeb86`, deployed to production.

> Note: Vercel's Hobby plan allows **12 serverless functions** and the site was
> already at the cap. The three bot-preview routes were consolidated into
> `api/preview/[...path].ts` and the four lab routes into
> `api/norma/[action].ts`. Public paths are unchanged. **Total is now 11** —
> if you add a function later and hit the cap, consolidate rather than
> upgrading the plan, or move the preview to its own project (which is the plan
> anyway, see §1).

---

## 3. The measured economics (do not re-guess these)

From `docs/calibration.md`, 22 recorded API calls on 2026-07-29:

| Figure | Intro prices | Post-intro list prices |
|---|---|---|
| Blended COGS per review | **$0.0115** | **$0.0164** |
| Deep review | $0.0203 | $0.0200 |
| Batched analysis | $0.0025/call | — |
| Target | ≤ $0.08 | ≤ $0.08 — **met ~5× over** |

Packs seeded at the **list-price** 3× floor so nothing loses money when Sonnet 5
introductory pricing ends **2026-08-31**:

| Pack | COGS | 3× floor | Price |
|---|---|---|---|
| 50 reviews | $0.82 | $2.46 | **$3** |
| 200 reviews | $3.29 | $9.86 | **$12** |
| 1000 reviews | $16.43 | $49.29 | **$60** |

`usage.ts` deliberately records at **list** prices, never intro prices, so
recorded spend can never under-state reality.

**Rule:** any figure that reaches a customer must trace to a recorded `usage`
object × a live price. Never estimate.

---

## 4. Multi-tenancy — how company-specific access will work

The preview is **single-tenant by design**: one shared access code, one dataset.
That is fine for evaluation and wrong for customers. Here is the real design —
most of it already exists in `argus-cloud`, unbuilt only at the edges.

### The model already in the schema

```
org ──┬── memberships ── users          (who can log in)
      ├── api_keys      (upload + agent keys, hashed, per-key budgets)
      ├── repos ── runs ── frame_stats  (their data)
      ├── run_artifacts (their images — BuildV5 G2)
      ├── org_storage   (their quota + reservations — BuildV5 G2b)
      ├── credit_grants / usage_events  (their money)
      └── result_cache  (org in the key hash AND the row)
```

Every table that holds customer data carries `org_id` with
`ON DELETE CASCADE`. Every query in `explainService.ts` and the web routes
filters by it. Cross-tenant probes already return 404 (verified: org B
attempting org A's run, share, and batch — all denied).

### How a new client gets access — the intended flow

1. **Create the org.** Provisioned by the MoR purchase webhook — with no trial
   (BuildV5 §G2c), buying is the only way an org comes into existence. Plan
   defaults to `free`, which **cannot upload**; `migrations/001`'s
   `DEFAULT 'trial'` is superseded by a later migration. Direct
   `INSERT INTO orgs` remains the manual path until the admin UI exists.
2. **Grant credits.** A `plan_allotment` grant for the Team plan's included
   allotment, or a `pack_purchase` grant created by the MoR webhook after
   payment. **Balance is the cap** — there is no way to spend past it. (Note
   `reconcile.ts` counts allotment spend against pack revenue only — see
   BuildV5's Build 5.5 risks.)
3. **Issue keys** with `createApiKey(db, orgId, { kind })`:
   - `upload` keys — for CI/CLI uploads.
   - `agent` keys — for AI agents, with `monthly_budget_credits` and
     `rate_per_minute`. Exhaustion returns a clear error and **never reddens CI**.
   Keys are `nsk_`-prefixed, **sha256-hashed at rest**, shown exactly once.
4. **Invite humans.** GitHub OAuth for developers, email magic links for
   designers (designer seats don't require a GitHub account). Membership rows
   carry `admin | member | designer`. **This is the main unbuilt piece.**
5. **Isolation is automatic** from there: reports, trends, result cache, and
   credits are all org-scoped.

### Per-client boundaries that already work

| Boundary | Mechanism |
|---|---|
| Data | `org_id` on every row, cascade delete, every query filtered |
| Cache | `sha256(org‖frame‖buildHash‖designHash‖model‖promptVersion)` — identical content in a different org is a **miss**, never a leak |
| Spend | Prepaid balance per org; per-run auto-explain cap; per-agent-key monthly budget; global daily breaker above all of it |
| Keys | Hashed; revocation takes effect on the next request |
| Reports | Membership, or a revocable/expiring share token |

Two boundaries **added by BuildV5** — they did not exist when this section was
written, and they are the newest tenancy surface, so they are the least proven:

| Boundary | Mechanism | State |
|---|---|---|
| Storage | Blobs are content-addressed **inside the org prefix** (`org/{orgId}/blob/{sha256}.png`) — identical content in another org is a separate object, never shared. Org delete stays a prefix delete. Objects are private; access is a short-TTL presigned GET scoped to a session or share token | ⬜ BuildV5 G2 |
| Quota | `org_storage` reservations and counters are org-scoped; **org B must not be able to read, reserve against, or exhaust org A's quota**. Upload entitlement is re-checked per request against the org's *current* plan — key existence is never authorization | ⬜ BuildV5 G2b/G2c |

**Presigned URLs are a new leak vector with no precedent in the earlier
design.** A URL issued for org A's object is a bearer credential that works for
anyone holding it, regardless of session — which is why the TTL is 60–120s,
why the nonce makes it single-use, and why a share-token viewer must never
receive a URL outliving its token. These join the E4 tenant probe; a boundary
that has not been probed is an open risk, not an assumed pass.

### What still has to be built for real tenancy

- **Auth + org management UI** — sign-up, org create, invite, key management,
  revoke. (Stage 4 items 4–5.)
- **Plan limits as config, not code** — Team = 10 repos, unlimited seats. The
  price ladder runs on **repos**, never on seats. (Partly settled: BuildV5
  §G2c fixes the plan enum to `free | team | lapsed` and specifies the upload,
  storage, and quota dimensions. The **repo ladder above Team is still open** —
  needed for the pricing page at HorizonPath Step 8.)
- **Lapse handling** — uploads politely rejected on lapse, **CI stays green**,
  nothing deleted; 14-day grace. (No trial — BuildV5 §G2c. Risk reversal is a
  30-day money-back guarantee.)
- **Deletion + retention** — run/repo/org delete removes objects from storage
  as well as rows; a 90-day sweep with a dry-run mode.
- **Admin view** — spend, margin, breaker state, enterprise-lead flags.

### Interim option if a client needs access before that lands

Give them their **own deployment**: a separate Vercel project per client
pointed at its own database and bucket. Crude, but genuinely isolated, and it
buys time without faking multi-tenancy. Do **not** hand two clients the same
deployment.

> ⚠️ **The preview-cloning variant of this is retired.** It read "clone the preview
> pattern per client"; the preview itself is deleted at BuildV5 Phase J4, and its
> single-access-code, shared-database shape was never safe for two clients
> anyway. A per-client Vercel project is the only remaining interim option.
> After Step 6 (auth) it stops being needed at all.

---

## 5. What's left, in the order it should be done

### Now — unblocked, no decisions needed

1. ~~**Push both branches.**~~ **Done 2026-07-30** — both pushed and
   fast-forward-merged to their `main` branches (§2). The next release step is
   tagging `v0.7.0` and publishing to npm, in that order and only together:
   publish `norma-scope` first, then bump `normascope-mcp` to 0.2.0 with
   `norma-scope: ^0.7.0` and publish it second (§2, publish order).
2. **Artifact upload (R2).** Hosted/lab explain currently reasons over
   `summary.json` metadata + history, **not image crops** — the prompt says so
   explicitly and findings are hedged accordingly. Uploading crops brings hosted
   findings to CLI parity. Biggest quality win available.
3. **Wire the Action to `/api/ci-explain`** (POST after upload, poll GET, append
   the escaped `prLine` to the sticky comment). Service and tests already exist.
4. ~~**Publish `normascope-mcp` to npm**~~ **Done 2026-07-30** (v0.2.0, with
   `norma-scope@0.7.0`). Still open: **list it in an agent-tool registry** —
   that is the last remaining Build 3.5 Stage 3 gate item.
5. **`doctor` reports explain readiness** — mode, key, and whether the optional
   SDK is installed. Today `doctor` checks config, Figma, URL, selectors, and
   browser but says *nothing* about explain, so the first time a user learns
   they are missing a piece is the moment they wanted an answer. Nothing is
   lost when that happens (`.bridge/` state persists; only `explain` re-runs),
   but discovery belongs in `doctor`. Small, self-contained.
6. **`sourceType()` lies for baseline-only configs.** It returns
   `config.source?.type ?? "figma"`, so a config with no `source` block — now
   legal for a baseline-only project — reports **`"figma"`** even though no
   frame will ever call Figma. Nothing is broken today: every consumer is
   guarded (`source.ts` on `adapterFrames.length > 0`, `compare.ts` only
   surfaces it for non-baseline frames, `snapshot.ts` on `!figmaFileKey`,
   `doctor.ts` on the new `usesSource`). But the safety lives in four scattered
   call sites rather than in the type, so the next consumer to ask "what source
   is this?" gets a confidently wrong answer. **This already bit once** — the
   first cut of the baseline-only fix left `doctor`'s token check keyed on
   `srcType === "figma"`, which would have demanded a `FIGMA_TOKEN` for a
   project that never contacts Figma and exited 1, moving the failure instead
   of removing it. Caught by tracing consumers, not by a test. The fix is to
   make the absence representable — `sourceType()` returning `"none"`, or the
   call sites asking `usesSource` instead of a type — which ripples into
   `cache.ts` (the cache key carries `sourceType`) and the `summary.json` v2
   `source` field, i.e. a **published JSON Schema change**. That ripple is why
   it is written down instead of done inline. Not urgent; do it before a fourth
   adapter lands, because a new adapter is exactly when someone reaches for
   `sourceType()` and trusts it.

### Next — needs a decision from Harsha

6. **Pick the MoR: Paddle vs Lemon Squeezy.** (Stripe cannot onboard
   India-registered businesses — that's why MoR.) Unblocks C5 live, E7, and
   remapping the provisional `pack_*` product ids to real ones.
7. **Domain.** `harshat.space` subdomain for private testing; real domain later.
   Migration cost is a BASE_URL change, DNS, an OAuth app, and an MoR re-point.

### Then — the real launch sequence

8. **Deploy `argus-cloud/web/`** to its own Vercel project + Neon/Supabase
   Postgres + R2. Then **retire `/normascope-cloud`** from the portfolio (§1).
9. **Build Stage 4 auth + dashboard** (§4) — the report page's API-key field is
   a stopgap until sessions exist.
10. **Phase E security validation**: E1 injection fixtures against the *hosted*
   path, E6 provider retention posture + disclosure page, E7 the live
   buy→explain→exhaust→re-buy loop.
11. **Launch docs**: data-flow disclosure, pricing page with per-review cost,
    BYO instructions, exact model list, honest limitations ("hypotheses, not
    diagnoses"). File the **Normascope** trademark. ~~Record the FSL/BSL
    decision.~~ **Done 2026-07-29: Apache-2.0** for the client (CLI, MCP,
    Action) — permissive so it spreads, with the patent grant and trademark
    clause MIT lacks; `argus-cloud` stays closed. The moat is the data, not the
    licence (Doctrine 5).

---

## 6. Open risks — named, never assumed away

| Risk | Status |
|---|---|
| ~~Both stage branches unpushed~~ | **Closed 2026-07-30.** Both pushed and merged to `main`; `origin` holds everything. |
| E1 hosted-path injection fixtures not run 1:1 | Open. CLI-side injection suite is green and the hosted prompt uses the same delimiter rules — but it has not been *proven* on the hosted path. |
| E6 provider retention posture unverified | Open. Disclosure page unwritten. |
| E7 live purchase loop | Blocked on MoR. |
| Hosted findings are metadata-grounded, not crop-grounded | Known and honestly labelled in the prompt. Fixed by item 2 above. |
| Lab shares the portfolio's database and R2 | Accepted for a testing deployment. Prefixes make removal clean. Do not let real customer data land there. |
| Prepaid API balance is small (~$19) | Mitigated by the daily cap. Keep it on. |
| Explain is Anthropic-only, in BYO **and** hosted | Open. Invisible to us because we have a key; a hard blocker for any account without an Anthropic contract. Scoped in §8. |
| **A paying customer on the CLI would pay twice** | Open, and a **launch blocker for the cloud tier**. Org-credits mode exists only in the MCP server (`server.ts:234–269`); `norma explain` has no cloud branch and goes straight to `createAnthropicCaller()`. So a customer with credits cannot spend them from the CLI — they must also bring an Anthropic key. Harmless today (no paying customers), must close before Cloud launches. Scoped in §8. |

---

## 7. Doctrine — the rules that do not bend

1. **The deterministic diff is the only gate.** Explain never blocks, never
   scores, never fails a build.
2. **Never fabricate economics.** Every cost figure traces to a recorded `usage`
   object × a live price.
3. **Never fabricate security posture.** A suite that wasn't run is an open
   risk, never an assumed pass.
4. **Prepaid only.** No code path bills anyone open-endedly.
5. **Gates live on substrates we control** — servers, data, network. Never
   client-side locks; they're readable-JS theatre that annoy honest users and
   hand a fork its reason to exist. The durable moat is **data enrichment**.
   (The published tarball is minified as of v0.7.0. That is **friction, not a
   gate** — a prettifier undoes it in seconds and every string literal,
   including the prompts, is still plain text. It costs nothing and deters
   casual lifting; never treat it as protection, and never build a gate on it.)
6. **No paid logic in the published package.** (The Argus *repo* is private;
   the npm package is what's public, and that is the boundary that matters.)
   No provider key ever reaches the CLI,
   the Action, a browser, a log, or a repo.
7. **Failed analyses cost the user nothing.** Provider error, refusal, or schema
   failure → full refund, logged.
8. **Full suites green before any release.** `npm test` in each repo.

---

## 8. Provider flexibility — Anthropic-only today

### What is actually true right now

| Fact | Where |
|---|---|
| The Anthropic SDK is used in **exactly one production file** | `Argus/src/explain/client.ts` |
| The key is resolved by `new Anthropic()` from the environment — **`ANTHROPIC_API_KEY` and nothing else** | `client.ts:49`, gate at `command.ts:55` |
| Model IDs *are* overridable — `explain.models` in config, or `NORMA_EXPLAIN_{TRIAGE,ANALYSIS,DEEP}_MODEL` | `models.ts:resolveModels` |
| …but that only picks a **different Anthropic model**. The transport is the Anthropic SDK, so a non-Anthropic model id fails at the API, not at config time | `client.ts` |
| The calibration harness is Anthropic-hardcoded too | `Argus/scripts/calibrate.mjs:19` |
| `@anthropic-ai/sdk` is a **hard dependency (~10 MB installed) for every user**, even though explain is opt-in and most users never call it | `Argus/package.json` |

**The seam already exists.** `ModelCaller` is a one-function interface —
`(call: ModelCall) => Promise<ModelCallResult>` — and `createAnthropicCaller()`
is injected at `command.ts:130` with `deps.callModel` overriding it (that is how
the suite runs with zero live calls). Adding a provider is **a second
implementation of one function**, not a refactor. The architecture is already
right; only the transport is hardcoded.

### The CLI and the MCP server do not have the same modes

This is the sharper gap, found 2026-07-30, and it is a **launch blocker for the
cloud tier**:

| Surface | BYO (own key) | Org credits (paid) |
|---|---|---|
| MCP server | ✅ `ANTHROPIC_API_KEY` | ✅ `NORMASCOPE_CLOUD_URL` + `NORMASCOPE_ORG_KEY` → `/api/upload` + `/api/explain`, **plain fetch, no SDK** (`server.ts:234–269`) |
| CLI (`norma explain`) | ✅ | ❌ **missing entirely** |

A customer who has bought credits and runs `npx norma-scope explain` gets the
BYO path — so they pay us for credits they cannot spend, *and* pay Anthropic.
The server side is entirely built (upload, explain, metering, ledger, result
cache, breaker); the CLI is one branch away from using it.

Two consequences worth holding onto:

- **Cloud mode needs no SDK and no provider choice from the user.** It is a
  `fetch` to our endpoint. Whatever provider we run server-side is our problem,
  not theirs — so for paying users, "provider flexibility" is already solved by
  architecture. The SDK friction below applies to **BYO mode only**.
- **This is cheap and carries no wire-contract risk**, because the endpoints
  and their shapes already exist and are exercised by the MCP path.

Close it before Cloud launches, not after. No paying customers exist today, so
it costs nothing right now — it becomes embarrassing the day one does.

### Why this matters — procurement, not preference

An enterprise with an Azure OpenAI or Bedrock contract and no Anthropic MSA
**cannot run `explain` at all**. Not "prefers not to" — cannot, because legal
will not approve a new data processor for one CLI subcommand. That is a hard
adoption blocker in exactly the accounts that buy, and it is invisible in our
own testing because we have a key.

Second reason: **data residency**. Bedrock / Vertex / Azure keep inference
inside a cloud tenancy the customer has already signed for. That answers the
E6 retention question (§6, currently open) with a contract that already exists,
instead of a disclosure page we have to write and defend.

**Cheapest first win: Claude on Bedrock or Vertex.** Same model family, same
prompts, same schema semantics, same calibration numbers — only auth and
transport change. Ship that before any cross-family provider.

### The hosted tier stays single-provider

The economics in §3 are measured against Anthropic list prices, and the 3×
floor under every pack price depends on them. Multi-provider hosted means
re-calibrating per provider per model, forever, and Doctrine 2 (never fabricate
economics) makes that expensive rather than optional. **Flexibility belongs in
BYO mode.** Hosted stays Anthropic-only until a paying customer asks otherwise.

### What actually breaks across model families — the honest list

| # | Concern | Anthropic today | What a second provider needs |
|---|---|---|---|
| 1 | **Structured output** | `output_config.format.json_schema` | OpenAI `response_format: json_schema` (strict); Gemini `responseSchema`; open-weight: no guarantee. **Never fall back to free-text findings** — the report renders findings as structured claims. `validateFindings` already rejects; a weak provider retries once, then fails honestly and Doctrine 7 refunds it. |
| 2 | **Prompt caching** | Explicit `cache_control` breakpoints, ~0.1× reads, byte-deterministic prefix (A3.4) | OpenAI caches prefixes automatically at a different discount; Gemini needs explicit cached content with a TTL and a minimum prefix length. **Cache economics do not transfer — §3 is Anthropic-specific.** |
| 3 | **Refusal signal** | `stop_reason === "refusal"`, a first-class field | Others signal via `finish_reason: content_filter` or in-band text. Without a per-provider equivalent, **a refusal gets mis-parsed as a finding.** Test A4.3 needs a variant per provider. |
| 4 | **Image blocks** | Anthropic content blocks | OpenAI `image_url`/base64 parts, Gemini `inlineData`. Per-provider size and count limits feed straight back into the truncation ladder in `assemble.ts` (A3.1). |
| 5 | **Cost estimate** | `LIST_PRICES` keyed by Anthropic model id, hardcoded 1.25× / 0.1× cache multipliers | Per-provider price tables — or return `null` for unknown providers, which `estimateCost` already does correctly. |
| 6 | **Egress** | One destination, one posture | Each provider is a **new destination** for context that has already passed the secret scanner. SECURITY-LLM.md doctrine (one call, no tools, no agentic loop) must be **re-proved** per provider. Doctrine 3: a suite that wasn't run is an open risk, never an assumed pass. |

### Shape of the work

1. `explain.provider` in config + `NORMA_EXPLAIN_PROVIDER`: `anthropic`
   (default) · `bedrock` · `vertex` · `azure-openai` · `openai` ·
   `openai-compatible` (base URL — covers Ollama, vLLM, OpenRouter).
2. One `ModelCaller` per provider behind a factory keyed on that value.
   Per-provider key env var. `doctor` reports which provider and key are live.
3. ~~**Provider SDKs become optional dynamic imports, not hard deps.**~~
   **Done 2026-07-30, shipped in v0.7.0.** `@anthropic-ai/sdk` is an
   optional peer loaded by dynamic import; a clean install dropped from 27 MB
   to 14 MB and only BYO users who actually run an analysis pay for it. Two
   things a future provider must copy: the import is **type-only** at the top
   of `client.ts` so nothing is pulled at load time, and `loadSdk()` also
   resolves from the **working directory** — `npx` runs the CLI out of npm's
   `_npx` cache, where the project's `node_modules` is not on the resolution
   path, so a package the user installed exactly as instructed is otherwise
   invisible. That bug shipped and was caught in testing; do not reintroduce
   it per provider.
4. A **capability matrix** per provider (strict schema · images · caching ·
   refusal signal). A provider missing strict schema is **rejected at config
   time with a named reason** — never silently degraded.
5. Re-run `scripts/calibrate.mjs` per provider; it needs the same seam.
6. Docs: exact supported model list per provider. Launch-docs item 11 already
   promises "exact model list" — this makes that promise bigger.

### Decision needed

Ranked by value ÷ risk:

- **(a) Claude via Bedrock / Vertex** — days of work, no prompt changes, no
  re-calibration, unblocks AWS/GCP-committed accounts. Do this one first.
- **(b) Azure OpenAI / OpenAI** — needs the schema, refusal, and image mapping
  above plus its own calibration run. Real work, real payoff.
- **(c) `openai-compatible` base URL** — cheap to add, impossible to guarantee.
  Ship it labelled **best-effort / unsupported**, or not at all.

**Free escape hatch available today, undocumented:** the Anthropic SDK honours
`ANTHROPIC_BASE_URL`, so any Anthropic-API-compatible gateway — a proxy in
front of Bedrock, a LiteLLM-style router, a self-hosted endpoint — already
works with zero code change. That is how the whole triage → analysis →
findings path was verified against a local stand-in endpoint with no live
call. It is not real multi-provider (no schema, refusal, image, or price
mapping) but it is an afternoon of docs, and it may satisfy the first
enterprise that asks before (a) is built.

**Sequencing:** this sits behind the §5 "Now" list. Pushing both branches and
artifact upload beat it. It moves ahead of everything the moment one real
prospect says "we don't have an Anthropic contract" — treat that sentence as
the trigger.

---

## 9. Quick reference — where everything is

| What | Where |
|---|---|
| CLI + Action + MCP | `~/Documents/Tal/Argus` (**private repo**, public npm package `norma-scope`) |
| Cloud (real) | `~/Documents/Tal/argus-cloud` (private) |
| Cloud (temporary lab) | `~/Downloads/Projects/portfolio` → `/normascope-cloud` |
| Feature explainer | `Argus/normascope101.md` |
| Command reference | `Argus/COMMANDS.md` |
| **What to build next, in order** | `argus-cloud/docs/HorizonPath.md` — start here |
| **What is actually built, with evidence** | `argus-cloud/docs/FinishedSPEC.md` |
| Steps 1–5 executable spec | `argus-cloud/docs/BuildV5.md` — phases F–J |
| Phase detail | `argus-cloud/docs/CHECKPOINT.md` |
| The spec | `argus-cloud/docs/BuildV4.md` |
| Threat model | `Argus/SECURITY-LLM.md` |
| Measured costs | `argus-cloud/docs/calibration.md` |
| Provider key | `argus-cloud/src/.env` (gitignored) + Vercel env |
