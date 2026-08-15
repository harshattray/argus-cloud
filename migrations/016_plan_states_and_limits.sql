-- Plan states and plan limits — `BuildV5.md` Phase G2c ("upload is a paid
-- entitlement", "plan config: config, not code"); FUTURENORMA §3 (one paid tier
-- at launch) and CLAUDE.md's capture test ("plan limits are configuration read
-- at runtime, so a second tier is a config row rather than an authorization
-- rewrite").
--
-- Two things, both of which the documentation already decided.
--
-- **The trial was abolished on 2026-08-03** and the schema never heard about
-- it. `migrations/001` still defaults a new organization to `'trial'`, a state
-- that no longer exists in the product. G2c is explicit that `plan` becomes
-- `free | team | lapsed` and that 001's default becomes `'free'` in a new
-- migration rather than an edit to 001.
--
-- **Plan limits have never existed anywhere.** `retention.ts:54` says the
-- second tier "is meant to be a config row, not a code change" and that its
-- constant is the only value "until that exists". This is that row.

-- ---------------------------------------------------------------------------
-- orgs.plan — the tier, with the abolished state removed
-- ---------------------------------------------------------------------------
--
-- Ordered deliberately: move the rows off `trial` first, then change the
-- default, then constrain. Constraining first would reject the table it is
-- being added to, which is the same mistake 015 made and the real-Postgres run
-- caught.
--
-- Nothing reads `orgs.plan` today (migration 012 says so, and it is still
-- true), so this rewrites no behaviour. It removes a value that would otherwise
-- be waiting to surprise the first code that does read it.
UPDATE orgs SET plan = 'free' WHERE plan = 'trial';
ALTER TABLE orgs ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE orgs ADD CONSTRAINT orgs_plan CHECK (plan IN ('free', 'team', 'lapsed'));

-- ---------------------------------------------------------------------------
-- plan_limits — one row per plan, read at runtime
-- ---------------------------------------------------------------------------
--
-- **Why a table and not a constant.** A ladder above the single launch tier is
-- expected after the first 5-10 paying organizations. If limits live in code,
-- adding a tier is an authorization change with a deploy behind it; if they
-- live here, it is an INSERT. That is the whole point of the capture test's
-- note on plan limits, and it is cheaper to honour now than to retrofit.
--
-- **`can_upload` is not a quota.** G2c is explicit that entitlement and quota
-- are different questions: entitlement decides whether an organization may send
-- anything at all, quota shapes how much an entitled one may send. A free plan
-- is not "a team plan with the limits set to zero" — it is a plan that cannot
-- hold an upload credential in the first place. Keeping the boolean separate
-- means a future limit change can never accidentally grant upload.
--
-- **The numbers are policy starting points, not measurements.** G2c says so
-- plainly, and Doctrine's "never fabricate economics" cuts both ways: these are
-- limits to tune against real traffic, and nothing may present them as derived
-- from anything. The one figure that is not a guess is `retention_days`, which
-- matches the 90 days already promised in the plan contract.
CREATE TABLE plan_limits (
  plan              TEXT PRIMARY KEY CHECK (plan IN ('free', 'team', 'lapsed')),
  can_upload        BOOLEAN NOT NULL DEFAULT false,
  runs_per_day      INTEGER NOT NULL DEFAULT 0 CHECK (runs_per_day >= 0),
  artifacts_per_run INTEGER NOT NULL DEFAULT 0 CHECK (artifacts_per_run >= 0),
  bytes_per_run     BIGINT  NOT NULL DEFAULT 0 CHECK (bytes_per_run >= 0),
  bytes_stored_max  BIGINT  NOT NULL DEFAULT 0 CHECK (bytes_stored_max >= 0),
  retention_days    INTEGER NOT NULL DEFAULT 90 CHECK (retention_days > 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seeded here rather than by a job, because a plan with no limits row is an
-- organization with no answer to "may this upload?" — and the safe answer to
-- that question at 3am is not one anybody should have to derive from an absent
-- row. All three plans exist from the first boot.
--
-- free   — the entire CLI, forever, and nothing leaves the machine. Doctrine 5:
--          this is the free tier's selling point, not a withheld feature.
-- team   — the single paid tier at launch, $59/mo.
-- lapsed — reads everything it already uploaded, adds nothing. The standing
--          rule: rejected politely, CI stays green, nothing is deleted. Its
--          retention runs 90 days from the lapse.
INSERT INTO plan_limits (plan, can_upload, runs_per_day, artifacts_per_run, bytes_per_run, bytes_stored_max, retention_days)
VALUES
  ('free',   false,   0,   0,          0,           0, 90),
  ('team',   true,  200, 600,  262144000, 53687091200, 90),
  ('lapsed', false,   0,   0,          0, 53687091200, 90);
