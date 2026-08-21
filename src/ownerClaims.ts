import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { normaliseAddress } from "./authCrypto.js";
import { claimOwnership } from "./users.js";

/**
 * How an organization gets its first human — PATHWAYS §10.7 5A.5.
 *
 * The sequence, and every arrow in it is a rule rather than a convenience:
 *
 *     Paddle checkout
 *       → verified subscription webhook
 *       → organization + plan + subscription state
 *       → pending owner claim tied to the checkout identity
 *       → owner authenticates with GitHub or a magic link
 *       → the claim is consumed atomically
 *       → owner/admin session opens the organization console
 *
 * **The checkout email is not a session.** Paying proves someone controls a
 * payment method, not that the browser in front of us belongs to them. So the
 * webhook creates a *claim*, and the claim is redeemed by an ordinary sign-in —
 * a magic link to that address, or a GitHub account whose **verified** address
 * matches it. Nothing is put in a URL and there is no second bearer secret.
 *
 * **Until it is claimed, the organization has no human access.** It holds its
 * plan and its credits and nobody can open it. That is deliberate: a failure
 * between payment and claim is an operational alert and a retryable claim
 * email, never a second checkout.
 */

export interface OwnerClaim {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  checkoutReference: string;
  state: "pending" | "claimed" | "expired" | "cancelled";
  createdAt: string;
  expiresAt: string | null;
}

const SELECT_CLAIM = `SELECT c.id, c.org_id, o.name AS org_name, c.email, c.checkout_reference, c.state,
                             c.created_at, c.expires_at
                        FROM owner_claims c JOIN orgs o ON o.id = c.org_id`;

function toClaim(row: Record<string, unknown>): OwnerClaim {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    orgName: String(row.org_name),
    email: String(row.email),
    checkoutReference: String(row.checkout_reference),
    state: row.state as OwnerClaim["state"],
    createdAt: new Date(row.created_at as string).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
  };
}

/**
 * Records that an organization is waiting for its purchaser.
 *
 * **Idempotent on `checkout_reference`**, which is the processor's own
 * customer/subscription id. A retried webhook — and processors do retry — must
 * find the row it already wrote rather than create a second organization
 * (§10.7 5A.5, first rule). The `UNIQUE` constraint on that column is what makes
 * this true under concurrency; the `ON CONFLICT` below is what makes it quiet.
 *
 * **No expiry by default.** A claim that timed out would leave a paid tenant
 * that nobody can open, and the operator's fix would be to create another one.
 * An expiry can be set where a policy calls for it; the absence of one is a
 * decision, not an oversight.
 */
export async function createOwnerClaim(
  db: Db,
  input: { orgId: string; email: string; checkoutReference: string; expiresAt?: Date }
): Promise<OwnerClaim> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO owner_claims (id, org_id, email, checkout_reference, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (checkout_reference) DO NOTHING`,
    [id, input.orgId, normaliseAddress(input.email), input.checkoutReference, input.expiresAt?.toISOString() ?? null]
  );
  const rows = await db.query<Record<string, unknown>>(`${SELECT_CLAIM} WHERE c.checkout_reference = $1`, [
    input.checkoutReference,
  ]);
  return toClaim(rows.rows[0]);
}

/** A live claim for this address, if there is one. */
export async function pendingClaimFor(db: Db, email: string, now: Date = new Date()): Promise<OwnerClaim | null> {
  const rows = await db.query<Record<string, unknown>>(
    `${SELECT_CLAIM} WHERE c.email = $1 AND c.state = 'pending' AND (c.expires_at IS NULL OR c.expires_at > $2)
      ORDER BY c.created_at LIMIT 1`,
    [normaliseAddress(email), now.toISOString()]
  );
  return rows.rows[0] ? toClaim(rows.rows[0]) : null;
}

export type ClaimFailure = "unknown" | "already-claimed" | "expired" | "wrong-identity" | "already-owned";

/**
 * Hands the organization to the person who has just proved they control the
 * checkout address.
 *
 * Two conditional updates, one transaction. The claim moves `pending →
 * claimed` only if it is still pending, and ownership is installed only if the
 * organization still has no owner. Two tabs, two devices, or a retried OAuth
 * callback therefore produce **one** owner and one membership; the loser is
 * told the organization is already claimed rather than silently succeeding.
 */
export async function consumeOwnerClaim(
  db: Db,
  input: { claimId: string; userId: string; userEmail: string },
  options: { now?: Date } = {}
): Promise<{ ok: true; orgId: string } | { ok: false; failure: ClaimFailure }> {
  const now = options.now ?? new Date();
  const rows = await db.query<{ org_id: string; email: string; state: string; expires_at: string | null }>(
    "SELECT org_id, email, state, expires_at FROM owner_claims WHERE id = $1",
    [input.claimId]
  );
  const claim = rows.rows[0];
  if (!claim) {
    return { ok: false, failure: "unknown" };
  }
  if (claim.state !== "pending") {
    return { ok: false, failure: "already-claimed" };
  }
  if (claim.expires_at && new Date(claim.expires_at).getTime() <= now.getTime()) {
    return { ok: false, failure: "expired" };
  }
  if (claim.email !== normaliseAddress(input.userEmail)) {
    return { ok: false, failure: "wrong-identity" };
  }

  const claimed = await db.query<{ id: string }>(
    `UPDATE owner_claims SET state = 'claimed', claimed_at = $2, claimed_user = $3
      WHERE id = $1 AND state = 'pending' RETURNING id`,
    [input.claimId, now.toISOString(), input.userId]
  );
  if (claimed.rows.length === 0) {
    return { ok: false, failure: "already-claimed" };
  }

  const installed = await claimOwnership(db, claim.org_id, input.userId);
  if (!installed) {
    // The claim row is spent but the organization already had an owner. That is
    // a real inconsistency rather than a race we can paper over, so it is
    // reported as such — the operator console shows it and a human decides.
    return { ok: false, failure: "already-owned" };
  }
  return { ok: true, orgId: claim.org_id };
}

/** Organizations that were paid for and never opened. An operator surface. */
export async function unclaimedOrganizations(db: Db): Promise<OwnerClaim[]> {
  const rows = await db.query<Record<string, unknown>>(
    `${SELECT_CLAIM} WHERE c.state = 'pending' ORDER BY c.created_at`
  );
  return rows.rows.map(toClaim);
}
