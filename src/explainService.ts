import type { Db } from "./db.js";
import { creditsForPass, creditsRequired, type BudgetLimits } from "./providerBudget.js";
import {
  recordUsage,
  computeCostMicrodollars,
  autoAnalysesForRun,
  creditsUsedByKeyInMonth,
  type TokenUsage,
} from "./usage.js";
import { makeCacheKey, cacheGet } from "./resultCache.js";
import { isTripped, EXPLAIN_PAUSED_MESSAGE, type Alert } from "./breaker.js";
import { reserveBoth, settleCharged, releaseBoth } from "./economicPath.js";
import type { ApiKeyRecord } from "./apiKeys.js";
import { buildEnrichment, applyEnrichment, type Enrichment } from "./enrichment.js";
import { OutboundSecretError, promptVersionFor } from "./promptAssembly.js";
import type { GroundingCrop } from "./cropGrounding.js";

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
  /**
   * Validated crops for this frame (BuildV5 G3), already bounded to the pixel
   * budget by `cropGrounding.ts`. Empty when the run predates artifact upload
   * or its sidecar was unreadable — the provider then grounds on metadata and
   * says so (G3.2).
   *
   * They travel through the service rather than being captured in the route's
   * closure so that **the number the cache keys on and the images actually sent
   * are the same list**. A count passed separately would be a second source for
   * one fact, and the one that drifts is the cache.
   */
  crops?: readonly GroundingCrop[];
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
  /** Crops for this frame, validated and bounded by `cropGrounding.ts` (G3). */
  crops?: readonly GroundingCrop[];
  /**
   * Why this request carries no crops, when it carries none. Recorded on the
   * usage event so a silently vaguer answer can be explained after the fact —
   * an old run and a broken storage path look identical from the outside.
   */
  groundingNote?: string;
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
        | "model_not_priced"
        | "secret_blocked";
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
  // The prompt version carries the grounding, so a metadata-only answer is
  // never served to a crop-grounded request (`promptAssembly.ts`).
  const cacheKey = makeCacheKey({
    orgId: req.orgId,
    frame: req.frame,
    buildHash: req.buildHash,
    designHash: req.designHash,
    model: req.model,
    promptVersion: promptVersionFor(req.crops),
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
  // 5 and 6 — both reservations, or neither. The ordering, the unwind, the
  // breaker trip and the budget alerts all live in `economicPath.ts` so the CI
  // batch path cannot drift from this one (see that file's header).
  const admission = await reserveBoth(db, {
    orgId: req.orgId,
    apiKeyId: req.apiKey?.id ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    batch: req.batch ?? false,
    auto: req.auto ?? false,
    credits,
    limits,
    alert: deps.alert,
    now,
    context: "for an interactive explain",
  });
  if (!admission.ok) {
    switch (admission.code) {
      case "model_not_priced":
        return { ok: false, code: "model_not_priced", message: admission.message, ciStaysGreen: true };
      case "provider_budget_exhausted":
        // A tripped breaker is the paused-everywhere condition and says so; a
        // tenant ceiling is this org's problem alone and must read differently.
        return admission.breakerTripped
          ? { ok: false, code: "explain_paused", message: EXPLAIN_PAUSED_MESSAGE, ciStaysGreen: true }
          : { ok: false, code: "provider_budget_exhausted", message: admission.message, ciStaysGreen: true };
      case "insufficient_credits":
        return {
          ok: false,
          code: "insufficient_credits",
          message: "not enough credits — buy a pack to keep explaining. Diffs, reports, and uploads are unaffected.",
          ciStaysGreen: true,
        };
    }
  }

  // 7 — provider call; any failure returns both reservations in full.
  const release = async (detail: string): Promise<void> => {
    await releaseBoth(db, {
      orgId: req.orgId,
      apiKeyId: req.apiKey?.id ?? null,
      runId: req.runId ?? null,
      frame: req.frame,
      model: req.model,
      pass: req.pass,
      batch: req.batch ?? false,
      auto: req.auto ?? false,
      providerReservationId: admission.providerReservationId,
      creditReservation: admission.creditReservation,
      detail,
    });
  };
  const fail = async (detail: string): Promise<ExplainOutcome> => {
    await release(detail);
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
      crops: req.crops ?? [],
    });
  } catch (err) {
    // The secret scan (Pathway 2 item 8) lives in prompt assembly, which runs
    // inside the provider closure — so a block surfaces here, as a throw, and
    // must not be reported as "analysis failed". It is not a failure: nothing
    // was sent, nothing is wrong with the service, and the customer can fix it.
    // Both reservations go back, exactly as on any other unsent call.
    if (err instanceof OutboundSecretError) {
      await release(`secret scan ${err.rule} blocked ${err.source}`);
      return { ok: false, code: "secret_blocked", message: err.message, ciStaysGreen: true };
    }
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

  // 8 — inject history fields (our data, not the model's), then settle: record
  // the real spend, meter, cache, and persist for future recurrence.
  const findings = enrichment ? applyEnrichment(result.json, enrichment) : result.json;
  const cost = computeCostMicrodollars(req.model, result.usage, { batch: req.batch }) ?? 0;
  await settleCharged(db, {
    orgId: req.orgId,
    apiKeyId: req.apiKey?.id ?? null,
    repoId: req.repoId ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    batch: req.batch ?? false,
    auto: req.auto ?? false,
    providerReservationId: admission.providerReservationId,
    credits,
    creditReservation: admission.creditReservation,
    usage: result.usage,
    costMicrodollars: cost,
    cacheKey,
    findings,
    dailyBudgetMicrodollars: deps.dailyBudgetMicrodollars,
    alert: deps.alert,
    now,
    detail: [
      enrichment ? `enrichment_tokens=${enrichment.tokenEstimate}` : "",
      // On the usage event because G4's recalibration has to be able to tell a
      // crop-grounded call from a metadata one after the fact. Without it the
      // recorded costs are a mix of two request shapes with no way to separate
      // them, and the calibration would be an average of two things.
      `crops=${req.crops?.length ?? 0}`,
      req.groundingNote ? `grounding=${req.groundingNote}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  return { ok: true, findings, cached: false, creditsCharged: credits };
}
