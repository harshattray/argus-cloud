import { getDb } from "../../../lib/db";
import { requireApiKey, unauthorized, rateLimited } from "../../../lib/auth";
import { makeBatchSubmit, makeBatchFetch, HOSTED_MODELS, type FrameEvidence } from "../../../lib/provider";
import { enqueueCiBatch, collectCiBatch, summarizeForPr } from "argus-cloud/ciBatch.js";

/**
 * CI auto-explain (Build 4.0 D2), two-step because Message Batches finish
 * asynchronously:
 *
 *   POST {runId}          → enqueue top-N flagged frames, returns batchId
 *   GET  ?batchId=...     → collect when ended; returns findings + the
 *                            escaped PR comment line
 *
 * The Action calls POST after upload, then polls GET; every skip/failure
 * reason is phrased so CI stays green.
 */

const DAILY_BUDGET_MICRODOLLARS = Number(process.env.EXPLAIN_DAILY_BUDGET_MICRODOLLARS ?? 50_000_000);

const deps = (evidenceByFrame: Map<string, FrameEvidence>) => ({
  submit: makeBatchSubmit(evidenceByFrame),
  fetch: makeBatchFetch(),
  dailyBudgetMicrodollars: DAILY_BUDGET_MICRODOLLARS,
  alert: (message: string) => console.error(`[breaker-alert] ${message}`),
});

export async function POST(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  // Ahead of the batch enqueue, which reserves credits for every flagged frame.
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }
  let body: { runId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body is not valid JSON" }, { status: 400 });
  }
  if (!body.runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }
  const run = (
    await db.query<{ id: string; repo_id: string; commit_sha: string; summary: unknown }>(
      "SELECT id, repo_id, commit_sha, summary FROM runs WHERE id = $1 AND org_id = $2",
      [body.runId, key.org_id]
    )
  ).rows[0];
  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }

  const summary = typeof run.summary === "string" ? JSON.parse(run.summary) : (run.summary as Record<string, unknown>);
  const threshold = typeof summary?.threshold === "number" ? summary.threshold : 0;
  const frames = Array.isArray(summary?.frames) ? (summary.frames as Record<string, unknown>[]) : [];
  const flagged = frames
    .filter((f) => f.flagged === true && typeof f.screenshot === "string")
    .sort(
      (a, b) => Number(b.alignedMismatchPercent ?? 0) - Number(a.alignedMismatchPercent ?? 0) // worst first
    );

  const evidenceByFrame = new Map<string, FrameEvidence>(
    flagged.map((f) => [
      f.screenshot as string,
      {
        frame: f.screenshot as string,
        label: typeof f.label === "string" ? f.label : (f.screenshot as string),
        threshold,
        stats: f,
      },
    ])
  );

  const outcome = await enqueueCiBatch(db, deps(evidenceByFrame), {
    orgId: key.org_id,
    repoId: run.repo_id,
    runId: run.id,
    model: HOSTED_MODELS.analysis,
    frames: flagged.map((f) => ({
      frame: f.screenshot as string,
      buildHash: `${run.commit_sha}:${f.alignedMismatchPercent ?? ""}`,
      designHash: String(f.structuralSimilarity ?? ""),
    })),
  });

  return Response.json(outcome, { status: outcome.batchId ? 202 : 200 });
}

export async function GET(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  // The collect poll is limited too — an unlimited GET is an unlimited request
  // path. A poll that is refused backs off and the Action reports "skipped";
  // CI stays green either way (Doctrine: Cloud never reddens a build).
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }
  const batchId = new URL(request.url).searchParams.get("batchId");
  if (!batchId) {
    return Response.json({ error: "batchId is required" }, { status: 400 });
  }
  // Tenant isolation: only the owning org may collect.
  const owned = (
    await db.query<{ id: string }>("SELECT id FROM explain_batches WHERE id = $1 AND org_id = $2", [batchId, key.org_id])
  ).rows[0];
  if (!owned) {
    return Response.json({ error: "batch not found" }, { status: 404 });
  }
  const outcome = await collectCiBatch(db, deps(new Map()), batchId);
  return Response.json({ ...outcome, prLine: summarizeForPr(outcome.findings) }, { status: outcome.done ? 200 : 202 });
}
