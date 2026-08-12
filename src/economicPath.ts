import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { consumeCredits, refundCredits, InsufficientCreditsError, type Consumption } from "./ledger.js";
import { recordUsage, type TokenUsage } from "./usage.js";
import { cachePut } from "./resultCache.js";
import { checkAndTrip, tripBreaker, type Alert } from "./breaker.js";
import {
  reserveProviderBudget,
  settleProviderBudget,
  releaseProviderBudget,
  type BudgetLimits,
} from "./providerBudget.js";
import { evaluateAllBudgets } from "./budgetAlerts.js";
import { saveRunFindings } from "./enrichment.js";

/**
 * The three points where money moves, written once.
 *
 * **What this fixes.** `explainService.ts` (interactive explain) and
 * `ciBatch.ts` (CI batches) each hand-rolled the same sequence: reserve
 * provider dollars, reserve customer credits, unwind both if either fails, and
 * later either settle or refund. Two implementations of one rule means every
 * change has to be made twice, and forgetting the second one fails **silently**
 * — nothing errors, the money is just wrong.
 *
 * That is not hypothetical. Budget alerts were added to both files on
 * 2026-08-12, and the CI half had no test asserting its alert channel at all;
 * the miss would have shipped. `evaluateAllBudgets` now lives inside
 * `reserveBoth`, so a future rule about *what happens when a reservation
 * succeeds* cannot be added to one path and not the other.
 *
 * **What deliberately stayed in the callers.** Result-cache lookups, the
 * per-run cap, and the wording of refusals. Those genuinely differ in shape —
 * the batch path caps frames as it builds a batch, the interactive path counts
 * a run's history — and folding them in would mean a flag for each, which is
 * how a shared function becomes harder to read than the duplication it
 * replaced. The rule applied here: **extract what is identical and moves money,
 * not what merely rhymes.**
 *
 * Doctrine: PATHWAYS §3 "the economic request path", FUTURENORMA Doctrine 11.
 * The ordering below *is* that doctrine, and it now exists in one place:
 *
 *   reserve provider dollars → reserve credits → provider → settle
 *                            ↘ release ↙        ↘ release + refund ↙
 */

/** What one provider attempt needs to reserve against. */
export interface ReserveRequest {
  orgId: string;
  apiKeyId?: string | null;
  runId?: string | null;
  frame: string;
  model: string;
  pass: "analysis" | "deep";
  batch: boolean;
  /** CI auto-explain; recorded on the usage event. */
  auto: boolean;
  credits: number;
  limits: BudgetLimits;
  alert: Alert;
  now: Date;
  /**
   * Named in the breaker's trip reason so an operator can tell which path hit
   * the ceiling — "during a CI batch" reads very differently from a single
   * interactive request.
   */
  context: string;
}

export type ReserveOutcome =
  | { ok: true; providerReservationId: string; creditReservation: Consumption[] }
  | { ok: false; code: "model_not_priced"; message: string }
  | { ok: false; code: "provider_budget_exhausted"; scope: string; message: string; breakerTripped: boolean }
  | { ok: false; code: "insufficient_credits" };

/**
 * Reserves both ledgers, or neither.
 *
 * Provider dollars go first and deliberately so: they are the money we owe
 * whatever happens, and they bound concurrency (`providerBudget.ts`). Credits
 * are the customer's and can always be given back. If credits fail after
 * dollars succeeded, the dollars are released before returning — nothing may
 * stay held for a call that will not happen.
 *
 * A refused reservation is recorded as `blocked_no_charge`. That is an
 * operational event, not a customer fault, and recording it here means neither
 * path can refuse silently.
 *
 * Hitting the **global** day ceiling trips the breaker: it is the 100%
 * condition and a human decides when spending resumes. An organization or key
 * hitting its own ceiling must not pause explain for everyone, so it alerts
 * instead.
 */
