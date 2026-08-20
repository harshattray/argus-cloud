import type { Db } from "./db.js";
import type { GrantKind } from "./ledger.js";

/**
 * Append-only usage meter (Economics Doctrine rule 5): every provider call,
 * cache hit, block, and failure is recorded with token cache splits and an
 * integer-microdollar computed cost. Nothing here is ever updated or
 * deleted — reconciliation reads it as the source of truth.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

/**
 * List prices in microdollars per token. Verified against the live pricing
 * page by Phase B calibration on 2026-07-29 (docs/calibration.md). Sonnet 5
 * is deliberately kept at LIST price ($3/$15) rather than its intro price
 * ($2/$10, ends 2026-08-31) so recorded costs never under-state provider
 * spend. A model missing here fails closed (no charge computed → no sale).
 */
/**
 * Microdollars per token, at **list** prices.
 *
 * **Sonnet 5 corrected 2026-08-19: $3/$15 → $2/$10 per MTok.** The $2/$10 launch
 * price was introductory, due to rise to $3/$15 on 2026-09-01, and this table
 * carried the higher figure deliberately — FUTURENORMA §3's rule is to record at
 * list prices so recorded spend can never under-state reality. Anthropic's
 * pricing page now states that the increase **will not occur** and $2/$10 is the
 * standard price, so the same rule points the other way: the higher number is no
 * longer a list price, it is a number we made up.
 *
 * The consequence is mechanical and intended (§3, "credits are derived from
 * cost"): a sonnet analysis's worst case falls from $0.0844 to $0.0563, which
 * derives to **4 credits instead of 5** — so 500 included credits buy 125
 * analyses a month rather than 100.
 *
 * Found by `scripts/calibrate-hosted.mjs`, which refuses to calibrate while this
 * table disagrees with the live page. Nothing had ever checked it.
 */
const PRICES_MICRO_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

export function computeCostMicrodollars(
  model: string,
  usage: TokenUsage,
  options: { batch?: boolean } = {}
): number | null {
  const price = PRICES_MICRO_PER_TOKEN[model];
  if (!price) {
    return null;
  }
  const discount = options.batch ? 0.5 : 1;
  return Math.round(
    (usage.inputTokens * price.input +
      usage.cacheCreationInputTokens * price.input * 1.25 +
      usage.cacheReadInputTokens * price.input * 0.1 +
      usage.outputTokens * price.output) * discount
  );
}

export type UsageStatus = "charged" | "cache_hit" | "failed_no_charge" | "blocked_no_charge";

export interface UsageEvent {
  orgId: string;
  apiKeyId?: string | null;
  runId?: string | null;
  frame?: string;
  model: string;
  pass: "triage" | "analysis" | "deep";
  interactive?: boolean;
  auto?: boolean;
  status: UsageStatus;
  usage?: TokenUsage;
  costMicrodollars?: number;
  creditsCharged?: number;
  detail?: string;
}

/** Appends one usage event and returns its id, for attribution rows. */
export async function recordUsage(db: Db, event: UsageEvent): Promise<number> {
  const usage = event.usage ?? ZERO_USAGE;
  const result = await db.query<{ id: string | number }>(
    `INSERT INTO usage_events
       (org_id, api_key_id, run_id, frame, model, pass, interactive, auto, status,
        input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens,
        cost_microdollars, credits_charged, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      event.orgId,
      event.apiKeyId ?? null,
      event.runId ?? null,
      event.frame ?? "",
      event.model,
      event.pass,
      event.interactive ?? true,
      event.auto ?? false,
      event.status,
      usage.inputTokens,
      usage.cacheCreationInputTokens,
      usage.cacheReadInputTokens,
      usage.outputTokens,
      event.costMicrodollars ?? 0,
      event.creditsCharged ?? 0,
      event.detail ?? "",
    ]
  );
  return Number(result.rows[0]!.id);
}

/** One grant's share of a charge — what `usage_credit_sources` stores. */
export interface CostAttribution {
  grantId: string;
  grantKind: GrantKind;
  credits: number;
  costMicrodollars: number;
}

/**
 * Splits a charge's provider cost across the grants that funded it, in
 * proportion to the credits each supplied.
 *
 * Exported and pure because the property that matters is arithmetic, not
 * database behaviour: **the parts sum to exactly the whole.** Integer
 * microdollars do not divide evenly — three grants funding a 5-credit,
 * 78,400µ$ analysis floor to 78,399 — and a rounding loss of one microdollar
 * per event is a margin report that slowly stops reconciling with the meter it
 * is derived from. The remainder goes to the largest share, which is
 * deterministic (ties break on the earlier grant, and `consumeCredits` returns
 * grants expiry-first) rather than merely close.
 *
 * A zero-credit or zero-cost charge attributes nothing; there is nothing to
 * apportion and a row claiming otherwise would be noise in the report.
 */
export function attributeCost(
  costMicrodollars: number,
  funding: { grantId: string; grantKind: GrantKind; credits: number }[]
): CostAttribution[] {
  const totalCredits = funding.reduce((sum, f) => sum + f.credits, 0);
  if (totalCredits <= 0) {
    return [];
  }
  const parts = funding.map((f) => ({
    ...f,
    costMicrodollars: Math.floor((costMicrodollars * f.credits) / totalCredits),
  }));
  let remainder = costMicrodollars - parts.reduce((sum, p) => sum + p.costMicrodollars, 0);
  if (remainder > 0) {
    let largest = 0;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i]!.credits > parts[largest]!.credits) {
        largest = i;
      }
    }
    parts[largest]!.costMicrodollars += remainder;
    remainder = 0;
  }
  return parts;
}

/**
 * Records what funded one charged usage event.
 *
 * Only ever called for a `charged` event. The failure path refunds the credits
 * and writes a `failed_no_charge` event instead, so an attribution row and a
 * refund can never describe the same reservation.
 */
export async function recordCostAttribution(
  db: Db,
  usageEventId: number,
  attributions: CostAttribution[]
): Promise<void> {
  for (const a of attributions) {
    await db.query(
      `INSERT INTO usage_credit_sources (usage_event_id, grant_id, grant_kind, credits, cost_microdollars)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (usage_event_id, grant_id) DO NOTHING`,
      [usageEventId, a.grantId, a.grantKind, a.credits, a.costMicrodollars]
    );
  }
}

/** Charged auto-analyses for a run — drives the per-run cap. */
export async function autoAnalysesForRun(db: Db, orgId: string, runId: string): Promise<number> {
  const result = await db.query<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM usage_events
     WHERE org_id = $1 AND run_id = $2 AND auto = true AND status = 'charged' AND pass IN ('analysis', 'deep')`,
    [orgId, runId]
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Credits charged against one API key in a UTC month ("YYYY-MM"). */
export async function creditsUsedByKeyInMonth(db: Db, apiKeyId: string, month: string): Promise<number> {
  const start = `${month}-01T00:00:00.000Z`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();
  const result = await db.query<{ total: string | number | null }>(
    `SELECT COALESCE(SUM(credits_charged), 0) AS total FROM usage_events
     WHERE api_key_id = $1 AND created_at >= $2 AND created_at < $3`,
    [apiKeyId, start, end]
  );
  return Number(result.rows[0]?.total ?? 0);
}
