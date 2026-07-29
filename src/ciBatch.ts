import type { Db } from "./db.js";
import { consumeCredits, refundCredits, InsufficientCreditsError, type Consumption } from "./ledger.js";
import { recordUsage, computeCostMicrodollars, type TokenUsage } from "./usage.js";
import { makeCacheKey, cacheGet, cachePut } from "./resultCache.js";
import { isTripped, addSpend, checkAndTrip, type Alert } from "./breaker.js";
import { buildEnrichment, applyEnrichment, saveRunFindings } from "./enrichment.js";
import { findingsShapeValid, CREDITS_PER_ANALYSIS, AUTO_EXPLAIN_PER_RUN_CAP } from "./explainService.js";

/**
 * Build 4.0 Phase D — CI auto-explain of top-N flagged frames via the
 * Message Batches API (50% rate). Two-step because batches complete
 * asynchronously (Vercel functions can't block on them):
 *
 *   enqueue: breaker → cache (free hits excluded) → top-N cap → reserve
 *            credits per frame → submit one provider batch → persist
 *            reservations so nothing is ever silently double-charged.
 *   collect: fetch results → validate → enrich → meter AT BATCH RATE →
 *            cache → attach findings to the run; failures refund in full.
 *
 * The PR comment line comes from summarizeForPr(), which escapes findings —
 * findings are untrusted model output everywhere they surface (E3).
 */

export interface BatchEntry {
  frame: string;
  cacheKey: string;
  model: string;
  credits: number;
  reservation: Consumption[];
  enrichmentText: string | null;
  enrichmentTokens: number;
}

export interface BatchSubmission {
  /** custom_id → request payload the caller sends to the Batches API. */
  requests: { customId: string; frame: string; model: string; enrichmentText: string | null }[];
}

export type BatchSubmit = (submission: BatchSubmission) => Promise<string>; // returns provider batch id
export type BatchResult =
  | { kind: "ok"; json: unknown; usage: TokenUsage }
  | { kind: "refusal" }
  | { kind: "error"; message: string };
export type BatchFetch = (batchId: string) => Promise<Map<string, BatchResult> | null>; // null = not finished

export interface CiBatchDeps {
  submit: BatchSubmit;
  fetch: BatchFetch;
  dailyBudgetMicrodollars: number;
  alert: Alert;
  now?: () => Date;
}

export interface EnqueueRequest {
  orgId: string;
  repoId: string;
  runId: string;
  model: string;
  /** Flagged frames ordered worst-first; the top-N cap applies here. */
  frames: { frame: string; buildHash: string; designHash: string }[];
}

export interface EnqueueOutcome {
  batchId: string | null;
  /** Frames served free from the result cache at enqueue time. */
  cachedFindings: { frame: string; findings: unknown }[];
  /** Frames skipped (cap, credits, breaker) with honest reasons; CI stays green. */
  skipped: { frame: string; reason: string }[];
}

export async function enqueueCiBatch(db: Db, deps: CiBatchDeps, req: EnqueueRequest): Promise<EnqueueOutcome> {
  const now = deps.now?.() ?? new Date();
  const cachedFindings: EnqueueOutcome["cachedFindings"] = [];
  const skipped: EnqueueOutcome["skipped"] = [];

  if (await isTripped(db)) {
    return {
      batchId: null,
      cachedFindings,
      skipped: req.frames.map((f) => ({ frame: f.frame, reason: "explain is paused (daily budget breaker)" })),
    };
  }

  const entries: BatchEntry[] = [];
  const requests: BatchSubmission["requests"] = [];
  let accepted = 0;

  for (const f of req.frames) {
    const cacheKey = makeCacheKey({
      orgId: req.orgId,
      frame: f.frame,
      buildHash: f.buildHash,
      designHash: f.designHash,
      model: req.model,
      promptVersion: 1,
    });
    const cached = await cacheGet(db, req.orgId, cacheKey);
    if (cached !== null) {
      await recordUsage(db, {
        orgId: req.orgId, runId: req.runId, frame: f.frame, model: req.model, pass: "analysis",
        interactive: false, auto: true, status: "cache_hit", detail: "result cache hit — no charge",
      });
      cachedFindings.push({ frame: f.frame, findings: cached });
      continue; // cache hits don't count against the cap
    }
    if (accepted >= AUTO_EXPLAIN_PER_RUN_CAP) {
      skipped.push({
        frame: f.frame,
        reason: `auto-explain cap (${AUTO_EXPLAIN_PER_RUN_CAP} frames/run) — analyze manually from the report`,
      });
      continue;
    }
    let reservation: Consumption[];
    try {
      reservation = await consumeCredits(db, req.orgId, CREDITS_PER_ANALYSIS, now);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        skipped.push({ frame: f.frame, reason: "not enough credits — buy a pack to keep explaining" });
        continue;
      }
      throw err;
    }
    const enrichment = await buildEnrichment(db, { orgId: req.orgId, repoId: req.repoId, frame: f.frame });
    entries.push({
      frame: f.frame,
      cacheKey,
      model: req.model,
      credits: CREDITS_PER_ANALYSIS,
      reservation,
      enrichmentText: enrichment?.text ?? null,
      enrichmentTokens: enrichment?.tokenEstimate ?? 0,
    });
    requests.push({ customId: f.frame, frame: f.frame, model: req.model, enrichmentText: enrichment?.text ?? null });
    accepted++;
  }

  if (entries.length === 0) {
    return { batchId: null, cachedFindings, skipped };
  }

  let batchId: string;
  try {
    batchId = await deps.submit({ requests });
  } catch (err) {
    // Submission failed — refund every reservation, nothing was analyzed.
    for (const entry of entries) {
      await refundCredits(db, entry.reservation);
      await recordUsage(db, {
        orgId: req.orgId, runId: req.runId, frame: entry.frame, model: entry.model, pass: "analysis",
        interactive: false, auto: true, status: "failed_no_charge",
        detail: `batch submission failed: ${(err as Error).message}`,
      });
    }
    return {
      batchId: null,
      cachedFindings,
      skipped: [...skipped, ...entries.map((e) => ({ frame: e.frame, reason: "batch submission failed — no credits used" }))],
    };
  }

  await db.query(
    `INSERT INTO explain_batches (id, org_id, repo_id, run_id, status, entries) VALUES ($1,$2,$3,$4,'pending',$5)`,
    [batchId, req.orgId, req.repoId, req.runId, JSON.stringify(entries)]
  );
  return { batchId, cachedFindings, skipped };
}