export async function reserveBoth(db: Db, req: ReserveRequest): Promise<ReserveOutcome> {
  const base = {
    orgId: req.orgId,
    apiKeyId: req.apiKeyId ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    interactive: !req.batch,
    auto: req.auto,
  } as const;

  const providerReservationId = randomUUID();
  const budget = await reserveProviderBudget(db, {
    reservationId: providerReservationId,
    orgId: req.orgId,
    apiKeyId: req.apiKeyId ?? null,
    model: req.model,
    pass: req.pass,
    batch: req.batch,
    limits: req.limits,
    now: req.now,
  });

  if (!budget.ok) {
    await recordUsage(db, {
      ...base,
      status: "blocked_no_charge",
      detail: budget.code === "model_not_priced" ? "model not priced" : `provider budget: ${budget.scope}`,
    });
    if (budget.code === "model_not_priced") {
      return { ok: false, code: "model_not_priced", message: budget.message };
    }
    if (budget.scope === "global-day") {
      const breakerTripped = await tripBreaker(
        db,
        `daily provider budget would be exceeded ${req.context} (limit $${(budget.limitMicrodollars / 1e6).toFixed(2)}, ` +
          `spent $${(budget.committedMicrodollars / 1e6).toFixed(4)}, reserved $${(budget.outstandingMicrodollars / 1e6).toFixed(4)}, ` +
          `this call could cost $${(budget.requestedMicrodollars / 1e6).toFixed(4)})`,
        req.alert,
        req.now
      );
      return { ok: false, code: "provider_budget_exhausted", scope: budget.scope, message: budget.message, breakerTripped };
    }
    // A tenant-scoped ceiling. Previously only the interactive path alerted on
    // this and the CI path stayed silent — a divergence with no reason behind
    // it, and exactly what one implementation removes. An organization or key
    // pinned against its ceiling is worth an operator's attention on either
    // path.
    req.alert(
      `Normascope provider budget refused a call ${req.context}: ${budget.scope} limit $${(budget.limitMicrodollars / 1e6).toFixed(2)}, ` +
        `already spent $${(budget.committedMicrodollars / 1e6).toFixed(4)}, reserved $${(budget.outstandingMicrodollars / 1e6).toFixed(4)}.`
    );
    return { ok: false, code: "provider_budget_exhausted", scope: budget.scope, message: budget.message, breakerTripped: false };
  }

  // The reservation just raised committed capacity, so this is the moment a
  // budget can cross 50/75/90/100%. It lives *inside* this function on purpose:
  // when it sat in the callers it had to be added to both, and the CI copy
  // shipped untested. Observation only — it never refuses and never throws.
  await evaluateAllBudgets(
    db,
    { orgId: req.orgId, apiKeyId: req.apiKeyId ?? null, limits: req.limits },
    req.alert,
    req.now
  );

  let creditReservation: Consumption[];
  try {
    creditReservation = await consumeCredits(db, req.orgId, req.credits, req.now);
  } catch (err) {
    await releaseProviderBudget(db, providerReservationId);
    if (err instanceof InsufficientCreditsError) {
      return { ok: false, code: "insufficient_credits" };
    }
    throw err;
  }

  return { ok: true, providerReservationId, creditReservation };
}

export interface SettleRequest {
  orgId: string;
  apiKeyId?: string | null;
  repoId?: string | null;
  runId?: string | null;
  frame: string;
  model: string;
  pass: "analysis" | "deep";
  batch: boolean;
  auto: boolean;
  providerReservationId: string | undefined;
  credits: number;
  usage: TokenUsage;
  costMicrodollars: number;
  cacheKey: string;
  findings: unknown;
  dailyBudgetMicrodollars: number;
  alert: Alert;
  now: Date;
  detail?: string;
}

/**
 * The call happened and its result is good: record the real spend, meter it,
 * cache it, and persist the findings for future recurrence.
 *
 * `settleProviderBudget` is the only writer of provider spend on this path —
 * calling `addSpend` as well would double-count the day. It is idempotent, so a
 * retried worker or a second batch collector settles nothing twice.
 *
 * `providerReservationId` is optional only because a batch enqueued by an older
 * bundle may carry entries without one; a rollback deploy must still collect
 * cleanly. Everything new always has one.
 */
export async function settleCharged(db: Db, req: SettleRequest): Promise<void> {
  if (req.providerReservationId) {
    await settleProviderBudget(db, req.providerReservationId, req.costMicrodollars, req.now);
  }
  await checkAndTrip(db, req.dailyBudgetMicrodollars, req.alert, req.now);
  await recordUsage(db, {
    orgId: req.orgId,
    apiKeyId: req.apiKeyId ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    interactive: !req.batch,
    auto: req.auto,
    status: "charged",
    usage: req.usage,
    costMicrodollars: req.costMicrodollars,
    creditsCharged: req.credits,
    detail: req.detail ?? "",
  });
  await cachePut(db, req.orgId, req.cacheKey, req.model, req.findings);
  if (req.repoId && req.runId) {
    await saveRunFindings(db, {
      orgId: req.orgId,
      repoId: req.repoId,
      runId: req.runId,
      frame: req.frame,
      model: req.model,
      findings: req.findings,
    });
  }
}

export interface ReleaseRequest {
  orgId: string;
  apiKeyId?: string | null;
  runId?: string | null;
  frame: string;
  model: string;
  pass: "analysis" | "deep";
  batch: boolean;
  auto: boolean;
  providerReservationId: string | undefined;
  creditReservation: Consumption[];
  detail: string;
}

/**
 * The call did not happen, failed, was refused, or returned something we would
 * not accept: give back both reservations and record why.
 *
 * **A failed analysis costs the user nothing** (FUTURENORMA §3). Credits are
 * refunded in full and no provider spend is recorded, because none was
 * incurred — the reservation is released, not settled at zero, so the two mean
 * different things in the ledger.
 */
export async function releaseBoth(db: Db, req: ReleaseRequest): Promise<void> {
  if (req.providerReservationId) {
    await releaseProviderBudget(db, req.providerReservationId);
  }
  await refundCredits(db, req.creditReservation);
  await recordUsage(db, {
    orgId: req.orgId,
    apiKeyId: req.apiKeyId ?? null,
    runId: req.runId ?? null,
    frame: req.frame,
    model: req.model,
    pass: req.pass,
    interactive: !req.batch,
    auto: req.auto,
    status: "failed_no_charge",
    detail: req.detail,
  });
}
