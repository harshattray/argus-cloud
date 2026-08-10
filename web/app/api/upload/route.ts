import { randomUUID } from "node:crypto";
import { getDb } from "../../../lib/db";
import { requireApiKey, unauthorized, rateLimited } from "../../../lib/auth";

/**
 * Upload API (Stage 4 item 2, minimal viable): summary.json v2 + run
 * metadata, key-gated, size-capped, schema-version tolerant. Artifacts
 * (report HTML, screenshots) land with the R2 integration; the summary is
 * what trends, reports, and Phase D enrichment run on.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface UploadBody {
  repo?: string;
  commitSha?: string;
  branch?: string;
  summary?: {
    schemaVersion?: number;
    threshold?: number;
    frames?: {
      label?: string;
      screenshot?: string;
      mode?: string;
      source?: string;
      status?: string;
      alignedMismatchPercent?: number;
      structuralSimilarity?: number;
      flagged?: boolean;
    }[];
  };
}

export async function POST(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  // Before the body is read, not after: a 2MB read is the cost being limited.
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "upload exceeds the 2MB summary cap" }, { status: 413 });
  }
  let body: UploadBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  const repoName = body.repo?.trim();
  const summary = body.summary;
  if (!repoName || typeof summary !== "object" || summary === null) {
    return Response.json({ error: "repo and summary are required" }, { status: 400 });
  }
  // Schema-version tolerant: v2 is what we understand; newer majors are
  // accepted and stored verbatim, but frames we can't read produce no stats.
  const frames = Array.isArray(summary.frames) ? summary.frames : [];

  const orgId = key.org_id;
  const runId = randomUUID();
  await db.transaction(async (tx) => {
    const repoRow = await tx.query<{ id: string }>(
      "SELECT id FROM repos WHERE org_id = $1 AND name = $2",
      [orgId, repoName]
    );
    let repoId = repoRow.rows[0]?.id;
    if (!repoId) {
      repoId = randomUUID();
      await tx.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [repoId, orgId, repoName]);
    }
    await tx.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary) VALUES ($1,$2,$3,$4,$5,$6)",
      [runId, orgId, repoId, body.commitSha ?? "", body.branch ?? "", JSON.stringify(summary)]
    );
    for (const frame of frames) {
      if (frame?.status !== "compared" || typeof frame.screenshot !== "string") {
        continue;
      }
      await tx.query(
        `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          orgId, repoId, runId, frame.screenshot,
          typeof frame.mode === "string" ? frame.mode : "fidelity",
          typeof frame.source === "string" ? frame.source : "images",
          typeof frame.alignedMismatchPercent === "number" ? frame.alignedMismatchPercent : null,
          typeof frame.structuralSimilarity === "number" ? frame.structuralSimilarity : null,
          frame.flagged === true,
        ]
      );
    }
  });

  return Response.json({ runId, url: `/r/${runId}` }, { status: 201 });
}
