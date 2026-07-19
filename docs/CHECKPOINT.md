# CHECKPOINT — Build 4.0 (Stage 5, Explain + Metered Intelligence)

Last updated: 2026-07-19. This is the pick-up-from-here doc. Read this first,
then the phase spec it points you to. Status is authoritative as of the
commits listed below; if the code and this doc disagree, trust the code and
fix this doc.

## TL;DR — where we are

Build 4.0 has five phases (A–E) defined in `docs/BuildV4.md`. Phases A and C
are **built and green**; B is **built but not yet run** (needs a real API
key); D and E are **not started**.

| Phase | What it is | State | Where |
|---|---|---|---|
| A | Explain engine (free BYO-key CLI) | ✅ DONE, tests green | Argus (public), branch `stage-5-explain` |
| B | Calibration (measure real cost) | 🟡 harness built, NOT RUN — needs `ANTHROPIC_API_KEY` | Argus, same branch (`scripts/calibrate.mjs`) |
| C | Metering (credits/caps/breaker/webhooks) | ✅ DONE, tests green (fixture-level) | argus-cloud (private), branch `stage-5-metering` |
| D | Hosted explain + CI batch + MCP org-key | ❌ NOT STARTED — blocked on stack decision | argus-cloud |
| E | Security validation + live e2e + launch | ❌ NOT STARTED — blocked on B, D, MoR | both repos |

## Branch / commit map (nothing merged to main yet)

- **Argus (public, npm `norma-scope`)** — branch `stage-5-explain`, pushed to
  `origin`. Commits: `5a7a1d3` (Phase A engine), `5fe53fe` (usage-log seam),
  `7da14ce` (Phase B calibration harness + cache breakpoint).
- **argus-cloud (private)** — branch `stage-5-metering`, pushed to `origin`.
  Commit: `b5158b4` (Phase C metering core on the Stage 4 substrate).

Both branches open their stage-gate PR when the phase is fully done (Phase A
can PR now; Phase C's gate also wants Build 3.5 Stage 4's HTTP/UI, which does
not exist yet — see "Prerequisite debt" below).

## What's DONE

### Phase A — explain engine (Argus, `stage-5-explain`)
- `SECURITY-LLM.md` — normative threat model. **Any new outbound field must
  be added to its payload inventory (P1–P6) and covered by a scanner/cap.**
- `src/explain/`: `context.ts` (A2 DOM+style capture during `auto`, opt-in,
  deterministic, capped), `assemble.ts` (A3 pure assembly, token budget with
  fixed truncation order, blocking secret scanner), `scanner.ts`, `schema.ts`
  (strict findings schema + validation), `prompt.ts` (hardened, PROMPT_VERSION
  = 1), `models.ts` (haiku-4-5 triage / sonnet-5 analysis / opus-4-8 deep),
  `client.ts` (`@anthropic-ai/sdk`, structured outputs, injectable caller so
  tests never go live), `codepointers.ts` (globs + `git check-ignore` gate),
  `command.ts` (`norma explain [frame|--all|--deep]`), `findings.ts`.
- `report.ts` renders findings escaped, with a stale-hash guard.
- `test/explain.test.mjs`: 25 checks (A2–A6), no live calls. All green.

### Phase C — metering (argus-cloud, `stage-5-metering`)
- `migrations/001_foundation.sql` (Stage 4 substrate) + `002_metering.sql`.
- `src/`: `db.ts` (PGlite default / `pg` via `DATABASE_URL`), `ledger.ts`,
  `usage.ts`, `resultCache.ts`, `breaker.ts`, `apiKeys.ts`, `webhooks.ts`,
  `reconcile.ts`, `explainService.ts` (the hosted enforcement pipeline).
- `test/metering.test.mjs`: 30 checks (C1–C8). All green.

## NEXT STEPS (in order)

