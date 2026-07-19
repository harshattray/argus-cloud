# Normascope Cloud (argus-cloud)

Private repo for Normascope's hosted paid tier — the closed half of the
open-core split; nothing here ever ships to npm. The public CLI lives at
github.com/harshattray/norma (npm `norma-scope`). Planning docs (pricing,
margins, strategy) are canonical under `docs/`.

## What exists

- `migrations/001_foundation.sql` — Build 3.5 Stage 4 substrate: orgs, users,
  memberships, hashed api_keys, repos, runs, share_links, frame_stats.
- `migrations/002_metering.sql` + `src/` — Build 4.0 Phase C, the Economics
  Doctrine as code:
  - `ledger.ts` — prepaid credit grants; balance computed, never stored;
    atomic expiry-first consumption; refunds for failed analyses.
  - `usage.ts` — append-only usage meter with token cache splits and
    integer-microdollar costs.
  - `resultCache.ts` — org-scoped result cache (hits free, never cross-org).
  - `breaker.ts` — global daily provider budget circuit breaker (pauses
    explain, alerts a human, product unaffected, manual reset).
  - `apiKeys.ts` — hashed keys; agent keys with monthly credit budgets.
  - `webhooks.ts` — MoR webhook (HMAC, timing-safe) → idempotent grant.
  - `reconcile.ts` — monthly provider-spend vs credit-revenue margin report,
    <50% margin alert → reprice runbook.
  - `explainService.ts` — the hosted explain enforcement pipeline:
    breaker → cache → per-run cap → agent budget → reserve → provider →
    validate → meter/cache or refund.

## Running

```bash
npm install
npm test        # C1–C8 suite on PGlite (in-process Postgres, zero setup)
DATABASE_URL=postgres://… npm test   # identical suite on real Postgres
```

## Deliberately not built yet

- HTTP routes, hosted report/dashboard UI, auth (GitHub OAuth, magic links) —
  the rest of Build 3.5 Stage 4.
- Phase D: server-side explain route with the provider key, CI batch
  auto-explain, history enrichment (firstDriftCommit/recurrence), MCP
  org-key mode.
- Live MoR integration (sandbox account is a user-provided credential); the
  webhook handler is provider-shaped and fixture-tested.
- Pack prices: `products` rows must be seeded from `calibration.md`
  (Build 4.0 Phase B) — never invented.
