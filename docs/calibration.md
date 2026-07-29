# calibration.md — Build 4.0 Phase B (measured)

Generated 2026-07-29T15:56:58.072Z by scripts/calibrate.mjs.
**Every figure derives from a recorded `usage` object** in test/.tmp-calibrate/logs/*.jsonl,
priced against the live pricing page at run time. Nothing is estimated or reused from planning docs.

## Live prices (fetched 2026-07-29T15:53:02.140Z from https://platform.claude.com/docs/en/about-claude/pricing.md)

| Model | $/MTok in | $/MTok out | Raw source line |
|---|---|---|---|
| claude-haiku-4-5 | $1 | $5 | `\| Claude Haiku 4.5                                                                                              \| $1 /` |
| claude-sonnet-5 | $2 | $10 | `\| Claude Sonnet 5 [through August 31, 2026](/docs/en/about-claude/pricing#claude-sonnet-5-introductory-pricing) \| $2 /` |
| claude-opus-4-8 | $5 | $25 | `\| Claude Opus 4.8                                                                                               \| $5 /` |

Rate factors applied: cache write 1.25×in, cache read 0.1×in, batch 50% on both.

## Recorded calls (22 total)

| Scenario | Calls | Tokens (in / cache-write / cache-read / out) | Cost |
|---|---|---|---|
| s1-interactive | 4 | 1871 in / 1144 cw / 2696 cr / 793 out | $0.0122 |
| s2-repeat | 4 | 1871 in / 0 cw / 3840 cr / 814 out | $0.0097 |
| s3-deep | 2 | 934 in / 1936 cw / 0 cr / 370 out | $0.0200 |
| s4a-realworld | 2 | 1662 in / 4099 cw / 1348 cr / 1296 out | $0.0245 |
| s4b-realworld-repeat | 2 | 1662 in / 3954 cw / 1348 cr / 1197 out | $0.0229 |
| batch | 8 | 12056 in / 0 cw / 0 cr / 1641 out | $0.0203 |

## Per-pass economics (measured)

| Pass | Calls | Avg cost/call |
|---|---|---|
| Triage (claude-haiku-4-5) | 7 | $0.0017 |
| Analysis, interactive (claude-sonnet-5) | 6 | $0.0098 |
| Analysis, batched | 8 | $0.0025 |
| Deep (claude-opus-4-8) | 1 | $0.0185 |

## Cache verification (B2)

- Repeat-eligible calls: 6; with cache reads: 3 (50%)
- Cold real-world run (s4a): $0.0245 → repeat (s4b): $0.0229


## Batch verification (B3)

- Batch msgbatch_01McP1E3CuKKXQeoaYueN8Au: 8/8 succeeded
- Interactive analysis avg $0.0098 vs batched $0.0025 (recorded tokens × 50% batch rate)

## Blended COGS + target check (B4)

- **Blended COGS: $0.0115 per review** (triage + analysis, interactive, observed cache mix; 6 reviews)
- Target ≤ $0.08: **MET**
- Deep review cost: $0.0203 (price Deep explain accordingly)

## Pack pricing at the 3× floor (Economics Doctrine rule 2)

| Pack | COGS | 3× floor | Suggested price |
|---|---|---|---|
| 50 reviews | $0.5774 | $1.7322 | $3 |
| 200 reviews | $2.3096 | $6.9287 | $9 |
| 1000 reviews | $11.5478 | $34.6435 | $42 |

## Audit trail (B1)

Raw usage records: `test/.tmp-calibrate/logs/*.jsonl` (one JSON line per API response).
Recompute any figure: tokens from the record × the live price table above.
Copy this file to `argus-cloud/docs/calibration.md` — it prices Phase C packs.

## Post-intro supplement (added when seeding Phase C prices)

Sonnet 5 was on introductory pricing ($2/$10 per MTok, through 2026-08-31)
when this calibration ran. Recomputing the SAME recorded usage objects at
list prices ($3/$15) — the worst case packs must survive after Sept 1:

- Blended COGS at list prices: **$0.0164 per review** (target ≤ $0.08: MET)
- Deep review at list prices: $0.0200

Products are therefore seeded at the list-price 3× floor with headroom
(migrations/005_products.sql): 50 reviews $3, 200 reviews $12, 1000 reviews
$60. `usage.ts` keeps list prices so recorded costs never under-state after
the intro window closes.