### 1. Run Phase B calibration — UNBLOCKS pricing (needs the key)
- Doc: `docs/BuildV4.md` → "Phase B — Calibration", tests B1–B4.
- Action: in the **Argus** repo, `export ANTHROPIC_API_KEY=sk-ant-…` then
  `npm run calibrate`. Costs ~$0.50–$2. Writes `calibration.md` (gitignored)
  with blended COGS vs the $0.08 target and 3×-floor pack prices.
- Then: if COGS ≤ $0.08, copy `calibration.md` → `argus-cloud/docs/`; seed the
  `products` table + `usage.ts` price table from it. If COGS > $0.08, tune
  (fewer/smaller crops, tighter DOM budget in `assemble.ts`) and re-run BEFORE
  pricing anything.
- Also do the A5.3 live smoke test (one real `norma explain` on a flagged
  frame) while the key is set.

### 2. Decide the hosted stack — UNBLOCKS Phase D
- Doc: `docs/BuildV3.5.md` → "Stage 4 — Hosted & Paid" (items 2–5 are the
  HTTP/report/auth/dashboard surface).
- Open question for Harsha: **Next.js on Vercel** (one deploy: report page +
  dashboard + API routes; recommended) vs. **plain Node API + server-rendered
  pages**. Deploy target from spec: Vercel/Fly, Neon/Supabase Postgres, R2.
- This is a genuine decision, not a default — do not pick it silently.

### 3. Build Phase D — hosted explain + CI batch + MCP tool
- Doc: `docs/BuildV4.md` → "Phase D", tests D1–D6.
- Server-side explain route (provider key in server env only) wired to the
  existing `hostedExplain` pipeline in `explainService.ts` (already built).
- CI auto-explain of top-N flagged frames via the **Batches API** (50% rate;
  `usage.ts` already models `interactive: false`).
- **History enrichment** (the durable BYO gap): inject `firstDriftCommit` /
  `recurrence` from `frame_stats` before the provider call; schema-versioned
  optional fields. These enrichment queries are **locally testable today**
  against `frame_stats` — a good first Phase D task that needs no key.
- MCP `explain` tool: BYO local / org-credits when server has an org key.

### 4. Phase E — security validation + live e2e + launch
- Doc: `docs/BuildV4.md` → "Phase E", tests E1–E7; run `SECURITY-LLM.md`'s
  scenario list 1:1.
- Needs: Phase B done, Phase D done, and a live MoR sandbox for E7.

## Prerequisite debt (important)

Build 3.5 **Stage 4** (the hosted product + MoR billing + auth + dashboard)
was specced but **never built** — argus-cloud went straight to Phase C
metering. Phase D's HTTP/UI needs that foundation. So step 2/3 above is really
"build Stage 4's web surface AND Phase D's explain routes together." The
Phase C metering modules are ready to plug into it.

## Blockers owned by Harsha (zero model budget to resolve)

1. **`ANTHROPIC_API_KEY`** — separate API billing (Console prepaid credits,
   $5 min; the Claude subscription does NOT cover API). Unblocks B + A5.3 + E1.
2. **Hosted stack decision** — Next.js vs plain server (see step 2).
3. **MoR sandbox account** — Paddle vs Lemon Squeezy; spec says evaluate in
   sandbox and pick one. Unblocks C5 live + E7. (Stripe can't onboard
   India-registered businesses — that's why MoR.)
4. **Domain** — `harshat.space` subdomain for private testing (already owned);
   real domain + DKIM/MoR re-point later.

## Standing rules (don't regress)
- Deterministic diff is the ONLY gate; explain never blocks. (BuildV4 mandate)
- Never fabricate economics — every cost figure traces to a recorded `usage`
  object × live price. (Economics Doctrine)
- No paid logic in the public repo; no provider key ever reaches the CLI,
  Action, a browser, a log, or the repo. (open-core boundary + SECURITY-LLM.md)
- Full test suites green before any release; `npm test` in each repo.
