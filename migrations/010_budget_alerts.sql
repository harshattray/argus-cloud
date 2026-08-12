-- Budget alerts and breaker audit — PATHWAYS.md Pathway 1 item 6 / §10.3 "1C"
-- (second half); FUTURENORMA §3 ("alert at 50%, 75%, 90%, and 100%", "a 100%
-- trip stops new provider calls and needs a manual reset").
--
-- Three things were missing. A budget that is only visible at 100% gives the
-- operator no warning and no decision to make; a breaker that anyone can clear
-- silently is not a control; and a provider balance nobody tracks becomes the
-- limiting failure without notice.

-- ---------------------------------------------------------------------------
-- Which thresholds have already been announced
-- ---------------------------------------------------------------------------
--
-- One row per (scope, subject, period, threshold). The primary key is the whole
-- of the once-only guarantee: serverless runs many instances, so "have we sent
-- this yet?" cannot live in process memory, and two instances crossing 75% in
-- the same second must not page a human twice.
--
-- `period` re-arms the alerts. A new UTC day is a new period for the global
-- budget, a new month for an organization or key, a new funding record for the
-- provider balance — so yesterday's 90% alert never suppresses today's.
--
-- **Claim, then deliver.** A row is claimed *before* the message is sent, and
-- only the claimer sends — otherwise twenty instances all read "not delivered
-- yet" and all page a human. The claim carries `delivered_at` immediately, so
-- concurrent evaluations find nothing to claim.
--
-- The cost of claiming optimistically is a crash between the claim and the
-- send, which would lose the alert. `claimed_at` bounds that: a row still
-- undelivered after `ALERT_RETRY_AFTER_SECONDS` may be claimed again. A known
-- delivery failure does not wait — it records the error and re-arms the row at
-- once. `attempts` and `last_error` are what the operator page reads to tell an
-- alert channel that is broken from one that is quiet.
CREATE TABLE budget_alerts (
  scope        TEXT NOT NULL
               CHECK (scope IN ('global-day', 'org-month', 'key-month', 'provider-balance')),
  subject_id   TEXT NOT NULL,          -- 'global', an org id, a key id, or a funding id
  period       TEXT NOT NULL,          -- 'YYYY-MM-DD', 'YYYY-MM', or the funding id
  threshold    INTEGER NOT NULL CHECK (threshold IN (50, 75, 90, 100)),
  used_percent NUMERIC(8, 2) NOT NULL,
  limit_microdollars BIGINT NOT NULL CHECK (limit_microdollars >= 0),
  used_microdollars  BIGINT NOT NULL CHECK (used_microdollars >= 0),
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at   TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  PRIMARY KEY (scope, subject_id, period, threshold)
);

-- The operator view: newest first, and undelivered alerts specifically.
CREATE INDEX budget_alerts_recent ON budget_alerts (first_seen_at DESC);
CREATE INDEX budget_alerts_undelivered ON budget_alerts (first_seen_at DESC) WHERE delivered_at IS NULL;

-- ---------------------------------------------------------------------------
-- Every trip and every reset, with a name against it
-- ---------------------------------------------------------------------------
--
-- `breaker_state` holds one row and remembers only the current state, so the
-- reset that cleared a trip left no trace at all. Spend protection that a human
-- can clear invisibly is not a control — the record of who cleared it, when,
-- and why is the part that makes it one (PATHWAYS §10.3 1C: "an audited manual
-- reset").
--
-- Append-only. A trip is recorded by the system; a reset must name a person.
-- Both are enforced here rather than by convention: `actor` and `reason` cannot
-- be blank, so there is no code path that produces an anonymous reset.
CREATE TABLE breaker_events (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL CHECK (action IN ('tripped', 'reset')),
  actor      TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX breaker_events_recent ON breaker_events (created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- What we have actually funded the provider account with
-- ---------------------------------------------------------------------------
--
-- The launch funding policy is a small preloaded balance with auto-reload off
-- (FUTURENORMA §3, "Launch hard-stop policy"). That only works if someone is
-- told before it runs out — otherwise the external balance becomes the
-- limiting failure, and the first sign of it is a customer's failed analysis.
--
-- One row per funding event; the newest is the current balance. Consumption is
-- measured against `provider_spend_days` from `recorded_at` onward, so there is
-- no second ledger of what has been spent. With no row, there is no balance to
-- report — the status is null and nothing is alerted, rather than inventing a
-- figure (Doctrine 2).
CREATE TABLE provider_fundings (
  id          TEXT PRIMARY KEY,
  balance_microdollars BIGINT NOT NULL CHECK (balance_microdollars > 0),
  recorded_at TIMESTAMPTZ NOT NULL,
  actor       TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  note        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX provider_fundings_recent ON provider_fundings (recorded_at DESC);
