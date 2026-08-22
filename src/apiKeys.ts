import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { planLimitsFor } from "./plans.js";

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

/**
 * An upload key an unentitled plan asked for. G2c's first line of defence.
 *
 * The point is not that the key would fail later — it would, because
 * entitlement is re-checked on every request. The point is that the credential
 * **does not exist to be leaked, stolen, or reused**. A key that was never
 * minted cannot be sitting in a GitHub Actions secret when a plan lapses, and
 * cannot be the thing someone finds in a log a year from now.
 */
export class NotEntitled extends Error {
  constructor(readonly plan: string, message: string) {
    super(message);
    this.name = "NotEntitled";
  }
}

export async function createApiKey(
  db: Db,
  orgId: string,
  options: {
    kind?: "upload" | "agent";
    label?: string;
    monthlyBudgetCredits?: number;
    ratePerMinute?: number;
    /**
     * The user who minted it, when a session made the request — §10.7 5A.10's
     * creator metadata. It is *audit*, never authority: the key belongs to the
     * organization, and it keeps working when this person leaves. Null for keys
     * minted by provisioning or by a script, which is honest rather than a gap.
     */
    createdBy?: string | null;
  } = {}
): Promise<CreatedKey> {
  const kind = options.kind ?? "upload";

  // Checked here as well as on every request, because these two checks protect
  // different things: this one keeps the credential from existing, and the
  // request-time one catches the plan that lapsed after it was minted. Neither
  // makes the other redundant — G2c calls for both, and says why: key existence
  // is never authorization.
  if (kind === "upload") {
    const limits = await planLimitsFor(db, orgId);
    if (!limits.canUpload) {
      throw new NotEntitled(
        limits.plan,
        `the ${limits.plan} plan cannot hold an upload key. The CLI is complete and local on this plan; ` +
          `subscribe to Normascope Cloud for hosted history and reports.`
      );
    }
  }

  const id = randomUUID();
  const plaintext = `nsk_${options.kind === "agent" ? "agent_" : ""}${randomBytes(24).toString("base64url")}`;
  await db.query(
    `INSERT INTO api_keys (id, org_id, key_hash, kind, label, monthly_budget_credits, rate_per_minute, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      orgId,
      hashKey(plaintext),
      kind,
      options.label ?? "",
      options.monthlyBudgetCredits ?? null,
      options.ratePerMinute ?? null,
      options.createdBy ?? null,
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

/** One row of the operator's key list. Deliberately without `key_hash`. */
export interface ApiKeySummary {
  id: string;
  org_id: string;
  org_name: string;
  kind: "upload" | "agent";
  label: string;
  monthly_budget_credits: number | null;
  rate_per_minute: number | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string;
  revoked_reason: string;
  /** Who minted it, when a session did. Display name, never the address. */
  created_by_name: string | null;
}

/**
 * Lists keys for the operator surface.
 *
 * **`key_hash` is not selected, and that is not squeamishness.** The hash is
 * the only stored form of the credential; a list that carries it puts it into a
 * server-rendered page, a React payload, and any log that captures either. The
 * plaintext is shown exactly once at creation and never again — this keeps that
 * true. Nothing on the revoke path needs it: revocation is by row id.
 */
export async function listApiKeys(db: Db, options: { orgId?: string; includeRevoked?: boolean } = {}): Promise<ApiKeySummary[]> {
  const conditions = ["1 = 1"];
  const params: unknown[] = [];
  if (options.orgId) {
    params.push(options.orgId);
    conditions.push(`k.org_id = $${params.length}`);
  }
  if (!options.includeRevoked) {
    conditions.push("k.revoked_at IS NULL");
  }
  const result = await db.query<ApiKeySummary>(
    `SELECT k.id, k.org_id, o.name AS org_name, k.kind, k.label,
            k.monthly_budget_credits, k.rate_per_minute,
            k.created_at, k.revoked_at, k.revoked_by, k.revoked_reason,
            c.display_name AS created_by_name
       FROM api_keys k
       JOIN orgs o ON o.id = k.org_id
       LEFT JOIN users c ON c.id = k.created_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY k.created_at DESC`,
    params
  );
  return result.rows;
}

/**
 * Withdraws a key, with a name against it.
 *
 * **It takes effect on the next request, not eventually.** `findApiKey` reads
 * the row and checks `revoked_at` on every call and there is no cache in front
 * of it, so there is no window in which a revoked key still authenticates.
 *
 * **What revocation does not reach:** presigned upload URLs already issued to
 * that key. They are bearer credentials signed by storage, valid for their
 * remaining TTL (two minutes), and nothing we hold can withdraw them. The
 * bytes they can still write are harmless — committing the run needs the key,
 * which no longer works, so the objects are never published and the abandoned
 * sweep deletes them. Worth knowing during an incident rather than discovering.
 *
 * Idempotent: revoking an already-revoked key keeps the original time, actor
 * and reason. The first answer to "who pulled this and why" is the true one,
 * and a second click must not overwrite it.
 */
export async function revokeApiKey(
  db: Db,
  id: string,
  options: {
    actor: string;
    reason?: string;
    /**
     * The organization this revocation is allowed to touch.
     *
     * **Required, with `null` meaning "any" — not defaulted to it.** A key id
     * reaches this function from a form in an admin's browser, and the id of a
     * row is not evidence of the right to withdraw it. Scoping the `UPDATE` is
     * what makes a copied id useless; making the field mandatory is what stops a
     * later caller from omitting it without noticing. `/admin` passes `null`
     * because it is the operator surface and revokes across tenants by design.
     */
    orgId: string | null;
  }
): Promise<{ revoked: boolean; alreadyRevoked: boolean }> {
  if (options.orgId === undefined) {
    // TypeScript already requires the field, so this catches the caller that is
    // not compiled — a test, a script, a REPL. Without it, `undefined` reaches
    // the query as a parameter that matches nothing: the revoke fails closed,
    // which is the right direction, but the error it produces is "no such API
    // key", which sends the reader looking for a missing row instead of a
    // missing argument.
    throw new Error("revokeApiKey needs an orgId — pass null for an operator-wide revocation");
  }
  const actor = options.actor.trim();
  if (actor.length === 0) {
    // The database enforces this too. Refusing here as well means the operator
    // gets a sentence rather than a constraint violation.
    throw new Error("revoking a key needs an actor — record who is withdrawing it");
  }
  const params: unknown[] = [id, actor, (options.reason ?? "").trim()];
  let scoped = "";
  if (options.orgId !== null) {
    params.push(options.orgId);
    scoped = ` AND org_id = $${params.length}`;
  }
  const result = await db.query<{ id: string }>(
    `UPDATE api_keys
        SET revoked_at = now(), revoked_by = $2, revoked_reason = $3
      WHERE id = $1 AND revoked_at IS NULL${scoped}
      RETURNING id`,
    params
  );
  if (result.rows.length > 0) {
    return { revoked: true, alreadyRevoked: false };
  }
  // The existence check is scoped too. Out of scope has to be indistinguishable
  // from absent, or the thrown "no such API key" becomes a way to ask whether an
  // id belongs to somebody else.
  const existsParams: unknown[] = [id];
  let existsScoped = "";
  if (options.orgId !== null) {
    existsParams.push(options.orgId);
    existsScoped = ` AND org_id = $${existsParams.length}`;
  }
  const exists = await db.query<{ id: string }>(
    `SELECT id FROM api_keys WHERE id = $1${existsScoped}`,
    existsParams
  );
  if (exists.rows.length === 0) {
    throw new Error(`no such API key: ${id}`);
  }
  return { revoked: false, alreadyRevoked: true };
}
