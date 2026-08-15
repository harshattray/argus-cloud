import { getDb } from "../../../../../lib/db";
import { getStorage } from "../../../../../lib/storage";
import { requireApiKey, unauthorized, rateLimited } from "../../../../../lib/auth";
import { commitResponse } from "argus-cloud/uploadHttp.js";

/**
 * Phase 3 of the upload — `BuildV5.md` G2 step 3.
 *
 * The client has finished PUTting straight to storage and is asking us to
 * accept the run. Everything that decides the answer is in `commitResponse`;
 * this route reads the key, counts the request, and carries the result out.
 *
 * **The run id in the path is not trusted on its own.** It is checked against
 * the key's organization, so a valid key from org A cannot commit — or, on
 * failure, destroy — a run belonging to org B. That check lives with the logic
 * rather than here, and is covered by H8 in the upload suite.
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
  const result = await commitResponse(db, await getStorage(), key.org_id, runId);
  return Response.json(result.body, { status: result.status });
}
