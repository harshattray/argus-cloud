# FinishedSPEC.md — what is concretely built

**Private.** Companion to `HorizonPath.md` (what to build next). This document
answers only one question: **what exists right now, and what is the evidence?**

Last audited: **2026-08-03**, by reading the code, not the plans. Where a
planning document and the code disagreed, the code won and the disagreement is
recorded in §7.

## How to read this

| Mark | Meaning |
|---|---|
| ✅ | Built **and** verified by a suite that was actually run, or by a live smoke test with recorded evidence |
| 🟡 | Built and tested against fixtures only — the real integration has never run |
| ⚠️ | Code exists but is **unreachable** — nothing calls it |
| ❌ | Named in a planning doc; **does not exist in code** |

Nothing is marked ✅ on the strength of a plan saying it was done.

---

## 1. Verified this audit

Both suites were run on 2026-08-03, not quoted from memory:

| Repo | Command | Result |
|---|---|---|
| Argus | `npm test` | **66 checks, all green** |
| argus-cloud | `npm test` | **63 checks, all green** |

Heads: Argus `main` @ `91a63d5`; argus-cloud `main` @ `09ab40e` (merge of
`stage-5-metering`).

---

## 2. Argus — the CLI, Action, and MCP server

Private repo; public npm package. **This tier is genuinely finished** — it is
the free product, it is published, and it works.

| Area | State | Evidence |
|---|---|---|
| Diff engine — AA-aware pixelmatch, band alignment, SSIM, region clustering | ✅ | T1 suite; 0.43% aligned vs 14.24% unaligned on a real page |
| Source adapters — `figma` / `images` / `url` | ✅ | T3 suite |
| Baseline mode (visual regression, no designer) | ✅ | T4 suite |
| Version-keyed cache, 429 retry, degradation ladder, `snapshot` | ✅ | T2 suite |
| `summary.json` v2 + published JSON Schema | ✅ | ajv-validated, T5 |
| Sticky PR comment + composite Action, `--strict` | ✅ | Verified on a real PR |
| MCP server — `list_frames`, `capture`, `compare`, `get_summary`, `explain` | ✅ | T6.1–T6.6; SSRF 5/5 refused and logged |
| Explain engine (Build 4.0 Phase A) | ✅ | 25 checks, zero live calls in CI |
| Calibration harness | ✅ and **executed live** | `calibration.md`, 22 recorded calls |
| Commands | `init` `doctor` `auto` `compare` `check` `comment` `explain` `baseline` `snapshot` `clean` | `COMMANDS.md` |

**Published:** `norma-scope@0.7.3` (2026-08-03) and `normascope-mcp@0.2.0`,
both Apache-2.0, both verified by installing from the registry. Registry
reports `latest` = 0.7.3, 50 files / 142,348 B unpacked, `bin` carrying **both**
`norma-scope` and `norma` — matching `npm pack --dry-run` exactly.

Two patch releases shipped that day, both patch rather than minor on purpose:
`normascope-mcp@0.2.0` pins `^0.7.0`, and on 0.x a caret is minor-locked, so
0.8.0 would have refused to install for every MCP user until the MCP was
republished. Verified after each: a fresh `npm install normascope-mcp` resolves
the new version through the unchanged range.

- **0.7.2 — `norma-scope` became the canonical command.** The package was
  `norma-scope` but the only bin was `norma`, so documented invocations and
  error messages disagreed. `norma` stays as an alias.
- **0.7.3 — generated output is ignored automatically.** Only `init` ever wrote
  `.gitignore` entries, yet `auto`, `target`, `baseline`, `snapshot`, `compare`
  and `explain` all create `.bridge/` directories — and `--target` is a
  documented zero-config flow whose users never run `init`. Those repos
  accumulated megabytes of regenerable output neither tracked nor ignored.
  `ensureBridgeDir()` now writes a `.bridge/.gitignore` at every entry point;
  `config.json`, `baseline/` and `design/` stay un-ignored because baseline
  mode diffs against the *committed* baseline. Verified from the published
  package: fresh repo, no `init`, `git add -A` after `compare` stages only the
  two inputs. Suite 70 green (S1.4a–d).

**Loose ends in this tier:**

- ⚠️ **Tags `v0.7.1`, `v0.7.2` and `v0.7.3` exist locally and are not on the
  remote** — only `v0.2.1`, `v0.6.0` and `v0.7.0` are (checked live with
  `git ls-remote`, 2026-08-03). `git push` does not carry tags, which is why
  this has now persisted across three releases; two of them are live on npm
  with nothing in the repo marking what shipped.
  `git push origin v0.7.1 v0.7.2 v0.7.3`, and use `--follow-tags` thereafter.
- ❌ **No `upload` command.** See §7.
- Open: MCP registry listing — the last Build 3.5 Stage 3 gate item.
- Open: `doctor` says nothing about explain readiness.
- Open: `sourceType()` returns `"figma"` for baseline-only configs (FUTURENORMA
  §5 item 6 has the full analysis; guarded at four call sites, unsafe by type).

