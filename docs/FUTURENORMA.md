# FUTURENORMA.md — the source of truth

**Private.** Contains credentials, pricing, margins, and strategy.

Last updated: **2026-08-14** — §2 state facts refreshed after Pathway 1 item 10
(encrypted backups, a rehearsed restore, and operational alerts): suite counts,
suite names and the migration range. Strategy is unchanged.

Before that, **2026-08-10** — state facts in §0 and §2 refreshed against the
code and the npm registry (published versions, branch heads, suite counts, and
the three defect fixes that shipped after 0.7.3). The §4 path now distinguishes
the public waitlist launch from the later paid Cloud launch.

This is **the single source of truth**: where we are, what is built, what to
build next in order, what we sell, and the rules that do not bend. Where this
document and any other disagree, **this one wins**. Supporting detail lives in
`FinishedSPEC.md` (evidence for what exists), `BuildV5.md` (executable spec for
Steps 1–5), and `normascopeWeb.md` (website requirements).

`PATHWAYS.md` is the implementation companion to this document. It expands the
settled strategy into product pathways, plan entitlements, CLI/Cloud data flow,
deletion, privacy controls, experiments, and acceptance gates. It may not
silently change a decision in this file; any strategic change must be recorded
here first.

### Contents

| § | What's in it | Read it when |
|---|---|---|
| 0 | TL;DR | Always |
| 1 | Where Cloud lives today | Orienting |
| 2 | What is built, with evidence | Orienting |
| 3 | The measured economics | Pricing anything |
| 4 | **What to build next, in order** | Starting work |
| 5 | Multi-tenancy — design detail behind Steps 6 and 8 | Onboarding a client |
| 6 | Open risks | Before a release |
| 7 | **Doctrine — rules that do not bend** | Always |
| 8 | Provider flexibility | An enterprise asks |
| 9 | Quick reference | Looking something up |
| 10 | **What we sell — paid-only features and how to say them** | Building the website or pricing page |

---

## 0. TL;DR — read this paragraph if you read nothing else

The **CLI is finished and published** (`norma-scope` v0.7.5 and
`normascope-mcp` v0.2.2, both live on npm under Apache-2.0; registry verified
2026-08-10). The **explain engine is finished** and its real cost is
**measured, not guessed** ($0.0115/review; $0.0164 at post-intro list prices —
target was ≤$0.08). The **metering core is finished** (credits, caps, breaker,
webhooks, reconciliation). The real hosted product is the Next.js app in
`argus-cloud/web/`, **developed and tested locally** — Steps 1–4 need no domain,
no accounts, and no money. It ships to **normascope.com** at Step 5.

What's genuinely missing before launch: **a payment provider** (MoR account —
Harsha's call), **real multi-tenancy** (§5, built across Steps 6 and 8), **crop
grounding** (hosted explain still reasons over diff metadata rather than image
crops), and **the deployment itself**.

**Artifact upload is no longer on that list — 2026-08-15.** Declare → transfer →
commit is built on both sides and has been run end to end against the real
portfolio capture: uploaded through presigned URLs, committed after size and
content-hash verification, and read back in a browser. `norma-scope@0.8.0` is
built and awaiting publish. Two things it did not prove and does not claim: **the
R2 leg has never carried a real artifact**, and nothing is deployed. See
`FinishedSPEC.md` §3l.

---

## 1. Where Normascope Cloud lives — and where it's going

> **The destination is `normascope.com`.** One Next.js app in
> `argus-cloud/web/` carrying both surfaces (public marketing + gated Cloud),
> per `normascopeWeb.md`. That is the only address the product ever launches on.
>
> **Until then, everything is built and tested locally.** Steps 1–4 (§4) need no
> domain, no accounts, and no credit card — file-backed PGlite, a filesystem
> storage driver, `localhost`. The domain is required at **Step 7**, because
> Paddle production checkout demands an approved domain; a free `*.vercel.app`
> covers Step 5 if anything needs to be shown before then.

> **⚠️ Legacy: the portfolio preview.**
>
> An older access-gated preview runs as a protected route inside the portfolio
> repo (`harshaattray.com/normascope-cloud`, repo
> `github.com/harshattray/my-website`). It was a **stopgap so the hosted
> experience could be demoed before any infrastructure existed**. It is *not*
> where the site will live, it is not the product, and it gets **deleted at Step
> 5** (BuildV5 Phase J4).
>
> **Rules while it still exists:**
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
| MCP server: `list_frames`, `capture`, `compare`, `get_summary`, **`explain`** | ✅ | T6.1–T6.7; SSRF 5/5 refused + logged |
| Explain engine (Build 4.0 Phase A) | ✅ | 25 checks, no live calls in CI |
| Calibration harness (Phase B) | ✅ **and executed** | `docs/calibration.md` |
| Commands | `init` `doctor` `auto` `compare` `check` `comment` `explain` `baseline` `snapshot` `clean` | `normascope101.md` |
| Packaging: esbuild bundle + minify, no `.d.ts` in the tarball, Apache-2.0, SDK optional | ✅ published `norma-scope@0.7.5`; **`0.8.0` built and awaiting publish** | Registry `dist-tags.latest` = **0.7.5**, verified 2026-08-10. `0.8.0` adds the `upload` command: 52 files / 50.2 kB packed, 0 declarations and 0 source, verified 2026-08-15. `normascope-mcp@0.2.3` follows it — its floor moved to `^0.8.0`, so **the root must publish first or the MCP package cannot install** |
| `normascope-mcp` on npm | ✅ **published** v0.2.2 | Registry reports **0.2.2**, verified 2026-08-10. Its `norma-scope` floor was raised `^0.7.0` → `^0.7.4` in `8e96b5e` — see below |

`main` @ **`12af929`**. Full suite: **83 checks green** (run 2026-08-10).

*The 0.7.3 release, for the history below:* `main` was @ `9031fb5`, published as
`norma-scope@0.7.3` on 2026-08-03 and pushed, with **66 checks green**. Two
branches landed in that release, both cut from `main`, touching disjoint files,
fast-forwarded in to keep history linear:

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
  guard. See §4 Step 0 for the loose end it leaves behind.

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

*(Git tags: deliberately not tracked as a task. npm and `main` are the record of
what shipped. `git push --follow-tags` is a fine habit if you want tags, but no
step is blocked on it.)*

**0.7.2 and 0.7.3 both shipped 2026-08-03.** 0.7.2 made `norma-scope` the
canonical bin name (`norma` kept as an alias) and fixed every user-facing
message to match. 0.7.3 made `.gitignore` coverage automatic: `ensureBridgeDir()`
writes a `.bridge/.gitignore` at every entry point, because only `init` had
ever done it and `--target` users never run `init`. Both patch rather than
minor for the same MCP-range reason as 0.7.1; verified after each publish that
a fresh `normascope-mcp` install resolves the new version.

⚠️ **0.7.2 was published from the `naming-conventions` branch before it reached
`main`** — the registry briefly held code the default branch did not. 0.7.3 was
done the right way round. **Merge first, then publish.**

⚠️ **Watch for divergence when merging a PR on GitHub.** A GitHub merge creates
a merge commit; a local fast-forward does not. Doing both leaves `main` and
`origin/main` diverged, and a later `git push` is rejected as non-fast-forward
— easy to misread as having succeeded. Pull before pushing a release.

**0.7.4 and 0.7.5 shipped after the 2026-08-03 audit** — three defect fixes,
each found by using the tool rather than by a test.

- **`b3db0c7` — capture viewport, and diff sensitivity split by mode.** `init`
  persisted each Figma frame's dimensions and `auto` used *both* as the browser
  viewport. But a design frame is an artboard — full-page exports run
  4,000–9,000px tall — so every `vh` unit resolved against a window no user has:
  a 100vh hero rendered thousands of pixels tall and everything below it
  shifted. The resulting size gap then tripped the dimension guard that disables
  section alignment, losing the analysis exactly where it would have helped.
  Width still comes from the design; height is now a normal window. Existing
  configs carry an explicit viewport and are untouched; `doctor` now warns when
  a configured viewport height is taller than any real screen.

  > ⚠️ **This changes a figure quoted elsewhere.** The committed Bose example
  > scored **79.7%** with a size warning and no alignment; it now scores
  > **36.4%** with banded alignment across 3 drifted sections. The 79.7% was the
  > tool measuring its own misconfiguration, not the site. Anywhere that number
  > is used as evidence of diff quality is wrong — including the Bose-style
  > fidelity case study named in §4 Step 9. The **plumbing** evidence from the
  > 2026-07-29 preview run (§1) still stands; its *score* does not.

- **`ce0a147` — MCP `compare` captures before scoring.** The tool had two
  branches with opposite capture semantics: zero-config captured then diffed;
  configured-frames only diffed screenshots already on disk. For an agent that
  is the worst possible failure — it edits the UI, calls `compare`, and is handed
  the score of the app *before* its edit. Both branches now capture;
  `capture: false` opts out. Adds T6.7, covering the configured branch that had
  no coverage.

