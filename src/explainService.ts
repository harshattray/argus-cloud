import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { consumeCredits, refundCredits, InsufficientCreditsError } from "./ledger.js";
import {
  reserveProviderBudget,
  settleProviderBudget,
  releaseProviderBudget,
  creditsForPass,
  creditsRequired,
  type BudgetLimits,
} from "./providerBudget.js";
import {
  recordUsage,
  computeCostMicrodollars,
  autoAnalysesForRun,
  creditsUsedByKeyInMonth,
  type TokenUsage,
} from "./usage.js";
import { makeCacheKey, cacheGet, cachePut } from "./resultCache.js";
import { isTripped, checkAndTrip, tripBreaker, EXPLAIN_PAUSED_MESSAGE, type Alert } from "./breaker.js";
import type { ApiKeyRecord } from "./apiKeys.js";
import { buildEnrichment, applyEnrichment, saveRunFindings, type Enrichment } from "./enrichment.js";

/**
 * Hosted explain pipeline (Build 4.0 Phase C) — the enforcement point every
 * hosted/org-key analysis flows through. Order is doctrine (PATHWAYS §3, "the
 * economic request path"):
 *
 *   breaker → result cache (free) → priced-model check → per-run cap →
 *   agent-key budget → reserve provider dollars → reserve credits →
 *   provider → validate → settle + meter + cache, or release and refund.
 *
 * Failed analyses cost the user nothing (rule 6): credits are reserved
 * before the provider call and refunded in full on provider error, refusal,
 * or schema failure — every outcome leaves an append-only usage event.
 *
 * **Provider dollars are reserved before the call, not measured after it**
 * (Doctrine 11). Both reservations are taken before the provider is touched and
 * both are given back on failure. They are separate money: credits are what the
 * customer bought, dollars are what we owe the provider.
 */

/**
 * Credit prices are **derived from cost, not chosen** (decided 2026-08-10;
 * FUTURENORMA §3). Each pass charges whatever it must for its worst possible
 * call to clear the margin floor, so no scenario can sell below cost. Change a
 * model and the price follows it in the same breath — see
 * `providerBudget.ts`, `creditsRequired`.
 */
export const CREDITS_PER_ANALYSIS = creditsForPass("analysis");
export const CREDITS_PER_DEEP = creditsForPass("deep");
export const AUTO_EXPLAIN_PER_RUN_CAP = 5;
export const DEFAULT_AGENT_MONTHLY_BUDGET = 200;

export type ProviderResult =
  | { kind: "ok"; json: unknown; usage: TokenUsage }
  | { kind: "refusal" }
  | { kind: "error"; message: string };

export interface ProviderRequest {
  model: string;
  batch: boolean;
  /**
   * Phase D hosted-only history context, as a delimited data block for the
   * prompt. Null for orgs/frames with no history. Never present on BYO.
   */
  enrichmentText?: string | null;
}

export type Provider = (request: ProviderRequest) => Promise<ProviderResult>;

export interface ExplainDeps {
  provider: Provider;
  dailyBudgetMicrodollars: number;
  alert: Alert;
  now?: () => Date;
  /**
   * Optional dollar ceilings for one organization or one key. The global daily
   * budget above is always enforced; these narrow it further when an operator
   * needs to contain a single tenant or a runaway agent key.
   */
  orgMonthlyBudgetMicrodollars?: number | null;
  keyMonthlyBudgetMicrodollars?: number | null;
}

export interface ExplainRequest {
  orgId: string;
  apiKey?: ApiKeyRecord | null;
  runId?: string | null;
  /** Enables history enrichment (D6) and findings storage when set with runId. */
  repoId?: string | null;
  frame: string;
  buildHash: string;
  designHash: string;
  model: string;
  pass: "analysis" | "deep";
  /** CI auto-explain (per-run cap applies); interactive requests pass false. */
  auto?: boolean;
  batch?: boolean;
}

export type ExplainOutcome =
  | { ok: true; findings: unknown; cached: boolean; creditsCharged: number }
  | {
      ok: false;
      code:
        | "explain_paused"
        | "run_cap"
        | "agent_budget_exhausted"
        | "provider_budget_exhausted"
        | "insufficient_credits"
        | "analysis_failed"
        | "model_not_priced";
      message: string;
      /** True when a CI job should continue green despite the error. */
      ciStaysGreen: boolean;
    };

/**
 * Minimal server-side findings validation. Model output is untrusted input
 * (SECURITY-LLM.md boundary 2); the CLI's full validator is authoritative —
 * this re-check moves to the shared norma-scope package once 0.7.0 ships.
 */
