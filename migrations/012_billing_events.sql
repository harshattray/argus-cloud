-- Merchant-of-record webhook intake — PATHWAYS.md Pathway 1 item 8 ("add the
-- reachable MoR webhook route and Paddle signature adapter") and §3 "Payment
-- failure safe state"; FUTURENORMA §3 ("grant credits only from an
-- idempotently verified payment webhook").
--
-- Two things this adds, both of which the payment path is unsafe without.

-- ---------------------------------------------------------------------------
-- Every event we were sent, and what we did about it
-- ---------------------------------------------------------------------------
--
-- The grant tables are already idempotent on `source_ref`, so a replayed
-- purchase cannot double-grant. That is not the same as being replay-safe.
-- Without a record of the event itself:
--
--   * a replayed *cancellation* has nothing to be idempotent against — it is a
--     state transition, not a grant, and applying it twice out of order can
--     revive or kill a subscription that has since moved on;
--   * an event that arrived and failed to process leaves no trace, so nobody
--     can tell "Paddle never sent it" from "we dropped it";
--   * the operator console's Revenue and reconciliation area (PATHWAYS
--     §"Control-plane information architecture") has no webhook state to show.
--
-- `event_id` is the primary key, so the second delivery of an event is
-- recognised before anything is applied. The raw body is **not** stored: it
-- carries customer names, addresses and card metadata we have no reason to
-- keep, and a webhook log is exactly the kind of table that gets exported into
-- a support ticket. The signature outcome, the type, and the org are enough to
-- answer every operational question.
--
-- `occurred_at` is the processor's own timestamp, not ours. Out-of-order
-- delivery is normal — an `updated` can land before the `created` it follows —
-- so state transitions compare against the last event *the processor* stamped
-- later, never against arrival order.
--
-- `claimed_org_id` carries no foreign key, and the name says why. It is the
-- organization the *event asserted* in `custom_data`, before anything checked
-- whether that org exists. A foreign key here would reject exactly the row
-- worth keeping — an event naming an org we have never heard of — and leave
-- the operator with an `unknown_org` outcome and no way to see which org was
-- named. A column called `org_id REFERENCES orgs` would also read to the next
-- person as a verified link, which this is not.
CREATE TABLE billing_events (
  event_id      TEXT PRIMARY KEY,
  provider      TEXT NOT NULL DEFAULT 'paddle',
  event_type    TEXT NOT NULL,
  claimed_org_id TEXT,
  occurred_at   TIMESTAMPTZ,
  -- processing | applied | ignored | stale | unknown_org | unknown_type |
  -- unknown_product | error. The row is claimed as `processing` before
  -- anything is applied and amended after, so a crash mid-apply leaves a
  -- visible record rather than a silent gap. A rejected signature is never
  -- recorded here: an unverified body is not evidence of anything, and writing
  -- it would let anyone fill this table.
  outcome       TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_events_recent ON billing_events (received_at DESC);
CREATE INDEX billing_events_org ON billing_events (claimed_org_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Subscription state as a state, not a boolean
-- ---------------------------------------------------------------------------
--
-- `orgs.plan` is `trial | team | lapsed` and nothing reads it. It cannot carry
-- what PATHWAYS §"Payment failure safe state" requires, which is explicitly
-- "explicit states rather than a boolean `paid` flag":
--
--   active     — hosted product and entitled AI available
--   past_due   — a charge failed; existing data stays, no new allowance
--   lapsed     — read-only; new uploads and hosted AI rejected politely
--   refunded   — entitlement revoked at the processor-confirmed time
--   none       — never subscribed
--
-- `subscription_status_at` is the *processor's* timestamp for the event that
-- set the status. A late-arriving older event is compared against it and
-- discarded, which is how out-of-order delivery stops being able to resurrect
-- a cancelled subscription.
--
-- Nothing here deletes data. Rule 4 of the safe payment-failure behaviour:
-- never delete reports, artifacts, users, repositories or audit history just
-- because a payment failed.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS subscription_status_at TIMESTAMPTZ;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS mor_subscription_id TEXT;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS mor_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orgs_mor_subscription ON orgs (mor_subscription_id)
  WHERE mor_subscription_id IS NOT NULL;

-- The subscription products, alongside the pack products already in `products`.
-- Priced from FUTURENORMA §3: one tier at launch, $59/month, 500 credits that
-- expire with the period so they cannot be hoarded.
CREATE TABLE subscription_products (
  id            TEXT PRIMARY KEY,               -- MoR price id
  monthly_credits INTEGER NOT NULL CHECK (monthly_credits > 0),
  price_microdollars BIGINT NOT NULL CHECK (price_microdollars >= 0),
  active        BOOLEAN NOT NULL DEFAULT true
);

-- A provisional slug, like the pack ids in 005. Remapped to the real Paddle
-- price id in a follow-up migration once the sandbox catalog exists — the
-- webhook looks products up by this id, so the remap is the whole of the
-- wiring.
INSERT INTO subscription_products (id, monthly_credits, price_microdollars, active) VALUES
  ('cloud_monthly', 500, 59000000, true);
