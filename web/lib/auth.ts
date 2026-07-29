import { findApiKey, type ApiKeyRecord } from "argus-cloud/apiKeys.js";
import type { Db } from "argus-cloud/db.js";

/**
 * Bearer-key authentication for the API surface. Keys are hashed at rest and
 * never logged (Stage 4 security protocol); a revoked key stops working
 * immediately because lookup is by hash on every request.
 */
export async function requireApiKey(db: Db, request: Request): Promise<ApiKeyRecord | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) {
    return null;
  }
  return findApiKey(db, match[1]);
}

export function unauthorized(): Response {
  return Response.json({ error: "missing or invalid API key" }, { status: 401 });
}
