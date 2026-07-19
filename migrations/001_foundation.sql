-- Stage 4 substrate (BuildV3.5 item 1). Minimal columns Phase C needs are
-- present in full; UX-only columns can be added by later migrations.

CREATE TABLE orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'trial',   -- trial | team | lapsed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  github_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',  -- admin | member | designer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Keys are stored hashed (sha256 hex), shown once at creation, never logged.
-- kind 'agent' keys carry per-key explain budgets (Build 4.0 doctrine rule 8).
CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL DEFAULT 'upload',  -- upload | agent
  label         TEXT NOT NULL DEFAULT '',
  monthly_budget_credits INTEGER,                -- agent keys: NULL = org default
  rate_per_minute        INTEGER,                -- agent keys: NULL = default
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE repos (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  commit_sha  TEXT NOT NULL DEFAULT '',
  branch      TEXT NOT NULL DEFAULT '',
  summary     JSONB NOT NULL,                    -- verbatim summary.json
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE share_links (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-frame trend rows, mode/source/aligned columns from day one (spec).
CREATE TABLE frame_stats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  frame       TEXT NOT NULL,
  mode        TEXT NOT NULL,                     -- fidelity | baseline
  source      TEXT NOT NULL,                     -- figma | images | url | baseline
  aligned_mismatch_percent DOUBLE PRECISION,
  structural_similarity    DOUBLE PRECISION,
  flagged     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX frame_stats_trend ON frame_stats (org_id, repo_id, frame, created_at);
