-- Revenue attribution — PATHWAYS.md Pathway 1 item 7 / §10.3 "1B. Fix
-- reconciliation before selling credits"; FUTURENORMA §3 ("keep subscription
-- revenue, pack revenue, provider cost, payment fees, refunds, and goodwill
-- credits separate in reconciliation").
--
-- The bug this closes. `reconcile.ts` divided *all* provider spend in a month
-- by *pack* revenue alone. Two things were wrong with that and both point the
-- same way — margin looked worse than it is, so the alert that exists to stop
-- us selling a losing pack would have fired on a perfectly healthy month and
-- been learned to ignore.
--
--   1. Subscription revenue was not recorded anywhere. The $59/mo is the
--      larger half of the business and reconciliation could not see a cent of
--      it.
--   2. A usage event did not know which grant funded it. Cost from a monthly
--      allowance, a purchased pack and a goodwill credit all landed in one
--      total and were charged against pack revenue.
--
-- Three records fix it: what a subscription period was worth, what each
-- charge's credits were drawn from, and what the payment processor kept.

-- ---------------------------------------------------------------------------
-- What a subscription period was worth
-- ---------------------------------------------------------------------------
--
-- One row per organization per billing period. Written from a verified payment
-- webhook and nowhere else (FUTURENORMA §3: "grant credits only from an
-- idempotently verified payment webhook") — `source_ref` is that event's id,
-- and UNIQUE makes a webhook retry a no-op rather than a second month of
-- revenue.
--
-- **Revenue belongs to the month the period starts in, not pro-rated across
-- the two months a period usually spans.** The 500-credit allowance is granted
-- at period start and expires at period end, so the credits and the money that
-- bought them stay in the same bucket. Pro-rating the revenue while the credits
-- burn where they were granted would swing margin month to month for no
-- economic reason.
--
-- Refunds and chargebacks reduce revenue in place rather than deleting the
-- row: the ledger must stay append-only enough to explain itself later, and a
-- refunded period still cost us the provider dollars its credits bought.
CREATE TABLE subscription_periods (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  price_microdollars BIGINT NOT NULL CHECK (price_microdollars >= 0),
  refunded_microdollars BIGINT NOT NULL DEFAULT 0 CHECK (refunded_microdollars >= 0),
  -- What the merchant of record kept. `fee_recorded` exists because a $0 fee
  -- and an unknown fee are not the same number, and a margin report that
  -- silently treats "we have not been told yet" as "free" is the fabricated
  -- economics Doctrine 2 forbids. Paddle populates both at Step 7.
  fee_microdollars BIGINT NOT NULL DEFAULT 0 CHECK (fee_microdollars >= 0),
  fee_recorded  BOOLEAN NOT NULL DEFAULT false,
  source_ref    TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE INDEX subscription_periods_start ON subscription_periods (period_start);
CREATE INDEX subscription_periods_org ON subscription_periods (org_id, period_start);

-- The same two columns on pack purchases, for the same reason.
ALTER TABLE credit_grants ADD COLUMN IF NOT EXISTS refunded_microdollars BIGINT NOT NULL DEFAULT 0;
ALTER TABLE credit_grants ADD COLUMN IF NOT EXISTS fee_microdollars BIGINT NOT NULL DEFAULT 0;
ALTER TABLE credit_grants ADD COLUMN IF NOT EXISTS fee_recorded BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS credit_grants_kind_time ON credit_grants (kind, created_at);

-- ---------------------------------------------------------------------------
-- Which grant funded which charge
-- ---------------------------------------------------------------------------
--
-- `ledger.ts` consumes soonest-to-expire first, so one analysis can draw its
-- credits from two or three grants of different kinds. The split was computed,
-- used to decrement, returned to the caller for a possible refund — and then
-- thrown away. This table keeps it.
--
-- **The provider cost is stored per row, not derived at report time.** The
-- split of an event's cost across its funding grants is proportional to the
-- credits each supplied, which does not divide evenly; doing that arithmetic
-- inside the monthly query would make the report's totals depend on how the
-- rounding was written that day. Allocating once, at settlement, with the
-- remainder given to the largest share, makes the rows sum exactly to the
-- event's cost and the report a plain SUM ... GROUP BY. §10.3 1B: "the report
-- must be deterministic from append-only usage/grant records."
--
-- `grant_kind` is copied rather than joined. It is what the report groups by,
-- and a copy taken at charge time is the honest answer to "what funded this?"
-- even if the grant row is later reclassified.
--
-- Rows exist only for charges. A failed or refused analysis costs the customer
-- nothing (FUTURENORMA §3): `releaseBoth` refunds the credits and records a
-- `failed_no_charge` event, and no attribution row is ever written — so there
-- is no attribution to reverse. A reservation has exactly one terminal
-- transition, charged or refunded, and only the first writes here.
CREATE TABLE usage_credit_sources (
  usage_event_id BIGINT NOT NULL REFERENCES usage_events(id) ON DELETE CASCADE,
  grant_id       TEXT NOT NULL REFERENCES credit_grants(id) ON DELETE CASCADE,
  grant_kind     TEXT NOT NULL
                 CHECK (grant_kind IN ('plan_allotment', 'pack_purchase', 'goodwill')),
  credits        INTEGER NOT NULL CHECK (credits > 0),
  cost_microdollars BIGINT NOT NULL CHECK (cost_microdollars >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_event_id, grant_id)
);
CREATE INDEX usage_credit_sources_time ON usage_credit_sources (created_at, grant_kind);
