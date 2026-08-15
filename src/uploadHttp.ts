/**
 * The HTTP shape of the upload protocol — status codes and response bodies.
 *
 * **Why this is here and not in the route.** The route files under `web/app`
 * are not reachable from the suite: they are Next modules compiled by Next, and
 * the tests import from `dist/`. Everything left in them is therefore covered
 * by the typechecker and nothing else. So the route keeps only what is
 * genuinely web-specific — reading the header, the body, the rate limiter — and
 * every decision that could be *wrong* lives here, where it can be tested.
 *
 * That is not a contrivance for the tests. It is the same split the rest of
 * this repo already uses, and the reason the split is worth the file is that
 * the interesting part of an upload endpoint is exactly the part a typechecker
 * cannot see: which refusal becomes which status, and whether one
 * organization's key can commit another organization's run.
 */

import type { Db } from "./db.js";
import type { Storage } from "./storage.js";
import {
  commitUpload,
  declareUpload,
  UploadRefused,
  UploadRejected,
  type DeclaredArtifact,
} from "./artifactUploads.js";

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Refusal → status.
 *
 * Chosen to be honest to an ordinary HTTP client that knows nothing about
 * Normascope: 402 for "this plan does not include it", 429 for "too often",
 * 413 for "too large", 400 for "malformed". The `code` in the body is what a
 * client should actually branch on — a status is a category, and two different
 * quota failures share one.
 *
 * Every one of these is a refusal the CLI prints and exits 0 on. None of them
 * may redden a build.
 */
export function statusForRefusal(reason: UploadRefused["reason"]): number {
  switch (reason) {
    case "not_entitled":
      return 402;
    case "runs_per_day":
      return 429;
    case "malformed":
      return 400;
    case "artifacts_per_run":
    case "bytes_per_run":
    case "bytes_stored_max":
      return 413;
  }
}

export interface DeclareRequestBody {
  repo?: string;
  commitSha?: string;
  branch?: string;
  summary?: unknown;
  artifacts?: DeclaredArtifact[];
}

/** Phase 1 as an HTTP result. */
export async function declareResponse(
  db: Db,
  storage: Storage,
  orgId: string,
  body: DeclareRequestBody
): Promise<HttpResult> {
  const repoName = typeof body.repo === "string" ? body.repo.trim() : "";
  if (!repoName) {
    return { status: 400, body: { error: "repo is required", code: "malformed" } };
  }
  if (!Array.isArray(body.artifacts) || body.artifacts.length === 0) {
    return { status: 400, body: { error: "artifacts must be a non-empty array", code: "malformed" } };
  }

  try {
    const declared = await declareUpload(db, storage, {
      orgId,
      repoName,
      commitSha: body.commitSha,
      branch: body.branch,
      summary: body.summary ?? {},
      artifacts: body.artifacts,
    });
    return {
      status: 201,
      body: {
        runId: declared.runId,
        uploads: declared.uploads,
        deduplicated: declared.deduplicated,
        bytesReserved: declared.bytesReserved,
        commit: `/api/upload/${declared.runId}/commit`,
      },
    };
  } catch (err) {
    if (err instanceof UploadRefused) {
      return { status: statusForRefusal(err.reason), body: { error: err.message, code: err.reason } };
    }
    throw err;
  }
}

/**
 * Phase 3 as an HTTP result.
 *
 * `orgId` comes from the authenticated key and `runId` from the URL, and
 * `commitUpload` requires them to agree. A run id is guessable in a way a key
 * is not, so without that check a valid key from one organization could commit
 * — and, on failure, delete — another organization's run.
 */
export async function commitResponse(
  db: Db,
  storage: Storage,
  orgId: string,
  runId: string
): Promise<HttpResult> {
  try {
    const result = await commitUpload(db, storage, { orgId, runId });
    return {
      status: 200,
      body: {
        runId: result.runId,
        artifacts: result.artifactsCommitted,
        bytes: result.bytesCommitted,
        url: `/r/${result.runId}`,
      },
    };
  } catch (err) {
    // A refusal and a rejection are different answers and must not share a
    // status. "Your plan cannot publish this" is 402 and is about billing;
    // "the object you promised never arrived" is 422 and is about the upload.
    // Collapsing them would tell a lapsed customer their files were corrupt.
    if (err instanceof UploadRefused) {
      return { status: statusForRefusal(err.reason), body: { error: err.message, code: err.reason } };
    }
    if (err instanceof UploadRejected) {
      // 422, not 400: the request is well-formed. What failed is the upload it
      // describes, and the run has already been cleaned up — so the honest
      // instruction is "declare again", which the message gives.
      return { status: 422, body: { error: err.message, code: "commit_rejected" } };
    }
    throw err;
  }
}