- **`8e96b5e` — ERESOLVE install failure on npm 10.** `@anthropic-ai/sdk` was
  `^0.112.3` in `peerDependencies` with `optional: true`. `optional` only means
  the peer may be *absent* — it does not widen the range — so any project already
  depending on the SDK outside that caret could not install `norma-scope` at
  all. npm 11 tolerates it, npm 10 does not, and Node 20 is still the common
  `setup-node` pin: broken for users, invisible on a maintainer machine. Both
  manifests now declare `>=0.112.3`. Also raised the MCP's `norma-scope` floor to
  `^0.7.4`, because a stale 0.7.0 resolved a `parseConfig` that rejects the
  baseline-only configs 0.7.3+ accepts.

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
| **Paddle webhook route + signature adapter** (Pathway 1 item 8) | ✅ built, ❌ **no sandbox** | Real `ts:body` scheme, 5-min replay window, idempotent claim, out-of-order-safe state machine — 37 checks, §3i. No real Paddle delivery has reached it |
| Monthly reconciliation + <50% margin alert | ✅ | R-suite (was C8) |
| Reconciliation attributes cost to the pot that funded it (Pathway 1 item 7) | ✅ | Subscription revenue recorded at last; allowance / pack / goodwill / unattributed kept apart; the old formula false-alarms on the same month — §3h |
| **History enrichment** (trend, `firstDriftCommit`, `recurrence`, 2K cap) | ✅ | 15 checks (D6) |
| **CI batch service** (Batches API, 50% rate, reserve→refund, escaped PR line) | ✅ | 18 checks (D2, fixture-level) |
| **Next.js web surface** (`web/`): upload, explain, ci-explain, share, report page | ✅ built, ✅ **deployed** | `normascope.com` live on Vercel 2026-08-13; waitlist round-trips from the deployed path — §4g |
| Credit packs seeded from measured COGS | ✅ | `migrations/005` |
| Race-safe migrations (Pathway 1 item 1) | ✅ | 20 real cold starts on real Postgres — `FinishedSPEC.md` §3a |
| Storage port, filesystem + S3/R2 drivers (Pathway 1 item 2) | ✅ | Contract run against both; S3 leg on real R2 — §3b |
| Request rate limiting, per key and per org (Pathway 1 item 3) | ✅ for authenticated paths | 20 separate processes share one ceiling — §3c |
| Provider-dollar reservation before every call (Pathway 1, §10.3 1B.1) | ✅ | 20 separate processes share one budget; settlement idempotent — §3d |
| Credits derived from each operation's hard maximum (Pathway 1 item 5, §10.3 1B.2) | ✅ | Suite fails if any operation earns below the margin floor — §3e |
| Budget alerts at 50/75/90/100% + audited manual reset (Pathway 1 item 6) | ✅ | 20 separate processes page a human once; unattributed reset impossible — §3f |
| Retention sweep + run/repo/org deletion, rows **and** objects (Pathway 1 item 9) | ✅ | 55 checks; 20 processes contend for one deletion job and exactly one claims it; dry run is the default — §3j. **Open decision:** org deletion cascades its usage and revenue rows |
| **Encrypted backups, a rehearsed restore, operational alerts** (Pathway 1 item 10) | ✅ built, ✅ **production backed up 2026-08-15**, ❌ not scheduled | 91 checks; both failure paths watched — §3k. **Production Neon was dumped, encrypted, restored and compared table by table on 2026-08-15** (32 tables). The nightly workflow exists and is inert; scheduling is **deferred to the first paying organization**, with hand backups covering the waitlist meanwhile. Switch-on checklist: `PATHWAYS.md` Pathway 1 item 10 |
| **Alerts reach a person, not a log line** | ✅ | The explain routes alert through a real webhook/email channel; an alert claimed but never delivered is itself an alert — §3k |
| **Artifact upload: declare → transfer → commit** (Pathway 2 items 1-6) | ✅ built and run end to end, ❌ never against R2 | Migrations 015-018, `norma-scope upload` in Argus. The portfolio capture uploaded from the CLI through presigned PUTs and committed after size and content-hash verification; deduplication, quota release and org deletion all exercised on real artifacts. Filesystem driver only — `PATHWAYS.md` Pathway 2 |
| **The hosted run report renders** | ❌ **blank in production** | The `/r/` CSP blocks the inline scripts Next uses to deliver page content. Proven against a real production build. Fix is a per-request nonce, not `unsafe-inline` — the strictness is deliberate, that page renders model output. **Blocks Pathway 3** |
| **Vercel build contract** (`vercel.json`, root-directory build, `tsc` before `next build`) | ✅ | Clean checkout — no `node_modules`, no `dist/` — installs and builds — §4f |
| **Migrations reach the function bundles** (`outputFileTracingIncludes`) | ✅ | 0/34 → **34/34** bundles carry all ten `.sql` files — §4f |
| **Missing `DATABASE_URL` on Vercel fails loudly** | ✅ | Refuses to boot rather than silently losing writes to in-process PGlite — §4f |
| **Production database provisioned** — Neon, us-east-1, Postgres 17.10, pooled | ✅ | 10 migrations cold through the pooler, 23 tables — §4f |
| **Waitlist verified against the real production database** | ✅ | Signup row read back from a separate process; dedupe, honeypot, referrer stripping — §4f |
| Waitlist client-side validation, sharing the server's rules and wording | ✅ | `web/lib/waitlistEmail.ts`; both forms + the API import it — §4f |

Branch `pathway-1-spend-safety` (cut from `main` @ `e42810d`, the merge of
`normascope-site` that landed the public marketing site, the gated `/pitch` tree
and the waitlist route). **Pathway 1 items 1–10 are implemented**, and the public
site is **live on `normascope.com`** (§4g) with its legal pages published
(§4h). Full suite:
**598 checks green** on PGlite, **626** against real Postgres, across twenty
suites — `apiKeyRevocation`, `artifactUploads`, `backup`, `budgetAlerts`, `cibatch`, `enrichment`,
`legal`, `metering`, `migrations`, `opsAlerts`, `planLimits`, `providerBudget`,
`rateLimit`, `reconcile`, `retention`, `storage`, `uploadPipeline`, `waitlist`,
`waitlistConfirmationEmail`, `webhooks` —
run 2026-08-15. Migrations are now `001`–`018`.

