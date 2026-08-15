import { randomUUID } from "node:crypto";
import { getDb } from "../../../lib/db";
import { getStorage } from "../../../lib/storage";
import { requireApiKey, unauthorized, rateLimited } from "../../../lib/auth";
import { declareResponse } from "argus-cloud/uploadHttp.js";
import { recordFrameStats } from "argus-cloud/artifactUploads.js";
import type { DeclaredArtifact } from "argus-cloud/artifactUploads.js";

/**
 * Upload API. Two shapes through one endpoint, decided by whether the body
 * carries `artifacts`.
 *
 * **Without `artifacts`** — the original summary-only upload (Stage 4 item 2):
 * summary.json v2 plus run metadata, key-gated, size-capped, schema-version
 * tolerant. Still supported because a CLI that predates the artifact pipeline
 * must keep working; a client that has nothing to transfer has nothing to wait
 * for, and its run is complete on arrival.
 *
 * **With `artifacts`** — phase 1 of the three-phase upload (BuildV5 G2): the
 * client declares each file's size and hash, and gets back presigned PUTs plus
 * a run id to commit against. Nothing is visible until
 * `POST /api/upload/{runId}/commit` verifies what actually arrived.
 *
 * One endpoint rather than two because the client's question is the same —
 * "here is a run, take it" — and a second path would be a second place for the
 * entitlement check to be forgotten.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface UploadBody {
  repo?: string;
  commitSha?: string;
  branch?: string;
  artifacts?: DeclaredArtifact[];
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
  const orgId = key.org_id;

  // The declare path. Entitlement, quota, reservation and the status mapping
  // all live in `declareResponse` — this route only carries the result out.
  if (Array.isArray(body.artifacts) && body.artifacts.length > 0) {
    const result = await declareResponse(db, await getStorage(), orgId, {
      repo: repoName,
      commitSha: body.commitSha,
      branch: body.branch,
      summary,
      artifacts: body.artifacts,
    });
    return Response.json(result.body, { status: result.status });
  }

  // Schema-version tolerant: v2 is what we understand; newer majors are
  // accepted and stored verbatim, but frames we can't read produce no stats.

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
    // `state` is explicit because migration 017 flipped the default to
    // 'pending' so that a forgotten commit hides a run instead of showing a
    // broken one. This path carries no artifacts and has nothing to wait for,
    // so it is complete on arrival — but it now has to say so.
    await tx.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state) VALUES ($1,$2,$3,$4,$5,$6,'committed')",
      [runId, orgId, repoId, body.commitSha ?? "", body.branch ?? "", JSON.stringify(summary)]
    );
    // Shared with the declare path so the two upload shapes cannot disagree
    // about what a frame's stats are.
    await recordFrameStats(tx, { orgId, repoId, runId, summary });
  });

  return Response.json({ runId, url: `/r/${runId}` }, { status: 201 });
}