---

## 3. argus-cloud — the backend substrate

**This is finished and good.** Every row below is exercised by the 63-check
suite that ran today.

| Area | State | Evidence |
|---|---|---|
| Stage 4 schema — orgs, users, memberships, hashed api_keys, repos, runs, share_links, frame_stats | ✅ | `migrations/001` |
| Credits ledger — grants, expiry, atomic consume/refund, computed balance | ✅ | C1, incl. a race test |
| Usage meter — append-only, microdollar costs, cache splits | ✅ | C-suite |
| Org-scoped result cache — org in the key hash **and** the row | ✅ | C3, incl. cross-org miss |
| Circuit breaker + admin spend view | ✅ | C6 |
| Agent keys with per-key monthly budgets | ✅ | C7 |
| History enrichment — trend, `firstDriftCommit`, `recurrence`, 2K cap | ✅ | 15 checks (D6) |
| CI batch service — Batches API, 50% rate, reserve→refund, escaped PR line | 🟡 | 18 checks (D2), **fixture-level only** |
| MoR webhook handling — HMAC, idempotent | 🟡 ⚠️ | C5 fixture-level, **and unreachable** — see §7 |
| Monthly reconciliation + <50% margin alert | 🟡 | C8 — **and carries a bug**, see §7 |
| Credit packs seeded from measured COGS | ✅ | `migrations/005` |

---

## 4. argus-cloud — the web surface

**This is the gap.** The entire user-facing product is six files:

| File | Lines | What it actually is |
|---|---|---|
| `web/app/page.tsx` | 11 | One paragraph. No nav, no pricing, no signup |
| `web/app/r/[runId]/page.tsx` | 131 | Report page — **renders no images**; frame names, percentages, SSIM |
| `web/app/r/[runId]/explain-panel.tsx` | 139 | The Explain button |
| `web/app/api/upload/route.ts` | 97 | Accepts summary JSON only; no artifacts |
| `web/app/api/explain/route.ts` | — | ✅ D1 verified live locally |
| `web/app/api/ci-explain/route.ts` | — | 🟡 fixture-level |
| `web/app/api/share/route.ts` | — | ✅ API only, **no UI** |

| Capability | State |
|---|---|
| Hosted report showing screenshots / diff overlay | ❌ |
| Trends / dashboard / charts | ❌ **no file, no route, no query** |
| Auth — GitHub OAuth, magic links, sessions | ❌ |
| Org management, invites, key management UI | ❌ |
| Billing UI, pricing page, checkout | ❌ |
| Share links UI | ❌ (API exists) |
| Artifact storage (R2) | ❌ |
| Rate limiting / quotas | ❌ — see §7 |

Access control today is a share token, or `NORMA_DEV_OPEN=1` for local dev.

---

## 5. The preview — temporary, in the portfolio repo

Live at `harshaattray.com/normascope-cloud`, access-gated, single-tenant **on
purpose**. `api/_norma/{login,runs,run,explain}.ts` behind one dispatcher, plus
two frontend routes. Committed @ `b4eeb86`, deployed.

Verified in production 2026-07-29 with a real Bose-landing run: findings
returned with `firstDriftCommit` and `recurrence`, result-cache hit was free,
2.5MB report served from R2.

Shares the portfolio's Turso DB and R2 bucket; all tables prefixed `norma_`,
objects `normascope-cloud-*`. **Scheduled for deletion at Phase J4.** Portfolio is at
11 of Vercel Hobby's 12 functions.

---

## 6. Measured economics

From `calibration.md` — 22 recorded API calls, 2026-07-29. **Measured, not
estimated.**

| Figure | Intro prices | Post-intro list |
|---|---|---|
| Blended COGS per review | **$0.0115** | **$0.0164** |
| Deep review | $0.0203 | $0.0200 |
| Batched analysis | $0.0025/call | — |
| Target | ≤ $0.08 | **met ~5× over** |