Three things are left in Pathway 1 and none is a logic gap: the **Paddle sandbox
loop** (item 8, `Blocked` on an account — Step 7's gate), the **backup schedule**
(item 10, deferred by decision to the first paying organization, 2026-08-15 —
not blocked), and the **org-deletion policy question** (item 9 — Harsha's call,
not code).

> The real-Postgres number moved by more than the new suite adds. Running the
> existing suites against one shared server exposed four `budgetAlerts` checks
> that had been passing only because PGlite gives every suite its own database
> — see `FinishedSPEC.md` §3h. Doctrine 3 again: a suite proven only against a
> local stand-in is weak evidence.

*Previously:* branch `stage-5-metering` @ `ab40521`, pushed and
fast-forward-merged to `main` 2026-07-30, with **63 checks green**.

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

`usage.ts` deliberately records at **list** prices, never intro prices, so
recorded spend can never under-state reality.

**Rule:** any figure that reaches a customer must trace to a recorded `usage`
object × a live price. Never estimate.

### The price — decided 2026-08-05

**Normascope Cloud is $59/month per organization.** Single tier at launch. No
ladder, no lite tier, no trial.

> **This section owns the launch plan contract.** `PATHWAYS.md` §2 mirrors these
> values as an implementation contract; it does not create a separate authority.
> The launch plan is: **unlimited viewers/designers, repositories under
> active-repository fair use**, 500 monthly credits expiring monthly, prepaid
> packs with no overage invoices, 90-day history, a 30-day money-back guarantee,
> and no client-side paid locks.
>
> **Why this rule exists.** This line previously read "Unlimited repos and
> seats", while §4 and §5 operated a 10-repo fair-use line and `PATHWAYS.md`
> §2's Starter hypothesis assumed 3 — three different answers, all written as
> though decided. See the note under Open Decisions #2.

Why $59 and not $29: the same person buys both the same way — both sit under
the amount that triggers a company approval process — so the lower price bought
identical sales friction for a third of the revenue. Chromatic starts near $149
and Percy's paid plans near $99; $29 read as a side project. With no trial, what
removes the buyer's risk is the **30-day money-back guarantee**, not a low price.

| | Per paying org, per month |
|---|---|
| Price | $59.00 |
| Paddle (5% + $0.50) | −$3.45 |
| Included credits at worst-case COGS (500 × $0.0164) | −$8.20 |
| Storage / DB / serving | under $1 |
| **Contribution** | **≈ $46 (78%)** |

Break-even against the $20–30/mo fixed floor is **one customer**; two on the
$60–80/mo paid-tier floor.

### Included credits and packs

- **500 credits are granted monthly** with the subscription (grant kind
  `plan_allotment`), and **expire at month end** so they cannot be hoarded.
  500 keeps the included COGS at ~14% of price, inside the <15% rule.
- **Packs are bought on top** and last 12 months (`pack_purchase`).
- `ledger.ts` consumes **soonest-to-expire first**, so the monthly allowance
  always burns before anything the customer paid extra for. Already implemented.

#### Credits are derived from cost — decided 2026-08-10

**The rule:** credits are relative to the cost we incur, and **no scenario may
deny profit**. Not "profitable on average" — an average says nothing about the
call that costs the most.

It is mechanised, not written down and hoped for. `providerBudget.ts` computes
each operation's **hard maximum cost** from the caps the request path enforces,
then derives its credit price so that even the worst possible call clears a
stated margin floor. `MARGIN_FLOOR = 0.5` (50% at the worst case, the
conservative analogue of the packs' 64% on measured cost). The suite fails if any
operation would earn less. Change the model and the price follows it in the same
commit, because it is the same number.

Prices as derived today, against the cheapest pack net of Paddle
($0.03535/credit — the binding floor, since included credits are worth more):

| Pass | Model | Worst case | Credits | Revenue | Margin at worst case |
|---|---|---:|---:|---:|---:|
| analysis | Sonnet 5 | $0.0784 | **5** | $0.1767 | 55.6% |
| deep | Opus 4.8 | $0.1307 | **8** | $0.2828 | 53.8% |

> ⚠️ **This replaces "1 credit = one analysis, 3 for deep".** Those prices were
> chosen against *measured* cost ($0.0164) and lost money at the ceiling. The
> consequence is real and needs a decision: **500 included credits now buy 100
> analyses a month, not 500.**
>
> The lever that changes this is the model, and cost-wise it is large:
>
> | If a pass ran on | Worst case | Credits per call |
> |---|---:|---:|
> | Haiku 4.5 | $0.0261 | **2** |
> | Sonnet 5 | $0.0784 | 5 |
> | Opus 4.8 | $0.1307 | 8 |
>
> Moving analysis to Haiku 4.5 would take it from 5 credits to 2 — 250 analyses
> in the monthly allowance. That is a **cost** finding only. §8's provider
> substitution process requires the calibration fixtures re-run against the
> candidate and its quality, schema validity and refusal rate compared before
> cutover, and that has not been done. Do not treat 2 credits as available until
> it has.

Packs, repriced by `migrations/007_repricing.sql`. Floor is 3× COGS at
post-intro **list** prices, so nothing loses money after 2026-08-31:

| Pack | COGS | 3× floor | Price | Per credit | After Paddle | Margin |
|---|---|---|---|---|---|---|
| ~~50~~ | — | — | ~~$3~~ **retired** | — | — | 51% — the flat $0.50 fee ate it |
| 100 | $1.64 | $4.92 | **$7** | $0.070 | $4.51 | 64% |
| 200 | $3.28 | $9.86 | **$12** | $0.060 | $7.62 | 64% |
| 1000 | $16.40 | $49.29 | **$55** | $0.055 | $35.35 | 64% |

`pack_1000` moved $60 → $55 so the ladder rewards volume; at $60 it matched
`pack_200`'s unit rate exactly and gave nobody a reason to size up.

### Customer credits versus AI-provider billing

When an organization buys the subscription or a top-up pack, NormaScope does
not buy AI tokens from the provider at that instant. The customer's payment
creates an internal NormaScope entitlement after a verified payment webhook.
Our provider account is funded separately through its approved billing method,
prepaid balance, or spending limit.

The two money flows are deliberately separate:

    customer payment
    → verified webhook
    → internal monthly or pack credit grant

    explicit hosted-AI request
    → reserve customer credits
    → reserve maximum provider cost
    → call provider using our account
    → meter actual usage
    → settle cost and finalize the credit deduction

This means we do not promise instant provider capacity merely because a
customer has topped up. If our provider account is unavailable, over budget,
unfunded, or returns an error, hosted AI must fail closed with an honest
message. The customer's reserved credits must be released or refunded exactly
once; reports, diffs, history, and other non-AI features continue according to
their entitlements.

The implementation must therefore enforce all of the following:

- grant credits only from an idempotently verified payment webhook;
- never call a provider before both customer-credit and provider-dollar
  reservations succeed;
- reject unknown or unpriced models;
- settle actual provider usage and release unused reservation;
- make timeout, retry, duplicate webhook, and duplicate refund handling
  idempotent;
- alert operators when the provider balance or spend budget reaches 50%, 75%,
  90%, or 100%;
- keep subscription revenue, pack revenue, provider cost, payment fees,
  refunds, and goodwill credits separate in reconciliation.

Customer documentation must describe credits as a NormaScope usage allowance,
not as provider tokens purchased on the customer's behalf.

### Provider substitution and hard-cost management

Anthropic is an internal provider choice, not a customer-facing commitment.
NormaScope may centrally move hosted AI work to another provider when its
measured cost, quality, privacy posture, latency, or reliability is better.
This is a planned provider substitution, not an automatic customer-visible
fallback.

Customers should see a stable NormaScope AI capability and credit price. The
server must still record the actual provider, model, routing-policy version,
usage, and cost internally for audit, debugging, and margin reconciliation.
Provider names, API keys, raw provider errors, and provider-specific model
configuration must not leak into the normal customer workflow.

The implementation needs a provider-neutral contract:

    NormaScope operation
    → routing policy
    → provider/model adapter
    → normalized usage and findings

Every provider/model/operation combination must have a hard maximum cost
derived from its input, output, image, cache, and batch caps. The measured
blended cost in calibration.md is suitable for pricing and forecasting; it is
not by itself an authorization limit.

The hard maximum must fit the revenue floor of the credits consumed. If it
does not, reduce the payload, choose a cheaper model, or charge more credits
before launch. The product must never knowingly sell a credit class whose
maximum provider cost can destroy its margin.

Spending protection must be layered:

- maximum cost per request;
- user/API-key budget;
- organization billing-period budget;
- provider-specific daily budget;
- global NormaScope all-provider daily and monthly budget;
- concurrency and in-flight reservation limit.

All providers count against the same aggregate NormaScope budget. Having room
in a second provider account must not allow the application to bypass a
global breaker.

Changing providers requires a controlled release:

1. run the same calibration fixtures against the candidate provider;
2. compare cost per successful result, quality, schema validity, latency,
   refusals, image support, privacy terms, retention, region, and rate limits;
3. verify the candidate's hard maximum and credit margin;
4. run an internal canary or shadow evaluation;
5. version the routing policy;
6. cut over centrally with rollback available;
7. reconcile old and new provider spend separately.

Maintain separate production accounts and keys for each provider. Auto-reload,
if enabled, must have a bounded reload amount, operator alerts, and an
application-level breaker. It protects availability, not profit. A manual
funding mode is acceptable at launch if reaching zero safely pauses hosted AI.

The provider and aggregate budgets must alert at 50%, 75%, 90%, and 100%. A
100% trip stops new provider calls, even when customer credits remain. Local
reports, diffs, history, and other non-AI features continue.

Before any provider cutover, the release gate must pass largest-payload cost
tests, concurrent cross-provider reservation tests, timeout/retry settlement
tests, zero-balance and auto-reload-failure tests, candidate margin tests, and
provider/model/plan/pack/refund reconciliation.

### Launch hard-stop policy

At launch, use a dedicated production provider account and key. Never use a
founder's personal key, share the production key with customers, use the
production key for development, or permit an agent to call a provider directly.
All calls must pass through NormaScope's server-side budgets and credit ledger.

The initial funding policy should preload only a small provider balance, keep
automatic reload disabled while real usage is measured, alert at 50% and all
budget thresholds, and manually approve additional funding. Later auto-reload
must have a bounded amount, minimum-balance threshold, card/bank alerts,
NormaScope daily/monthly caps, and an emergency kill switch.

Planning example: 100 organizations with 500 credits each represent 50,000
internal credits. At the measured post-intro list-price review cost of $0.0164,
that is approximately $820 of potential provider COGS. It is not a reason to
pre-purchase $820. Actual usage, hard maximum reservations, and the global
provider budget determine what is funded.

| State | Hosted AI behavior |
|---|---|
| Normal | Requests run within all caps |
| Budget warning | Requests run; operators are alerted |
| Budget critical | New expensive/deep requests pause |
| Provider balance unsafe | Hosted AI pauses |
| Global breaker tripped | No provider calls |
| Organization credits exhausted | Only that organization's AI pauses |
| Provider outage | AI pauses; non-AI reports and comparisons continue |

Never silently fall back to an uncapped internal provider account.

### The subscription is mandatory — packs are not a way around it

**Credits can only be bought, and only be spent, by an org with an active
subscription.** Buying a $55 pack instead of subscribing is not a path that
exists. Enforcement points, all server-side:

1. **Checkout** — pack products are only purchasable by an org that already has
   an active subscription.
2. **Spend** — `explainService.ts` checks plan entitlement *before* it touches
   the balance. `free` and `lapsed` plans cannot run hosted explain at any
   balance (`BuildV5.md` plan config).
3. **Upload** — free and lapsed plans cannot upload at all, so there is nothing
   for credits to be spent on.

**On cancellation, unused pack credits are frozen, not forfeited.** They were
paid for; their 12-month expiry keeps running, and they become spendable again
if the org resubscribes before it lapses. Forfeiting them would be a chargeback
generator for a rounding error of revenue.

### Shared organization wallet — settled product behavior

Credits are shared by the organization, not allocated automatically per seat.
Many people may run local reports without consuming Cloud credits or creating
provider cost. Explicit Cloud uploads consume storage/run/repository quota;
hosted and automatic AI explanations consume the shared credit wallet.

When an active organization reaches zero credits, only provider-backed AI
pauses. Local capture, local reports, deterministic GitHub comparisons, hosted
reports/history/trends, share links, and permitted uploads continue. Automatic
PR explanations are skipped with an honest message and CI remains green. The
system never falls back to an uncapped internal provider account.

The next monthly allowance is granted at renewal. Purchased packs remain
available according to their expiry while the subscription is active. A lapsed
organization becomes read-only for existing hosted data; new uploads and
hosted AI are rejected politely.

Organization admins must have visibility and controls for per-organization,
per-repository, per-agent-key, rate, concurrency, and per-run limits, with
usage alerts at 50%, 75%, 90%, and 100%. The detailed state matrix and user
experience live in `PATHWAYS.md` §2.

### Pricing expansion is not yet a launch decision

The settled launch model remains one Cloud subscription at $59/month per
organization. `PATHWAYS.md` records a post-validation expansion hypothesis,
not a change to this doctrine:

| Path | Price hypothesis | Active repositories | Credits |
|---|---:|---:|---:|
| Starter | $59/month | 3 | 500 |
| Growth | $89–99/month | 10 | 1,000 |
| Team | $149/month | 25 | 2,000 |
| Enterprise | Custom | Custom | Custom |

Repository count alone is not sufficient billing. If a ladder is introduced,
it must use active repositories (a repository uploading at least one run in the
billing month), plus measured credit, storage, retention, and governance needs.
Registered or archived repositories must not create accidental upgrades. A
customer with six or seven repositories must have a Growth step or a measured
fair-use conversation; it must not be forced directly from $59 to $149.

Starter must contain the complete core product: hosted reports, history,
trends, share links, unlimited viewers/designers, GitHub Action integration,
bounded PR explanations, basic keys, quotas, and self-serve deletion. Higher
plans may add scale, coordination, governance, audit, retention, support, SSO,
private deployment, or data-residency controls. They must not make the basic
report artificially worse.

Any published plan ladder requires actual customer evidence and a new decision
record here. Until then, keep one public $59 plan and operate fair-use limits
as policy rather than marketing a ladder.

### India pricing — deferred

Not at launch. Costs are dollar-denominated and do not shrink for Indian
customers, so a discount comes straight out of margin. When demand appears, the
shape is **₹1,999/mo with a smaller allowance (~150 credits)** — lower price
*and* a proportionally smaller allotment, keeping included COGS near 15%. Two
things to settle first: **GST** (18% — price GST-exclusive; confirm treatment
with an accountant, do not guess) and **rails** (Razorpay for domestic sales; no
merchant-of-record needed for India-to-India).

---

## 4. What to build next, in order

*(Absorbed from `HorizonPath.md` on 2026-08-05 and clarified on 2026-08-10.
This is the spine from public demand testing to paid Cloud launch.
`PATHWAYS.md` implements this same order; it must not introduce a competing
sequence.)*

It does not restate executable detail that exists elsewhere — it points at it:

| Layer | Document |
|---|---|
| Where we stand, with evidence | `FinishedSPEC.md` |
| **Steps 1–5 executable spec** (phases F–J, test plans) | `BuildV5.md` |
| Steps 6–8 source specs | `BuildV3.5.md` Stage 4 items 4–8, `BuildV4.md` Phase E |
| Website requirements | `normascopeWeb.md` |
| Long-range strategy | `roadmapV1.md`, `Argus/BuildHorizons.md` |

Where this document and an older one conflict, **this one wins** — the older
docs predate the decisions in `FinishedSPEC.md` §8 and Doctrine 9.

### The three rules that shape the order

1. **Public demand first; paid Cloud later.** Launch `normascope.com` as a
   public marketing and waitlist site as soon as its demand-test gate passes.
   This does not mean Cloud is available, and the site must not imply login,
   upload, subscription, or hosted access. Continue building Cloud privately
   while measuring waitlist traction.
2. **Deploy Cloud when there is something worth showing.** Steps 1–4 can be
   built locally. Step 5 is the private/preview deployment of the real Cloud
   infrastructure, not the public paid launch.
3. **Nothing paid ships before the thing it charges for is visible.** The engine
   has been finished for weeks and has earned nothing, because no one can see
   it. Surface before billing.
4. **One paid tier, and every new feature enhances it.** Normascope Cloud at
   **$59/mo per org** — no ladder above, no lite tier below, no trial; credit
   packs are consumables bought *on top of* a live subscription, not a tier and
   not a way around one (§3). New work in either repo must pass the
   capture test (Doctrine 9) or be booked knowingly as marketing spend.

### The whole path on one screen

| # | Step | Where | Blocked on | Done when |
|---|---|---|---|---|
| P | Public website + waitlist | web/ | — | `normascope.com` explains the CLI and Cloud direction, waitlist works, and no paid Cloud access is implied |
| 0 | Loose ends | Argus | — | Registry listed, `doctor` reports explain readiness (**not** a tag — §2 settles that tags are not tracked as a task) |
| 1 | Build substrate | argus-cloud | — | Builds on Vercel; migrations race-safe; storage port has two drivers |
| 2 | Artifact pipeline | both | 1 | `npx norma-scope upload` ships; hosted explain is crop-grounded; re-calibrated |
| 3 | The report page | argus-cloud | 2 | Images, findings, history visible; share UI |
| 4 | Trends | argus-cloud | 2 | Repo view + frame trend chart |
| 5 | Cloud infrastructure go-live | argus-cloud | 1–4 | Own DB, storage, preview URL; lab deleted; G suite green on real R2 |
| 6 | Auth + orgs + control planes | argus-cloud | 5 | GitHub OAuth, magic links, key management, complete organization console, complete operator console |
| 7 | Paddle | argus-cloud | 5, 6 | Sandbox loop green; org provisioned by webhook |
| 8 | Launch gates | both | 7 | E1, E6, legal pages, trademark, refund runbook |
| 9 | Paid Cloud launch + first customers | — | 8 | Enable paid access for qualified waitlist users; first revenue |
| 10+ | Horizons | as needed | 9 | Demand-gated, individually |

**Steps 1–4 are roughly the whole of the remaining product work.** Steps 5–8
are infrastructure, plumbing, and paperwork.

**Where this stands on 2026-08-15.** Step 2's upload half is built and has been
run end to end against the real portfolio capture — declared, transferred
through presigned URLs, committed after verification, read back in a browser.
What remains in Step 2 is crop grounding and recalibration. Step 3 is blocked by
something outside its own scope: **the run report is a blank page in
production**, because the `/r/` CSP blocks the inline scripts Next uses to
deliver content. Fixing that comes before building the page it would render.
Details and the rest of the open list: `PATHWAYS.md` Pathway 2, "Carried
forward".

### The capture test applied to this path

> *Does this require state we store, a key we hold, or a person who isn't the
> developer?* (Doctrine 9)

**Steps 1–8 already comply** — the test validates the existing order rather than
disturbing it. Stated explicitly so the reasoning is reusable:

| Step | Verdict | Why |
|---|---|---|
| 0 Loose ends | ⚠️ marketing spend | The tag and the registry listing are distribution. `doctor` explain-readiness is free-CLI polish — an hour, book it knowingly, don't let it grow. |
| 1 Substrate | ✅ | Pure paid infrastructure. |
| 2 Artifact pipeline | ✅ | `upload` lives in the CLI but is the *rail into* the paid product — G2c already forbids free plans from uploading at all. The client half of a paid service passes. |
| 3 Report page | ✅✅ | Highest-value item on the path — see §10, item 1. |
| 4 Trends | ✅✅ | Cross-run state we hold, structurally impossible client-side. |
| 5–8 | ✅ | Infrastructure, auth, billing, gates for the paid tier. |

Where the test actually bites is **Step 10+**, and it re-ranks that list. The
standing consequence for both repos: **new CLI work is marketing spend by
definition.** Not a prohibition — the free CLI is what makes the paid tier
reachable — but each item needs an adoption reason stated before it starts, and
it competes against paid-side work rather than sitting in a separate budget.

The single-tier decision also settles two things further down, and both are
about **launch**, not forever:

- **No repo-count ladder is published at launch.** Repositories run on
  active-repository fair use, operated as policy rather than printed as a tier
  boundary — `PATHWAYS.md` §2 states the policy, and **the number itself is
  still open** (§3, Open Decisions #2). Do not quote a figure until it is.
- **Step 6 ships without plan-tier logic — but not in a way that forecloses
  it.** Roles stay; there is no tier comparison to implement while one plan
  exists. Build plan limits as **config read at runtime**, the shape §5 already
  calls for, so adding a tier later is a row of configuration rather than a
  rewrite of authorization. Do not hard-code "one plan" into the org, quota, or
  entitlement checks.

> The earlier wording here said the ladder was "closed" and that plan-tier logic
> "never needs to exist". That contradicted §3, §5, and `PATHWAYS.md` §2, all of
> which plan a ladder after validation — and it was the sentence most likely to
> cause real rework, because it invited a Step 6 built on an assumption the
> business does not make. Corrected 2026-08-10.

---

### Step 0 — Loose ends (an hour, do it first)

Small, unblocked, and each one is a papercut that compounds.

1. **List `normascope-mcp` in an agent-tool registry** — the last outstanding
   Build 3.5 Stage 3 gate item.
2. **`doctor` reports explain readiness** — mode, key, optional SDK present.
   Today the first time a user learns they are missing a piece is the moment
   they wanted an answer. Nothing is lost when that happens (`.bridge/` state
   persists; only `explain` re-runs), but discovery belongs in `doctor`.

Deliberately *not* here: **`sourceType()` lies for baseline-only configs.** It
returns `config.source?.type ?? "figma"`, so a config with no `source` block —
now legal for a baseline-only project — reports `"figma"` even though no frame
will ever call Figma. Nothing is broken today: every consumer is guarded
(`source.ts` on `adapterFrames.length > 0`, `compare.ts` only surfaces it for
non-baseline frames, `snapshot.ts` on `!figmaFileKey`, `doctor.ts` on the new
`usesSource`). But the safety lives in four scattered call sites rather than in
the type, so the next consumer to ask "what source is this?" gets a confidently
wrong answer. **This already bit once** — the first cut of the baseline-only fix
left `doctor`'s token check keyed on `srcType === "figma"`, which would have
demanded a `FIGMA_TOKEN` for a project that never contacts Figma and exited 1,
moving the failure instead of removing it. Caught by tracing consumers, not by a
test. The fix is to make the absence representable — `sourceType()` returning
`"none"`, or call sites asking `usesSource` — which ripples into `cache.ts` (the
cache key carries `sourceType`) and the `summary.json` v2 `source` field, i.e. a
**published JSON Schema change**. Do it before a fourth adapter lands, because a
new adapter is exactly when someone reaches for `sourceType()` and trusts it.

---

### Step 1 — Build substrate → `BuildV5.md` Phase F

**No accounts, no domain, no cost.** Three things:

- **F1** — make the monorepo build. ✅ **Done 2026-08-13**, and the diagnosis
  above was stale: npm workspaces already resolved `"argus-cloud": "file:.."`.
  The real gaps were a missing build contract (`dist/` is gitignored, so a
  fresh checkout has nothing for `web/` to import) and — found only by reading
  the build's trace manifests — `migrations/*.sql` reaching **0 of 34** function
  bundles, which would have made the first database request on Vercel fail with
  `ENOENT` while every local build stayed green. `vercel.json` and
  `outputFileTracingIncludes` fix both; proven against a clean checkout.
  Evidence: `FinishedSPEC.md` §4f.
  **The preview deploy is still owed** — no domain, no DNS — because Vercel's
  own builder behaviour with a subdirectory output is the one thing that cannot
  be proven locally.
- **F2** — stop `migrate()` running on cold start. N concurrent cold starts
  currently race N migration runs. Advisory lock.
- **F3** — one `Storage` port, two drivers: filesystem now, S3/R2 at Step 5.
  Nothing above the port may import an S3 type. **This is what keeps Step 5 a
  config change rather than a rewrite.**

**Gate:** everything after this runs entirely offline.

---

### Step 2 — Artifact pipeline → `BuildV5.md` Phase G

The largest quality win available, and the fix for the paid explain being
weaker than the free one.

- **G1** — `npx norma-scope upload` in the CLI. It does not exist today, despite
  the web home page telling users to run it. Opt-in, never-throw, never
  automatic. Region coordinates ride in the upload body, **not** the published
  JSON Schema.
- **G2** — presigned direct-to-R2, three-phase: declare → transfer →
  commit-verify. Content-addressed blobs inside the org prefix.
- **G2b/G2c** — abuse controls and the **paid-entitlement rule**. Free plans
  cannot upload anything: no key, no presigned URL, no bypass flag, checked on
  every request. There is no trial, so there is no unpaid party with an upload
  key.
- **G3** — crop-grounded hosted explain. Delete the metadata hedge from the
  prompt **only** once CLI-vs-hosted findings are recorded side by side.
- **G4** — **re-calibrate.** Crops change COGS, and COGS is the floor under
  every pack price. Rewrite `calibration.md` before Step 7 creates the Paddle
  catalog, never after.
- **Wire the Action to `/api/ci-explain`** — POST after upload, poll GET, append
  the escaped `prLine` to the sticky comment. Service and tests already exist;
  only the wiring is missing.

**Needs from Harsha:** an `ANTHROPIC_API_KEY` with a little balance for G4
(~$0.20). Runs locally; no deployment required.

---

### Step 3 — The report page → `BuildV5.md` Phase H

The page a customer looks at. Today: 131 lines, no images.

- Three images per frame, reusing `Argus/src/report.ts`'s visual language from
  `5d311fb` — including its aspect-ratio, synced-scroll, and lightbox fixes.
  Do not re-derive them; they were bugs once.
- Findings rendered properly, region-highlighted, escaped,
  `injection-suspected` visually distinct.
- **History made prominent.** `enrichment.ts` computes `firstDriftCommit` and
  `recurrence` and feeds them to the model; `explain-panel.tsx:96` renders them
  as a 12px, 65%-opacity grey line under each finding. *(Corrected 2026-08-05 —
  an earlier note claimed nothing rendered them; the work left is promotion, not
  plumbing.)* This is the one thing a local tool can never compute, so it should
  be the most prominent element on the page, not the faintest. See §10 item 1.
- Share UI for the API that already exists.

#### Free report vs hosted report — what may differ, and what may not

The CLI's `report.html` and the hosted run page must diverge, but **only
additively**. The binding rule:

> **The free report is never degraded to make the hosted one look better.**
> Anything the CLI can compute from a single local run, it keeps — at full
> quality, forever. The hosted page differs because it can show things a local
> run *structurally cannot know*, not because we withheld something.

Degrading the free report would be a client-side gate (Doctrine 5), and it would
damage the best marketing asset we have: a self-contained, designer-readable
file that works offline, attaches to an email, and needs no account. That
property is a feature — protect it.

**Identical in both (never touch):** aligned score and meter, SSIM, significant
regions, the three-image comparison with its aspect/synced-scroll/lightbox
fixes, the section table, BYO explain findings, the full visual language.

**Hosted-only, per frame** — each needs `frame_stats` / `run_findings`, i.e. our
database:

| Addition | What it says |
|---|---|
| History strip | Sparkline of this frame's score across the last N commits |
| First drift | "First exceeded threshold at `a1b2c3`, 14 commits ago" |
| Recurrence | "3rd time this frame has regressed" |
| Run-over-run delta | "Was 2.1% on the previous default-branch run, now 12.4%" |
| Prior-finding recall | "This region was flagged in March; the finding then was X" |
| History-aware findings | Already built — `enrichment.ts` feeds these facts to the model before it writes |

**Hosted-only, page level:** which frames improved or worsened since the last
run; the repo trend view (Step 4); a revocable share link; 90-day retention and
stable permalinks, against a local file that is overwritten on the next run.

**The one thing the free report gains:** a single quiet line in the place where
the history strip would sit — *"History needs past runs; a local run only knows
about itself."* Honest, one line, no link-bait, no phone-home, static string
only (Doctrine 6). It demonstrates the gap instead of claiming it. **It must
never become a nag** — the free report is a trust artifact, and turning it into
an advert costs more than it earns.

**Maintenance risk to plan for:** two renderers will drift. The hosted page
reuses `Argus/src/report.ts`'s visual language but cannot import it (Doctrine 6
— the published package carries no paid logic). Copy the CSS deliberately, and
keep the three fixes from `5d311fb` (aspect-ratio sizing, synced scroll,
lightbox overflow) on a checklist so the hosted page does not re-introduce bugs
the CLI already fixed.

**Build order within this step:** the per-frame history strip first. It is the
highest-value addition, the data already exists in `frame_stats`, and it is the
same work as promoting the enrichment fields out of 12px grey text.

---

### Step 4 — Trends → `BuildV5.md` Phase I

Every number already exists in `frame_stats` with the right index.

- Repo view — runs, flagged counts, per-frame sparkline. **Nothing above
  `/r/{runId}` exists today.**
- Frame trend — score over commits, threshold line, first-exceeded annotation,
  mode-transition markers. Skips render as gaps, never zeros.
- Org-scoped, capped trends API.

**Gate:** the chart's "first drift" must agree with `enrichment.ts` on the same
data. Two implementations that disagree means one is wrong.

> **Steps 3 and 4 are the sales asset.** With no trial, a prospect never touches
> the hosted product before paying — the demo carries the whole argument. Argus
> has dogfooded its own Action since Stage 2, so its `frame_stats` history is
> real and months deep. Publish it: a trend chart with genuine history and a real
> regression catch is the case study BuildHorizons asks for, and no trial account
> could ever have produced it.

---

### Step 5 — Go live → `BuildV5.md` Phase J

The first step needing accounts. Postgres, R2, a URL, and deleting the portfolio
preview.

**Re-run the entire G suite against real R2.** Presigning, `Content-Length`
pinning, and TTL behave differently against a real service than a local stub,
and abuse controls proven only against a stub are not proven.

**normascope.com** is the destination, and it is **registered as of
2026-08-13** — earlier than this step required. DNS is not delegated yet, so a
free `*.vercel.app` still covers this step; the domain becomes mandatory at
Step 7, because Paddle production checkout requires an approved domain.

**Needs from Harsha:** items 1–5 and 7 of `BuildV5.md`'s handover table.

---

### Step 6 — Auth, orgs and dashboards → `BuildV3.5.md` Stage 4 items 4–5

Until this lands there is no "customer", only an access code and share links.
Multi-tenancy is enforced in the data layer and **unproven in the session layer,
because there is no session layer.**

- GitHub OAuth for developers; **email magic links for designers** (a designer
  seat must not require a GitHub account — this is a real differentiator, not a
  detail).
- Org creation, invites, roles (`admin | member | designer`), key management UI
  with once-shown keys and working revocation.
- The report page's API-key field disappears; sessions replace it.
- **Smaller than originally specced**: with no trial, no free accounts, and no
  plan tiers, only paying users are ever authenticated.

**The customer's own account page** (same step — it needs the session layer):

- Credit balance, split into **this month's allowance** (with its expiry) and
  **purchased packs** (with theirs), so "why did my balance drop" is never a
  support ticket.
- Usage history: date, repo, frame, analysis vs deep, credits spent. Every row
  traces to a `usage_events` record — Doctrine 2 applies to what the customer
  sees, not just to our own figures.
- Cache hits shown as **free**, explicitly. It is a selling point and it should
  be visible in the ledger the customer reads.
- Subscription state, renewal date, invoices (link out to the MoR portal rather
  than rebuilding billing history), and a self-serve cancel.
- Seat and repo list.

**Gate:** cross-tenant probes denied at the session layer, not just in SQL.

**Our own operator console** (internal, no public route, restricted operator
roles, and built as a real control plane rather than a small collection of
support pages):

- Every org: plan, subscription state, credit balance, credits consumed this
  month, storage used, last activity.
- Spend and margin per org — `usage_events` already stores real microdollar
  cost per call, so revenue-minus-COGS per customer is a query, not a new
  system. `reconcile.ts` already computes the global version.
- Provider spend today against the breaker's daily budget.
- Manual actions with an audit trail: issue goodwill credits (`ledger.ts`
  already has the grant kind), reset the breaker, revoke a key, and apply
  scoped operational pauses.

Build it as one protected operator console inside the Cloud app, not as a
separate app or a scattered set of hidden routes. It is how you answer “is this
customer profitable?”, “what is failing?”, and “why did their bill look odd?”
without opening a SQL client.

#### Control-plane UI contract

The product has two deliberate interfaces with separate navigation and
permissions:

1. **Organization console** — the customer-facing workspace for admins,
   members, designers, and read-only share viewers.
2. **Operator console** — the internal workspace for support, finance,
   reliability, and security operators. It never becomes visible merely because
   a user belongs to an organization.

Both consoles use the same product shell and design system, but they do not
share authorization, navigation, or data visibility. A route is not a UI
boundary: every page, server action, API call, export, and object URL must
enforce the same role and organization scope on the server.

The organization console has a stable information architecture:

- **Overview:** current status, recent runs, unresolved findings, credits,
  storage, and actions needing attention.
- **Runs and reports:** repositories, runs, frames, history, findings, and
  share links.
- **Trends:** repository and organization quality trends, recurrence, first
  drift, and quality debt.
- **Explain and automation:** hosted explanations, CI explanation activity,
  caps, skipped work, and AI-exhaustion state.
- **Organization:** members, roles, invitations, repositories, API/agent keys,
  notifications, and automatic-explain policies.
- **Billing and usage:** subscription, renewal, invoices, allowance versus
  packs, usage ledger, storage, and payment management.
- **Privacy and data:** upload mode, pre-upload disclosure, retention,
  exclusions, exports, deletion, and completion receipts.

The operator console has a separate stable information architecture:

- **Operations overview:** service health, incidents, queues, breakers,
  provider status, backups, restore status, and deletion sweeps.
- **Organizations:** searchable tenant inventory, account state, activity,
  storage, credits, repositories, and support context.
- **Revenue and reconciliation:** subscriptions, packs, webhooks, refunds,
  chargebacks, credit movements, provider cost, margin, and discrepancies.
- **Usage and spend:** provider/model/operation costs, cache rate, budgets,
  reservations, concurrency, rate limits, and anomalies.
- **Security and abuse:** suspicious sign-ins, upload abuse, cross-tenant probe
  failures, key events, injection alerts, and incident evidence.
- **Controls:** scoped pauses for AI, uploads, captures, sharing, providers,
  organizations, and keys; every action requires a reason and records expiry or
  rollback when possible.
- **Audit and support:** immutable operator actions, break-glass access,
  customer-visible event context, and incident notes.

The shared usability contract is part of the product, not visual polish:

- persistent navigation with the current organization and environment visible;
- consistent breadcrumbs, page titles, filters, search, pagination, and URL
  state so support can link directly to a view;
- clear loading, empty, stale, partial-failure, paused, exhausted, and
  read-only states;
- tables for investigation and cards only for summaries; no critical action
  hidden behind an unexplained number;
- destructive actions require recent authentication, an explicit scope, a
  typed confirmation where appropriate, and a visible completion receipt;
- every number has a time window, source, and timezone; customer totals and
  operator totals reconcile to the same ledger;
- keyboard access, responsive layouts, readable contrast, reduced motion, and
  screen-reader labels are required for all core workflows;
- no raw provider errors, secrets, prompts, screenshots, or cross-tenant data
  appear in ordinary customer or operator views.

The two consoles share components, but not data shortcuts. Any new admin or
account feature must first be assigned to one of these information-architecture
areas, its role matrix, its audit event, and its acceptance test. Do not add a
one-off page when an existing area can own the workflow.

---

### Step 7 — Paddle → `BuildV3.5.md` Stage 4 item 6

Sandbox first; production keys last.

1. **Signature adapter.** Paddle signs `ts:body` and sends `ts=<unix>;h1=<hmac>`
   — **not** the generic HMAC-hex `webhooks.ts` implements today, despite its
   comment. Write it, test it, keep the tampered-payload case.
2. **Webhook route.** `src/webhooks.ts` is currently unreachable — no
   `/api/webhooks/*` exists.
3. **Org provisioning.** With no trial, the purchase webhook is the *only* way an
   org is ever created. Checkout → webhook → org + grant → magic link.
4. **Real product ids.** Remap `migrations/005`'s provisional `pack_*` slugs
   after creating the catalog — priced from **G4's** recalibrated COGS, not the
   pre-crop numbers.
5. **Fix `reconcile.ts` first.** It counts allotment-funded spend against pack
   revenue only, and will trip the <50% margin alert into an unjustified
   reprice. Small fix; do it before the first paying org.
6. **Lapse, grace, refunds.** Uploads rejected politely, CI stays green, nothing
   deleted. Plus the 30-day money-back guarantee: a written policy and a runbook
   entry. Verify Paddle's fee treatment on refunds — that is the real per-refund
   exposure.
7. **E7 live loop in sandbox**: buy → explain → exhaust → clear message, CI green
   → re-buy → works.

**Needs from Harsha:** Paddle sandbox account (free, no business verification),
then business verification for production. `normascope.com` is registered
(2026-08-13); DNS delegation is still owed.

---

### Step 8 — Launch gates → `BuildV4.md` Phase E + `BuildV3.5.md` items 8, 10

Nothing here is optional, and none of it is invisible if skipped.

- **E1** — injection fixtures against the *hosted* path, 1:1 with
  `SECURITY-LLM.md`. Step 2 widens this surface by sending uploaded images to
  the provider, so it matters more now, not less.
- **E6** — provider retention posture verified and stated on a disclosure page.
- **Close the pay-twice gap** — `npx norma-scope explain` has no cloud branch, so
  a customer with credits cannot spend them from the CLI. Step 2 gives the CLI an
  authenticated cloud client, which makes this small. **Launch blocker.**
- **Retention sweep + deletion** — 90-day sweep with dry-run; run/repo/org delete
  removes objects from storage, not just rows. ✅ **Built** — `FinishedSPEC.md`
  §3j.
- **Ops** — backups with a *rehearsed* restore, uptime alerts that reach a phone,
  `npm audit`, security headers. Backups, the rehearsal and the alert channel are
  ✅ **built** (§3k) and `npm audit` runs in CI; what is still owed here is
  **turning the schedule on in production** (secrets) and the security headers.
- **Control-plane UI** — the organization and operator consoles pass their
  navigation, role, tenant-isolation, audit, responsive, keyboard, and
  screen-reader gates. No paid launch with scattered or support-only control
  surfaces.
- **Legal + docs** — ToS, Privacy, subprocessors, security contact, data-flow
  disclosure, pricing page with per-review cost, BYO instructions, exact model
  list, honest limitations ("hypotheses, not diagnoses").
- **File the "Normascope" trademark** (one word mark covers both tiers).

---

### Step 9 — First customers

Break-even is **3–4 orgs**. Distribution per BuildHorizons: npm, the Action
marketplace, MCP registries, and one honest case study per mode — the Bose-style
writeup for fidelity, a real regression catch for baseline.

Watch three things, because each is a documented trigger:

| Signal | Triggers |
|---|---|
| "Can I try the hosted side first?" | Re-enable the trial (design settled, `BuildV5.md` §G2c) |
| "We don't have an Anthropic contract" | Provider flexibility — Claude on Bedrock/Vertex first (§8) |
| Support load approaching ~1 day/week | First hire, a support-minded engineer |

---

### Step 10+ — Horizons (demand-gated, individually)

From `roadmapV1.md`. **None begins without paying demand** — and the capture test
re-ranks them, because three of the five cannot be charged for as originally
specced. Order below is the corrected one.

**Passes — chargeable, build these first when demand appears:**

1. **Provider flexibility** — Claude on Bedrock/Vertex is days of work, no prompt
   changes, no re-calibration, and unblocks AWS/GCP-committed accounts. Hosted
   runs on our key, so this passes cleanly. The free escape hatch exists today
   and is undocumented: the Anthropic SDK honours `ANTHROPIC_BASE_URL`, so any
   compatible gateway already works — that documentation is CLI-side, i.e. an
   afternoon of marketing spend that may satisfy the first enterprise to ask.
2. **Design tokens / brand compliance — only in its hosted form.** As specced in
   `roadmapV1.md` it **fails**: a token spec checked against computed styles at
   capture time is pure local computation, so it would be free forever no matter
   how enterprise the buyer sounds. It *passes* if respecced — the token spec
   lives org-side, versioned, and compliance is evaluated server-side against
   uploaded runs, producing history ("this component drifted off-token in
   March"). Same feature, opposite side of the line. **Do not build the local
   version and hope to charge for it later.**
3. **Email rendering QA** — passes: it requires third-party client-rendering
   infrastructure we run and pay for. Carries a new data flow (emails leave the
   machine) needing its own disclosure and opt-in.

**Fails — free by construction; only ever marketing spend:**

4. **Localization QA** — same page × N locales, text masked, layout diffed. All
   local capture and local diff. Genuinely useful, genuinely unchargeable.
5. **Mobile (RN/Flutter via simulators)** — capture and diff both local. The
   largest build cost on the list and the weakest capture: it would enlarge the
   free tier substantially and the paid tier not at all. Only ever justified as a
   deliberate adoption bet, never as a revenue item.

Still not doing: generic screenshot API, test runner, accessibility audits,
Figma plugins, auto-fix PRs, CI blocking by default.

---

### What only Harsha can provide, consolidated

| Needed at | Item |
|---|---|
| Step 2 | `ANTHROPIC_API_KEY` + small balance (~$0.20 for G4) |
| Step 5 | Vercel project · ~~Postgres (Neon/Supabase)~~ **provided 2026-08-13 — Neon, us-east-1, PG 17.10, pooled** · R2 bucket + credentials · `NORMASCOPE_CLOUD_PASSWORD` + fresh `JWT_SECRET` · confirmation to delete the portfolio preview |
| Step 5 (now) | `DATABASE_URL` set in the Vercel project itself — the local `web/.env.local` copy does not travel, and the guard in `src/db.ts:61` makes a deploy without it fail rather than lose signups |
| ~~Step 5 (optional)~~ | ~~`normascope.com` early~~ **provided 2026-08-13** — registered at Spaceship; **DNS still on the registrar's parking nameservers**, so delegation to Vercel is the remaining step |
| Step 7 | Paddle sandbox account; then business verification for production (the domain is in hand) |
| Step 8 | Trademark filing; ToS/Privacy content decisions; a phone number for alerts |

### Open decisions

Everything else is settled (`FinishedSPEC.md` §8). These are not:

1. ~~**Real domain name**~~ **Closed: `normascope.com`.** Registration and DNS
   are needed by Step 7, not before; everything until then is local.
2. **Post-launch expansion shape** — launch remains one $59/month plan, and
   this section states what that plan offers (decided 2026-08-10).
   The post-validation Growth/Team hypothesis still needs real repository,
   credit, storage, support and retention data before any ladder is published.

   > ⚠️ **The sub-decision that is actually open: what number the fair-use line
   > is, and whether it is ever said out loud.** Three numbers have been written
   > down at different times — "unlimited" (§3, 2026-08-05), a **10**-repo
   > fair-use line (§4, §5, inherited from the pre-single-tier design), and
   > **3** active repositories for Starter in PATHWAYS' expansion hypothesis
   > (2026-08-10). This was never sloppiness: the 2026-08-05 commit that decided
   > $59 recorded the sub-decision as *open* — "whether the 10-repo figure is
   > published as a fair-use line or dropped entirely in favour of unlimited" —
   > and then both branches stayed in the text.
   >
   > **The trap to avoid:** if we operate a 10-repo line now and later publish a
   > ladder whose Starter is 3, every existing $59 customer loses seven
   > repositories at the moment we launch tiers. Grandfathering costs revenue;
   > not grandfathering costs trust. Decide the launch number *before* it is
   > quoted to anyone — including in a sales call — and make the ladder's
   > Starter no smaller than it. Needed for the pricing page at Step 8.
3. **Refund policy wording** — 30 days is decided; the exclusions are not.
4. **Whether Step 6 ships GitHub OAuth and magic links together** or OAuth
   first. Designer seats are a differentiator; shipping OAuth alone delays it.

---

## 5. Multi-tenancy — how company-specific access will work

**This section is design detail for §4 Steps 6 and 8, not a separate track** —
auth and org management are Step 6, deletion/retention and the tenant probes are
Step 8. It sits after the path because it explains *how* those steps work.

The legacy preview is **single-tenant by design**: one shared access code, one
dataset. That is fine for a demo and wrong for customers. Here is the real
design — most of it already exists in `argus-cloud`, unbuilt only at the edges.

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
   (BuildV5 §G2c), buying is the only way an org comes into existence. The plan
   *should* default to `free`, which **cannot upload**.

   > ⚠️ **Corrected 2026-08-10: it does not yet.** This previously said
   > `migrations/001`'s `DEFAULT 'trial'` "is superseded by a later migration".
   > **No such migration exists** — checked across `001`–`009`; the column still
   > reads `plan TEXT NOT NULL DEFAULT 'trial'` and nothing alters it. So a
   > directly-inserted org lands on a plan value the product no longer has. It
   > is harmless today because every org is created by hand, and it is owed as
   > part of BuildV5 §G2c (plan enum → `free | team | lapsed`) at Step 6.

   Direct `INSERT INTO orgs` remains the manual path until the admin UI exists.
2. **Grant credits.** A `plan_allotment` grant for the paid plan's included
   allotment, or a `pack_purchase` grant created by the MoR webhook after
   payment. (`team` is the *internal enum value* for the one paid plan, not a
   published tier name — §3 has no "Team" tier at launch.) **Balance is the cap** — there is no way to spend past it. (Note
   `reconcile.ts` counts allotment spend against pack revenue only — see
   BuildV5's Build 5.5 risks.)
3. **Issue keys** with `createApiKey(db, orgId, { kind })`:
   - `upload` keys — for CI/CLI uploads.
   - `agent` keys — for AI agents, with `monthly_budget_credits` and
     `rate_per_minute`. Exhaustion returns a clear error and **never reddens CI**.
   Keys are `nsk_`-prefixed, **sha256-hashed at rest**, shown exactly once.
4. **Connect the CLI explicitly.** The free and paid users use the same
   `norma-scope` executable. `check`, `compare`, and the pre-commit hook never
   upload implicitly. A paid repository uses `npx norma-scope upload` after a
   user or CI configuration has opted in. The first implementation uses
   `NORMASCOPE_CLOUD_URL` and `NORMASCOPE_ORG_KEY`; a later `cloud login` device
   flow may use an OS credential store for interactive developers.
5. **Invite humans.** GitHub OAuth for developers, email magic links for
   designers (designer seats don't require a GitHub account). Membership rows
   carry `admin | member | designer`. **This is the main unbuilt piece.**
6. **Isolation is automatic** from there: reports, trends, result cache, and
   credits are all org-scoped.

The upload default for an entitled repository is `flagged`: full artifacts for
flagged frames, thumbnails or metadata for clean frames. Supported repository
modes should be `none`, `flagged`, `all`, and eventually `metadata-only`.
Uploading is a customer-controlled data transfer, not a side effect of using
the free CLI.

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
- **Plan limits as config, not code** — read every limit from configuration at
  runtime so a second plan is a configuration row, not an authorization rewrite
  (§4). **The values come from this document's §3 launch contract**; do not
  hard-code a repository or seat number here or in the code. Unlimited seats is
  settled; the repository figure is not (§3, Open Decisions #2). Any future
  ladder runs on **repos**, never on seats. (Partly
  settled: BuildV5 §G2c fixes the plan enum to `free | team | lapsed` and
  specifies the upload, storage and quota dimensions. **No ladder is published
  at launch** — the pricing page at §4 Step 8 ships the single $59 plan.)
- **Lapse handling** — uploads politely rejected on lapse, **CI stays green**,
  nothing deleted; 14-day grace. (No trial — BuildV5 §G2c. Risk reversal is a
  30-day money-back guarantee.)
- **Deletion + retention** — ✅ **built 2026-08-13** (`src/retention.ts`,
  `migrations/013`, §3j). Run/repo/org delete removes objects from storage as
  well as rows, and the 90-day sweep runs dry unless `--apply` is passed. What
  is left here is the **customer-facing flow** — re-authentication, typing the
  org name, key revocation, the receipt shown to the user — which is Step 6 UI
  on top of this engine.
- **Admin view** — spend, margin, breaker state, enterprise-lead flags.
- **Customer deletion UI** — personal account deletion must not delete an org
  unless the user is its owner; organization deletion requires re-authentication,
  typing the org name, key revocation, storage deletion, and a completion receipt.
- **Privacy controls** — first-run data-flow disclosure, pre-upload manifest,
  route/selector exclusions, DOM/code exclusions, retention choices, and
  hosted-report-without-hosted-AI mode.
- **Screenshot redaction** — the text secret scanner does not protect secrets
  visible in pixels; add `[data-norma-private]` DOM redaction and configurable
  screenshot redaction regions before hosted AI is marketed to sensitive teams.

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

## 6. Open risks — named, never assumed away

| Risk | Status |
|---|---|
| ~~Both stage branches unpushed~~ | **Closed 2026-07-30.** Both pushed and merged to `main`; `origin` holds everything. |
| E1 hosted-path injection fixtures not run 1:1 | Open. CLI-side injection suite is green and the hosted prompt uses the same delimiter rules — but it has not been *proven* on the hosted path. |
| E6 provider retention posture unverified | Open. Disclosure page unwritten. |
| E7 live purchase loop | Blocked on MoR. |
| Hosted findings are metadata-grounded, not crop-grounded | Known and honestly labelled in the prompt. Fixed by item 2 above. |
| ~~Worst-case provider cost exceeds credit revenue~~ | **Closed 2026-08-10.** Credits are now derived from the hard maximum cost with a 50% margin floor, enforced by the suite — analysis 5 credits, deep 8. See §3 "Credits are derived from cost". **The consequence needs a decision:** 500 included credits now buy 100 analyses, not 500. Moving analysis to Haiku 4.5 would make it 2 credits (250 analyses), gated on a calibration run per §8. |
| Screenshot-visible secrets and private data | Open. Text secret scanning does not detect credentials or personal data rendered inside pixels; redaction and a pre-upload manifest are required. |
| Customer deletion path | **Engine closed 2026-08-13** (§3j): run, repo and org deletion remove storage objects as well as rows and leave a receipt that outlives the org. **The user-facing half is open** — re-authentication, typing the org name, and showing the receipt are Step 6 UI. |
| Deleting an org deletes its books | **Open — a decision, not code.** The cascade from `orgs` takes `usage_events`, `credit_grants` and `subscription_periods` with it, so an erasure changes what past months report. The receipt keeps the aggregate totals; whether anonymised per-event records must be retained for the accounting period is undecided (§3j). |
| Cloud upload surprise | Open until repository-level upload mode, first-run disclosure, and the explicit `upload` trigger are implemented. |
| Lab shares the portfolio's database and R2 | Accepted for a testing deployment. Prefixes make removal clean. Do not let real customer data land there. |
| Prepaid API balance is small (~$19) | Mitigated by the daily cap. Keep it on. |
| Explain is Anthropic-only, in BYO **and** hosted | Open. Invisible to us because we have a key; a hard blocker for any account without an Anthropic contract. Scoped in §8. |
| **A paying customer on the CLI would pay twice** | Open, and a **launch blocker for the cloud tier**. Org-credits mode exists only in the MCP server (`server.ts:275–311`); `norma explain` has no cloud branch and goes straight to `createAnthropicCaller()`. So a customer with credits cannot spend them from the CLI — they must also bring an Anthropic key. Harmless today (no paying customers), must close before Cloud launches. Scoped in §8. |

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
9. **One paid tier at launch, and every new feature enhances it.** Normascope
   Cloud at **$59/mo per org** is the only subscription **we launch with** —
   no ladder above it, no lite tier below it, no trial. Prepaid credit packs are
   consumables that require a live subscription to buy *or* to spend (§3).

   **This is a launch configuration, not a permanent rule.** A ladder is
   expected after validation, on the schedule in §3 ("Pricing expansion is not
   yet a launch decision") and `PATHWAYS.md` §2: after the first 5–10 paying
   organizations, measured against real repository, credit, storage, support and
   retention data, and recorded as a new decision in §3 before anything is
   published. What does not bend is the *order* — evidence first, then a tier —
   not the number of tiers forever.

   The part that does not bend is the rest of this rule: every new feature
   enhances the paid product rather than fragmenting it, and before anything is
   built, in **either** repo, apply the **capture test**:

   > *Does this require state we store, a key we hold, or a person who isn't
   > the developer?*

   **No** → it cannot be charged for, however sophisticated it is. The CLI runs
   entirely on the user's machine, so the only available gate would be a
   client-side lock, which Doctrine 5 forbids. Such work is **marketing spend**
   — build it deliberately as that, with an adoption goal attached, or don't
   build it. **Yes** → it belongs here, in `argus-cloud`.

   This is the forward-looking half of Doctrine 5: that rule says where gates
   may live, this one says where effort goes. It is **not retroactive** —
   shipped CLI features fail the test on enforcement, not on user expectations,
   so nothing already free gets clawed back. Applied to the path in
   §4 → "The capture test applied to this path".

10. **Gated execution.** A pathway is not complete when code exists. It is
    complete only when implementation, normal tests, failure tests,
    security/tenant/accounting checks, and required external evidence all pass.
    Work proceeds strictly in order: the next delivery phase cannot begin until
    the current phase is implemented, verified, and all of its gates are green.
    A blocked phase, an unrun gate, or a skipped test is an open risk, never a
    pass. The detailed gate ledger and AI-agent handoff format live in
    `PATHWAYS.md` §3 and §10.

11. **Economic loss firewall.** No provider-backed feature reaches customers
    until provider dollars are reserved before the call, actual usage settles
    the reservation, failures release it, and credits/refunds are idempotent.
    Global, organization, and machine-key budgets are hard server-side caps;
    unknown models, unbounded payloads, and unpriced operations fail closed.
    Concurrent requests and batch collectors must not overspend or settle twice.
    Subscription, pack, goodwill, payment-fee, refund, storage, and provider
    costs must reconcile separately. The detailed reservation, hard-cost,
    settlement, and test requirements live in `PATHWAYS.md` §3 and §10.3.

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
| MCP server | ✅ `ANTHROPIC_API_KEY` | ✅ `NORMASCOPE_CLOUD_URL` + `NORMASCOPE_ORG_KEY` → `/api/upload` + `/api/explain`, **plain fetch, no SDK** (`server.ts:275–311`) |
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

**Sequencing:** this sits behind the §4 path. Pushing both branches and
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
| **What to build next, in order** | This document, §4 |
| **What is actually built, with evidence** | `argus-cloud/docs/FinishedSPEC.md` |
| Steps 1–5 executable spec | `argus-cloud/docs/BuildV5.md` — phases F–J |
| Phase detail | `argus-cloud/docs/CHECKPOINT.md` |
| The spec | `argus-cloud/docs/BuildV4.md` |
| Threat model | `Argus/SECURITY-LLM.md` |
| Measured costs | `argus-cloud/docs/calibration.md` |
| Provider key | `argus-cloud/src/.env` (gitignored) + Vercel env |

---

## 10. What we sell — the paid-only features and how to say them

*Added 2026-08-05. Source for the pricing page and the Cloud page in
`normascopeWeb.md`. Doctrine 2 and 3 apply to marketing copy too: **every claim
here traces to code, and anything not built is labelled.***

### The test a feature must pass to appear on the pricing page

A local CLI on the user's laptop only ever knows about **today's run, on this
machine**. Anything that needs *other* runs, *other* people, or *our* key is
something they cannot get by not paying. That — not feature count — is what
justifies $59.

Verified 2026-08-05: `grep` for `frame_stats|recurrence|firstDrift|history`
across `Argus/src/*.ts` returns **nothing**. The free CLI has no cross-run
memory of any kind. Every history claim below is structurally safe to make.

### The nine, ranked by how hard they are to argue with

| # | Feature | Where it lives | Status |
|---|---|---|---|
| 1 | History-aware findings | `enrichment.ts` | ✅ Built, under-displayed |
| 2 | Trends over time | `frame_stats` | ⚠️ Data yes, UI is Step 4 |
| 3 | No AI vendor account needed | `explainService.ts` | ✅ Built, needs billing (Step 7) |
| 4 | Spending that cannot run away | `ledger.ts`, `breaker.ts` | ✅ Built |
| 5 | Repeat analyses are free | `resultCache.ts` | ✅ Built |
| 6 | Automatic CI explanations at half cost | `ciBatch.ts` | ✅ Built, wiring is Step 2 |
| 7 | A link instead of a zip file | `runs`, `share_links` | ✅ API built, page is Step 3 |
| 8 | Designers without GitHub accounts | magic links | ❌ Step 6 |
| 9 | Budgeted keys for AI agents | `apiKeys.ts` | ✅ Built |

---

**1. History-aware findings — the strongest thing we have.**

*Plain:* Instead of "this section is 12% off", the customer reads "this section
is 12% off, it has drifted 3 times before, and it started at commit `a1b2c3`."

*Why local can't:* the laptop has one run. We have every run.

*Website copy:* **"Not just what broke — how long it's been breaking."**

*Action:* `explain-panel.tsx:96` renders this as 12px grey text at 65% opacity,
under the CSS hint and the suggested fix. The single best reason to pay is the
faintest thing on the page. Move it **above** the AI explanation, at normal
size, as its own labelled row. This is a layout change, not a feature — the
cheapest high-value work left on the whole path (§4, Step 3).

**2. Trends over time.**

*Plain:* a chart per frame showing how far off it has been on every commit, with
the line where it first crossed the threshold.

*Why local can't:* same reason.

*Website copy:* **"Watch drift accumulate, before it becomes a redesign."**

*Action:* every number already exists in `frame_stats`. Step 4. Use **Argus's
own months-deep dogfood history** as the live demo — no trial account could
produce it, and with no trial that demo carries the entire argument.

**3. No AI vendor account needed.**

*Plain:* free explain requires the user to have an Anthropic account, a key, and
a billing relationship. Paid means they buy credits from us and never talk to an
AI vendor at all.

*Why local can't:* the provider key is ours and never reaches the CLI
(Doctrine 6).

*Website copy:* **"No AI vendor account. No API keys to manage. Just credits."**

*Note:* this is a **procurement** argument, not a convenience one. For many
companies "get an Anthropic contract approved" is months; "expense a $59 tool"
is minutes. Say it near the top of the Cloud page.

**4. Spending that cannot run away.**

*Plain:* with your own key, a mistake or a loop is your bill. With us there is
no code path that can overcharge you — credits are prepaid, the balance is the
cap, a database constraint makes a negative balance impossible, a daily circuit
breaker pauses spend globally, and a failed analysis is refunded automatically.

*Why local can't:* BYO users hold uncapped exposure to their own provider.

*Website copy:* **"There is no overage invoice, because we never built one."**

*Note:* this is our sharpest contrast with per-screenshot competitors *and* with
BYO. It is unusually credible because it is enforced in the schema, not in a
policy page — `remaining_credits >= 0` is a CHECK constraint.

**5. Repeat analyses are free.**

*Plain:* same frame, same build, same design, same model → the stored result is
returned and no credit is spent. Cache entries can never cross an org boundary.

*Website copy:* **"Re-running costs nothing. We only charge for new thinking."**

**6. Automatic CI explanations at half cost.**

*Plain:* on every PR, the worst frames get explained automatically and the
explanation is appended to the PR comment. Batched through the provider's
Batches API at 50% rate. Free users must run `explain` by hand, one frame at a
time, at full price.

*Website copy:* **"Every PR explains itself."**

*Action:* the service and tests exist; only the Action wiring is missing
(§4, Step 2).

**7. A link instead of a zip file.**

*Plain:* free CI produces a report inside a GitHub Actions artifact — download,
unzip, open. Paid produces a URL that opens.

*Why local can't:* hosting is hosting.

*Website copy:* **"Send the link. They open it. That's the whole flow."**

**8. Designers without GitHub accounts.**

*Plain:* a designer signs in with an email magic link, sees the reports, and
never touches GitHub. Seats are unlimited and never metered.

*Why local can't:* this is literally the third clause of the capture test — a
person who isn't the developer.

*Website copy:* **"Your designer doesn't need a GitHub account. Or a seat fee."**

*Status:* ❌ not built (Step 6). Do not put it on the pricing page until it is.

**9. Budgeted keys for AI agents.**

*Plain:* issue a key with a monthly credit budget and a rate cap. When an agent
exhausts it, it gets a clear message and CI stays green.

*Website copy:* **"Give your agent a key and a budget. It cannot overspend."**

*Note:* pair this with the MCP server on the agents page — machine consumers are
high-volume, zero-support, and capped by construction.

---

### The two reports, side by side

The clearest single demonstration on the website: **the same run, rendered
twice.** Free report on the left, hosted page on the right, same frame, same
score — and the right one carries a history strip, a first-drift commit, a
recurrence count and a run-over-run delta that the left one has no way to know.

That comparison sells better than any feature list, because it shows the buyer
exactly what they are missing while proving the free version is genuinely good.
Rules for it: never a degraded free report (§4, Step 3), never a mockup — use a
real Argus dogfood run with months of real history behind it.

### How to present this on the site

1. **Lead with history everywhere.** It is the only claim a competitor with a
   free CLI cannot copy by writing more code. Items 1 and 2 are the product.
2. **Put free and paid side by side on one page**, same rows, honest ticks. The
   free column should look genuinely good — it is, and a credible free column
   makes the paid column believable.
3. **Show a real report with real history**, not a mockup. Argus has dogfooded
   its own Action since Stage 2. A screenshot with months of genuine drift and
   an actual regression catch outperforms any illustration.
4. **Frame the price against the alternative, not against zero.** The comparison
   that lands is per-screenshot metering, where a matrix build's bill explodes —
   not "free vs $59".
5. **Never claim anything marked ❌ or ⚠️ above** until its step lands. Doctrine
   3 applies to the pricing page as much as to a security suite.