export function findingsShapeValid(json: unknown): boolean {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return false;
  const keys = Object.keys(json as object);
  if (keys.length !== 1 || keys[0] !== "findings") return false;
  const findings = (json as { findings: unknown }).findings;
  if (!Array.isArray(findings) || findings.length > 10) return false;
  return findings.every(
    (f) =>
      typeof f === "object" &&
      f !== null &&
      typeof (f as Record<string, unknown>).observation === "string" &&
      ((f as Record<string, unknown>).observation as string).length <= 600 &&
      typeof (f as Record<string, unknown>).category === "string" &&
      typeof (f as Record<string, unknown>).confidence === "string"
  );
}

export async function hostedExplain(db: Db, deps: ExplainDeps, req: ExplainRequest): Promise<ExplainOutcome> {
  const now = deps.now?.() ?? new Date();
  // Priced from the model this call will actually use, not from the pass's
  // default. A route that asks for a more expensive model pays for it; there is
  // no path where the price and the model disagree.
  const credits = creditsRequired(req.model) ?? 0;
  const base = {
    orgId: req.orgId,
    apiKeyId: req.apiKey?.id ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    interactive: !req.batch,
    auto: req.auto ?? false,
  } as const;

  // 1 — circuit breaker: explain pauses, the product doesn't.
  if (await isTripped(db)) {
    return { ok: false, code: "explain_paused", message: EXPLAIN_PAUSED_MESSAGE, ciStaysGreen: true };
  }

  // 2 — result cache: hits are free and never decremented.
  const cacheKey = makeCacheKey({
    orgId: req.orgId,
    frame: req.frame,
    buildHash: req.buildHash,
    designHash: req.designHash,
    model: req.model,
    promptVersion: 1,
  });
  const cached = await cacheGet(db, req.orgId, cacheKey);
  if (cached !== null) {
    await recordUsage(db, { ...base, status: "cache_hit", detail: "result cache hit — no charge" });
    return { ok: true, findings: cached, cached: true, creditsCharged: 0 };
  }

  // Fail closed on unpriced models — if we can't measure the cost, we don't
  // sell the thing that incurs it.
  if (computeCostMicrodollars(req.model, { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }) === null) {
    return {
      ok: false,
      code: "model_not_priced",
      message: `model ${req.model} has no verified price — analysis refused`,
      ciStaysGreen: true,
    };
  }

  // 3 — per-run cap for CI auto-explain.
  if (req.auto && req.runId) {
    const already = await autoAnalysesForRun(db, req.orgId, req.runId);
    if (already >= AUTO_EXPLAIN_PER_RUN_CAP) {
      return {
        ok: false,
        code: "run_cap",
        message: `auto-explain cap reached for this run (${AUTO_EXPLAIN_PER_RUN_CAP} frames). Remaining flagged frames can be analyzed manually from the report — each uses credits as usual.`,
        ciStaysGreen: true,
      };
    }
  }

  // 4 — agent-key monthly budget: exhaustion is a clear error, CI stays green.
  if (req.apiKey?.kind === "agent") {
    const budget = req.apiKey.monthly_budget_credits ?? DEFAULT_AGENT_MONTHLY_BUDGET;
    const used = await creditsUsedByKeyInMonth(db, req.apiKey.id, now.toISOString().slice(0, 7));
    if (used + credits > budget) {
      return {
        ok: false,
        code: "agent_budget_exhausted",
        message: `this agent key has used ${used} of its ${budget} monthly credits — raise the key's budget in the dashboard or wait for the monthly reset. CI is unaffected.`,
        ciStaysGreen: true,
      };
    }
  }

  // 5 — reserve OUR dollars before anything else is committed. Sized to the
  // worst this call could cost, so concurrent requests cannot each look at the
  // same pre-call total and all decide there is room (Doctrine 11).
  const limits: BudgetLimits = {
    globalDailyMicrodollars: deps.dailyBudgetMicrodollars,
    orgMonthlyMicrodollars: deps.orgMonthlyBudgetMicrodollars ?? null,
    keyMonthlyMicrodollars: deps.keyMonthlyBudgetMicrodollars ?? null,
  };
  const providerReservationId = randomUUID();
  const budget = await reserveProviderBudget(db, {
    reservationId: providerReservationId,
    orgId: req.orgId,
    apiKeyId: req.apiKey?.id ?? null,
    model: req.model,
    pass: req.pass,
    batch: req.batch ?? false,
    limits,
    now,
  });
  if (!budget.ok) {
    // No provider call, no credits touched, and the reason is recorded — a
    // refused reservation is an operational event, not a customer fault.
    await recordUsage(db, {
      ...base,
      status: "blocked_no_charge",
      detail: budget.code === "model_not_priced" ? "model not priced" : `provider budget: ${budget.scope}`,
    });
    if (budget.code === "model_not_priced") {
      return { ok: false, code: "model_not_priced", message: budget.message, ciStaysGreen: true };
    }
    if (budget.scope === "global-day") {
      // The global ceiling is the 100% condition, and it must be sticky: a
      // human decides when spending resumes. A tenant-scoped refusal must not
      // pause explain for everyone, so only this scope trips.
      await tripBreaker(
        db,
        `daily provider budget would be exceeded (limit $${(budget.limitMicrodollars / 1e6).toFixed(2)}, ` +
          `spent $${(budget.committedMicrodollars / 1e6).toFixed(4)}, reserved $${(budget.outstandingMicrodollars / 1e6).toFixed(4)}, ` +
          `this call could cost $${(budget.requestedMicrodollars / 1e6).toFixed(4)})`,
        deps.alert,
        now
      );
      return { ok: false, code: "explain_paused", message: EXPLAIN_PAUSED_MESSAGE, ciStaysGreen: true };
    }
    deps.alert(
      `Normascope provider budget refused a call: ${budget.scope} limit $${(budget.limitMicrodollars / 1e6).toFixed(2)}, ` +
        `already spent $${(budget.committedMicrodollars / 1e6).toFixed(4)}, reserved $${(budget.outstandingMicrodollars / 1e6).toFixed(4)}.`
    );
    return { ok: false, code: "provider_budget_exhausted", message: budget.message, ciStaysGreen: true };
  }

  // 6 — reserve the customer's credits. If this fails, give our dollars back:
  // nothing was called, so nothing may stay held.
  let reservation;
  try {
    reservation = await consumeCredits(db, req.orgId, credits, now);
  } catch (err) {
    await releaseProviderBudget(db, providerReservationId);
    if (err instanceof InsufficientCreditsError) {
      return {
        ok: false,
        code: "insufficient_credits",
        message: "not enough credits — buy a pack to keep explaining. Diffs, reports, and uploads are unaffected.",
        ciStaysGreen: true,
      };
    }
    throw err;
  }

  // 7 — provider call; any failure returns both reservations in full.
  const fail = async (detail: string): Promise<ExplainOutcome> => {
    await releaseProviderBudget(db, providerReservationId);
    await refundCredits(db, reservation);
    await recordUsage(db, { ...base, status: "failed_no_charge", detail });
    return {
      ok: false,
      code: "analysis_failed",
      message: `analysis failed (${detail}) — no credits were used`,
      ciStaysGreen: true,
    };
  };

  // Phase D — hosted-only history enrichment, computed from our rows before
  // the provider call. BYO traffic never reaches this function, so the gap
  // is structural, not a client-side lock.
  let enrichment: Enrichment | null = null;
  if (req.repoId) {
    enrichment = await buildEnrichment(db, { orgId: req.orgId, repoId: req.repoId, frame: req.frame });
  }

  let result: ProviderResult;
  try {
    result = await deps.provider({
      model: req.model,
      batch: req.batch ?? false,
      enrichmentText: enrichment?.text ?? null,
    });
  } catch (err) {
    return fail(`provider threw: ${(err as Error).message}`);
  }
  if (result.kind === "error") {
    return fail(result.message);
  }
  if (result.kind === "refusal") {
    return fail("model declined the analysis");
  }
  if (!findingsShapeValid(result.json)) {
    return fail("response failed schema validation");
  }

  // 8 — inject history fields (our data, not the model's), settle, meter,
  // cache, persist for future recurrence, return.
  //
  // `settleProviderBudget` records the real spend and frees the unused part of
  // the reservation. It is the only writer of provider spend on this path —
  // calling `addSpend` here as well would double-count the day.
  const findings = enrichment ? applyEnrichment(result.json, enrichment) : result.json;
  const cost = computeCostMicrodollars(req.model, result.usage, { batch: req.batch }) ?? 0;
  await settleProviderBudget(db, providerReservationId, cost, now);
  await checkAndTrip(db, deps.dailyBudgetMicrodollars, deps.alert, now);
  await recordUsage(db, {
    ...base,
    status: "charged",
    usage: result.usage,
    costMicrodollars: cost,
    creditsCharged: credits,
    detail: enrichment ? `enrichment_tokens=${enrichment.tokenEstimate}` : "",
  });
  await cachePut(db, req.orgId, cacheKey, req.model, findings);
  if (req.repoId && req.runId) {
    await saveRunFindings(db, {
      orgId: req.orgId,
      repoId: req.repoId,
      runId: req.runId,
      frame: req.frame,
      model: req.model,
      findings,
    });
  }
  return { ok: true, findings, cached: false, creditsCharged: credits };
}
