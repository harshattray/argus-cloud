import { createHash } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Result cache (Economics Doctrine rule 4): keyed on (org, frame, build
 * hash, design hash, model, prompt version). Hits are free, never
 * decremented, and can never cross an org boundary — the org id is both an
 * input to the key hash and a column in the primary key, so even a
 * constructed hash collision can't read another tenant's findings.
 */

export interface CacheKeyInput {
  orgId: string;
  frame: string;
  buildHash: string;
  designHash: string;
  model: string;
  promptVersion: number;
}

export function makeCacheKey(input: CacheKeyInput): string {
  return createHash("sha256")
    .update(
      [input.orgId, input.frame, input.buildHash, input.designHash, input.model, String(input.promptVersion)].join("|")
    )
    .digest("hex");
}

export async function cacheGet(db: Db, orgId: string, cacheKey: string): Promise<unknown | null> {
  const result = await db.query<{ findings: unknown }>(
    "SELECT findings FROM result_cache WHERE org_id = $1 AND cache_key = $2",
    [orgId, cacheKey]
  );
  return result.rows[0]?.findings ?? null;
}

export async function cachePut(
  db: Db,
  orgId: string,
  cacheKey: string,
  model: string,
  findings: unknown
): Promise<void> {
  await db.query(
    `INSERT INTO result_cache (org_id, cache_key, model, findings)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, cache_key) DO NOTHING`,
    [orgId, cacheKey, model, JSON.stringify(findings)]
  );
}
