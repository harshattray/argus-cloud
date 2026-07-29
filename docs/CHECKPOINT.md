# CHECKPOINT — Build 4.0 (Stage 5, Explain + Metered Intelligence)

Last updated: 2026-07-29. This is the pick-up-from-here doc. Read this first,
then the phase spec it points you to. Status is authoritative as of the
commits listed below; if the code and this doc disagree, trust the code and
fix this doc.

## TL;DR — where we are

Build 4.0 phases A–E defined in `docs/BuildV4.md`. **A, B, C are DONE. D is
built and live-smoke-tested locally** (hosted explain, CI batch service, MCP
tool, history enrichment). **E is partially exercised**; the remainder is
blocked on the MoR sandbox and deployment.

| Phase | What it is | State | Where |
|---|---|---|---|
| A | Explain engine (free BYO-key CLI) | ✅ DONE, tests green; A5.3 live smoke done | Argus, `stage-5-explain` |
| B | Calibration (measure real cost) | ✅ DONE — ran live 2026-07-29, all B1–B4 green | `docs/calibration.md` (both repos) |
| C | Metering (credits/caps/breaker/webhooks) | ✅ DONE, tests green | argus-cloud, `stage-5-metering` |
| D | Hosted explain + CI batch + MCP org-key + enrichment | ✅ BUILT + local live smoke (D1, D3, D4, D6 verified; D2 fixture-verified) | argus-cloud `web/` + `src/`, Argus MCP |
| E | Security validation + live e2e + launch | 🟡 PARTIAL — E3/E4/E5/D5 exercised locally; E1 partial; E6/E7 open | both repos |

## Measured economics (Phase B, 2026-07-29)

- Blended COGS **$0.0115/review** at live (intro) prices; **$0.0164** at
  post-intro list prices. Target ≤ $0.08: **MET** both ways.
- Deep review: $0.0200–$0.0203. Batch analyses bill at 50% as expected;
  cache reads verified (50% hit rate on repeats).
- Packs seeded in `migrations/005_products.sql` at the list-price 3× floor:
  50/$3, 200/$12, 1000/$60. Full audit trail: `docs/calibration.md`
  (recompute any figure from recorded usage × the live price table).

## Branch / commit map (both merged to main 2026-07-30)

- **Argus (private repo, public npm package `norma-scope`)** — branch `stage-5-explain`.
  Latest: `e3f3fc9` (v0.7.0 packaging: minified bundle, Apache-2.0, optional SDK).
  Pushed and fast-forward-merged to `main`; `origin/main` is at the same commit.
  Not tagged, **not published** — `v0.6.0` is still the latest tag and npm release.
- **argus-cloud (private)** — branch `stage-5-metering`.
  Latest: `ab40521` (FUTURENORMA: CLI/MCP mode gap, v0.7.0 packaging state).
  Pushed and fast-forward-merged to `main`; `origin/main` is at the same commit.

## What's DONE since the last checkpoint

### Phase B (live, billed)
`npm run calibrate` in Argus ran twice (~$0.20 total): 22 recorded calls,
live pricing fetched from the (moved) pricing doc, deep pass included.
The harness's pricing parser was fixed for the new 5-column table.

### Phase D (argus-cloud `stage-5-metering`)
- `migrations/003_findings.sql` (run_findings), `004_explain_batches.sql`,
  `005_products.sql` (seeded packs).
- `src/enrichment.ts` — trend line, firstDriftCommit, recurrence from
  frame_stats + run_findings; ~2K token cap with fixed truncation order;
  fields injected **server-side from our rows**, never from model output.
  Suite: `test/enrichment.test.mjs` (15 checks, D6).
- `src/ciBatch.ts` — enqueue/collect around the Message Batches API at the
  50% rate; reserve-then-refund; escaped PR line. Suite:
  `test/cibatch.test.mjs` (18 checks, D2 fixture-level).