export interface CollectOutcome {
  done: boolean;
  findings: { frame: string; findings: unknown }[];
  failures: { frame: string; reason: string }[];
}

export async function collectCiBatch(db: Db, deps: CiBatchDeps, batchId: string): Promise<CollectOutcome> {
  const now = deps.now?.() ?? new Date();
  const row = (
    await db.query<{ org_id: string; repo_id: string; run_id: string; status: string; entries: unknown }>(
      "SELECT org_id, repo_id, run_id, status, entries FROM explain_batches WHERE id = $1",
      [batchId]
    )
  ).rows[0];
  if (!row) {
    throw new Error(`unknown batch ${batchId}`);
  }
  if (row.status === "collected") {
    return { done: true, findings: [], failures: [] };
  }
  const results = await deps.fetch(batchId);
  if (results === null) {
    return { done: false, findings: [], failures: [] };
  }

  const entries: BatchEntry[] = typeof row.entries === "string" ? JSON.parse(row.entries) : (row.entries as BatchEntry[]);
  const findings: CollectOutcome["findings"] = [];
  const failures: CollectOutcome["failures"] = [];

  for (const entry of entries) {
    const base = {
      orgId: row.org_id, runId: row.run_id, frame: entry.frame, model: entry.model,
      pass: "analysis" as const, interactive: false, auto: true,
    };
    const fail = async (reason: string) => {
      await refundCredits(db, entry.reservation);
      await recordUsage(db, { ...base, status: "failed_no_charge", detail: reason });
      failures.push({ frame: entry.frame, reason: `${reason} — no credits were used` });
    };
    const result = results.get(entry.frame);
    if (!result) {
      await fail("batch result missing for frame");
      continue;
    }
    if (result.kind === "error") {
      await fail(result.message);
      continue;
    }
    if (result.kind === "refusal") {
      await fail("model declined the analysis");
      continue;
    }
    if (!findingsShapeValid(result.json)) {
      await fail("response failed schema validation");
      continue;
    }
    const enrichment = await buildEnrichment(db, { orgId: row.org_id, repoId: row.repo_id, frame: entry.frame });
    const enriched = enrichment ? applyEnrichment(result.json, enrichment) : result.json;
    const cost = computeCostMicrodollars(entry.model, result.usage, { batch: true }) ?? 0;
    await addSpend(db, cost, now);
    await checkAndTrip(db, deps.dailyBudgetMicrodollars, deps.alert, now);
    await recordUsage(db, {
      ...base,
      status: "charged",
      usage: result.usage,
      costMicrodollars: cost,
      creditsCharged: entry.credits,
      detail: entry.enrichmentTokens > 0 ? `enrichment_tokens=${entry.enrichmentTokens}` : "",
    });
    await cachePut(db, row.org_id, entry.cacheKey, entry.model, enriched);
    await saveRunFindings(db, {
      orgId: row.org_id, repoId: row.repo_id, runId: row.run_id,
      frame: entry.frame, model: entry.model, findings: enriched,
    });
    findings.push({ frame: entry.frame, findings: enriched });
  }

  await db.query("UPDATE explain_batches SET status = 'collected', collected_at = now() WHERE id = $1", [batchId]);
  return { done: true, findings, failures };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * One escaped line for the PR comment (D2). Findings are untrusted model
 * output; everything interpolated is escaped and length-capped.
 */
export function summarizeForPr(collected: { frame: string; findings: unknown }[]): string {
  if (collected.length === 0) {
    return "";
  }
  const parts = collected.map(({ frame, findings }) => {
    const list = (findings as { findings?: { observation?: unknown }[] })?.findings ?? [];
    const first = typeof list[0]?.observation === "string" ? (list[0].observation as string) : "";
    const clipped = first.length > 120 ? `${first.slice(0, 117)}…` : first;
    return `${escapeHtml(frame)}: ${escapeHtml(clipped)}`;
  });
  return `🔎 Explain (generated — verify before applying): ${parts.join(" · ")}`;
}
