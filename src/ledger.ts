import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Credits ledger (Economics Doctrine rules 1, 4, 6).
 *
 * Prepaid only: grants are the sole way credits come into existence, the
 * org balance is computed from unexpired grants (never stored), and the
 * balance IS the org cap. Consumption is expiry-first inside a transaction;
 * every decrement is a conditional UPDATE guarded in the database, and the
 * remaining_credits >= 0 CHECK constraint makes a negative balance
 * impossible even under a bug.
 */

export type GrantKind = "plan_allotment" | "pack_purchase" | "goodwill";

export interface Grant {
  id: string;
  org_id: string;
  kind: GrantKind;
  credits: number;
  remaining_credits: number;
  expires_at: string;
}

export class InsufficientCreditsError extends Error {
  code = "insufficient_credits" as const;
  constructor(public balance: number, public needed: number) {
    super(`insufficient credits: balance ${balance}, needed ${needed}`);
  }
}

export interface GrantInput {
  orgId: string;
  kind: GrantKind;
  credits: number;
  expiresAt: Date;
  /** MoR webhook event id — makes the grant idempotent under retries. */
  sourceRef?: string;
  priceMicrodollars?: number;
}

/** Creates a grant. Returns null when sourceRef already granted (idempotent). */
export async function grantCredits(db: Db, input: GrantInput): Promise<string | null> {
  const id = randomUUID();
  const result = await db.query<{ id: string }>(
    `INSERT INTO credit_grants (id, org_id, kind, credits, remaining_credits, expires_at, source_ref, price_microdollars)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
     ON CONFLICT (source_ref) DO NOTHING
     RETURNING id`,
    [id, input.orgId, input.kind, input.credits, input.expiresAt.toISOString(), input.sourceRef ?? null, input.priceMicrodollars ?? 0]
  );
  return result.rows[0]?.id ?? null;
}

/** Computed balance: SUM(remaining) over unexpired grants. Never stored. */
export async function balance(db: Db, orgId: string, now: Date = new Date()): Promise<number> {
  const result = await db.query<{ total: string | number | null }>(
    "SELECT COALESCE(SUM(remaining_credits), 0) AS total FROM credit_grants WHERE org_id = $1 AND expires_at > $2",
    [orgId, now.toISOString()]
  );
  return Number(result.rows[0]?.total ?? 0);
}

export interface Consumption {
  grantId: string;
  amount: number;
}

/**
 * Consumes `amount` credits, earliest-expiring grants first, atomically.
 * Throws InsufficientCreditsError (transaction rolled back) when the org
 * can't cover it. Returns the per-grant consumption list so a failed
 * analysis can be refunded exactly (doctrine rule 6).
 */
export async function consumeCredits(
  db: Db,
  orgId: string,
  amount: number,
  now: Date = new Date()
): Promise<Consumption[]> {
  if (amount <= 0) {
    return [];
  }
  return db.transaction(async (tx) => {
    const grants = await tx.query<{ id: string; remaining_credits: number }>(
      `SELECT id, remaining_credits FROM credit_grants
       WHERE org_id = $1 AND expires_at > $2 AND remaining_credits > 0
       ORDER BY expires_at ASC, id ASC
       FOR UPDATE`,
      [orgId, now.toISOString()]
    );
    const consumed: Consumption[] = [];
    let left = amount;
    for (const grant of grants.rows) {
      if (left === 0) break;
      const take = Math.min(left, Number(grant.remaining_credits));
      const updated = await tx.query<{ id: string }>(
        `UPDATE credit_grants SET remaining_credits = remaining_credits - $1
         WHERE id = $2 AND remaining_credits >= $1
         RETURNING id`,
        [take, grant.id]
      );
      if (updated.rows.length === 0) {
        // Raced by a concurrent consumer between SELECT and UPDATE (possible
        // only without FOR UPDATE semantics); treat as unavailable.
        continue;
      }
      consumed.push({ grantId: grant.id, amount: take });
      left -= take;
    }
    if (left > 0) {
      // Roll back everything by throwing — the transaction wrapper aborts.
      const available = consumed.reduce((s, c) => s + c.amount, 0);
      throw new InsufficientCreditsError(available, amount);
    }
    return consumed;
  });
}

/** Refunds a prior consumption exactly (failed analyses cost nothing). */
export async function refundCredits(db: Db, consumed: Consumption[]): Promise<void> {
  for (const entry of consumed) {
    await db.query(
      "UPDATE credit_grants SET remaining_credits = remaining_credits + $1 WHERE id = $2",
      [entry.amount, entry.grantId]
    );
  }
}