- `web/` — **Next.js (Vercel-ready; stack decision made: Next.js on
  Vercel)**: `/api/upload` (summary.json v2, key-gated, capped),
  `/api/explain` (D1, wired to hostedExplain), `/api/ci-explain`
  (enqueue/collect), `/api/share` (hashed revocable tokens), `/r/[runId]`
  report page with Explain button (React-escaped, CSP sandboxed).
  Provider key is server-env only. Local dev: file-backed PGlite via
  `PGLITE_DATA_DIR`, `web/scripts/seed-dev.mjs`, `NORMA_DEV_OPEN=1`.

### Phase D (Argus `stage-5-explain`)
- `normascope-mcp` `explain` tool: BYO local (D3, `ANTHROPIC_API_KEY` in the
  MCP server env, zero cloud contact) and org-credits (D4,
  `NORMASCOPE_CLOUD_URL` + `NORMASCOPE_ORG_KEY` → upload + hosted explain).
  T6.6 covers the helpful no-key refusal.

### Live local verification (2026-07-29, dev server + real provider calls)
- D1: interactive explain on an uploaded run → schema-valid findings with
  `historyVersion/firstDriftCommit/recurrence`; re-request was a free cache
  hit; findings render server-side on the report page.
- D4: MCP org-credits mode end-to-end → exactly 1 credit decremented.
- E3: hostile frame names/labels through upload → inert on the report page;
  hostile findings escaped in the PR line (unit).
- E4: org B probed org A's run/share/batch → all 404; no key → 401.
- E5: MCP SSRF suite (T6.2) green with the explain tool present.
- D5: no key material in `.next/static` bundles; CSP + security headers
  verified with curl.

## NEXT STEPS (in order)

1. **MoR decision + sandbox (Harsha)** — Paddle vs Lemon Squeezy. Unblocks
   C5 live, E7, and real product ids for `products` (remap the seeded
   `pack_*` slugs in a follow-up migration).
2. **Deploy** — Vercel project for `web/` + Neon/Supabase Postgres
   (`DATABASE_URL`), R2 later for artifacts. `harshat.space` subdomain for
   private testing. Server env: `ANTHROPIC_API_KEY`,
   `EXPLAIN_DAILY_BUDGET_MICRODOLLARS`.
3. **Artifact upload (report + crops)** — hosted explain currently grounds
   in summary.json diff metadata + history, NOT image crops (the prompt says
   so; findings are hedged accordingly). Crop parity needs multipart artifact
   upload to R2 — Stage 4 item 2's second half.
4. **Stage 4 auth/dashboard** — GitHub OAuth + magic links, org management,
   trends dashboard. The report page's API-key field in the Explain panel is
   a stopgap until session auth exists.
5. **Action wiring for D2** — the GitHub Action calls `/api/ci-explain`
   (POST after upload, poll GET, append `prLine` to the sticky comment).
6. **Phase E remainder** — E1 injection fixtures against the hosted path,
   E6 retention posture page, E7 live e2e once MoR + deploy exist. Every
   unexercised item stays a named open risk, never an assumed pass.

## Open risks (named, per doctrine)

- E1 (hosted-path injection fixtures) not yet run 1:1 — CLI-side injection
  suite is green; hosted prompt uses the same data-delimiter rules.
- E6 (provider retention posture) unverified; disclosure page not written.
- E7 blocked on MoR sandbox.
- Hosted findings are metadata-grounded until artifact upload lands (weaker
  than CLI's crop-grounded findings; honestly labeled in the prompt).

## Standing rules (don't regress)

- Deterministic diff is the ONLY gate; explain never blocks.
- Never fabricate economics — every figure traces to recorded `usage` × live
  price. (Sonnet 5 intro pricing ends 2026-08-31; `usage.ts` records at list
  prices deliberately.)
- No paid logic in the public repo; no provider key ever reaches the CLI,
  Action, a browser, a log, or the repo.
- Full test suites green before any release: `npm test` in each repo
  (Argus: 62 checks; argus-cloud: 63 across metering/enrichment/cibatch).
