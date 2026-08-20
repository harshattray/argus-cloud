import { getDb } from "../../../lib/db";
import { requireApiKey, unauthorized, rateLimited } from "../../../lib/auth";
import { makeProvider, HOSTED_MODELS, type FrameEvidence } from "../../../lib/provider";
import { hostedExplain } from "argus-cloud/explainService.js";
import { alert } from "../../../lib/alerts";
import { cropsForFrame } from "../../../lib/crops";

/**
 * Interactive hosted explain (Build 4.0 D1): one frame, one decrement, wired
 * through the Phase C enforcement pipeline (breaker → cache → credits →
 * provider → validate → meter). The provider key never leaves the server
 * process (D5).
 */

const DAILY_BUDGET_MICRODOLLARS = Number(process.env.EXPLAIN_DAILY_BUDGET_MICRODOLLARS ?? 50_000_000); // $50/day default

interface ExplainBody {
  runId?: string;
  frame?: string;
  deep?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  // Ahead of the credit reservation and the provider call, both of which cost
  // real money the moment they start.
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }

  let body: ExplainBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body is not valid JSON" }, { status: 400 });
  }
  if (!body.runId || !body.frame) {
    return Response.json({ error: "runId and frame are required" }, { status: 400 });
  }

  // Tenant isolation: the run must belong to the key's org.
  const run = (
    await db.query<{ id: string; repo_id: string; commit_sha: string; summary: unknown }>(
      "SELECT id, repo_id, commit_sha, summary FROM runs WHERE id = $1 AND org_id = $2 AND state = 'committed'",
      [body.runId, key.org_id]
    )
  ).rows[0];
  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }

  const summary = typeof run.summary === "string" ? JSON.parse(run.summary) : (run.summary as Record<string, unknown>);
  const frames = Array.isArray(summary?.frames) ? (summary.frames as Record<string, unknown>[]) : [];
  const frameData = frames.find((f) => f.screenshot === body.frame);
  if (!frameData) {
    return Response.json({ error: "frame not found in this run" }, { status: 404 });
  }

  const evidence: FrameEvidence = {
    frame: body.frame,
    label: typeof frameData.label === "string" ? frameData.label : body.frame,
    threshold: typeof summary.threshold === "number" ? summary.threshold : 0,
    stats: frameData,
  };

  // Crop grounding (G3). Absent crops are not an error — the analysis falls
  // back to metadata with the hedge in the system prompt intact (G3.2).
  const grounding = await cropsForFrame(db, key.org_id, run.id, body.frame);

  const outcome = await hostedExplain(
    db,
    {
      provider: makeProvider(evidence),
      dailyBudgetMicrodollars: DAILY_BUDGET_MICRODOLLARS,
      alert,
    },
    {
      orgId: key.org_id,
      apiKey: key,
      runId: run.id,
      repoId: run.repo_id,
      frame: body.frame,
      // Until artifact upload carries real image hashes, key the result cache
      // on the commit + measured stats: conservative (a changed build misses),
      // never wrong (identical inputs hit).
      buildHash: `${run.commit_sha}:${frameData.alignedMismatchPercent ?? ""}`,
      designHash: String(frameData.structuralSimilarity ?? ""),
      model: body.deep ? HOSTED_MODELS.deep : HOSTED_MODELS.analysis,
      pass: body.deep ? "deep" : "analysis",
      crops: grounding.crops,
      groundingNote: grounding.note,
    }
  );

  if (!outcome.ok) {
    const status = outcome.code === "insufficient_credits" ? 402 : outcome.code === "explain_paused" ? 503 : 422;
    return Response.json({ error: outcome.message, code: outcome.code }, { status });
  }
  return Response.json({ findings: outcome.findings, cached: outcome.cached, creditsCharged: outcome.creditsCharged });
}
