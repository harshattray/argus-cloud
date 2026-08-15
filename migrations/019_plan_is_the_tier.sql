-- `plan` is the commercial tier; `subscription_status` owns the lifecycle.
-- PATHWAYS §"Payment failure safe state"; decision 2026-08-15.
--
-- Migration 016 gave `plan` three values — `free | team | lapsed` — following
-- the launch policy as written. That put `lapsed` in two columns at once, since
-- 012 already models it as one of five subscription states, and left the
-- question of which one owned it unanswered.
--
-- **The tie-breaker was that the duplicate was doing no work.** The `lapsed`
-- row in `plan_limits` differed from `free` on exactly one column,
-- `bytes_stored_max`, and that column is only read *after* the `can_upload`
-- gate — which both plans fail. So the single field distinguishing a lapsed
-- plan from a free one was never consulted. It read as a distinction and was
-- dead configuration.
--
-- After this:
--
--   plan                 what the organization bought      free | team
--   subscription_status  what state that purchase is in    active | past_due |
--                                                          lapsed | refunded | none
--
-- `plan_limits` stays keyed on `plan` alone, so an entitlement lookup is still
-- one row. Lapse becomes a status question, which is the only place it can
-- express `past_due` and `refunded` too — neither of which ever had anywhere to
-- live in a three-valued tier column.
--
-- **This is not Paddle-dependent.** Nothing reads `orgs.plan` for authorization
-- today and the webhook writes neither column's counterpart, so there is no
-- behaviour to preserve. Doing it now means the webhook, when it is written, is
-- written against the shape that survives rather than one it would have to
-- correct.

-- ---------------------------------------------------------------------------
-- Move any lapsed organization to the shape that describes it
-- ---------------------------------------------------------------------------
--
-- A lapsed organization *bought team*. That is the fact `plan` should carry;
-- the lapse is what happened to the subscription afterwards. Mapping it to
-- `free` would erase what they paid for and, on renewal, leave nothing to
-- restore them to.
--
-- No rows exist in production — `orgs` is empty there — so this is written for
-- correctness rather than for data. A migration that only works on an empty
-- table is not a migration.
UPDATE orgs
   SET plan = 'team',
       subscription_status = 'lapsed',
       subscription_status_at = COALESCE(subscription_status_at, now())
 WHERE plan = 'lapsed';

-- ---------------------------------------------------------------------------
-- Two values, in both places that name them
-- ---------------------------------------------------------------------------
ALTER TABLE orgs DROP CONSTRAINT IF EXISTS orgs_plan;
ALTER TABLE orgs ADD CONSTRAINT orgs_plan CHECK (plan IN ('free', 'team'));

-- The limits row goes with the value. Deleting it before the constraint change
-- so the table never violates the constraint it is about to acquire.
DELETE FROM plan_limits WHERE plan = 'lapsed';

ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;
ALTER TABLE plan_limits ADD CONSTRAINT plan_limits_plan CHECK (plan IN ('free', 'team'));

-- ---------------------------------------------------------------------------
-- The statuses that block new work
-- ---------------------------------------------------------------------------
--
-- Recorded in the schema rather than only in code, because the list is a policy
-- statement and PATHWAYS is where the policy lives:
--
--   active     work proceeds
--   past_due   work proceeds during grace — PATHWAYS is explicit that existing
--              reports, history and share links remain available and that new
--              paid work follows the configured grace policy. Blocking here
--              would turn a failed card into an outage.
--   none       never subscribed. Manual provisioning is the only path that
--              exists today, so blocking it would refuse every organization
--              created before Paddle.
--   lapsed     blocks new work; existing data stays readable
--   refunded   blocks new work; entitlement revoked at the processor's time
--
-- A CHECK cannot express "which of these may upload" — that belongs to the
-- code path that asks. This constraint only pins the vocabulary, so a typo
-- cannot invent a sixth state that nothing knows how to treat.
ALTER TABLE orgs ADD CONSTRAINT orgs_subscription_status
  CHECK (subscription_status IN ('active', 'past_due', 'lapsed', 'refunded', 'none'));

-- ---------------------------------------------------------------------------
-- The quota values are provisional
-- ---------------------------------------------------------------------------
--
-- Restated here because 016's seed is the only place they exist and nothing in
-- FUTURENORMA or PATHWAYS states them: 200 runs/day, 600 artifacts/run, 250 MB
-- per run, 50 GB stored came from `BuildV5.md` §G2c, which is implementation
-- detail and not authority. They are **launch assumptions pending traffic
-- data** (Harsha, 2026-08-15), deployed deliberately on the understanding that
-- changing one is an UPDATE against this table rather than a release.
COMMENT ON TABLE plan_limits IS
  'Per-plan entitlement and quotas. Values are launch assumptions pending real traffic (2026-08-15), not measurements; the dimensions are settled in PATHWAYS, the numbers are owed to FUTURENORMA section 3.';
