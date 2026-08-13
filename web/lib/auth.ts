import { findApiKey, type ApiKeyRecord } from "argus-cloud/apiKeys.js";
import { checkRateLimit, rateLimitMessage } from "argus-cloud/rateLimit.js";
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

/**
 * Counts the request against its key and organization ceilings (PATHWAYS
 * Pathway 1 item 3). Returns a 429 to send back, or null to proceed.
 *
 * Call it immediately after `requireApiKey` and before any expensive work —
 * parsing a 2MB body, reserving credits, or reaching a provider. A limiter
 * placed after the cost has been paid limits nothing.
 *
 * The refusal is a stable, non-sensitive shape: a fixed `code`, the caller's
 * own ceiling, and when to come back. `Retry-After` is set because that is
 * what a CI runner and an HTTP client already know how to read.
 */
export async function rateLimited(db: Db, key: ApiKeyRecord): Promise<Response | null> {
  const decision = await checkRateLimit(db, {
    orgId: key.org_id,
    apiKeyId: key.id,
    ratePerMinute: key.rate_per_minute,
  });
  if (decision.allowed) {
    return null;
  }
  return Response.json(
    {
      error: rateLimitMessage(decision),
      code: "rate_limited",
      scope: decision.scope,
      limitPerMinute: decision.limit,
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } }
  );
}
