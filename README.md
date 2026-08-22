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

### Seeing the signed-in surface locally

`/repos` needs a session, and locally there is no mail provider — the magic-link
flow prints the whole message to the dev server's console instead of sending it.
Two commands skip that:

```bash
npm run seed:demo -- --reset
npm run dev:web
```

`seed:demo` builds both tenants — `DEMO — Northwind Retail (sample data)`, with
twelve weeks of invented history so trends have something to draw, and
`REAL — Normascope's own runs (measured)`, four runs that actually happened —
and makes `NORMA_DEV_SIGNIN_EMAIL` an owner of both. Then `/login` shows a
**Sign in as …** button that mints a session with no link to fetch.

Set the address in `web/.env.local`:

```
NORMA_DEV_SIGNIN_EMAIL=dev@localhost
```

**That door cannot open on a deployment.** The button does not render and
`/api/auth/dev-signin` returns 404 unless the variable is set *and* `NODE_ENV`
is not `production` *and* `VERCEL` is unset. There is no default, because a
bypass that is on unless disabled is a bypass that ships. Every other address
typed into the sign-in form goes through the real route — abuse ladder,
proof-of-work challenge, email budget, fifteen-minute single-use token.
`web/lib/devSignIn.ts` holds the guard; `test/auth.test.mjs` A13 evaluates it
against every environment that matters, including a Vercel preview.

**One thing that bites:** PGlite is single-writer, so a dev server left running
from a previous session holds `.pgdata` and every later `next dev` and seed
crashes inside the WASM with `Aborted()`. `lsof +D .pgdata` names the process.

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
