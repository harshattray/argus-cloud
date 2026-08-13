-- Request rate limiting — PATHWAYS.md Pathway 1 item 3 / §10.3 "1C".
--
-- `api_keys.rate_per_minute` has existed since 001 and was enforced by nothing.
-- This is where the count lives. It is in the database, not in process memory,
-- because the deployment target is serverless: a per-instance counter caps
-- nothing when the platform is free to run fifty instances.
--
-- One row per (scope, subject, minute). Two scopes:
--
--   key  — the per-key ceiling, `api_keys.rate_per_minute` or the default
--   org  — the per-organization ceiling, so an org cannot raise its own limit
--          simply by minting more keys
--
-- `allowed` counts requests that were let through; `rejected` counts the ones
-- turned away. They are separate columns on purpose: a rejected request must
-- not consume window budget, or a client retrying hard would hold itself out
-- past the end of the window it is already inside.
--
-- org_id is a real foreign key so an organization deletion takes its counters
-- with it (deletion-awareness, PATHWAYS §10.2 rule 6). For scope 'org',
-- subject_id equals org_id.
CREATE TABLE rate_limit_windows (
  scope        TEXT NOT NULL CHECK (scope IN ('org', 'key')),
  subject_id   TEXT NOT NULL,                  -- org id, or api key id
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,           -- truncated to the minute, UTC
  allowed      INTEGER NOT NULL DEFAULT 0 CHECK (allowed >= 0),
  rejected     INTEGER NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  PRIMARY KEY (scope, subject_id, window_start)
);

-- The operator view reads "what got turned away recently, and for whom".
CREATE INDEX rate_limit_windows_recent ON rate_limit_windows (window_start DESC);
CREATE INDEX rate_limit_windows_org ON rate_limit_windows (org_id, window_start DESC);
