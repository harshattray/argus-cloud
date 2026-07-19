-- Build 4.0 Phase C — metered intelligence (Economics Doctrine).
-- Prepaid only: the balance IS the org cap, computed from grants, never stored.

-- Credit grants: plan allotments, pack purchases, goodwill. remaining_credits
-- is per-grant consumable state; org balance = SUM(remaining) of unexpired
-- grants. source_ref carries the MoR webhook event id — UNIQUE makes grant
-- creation idempotent under webhook retries.
CREATE TABLE credit_grants (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                   -- plan_allotment | pack_purchase | goodwill
  credits       INTEGER NOT NULL CHECK (credits > 0),
  remaining_credits INTEGER NOT NULL CHECK (remaining_credits >= 0),
  expires_at    TIMESTAMPTZ NOT NULL,            -- packs expire in 12 months (stated at purchase)
  source_ref    TEXT UNIQUE,                     -- MoR event id (NULL for goodwill/plan)
  price_microdollars BIGINT NOT NULL DEFAULT 0,  -- what the org paid (reconciliation)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_grants_org ON credit_grants (org_id, expires_at);

-- Append-only usage meter: every provider call, cache hit, and failure.
-- Tokens recorded with cache splits; computed cost in integer microdollars.
CREATE TABLE usage_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  api_key_id    TEXT REFERENCES api_keys(id),
  run_id        TEXT,
  frame         TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL,
  pass          TEXT NOT NULL,                   -- triage | analysis | deep
  interactive   BOOLEAN NOT NULL DEFAULT true,   -- false = Batches API
  auto          BOOLEAN NOT NULL DEFAULT false,  -- CI auto-explain (per-run cap applies)
  status        TEXT NOT NULL,                   -- charged | cache_hit | failed_no_charge | blocked_no_charge
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microdollars BIGINT NOT NULL DEFAULT 0,
  credits_charged   INTEGER NOT NULL DEFAULT 0,
  detail        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_org_time ON usage_events (org_id, created_at);
CREATE INDEX usage_events_key_time ON usage_events (api_key_id, created_at);

-- Result cache: hits are free, never decremented, never cross-org. The org_id
-- is in the key derivation AND the row, so a cross-tenant read is impossible
-- even under key collision.
CREATE TABLE result_cache (
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  cache_key     TEXT NOT NULL,                   -- sha256(org|frame|buildHash|designHash|model|promptVersion)
  findings      JSONB NOT NULL,
  model         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, cache_key)
);

-- Global circuit breaker: one row per UTC day accumulates provider spend.
-- Tripping pauses explain everywhere; the product (uploads/reports/diffs)
-- is unaffected.
CREATE TABLE provider_spend_days (
  day           DATE PRIMARY KEY,
  spend_microdollars BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE breaker_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  tripped_at    TIMESTAMPTZ,
  reason        TEXT NOT NULL DEFAULT ''
);
INSERT INTO breaker_state (id, tripped_at, reason) VALUES (1, NULL, '');

-- MoR products: pack definitions priced from calibration.md (Phase B).
CREATE TABLE products (
  id            TEXT PRIMARY KEY,               -- MoR product/price id
  credits       INTEGER NOT NULL,
  price_microdollars BIGINT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);
