import { getDb } from "../../../../../lib/db";
import { getStorage } from "../../../../../lib/storage";
import { requireApiKey, unauthorized, rateLimited } from "../../../../../lib/auth";
import { commitUpload, UploadRejected } from "argus-cloud/artifactUploads.js";

/**
 * Phase 3 of the upload — `BuildV5.md` G2 step 3.
 *
 * The client has finished PUTting straight to storage and is asking us to
 * accept the run. We verify every object it declared actually arrived, at the
 * size it declared, hashing to the value it is stored under; then the run
 * becomes visible.
 *
 * **The run id in the path is not trusted on its own.** It is checked against
 * the key's organization inside `commitUpload`, so a valid key from org A
 * cannot commit — or destroy — a run belonging to org B. That check lives with
 * the logic rather than here, because this route is not the only thing that
 * will ever call it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> }
): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }

  const { runId } = await context.params;

  try {
    const result = await commitUpload(db, await getStorage(), { orgId: key.org_id, runId });
    return Response.json(
      {
        runId: result.runId,
        artifacts: result.artifactsCommitted,
        bytes: result.bytesCommitted,
        url: `/r/${result.runId}`,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof UploadRejected) {
      // 422, not 400: the request itself is well-formed. What failed is the
      // upload it describes, and the run has already been cleaned up — so the
      // honest instruction to the client is "declare again", which is what the
      // message says rather than a bare status.
      return Response.json({ error: err.message, code: "commit_rejected" }, { status: 422 });
    }
    throw err;
  }
}
