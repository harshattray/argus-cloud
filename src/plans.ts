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

/**
 * Statuses that block new paid work.
 *
 * `past_due` is deliberately absent: PATHWAYS' payment-failure table says
 * existing reports, history and share links stay available during grace and
 * that new work follows the grace policy — blocking on a failed card would turn
 * a billing hiccup into an outage. `none` is absent because manual
 * provisioning is the only path that exists before Paddle, so blocking it would
 * refuse every organization created so far.
 */
export const BLOCKING_STATUSES = ["lapsed", "refunded"] as const;

export interface PlanLimits {
  plan: string;
  /** `active | past_due | lapsed | refunded | none` — the lifecycle, from migration 012. */
  subscriptionStatus: string;
  /**
   * Entitled *and* in a state that permits work.
   *
   * Two questions, deliberately answered together, because the upload path
   * needs one answer and asking it in two places is how they drift. `canUpload`
   * below is the plan's own entitlement; this is that plus the lifecycle.
   */
  uploadAllowed: boolean;
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

/**
 * An organization's plan and lifecycle, without its limits.
 *
 * **What the console chrome asks, and it must not be able to fail the way the
 * full lookup can.** `planLimitsFor` below throws when a plan has no
 * `plan_limits` row, which is right for an entitlement decision and wrong for a
 * label in a masthead: a provisioning gap would take down every console page,
 * including the billing page somebody would go to about it. These two columns
 * live on `orgs` and are always present, so this cannot throw for that reason.
 *
 * It is also the first half of `planLimitsFor`, rather than a second copy of
 * the same SELECT.
 */
export interface OrgPlanState {
  plan: string;
  subscriptionStatus: string;
}

export async function orgPlanState(db: Db, orgId: string): Promise<OrgPlanState> {
  const org = await db.query<{ plan: string; subscription_status: string }>(
    "SELECT plan, subscription_status FROM orgs WHERE id = $1",
    [orgId]
  );
  if (org.rows.length === 0) {
    throw new PlanConfigError(`no such organization: ${orgId}`);
  }
  return { plan: org.rows[0].plan, subscriptionStatus: org.rows[0].subscription_status };
}

export async function planLimitsFor(db: Db, orgId: string): Promise<PlanLimits> {
  const state = await orgPlanState(db, orgId);
  const limits = await planLimitsForPlan(db, state.plan);
  return withStatus(limits, state.subscriptionStatus);
}

/**
 * Folds the lifecycle into the plan's entitlement.
 *
 * **Until migration 019 nothing outside `webhooks.ts` read `subscription_status`
 * at all.** The webhook wrote it and no authorization path asked, so an
 * organization whose subscription lapsed kept uploading — the entitlement check
 * consulted a column no billing event touched. That gap existed whichever
 * column held `lapsed`; moving it here is what closes it.
 */
export function withStatus(limits: PlanLimits, subscriptionStatus: string): PlanLimits {
  const blocked = (BLOCKING_STATUSES as readonly string[]).includes(subscriptionStatus);
  return { ...limits, subscriptionStatus, uploadAllowed: limits.canUpload && !blocked };
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
    // Overwritten by `withStatus` when looked up per organization. A plan on
    // its own has no lifecycle, and defaulting to permissive here would mean a
    // caller that forgot the organization got a yes.
    subscriptionStatus: "none",
    uploadAllowed: r.can_upload,
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
