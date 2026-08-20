import type { Db } from "argus-cloud/db.js";
import { groundingFromSidecar, type GroundingCrop } from "argus-cloud/cropGrounding.js";
import { getStorage } from "./storage";

/**
 * Loads the crops sidecar for one frame and returns the crops that survive
 * validation (BuildV5 G3).
 *
 * **Every failure returns an empty list, never an error.** A run uploaded
 * before crop grounding has no sidecar; a sidecar can be missing from storage,
 * be unparseable, or be hostile. In each case the analysis proceeds on
 * metadata with the hedge intact, which is what G3.2 asks for. Turning any of
 * these into a failed request would mean a paid analysis that dies because the
 * *extra* evidence was unavailable.
 *
 * The org id is in the WHERE clause, not just the run id: the tenant probe (E4)
 * applies to every path that turns an id into bytes, and this one issues no
 * presigned URL to make the boundary visible elsewhere.
 */
export interface FrameGrounding {
  crops: GroundingCrop[];
  /**
   * Why there are none, when there are none.
   *
   * **Falling back silently is the failure mode this closes.** Every path here
   * degrades to the same visible outcome — a vaguer paid answer — whether the
   * run simply predates crop grounding or the object is missing from storage.
   * Without a reason on the record, "why was my explanation so general?" has no
   * answer, and a broken storage path looks exactly like an old run. It rides on
   * the usage event, next to `crops=0`, where the rest of the request's
   * accounting already is.
   */
  note: string;
}

export async function cropsForFrame(db: Db, orgId: string, runId: string, frame: string): Promise<FrameGrounding> {
  const row = (
    await db.query<{ storage_key: string }>(
      `SELECT storage_key FROM run_artifacts
        WHERE org_id = $1 AND run_id = $2 AND frame = $3 AND kind = 'crops' AND state = 'committed'`,
      [orgId, runId, frame]
    )
  ).rows[0];
  if (!row) {
    // The ordinary case, not a fault: runs uploaded before crop grounding, and
    // frames whose artifacts were never sent, have no sidecar to find.
    return { crops: [], note: "no_sidecar" };
  }
  try {
    const storage = await getStorage();
    const bytes = await storage.get(row.storage_key);
    if (!bytes) {
      // A row pointing at an object that is not there. Not expected, and worth
      // being able to see: it means storage and the database disagree.
      return { crops: [], note: "sidecar_object_missing" };
    }
    const result = groundingFromSidecar(JSON.parse(Buffer.from(bytes).toString("utf-8")));
    return {
      crops: result.crops,
      note: result.crops.length > 0 ? "" : `sidecar_yielded_nothing:${result.dropped[0] ?? "empty"}`,
    };
  } catch (err) {
    return { crops: [], note: `sidecar_unreadable:${(err as Error).name}` };
  }
}
