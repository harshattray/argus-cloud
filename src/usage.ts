import type { Db } from "./db.js";

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
const PRICES_MICRO_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
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

export async function recordUsage(db: Db, event: UsageEvent): Promise<void> {
  const usage = event.usage ?? ZERO_USAGE;
  await db.query(
    `INSERT INTO usage_events
       (org_id, api_key_id, run_id, frame, model, pass, interactive, auto, status,
        input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens,
        cost_microdollars, credits_charged, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
