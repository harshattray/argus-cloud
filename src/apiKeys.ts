import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./db.js";

/**
 * API keys: hashed at rest (sha256), plaintext shown exactly once at
 * creation, never logged. Agent keys are the machine-scale seat (Build 4.0
 * doctrine rule 8): a key with a monthly credit budget and a rate cap —
 * exhaustion produces a clear error and never reddens CI.
 */

export interface ApiKeyRecord {
  id: string;
  org_id: string;
  kind: "upload" | "agent";
  monthly_budget_credits: number | null;
  rate_per_minute: number | null;
  revoked_at: string | null;
}

export interface CreatedKey {
  id: string;
  /** Shown once; only the hash is stored. */
  plaintext: string;
}

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function createApiKey(
  db: Db,
  orgId: string,
  options: { kind?: "upload" | "agent"; label?: string; monthlyBudgetCredits?: number; ratePerMinute?: number } = {}
): Promise<CreatedKey> {
  const id = randomUUID();
  const plaintext = `nsk_${options.kind === "agent" ? "agent_" : ""}${randomBytes(24).toString("base64url")}`;
  await db.query(
    `INSERT INTO api_keys (id, org_id, key_hash, kind, label, monthly_budget_credits, rate_per_minute)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      orgId,
      hashKey(plaintext),
      options.kind ?? "upload",
      options.label ?? "",
      options.monthlyBudgetCredits ?? null,
      options.ratePerMinute ?? null,
    ]
  );
  return { id, plaintext };
}

export async function findApiKey(db: Db, plaintext: string): Promise<ApiKeyRecord | null> {
  const result = await db.query<ApiKeyRecord>(
    `SELECT id, org_id, kind, monthly_budget_credits, rate_per_minute, revoked_at
     FROM api_keys WHERE key_hash = $1`,
    [hashKey(plaintext)]
  );
  const key = result.rows[0];
  if (!key || key.revoked_at) {
    return null;
  }
  return key;
}

export async function revokeApiKey(db: Db, id: string): Promise<void> {
  await db.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1", [id]);
}
