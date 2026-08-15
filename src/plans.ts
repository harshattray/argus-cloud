/**
 * Plan configuration — `BuildV5.md` Phase G2c ("plan config: config, not
 * code"); CLAUDE.md's capture test, which says plan limits are configuration
 * read at runtime so a second tier is a config row rather than an authorization
 * rewrite.
 *
 * **Why this is its own module rather than part of the upload path.** Limits are
 * not an upload concern: `retention_days` belongs to the deletion sweep, and a
 * later tier will carry credit allotments that belong to the ledger. Putting the
 * lookup here means those callers do not have to import the upload machinery to
 * ask what plan an organization is on — and, more to the point, that there is
 * one place the answer comes from. A second reader with its own copy of the
 * defaults is how the free tier eventually gains a limit nobody chose.
 */

import type { Db } from "./db.js";

export interface PlanLimits {
  plan: string;
  /** Entitlement, not a quota. Asked before any number is looked at. */
  canUpload: boolean;
  runsPerDay: number;
  artifactsPerRun: number;
  bytesPerRun: number;
  bytesStoredMax: number;
  retentionDays: number;
}

/**
 * An organization or a plan that provisioning should have created and did not.
 *
 * Loud on purpose. The tempting alternative — a LEFT JOIN and a default — turns
 * a provisioning bug into unlimited access, which is the one failure mode this
 * lookup must not have.
 */
export class PlanConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanConfigError";
  }
}

export async function planLimitsFor(db: Db, orgId: string): Promise<PlanLimits> {
  const org = await db.query<{ plan: string }>("SELECT plan FROM orgs WHERE id = $1", [orgId]);
  if (org.rows.length === 0) {
    throw new PlanConfigError(`no such organization: ${orgId}`);
  }
  return planLimitsForPlan(db, org.rows[0].plan);
}

export async function planLimitsForPlan(db: Db, plan: string): Promise<PlanLimits> {
  const limits = await db.query<{
    can_upload: boolean;
    runs_per_day: number;
    artifacts_per_run: number;
    bytes_per_run: string;
    bytes_stored_max: string;
    retention_days: number;
  }>(
    `SELECT can_upload, runs_per_day, artifacts_per_run, bytes_per_run, bytes_stored_max, retention_days
       FROM plan_limits WHERE plan = $1`,
    [plan]
  );
  if (limits.rows.length === 0) {
    throw new PlanConfigError(`plan '${plan}' has no limits row — provisioning is incomplete`);
  }
  const r = limits.rows[0];
  return {
    plan,
    canUpload: r.can_upload,
    runsPerDay: r.runs_per_day,
    artifactsPerRun: r.artifacts_per_run,
    // BIGINT arrives as a string from node-postgres. Number() is safe here and
    // would not be for money: 50GB is nowhere near 2^53, and these are byte
    // counts rather than fractional currency.
    bytesPerRun: Number(r.bytes_per_run),
    bytesStoredMax: Number(r.bytes_stored_max),
    retentionDays: r.retention_days,
  };
}
