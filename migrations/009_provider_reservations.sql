-- Provider-dollar reservations — PATHWAYS.md §10.3 "1B.1"; FUTURENORMA
-- Doctrine 11 ("economic loss firewall").
--
-- The problem this closes: `provider_spend_days` records what a call cost
-- *after* it returns, and the breaker reads that total. Ten requests arriving
-- together all read the same pre-call total, all decide there is room, and all
-- call the provider. The cap is discovered, not enforced.
--
-- A reservation is money set aside *before* the call, sized to the worst the
-- call could possibly cost. Authorization asks: already-recorded spend, plus
-- everything currently reserved, plus this request's maximum — does that still
-- fit the budget? Concurrency stops mattering, because a reservation is visible
-- to the next request the moment it is written.
--
-- State machine. `reserved` is the only non-terminal state, and exactly one
-- terminal transition is legal:
--
--     reserved → settled    the call happened; actual_microdollars is real spend
--     reserved → released   the call did not happen, or failed; nothing spent
--     reserved → expired    the worker vanished; swept, never becomes permission
--
-- Every transition is a conditional UPDATE guarded on `state = 'reserved'`, so
-- a retry finds nothing to update and returns the existing outcome instead of
-- charging twice. That is the whole of the idempotency argument.
CREATE TABLE provider_reservations (
  id            TEXT PRIMARY KEY,               -- caller-supplied; the idempotency key
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  api_key_id    TEXT REFERENCES api_keys(id),
  model         TEXT NOT NULL,
  pass          TEXT NOT NULL,                  -- analysis | deep
  batch         BOOLEAN NOT NULL DEFAULT false,
  max_microdollars    BIGINT NOT NULL CHECK (max_microdollars >= 0),
  actual_microdollars BIGINT,                   -- NULL until settled
  state         TEXT NOT NULL DEFAULT 'reserved'
                CHECK (state IN ('reserved', 'settled', 'released', 'expired')),
  day           DATE NOT NULL,                  -- UTC day, the global budget scope
  month         TEXT NOT NULL,                  -- 'YYYY-MM', the org/key budget scope
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  settled_at    TIMESTAMPTZ,
  -- A settled reservation must carry its real cost, and an unsettled one must
  -- not. Enforced here so no code path can produce a half-settled row.
  CHECK ((state = 'settled') = (actual_microdollars IS NOT NULL))
);

-- The three authorization queries: outstanding by day, by org month, by key month.
CREATE INDEX provider_reservations_day ON provider_reservations (day) WHERE state = 'reserved';
CREATE INDEX provider_reservations_org ON provider_reservations (org_id, month);
CREATE INDEX provider_reservations_key ON provider_reservations (api_key_id, month);
-- The sweeper.
CREATE INDEX provider_reservations_expiry ON provider_reservations (expires_at) WHERE state = 'reserved';