Packs seeded at the list-price 3× floor: 50/**$3**, 200/**$12**, 1000/**$60**.
`usage.ts` records at **list** prices deliberately, so recorded spend can never
under-state reality. Sonnet 5 intro pricing ends **2026-08-31**.

⚠️ **These figures expire when artifact crops ship.** Crops change the input
token profile and therefore COGS. Re-calibrate at BuildV5 G4 before quoting any
of this again.

---

## 7. Corrections — where the plans and the code disagree

Found by reading code on 2026-08-03. Each of these is stated as done, or
implied to be done, somewhere in the planning docs.

| # | The claim | The reality |
|---|---|---|
| 1 | "Upload runs with `norma compare --upload`" (`web/app/page.tsx:7`) | **`--upload` does not exist.** No upload command in the CLI; `action.yml` uploads to GitHub artifacts only. BuildV5 G1 builds it |
| 2 | "Next.js web surface: upload, explain, ci-explain, share, report page ✅ built" | Built as *routes*. The **product** is 11 lines of home page and a report page with no images |
| 3 | "Dashboard + trends: mode-aware charts" (BuildV3.5 item 5) | Does not exist in any form |
| 4 | "MoR webhook handling ✅" | `src/webhooks.ts` is real and tested — and **no route calls it.** There is no `/api/webhooks/*` |
| 5 | `webhooks.ts:9` — Paddle and Lemon Squeezy "reduce to" generic HMAC-hex | **They don't.** Paddle signs `ts:body` and sends `ts=<unix>;h1=<hmac>`. The adapter is unwritten |
| 6 | "Upload API: … rate-limited" (BuildV3.5 item 2) | **No rate limiting anywhere.** `api_keys.rate_per_minute` is written by `createApiKey`, selected by `findApiKey`, and **read by nothing** |
| 7 | Reconciliation reports gross margin | `reconcile.ts:37` sums **all** charged usage with no plan/org filter; line 45 counts revenue from `pack_purchase` only. Allotment-funded spend lands as cost against zero revenue and can trip the <50% alert at line 53 into an unjustified reprice |
| 8 | Hosted explain is a paid upgrade | It is **weaker than the free CLI** — grounded in `summary.json` metadata, not image crops. Honestly hedged in the prompt. BuildV5 G3 fixes it |
| 9 | A customer with credits can use them | ❌ **They cannot from the CLI.** Org-credits mode exists only in the MCP server (`server.ts:234–269`); `npx norma-scope explain` goes straight to `createAnthropicCaller()`. A paying customer would pay twice |
| 10 | `migrate()` runs safely | It runs on **cold start** in `web/lib/db.ts`. N concurrent cold starts race N migration runs. BuildV5 F2 |
| 11 | `web/` deploys | `web/package.json` declares `"argus-cloud": "file:.."`, so a Vercel project rooted at `web/` cannot see its own dependency. BuildV5 F1 |

---

## 8. Decisions that are settled

Recorded so they are not re-litigated. Each has its reasoning where cited.

| Decision | Date | Where |
|---|---|---|
| Licence: **Apache-2.0** for the client (CLI, MCP, Action); `argus-cloud` stays closed | 2026-07-29 | FUTURENORMA §5 item 11 |
| Brand: **Normascope** for both tiers; paid tier is **Normascope Cloud**, never a second brand | — | RebrandV1 |
| Payments: **merchant of record**, not Stripe (India constraint). **Paddle chosen** | 2026-08-03 | This session |
| **No trial.** `plan` is `free \| team \| lapsed`; the free CLI is the trial; risk reversal is a 30-day money-back guarantee | 2026-08-03 | BuildV5 §G2c |
| **Free plans cannot upload anything** — no key, no presigned URL, no bypass flag | 2026-08-03 | BuildV5 §G2c |
| Trial deferred as a later experiment with a settled design (no card, one per GitHub org, ~15-review grant) | 2026-08-03 | BuildV5 §G2c |
| Stack: Next.js on Vercel | — | CHECKPOINT |
| Explain is **Anthropic-only** in hosted; provider flexibility belongs in BYO | — | FUTURENORMA §8 |
| Build order: **local first, deploy when demonstrable** | 2026-08-03 | BuildV5 Phase F / J |

---

## 9. Named open risks

Carried forward per doctrine — a suite that was not run is an open risk, never
an assumed pass.

| Risk | Status |
|---|---|
| E1 hosted-path injection fixtures not run 1:1 | **Open.** CLI-side suite is green; the hosted path has never been proven. Widens when crops ship |
| E6 provider retention posture unverified | **Open.** Disclosure page unwritten |
| E7 live purchase loop | **Blocked** on Paddle |
| Hosted findings metadata-grounded, not crop-grounded | Known, hedged, fixed by BuildV5 G3 |
| A paying customer would pay twice (§7 #9) | **Open — launch blocker for the paid tier** |
| Lab shares the portfolio's DB and R2 | Accepted for a test deployment; prefixes make removal clean |
| Prepaid API balance is small (~$19) | Mitigated by the daily cap. Keep it on |
| `reconcile.ts` margin bug (§7 #7) | **Open.** Fix before the first paying org |
| Retention sweep unbuilt | **Open.** Storage growth is currently unbounded by anything but goodwill |
| No paying customers exist | Every economic figure here is a projection from measured COGS, never from revenue |

---

## 10. The honest one-paragraph summary

The free product is finished, published, and good — 66 green checks, two npm
packages, a diff teams can trust. The paid product's **engine** is finished and
good — 63 green checks covering credits, metering, caching, budgets, breakers,
and history enrichment. The paid product's **surface** barely exists: no
images, no trends, no auth, no billing, and no upload command to feed it. The
distance to first revenue is almost entirely UI and integration work over data
that is already modelled and stored — which is a far better position than the
reverse, and is exactly what `HorizonPath.md` sequences.
