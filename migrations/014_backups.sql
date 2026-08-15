-- Backups, restore rehearsal, and operational alerts — PATHWAYS.md Pathway 1
-- item 10; §3 "Operations and recovery" ("maintain encrypted backups, tested
-- restores… alert on… provider failures, queue growth, storage growth, and data
-- deletion failures"); launch checklist "backup restore is rehearsed".
--
-- What was missing. Every spend and deletion control built in items 1–9 assumes
-- the database is there. Nothing recorded whether a backup had ever been taken,
-- nobody had ever restored one, and the only operational alert in the product
-- was about money. A backup that has never been restored is a belief, not a
-- backup — so the rehearsal gets a table of its own, with the same weight as the
-- backup itself.

-- ---------------------------------------------------------------------------
-- backups — one row per dump attempt, successful or not
-- ---------------------------------------------------------------------------
--
-- The row is written *before* the dump starts and finished afterwards, so a
-- process that dies mid-dump leaves a `running` row that has aged rather than
-- no evidence at all. "No backup last night" and "the backup crashed last
-- night" are different incidents and an operator should be able to tell them
-- apart.
--
-- `manifest` is what the database held when the dump was taken: one row count
-- per table, taken inside the same statement batch. It is the only thing a
-- restore can be checked *against* — without it, a rehearsal can prove the
-- restore ran but not that it brought the data back.
--
-- Nothing here stores bytes. The dump goes through the storage port
-- (`src/storage.ts`), encrypted, and `storage_key` is where it landed.
CREATE TABLE backups (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'pg_dump' CHECK (kind IN ('pg_dump')),
  storage_key TEXT NOT NULL DEFAULT '',
  bytes       BIGINT NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  -- Of the stored (encrypted) object, so a rehearsal can prove it read back the
  -- bytes that were written before it trusts anything inside them.
  sha256      TEXT NOT NULL DEFAULT '',
  encrypted   BOOLEAN NOT NULL DEFAULT false,
  state       TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'done', 'failed')),
  manifest    JSONB,
  actor       TEXT NOT NULL DEFAULT 'system' CHECK (length(trim(actor)) > 0),
  last_error  TEXT NOT NULL DEFAULT '',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  -- A finished backup must say where it went; a running one must not claim to.
  CHECK (state <> 'done' OR (finished_at IS NOT NULL AND length(storage_key) > 0 AND bytes > 0))
);

-- "When did the last good backup finish?" — the question the staleness alert
-- asks on every ops check.
CREATE INDEX backups_recent ON backups (started_at DESC);
CREATE INDEX backups_done ON backups (finished_at DESC) WHERE state = 'done';

-- ---------------------------------------------------------------------------
-- restore_rehearsals — evidence that a backup was actually restored
-- ---------------------------------------------------------------------------
--
-- The launch gate is "backup restore is rehearsed", not "backups exist". A
-- rehearsal restores a real dump into a scratch database and compares every
-- table's row count against the manifest recorded when the dump was taken.
--
-- `mismatches` is the whole verdict: `[]` is a pass, and any element names a
-- table, what the manifest said, and what came back. Storing the disagreement
-- rather than a boolean means a failed rehearsal is diagnosable a month later.
--
-- `actor` cannot be blank for the same reason a breaker reset cannot: the
-- rehearsal is a claim that someone checked, and a claim with no name against it
-- is not evidence. A scheduled run names the schedule.
--
-- No cascade from `backups`. The rehearsal is the record that the restore
-- happened; deleting the backup row must not silently take the evidence with it.
CREATE TABLE restore_rehearsals (
  id             TEXT PRIMARY KEY,
  backup_id      TEXT NOT NULL REFERENCES backups(id),
  state          TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'passed', 'failed')),
  tables_checked INTEGER NOT NULL DEFAULT 0 CHECK (tables_checked >= 0),
  rows_checked   BIGINT  NOT NULL DEFAULT 0 CHECK (rows_checked >= 0),
  mismatches     JSONB,
  restore_seconds NUMERIC(10, 2),
  actor          TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  note           TEXT NOT NULL DEFAULT '',
  last_error     TEXT NOT NULL DEFAULT '',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  -- A pass means every table agreed. The database enforces it so no script can
  -- record a green rehearsal over a list of disagreements.
  CHECK (state <> 'passed' OR (finished_at IS NOT NULL AND mismatches = '[]'::jsonb))
);

CREATE INDEX restore_rehearsals_recent ON restore_rehearsals (started_at DESC);
CREATE INDEX restore_rehearsals_passed ON restore_rehearsals (finished_at DESC) WHERE state = 'passed';

-- ---------------------------------------------------------------------------
-- ops_alerts — operational alerts that are not about money
-- ---------------------------------------------------------------------------
--
-- `budget_alerts` (migration 010) covers spend. This covers the rest of §3
-- "Operations and recovery": a missing or failed backup, a stale rehearsal, a
-- deletion job that failed, a breaker left tripped, provider reservations
-- leaking from workers that vanished, and a budget alert channel that is
-- itself broken.
--
-- Same guarantee, same shape, same reasons — the primary key is the once-only
-- promise, `period` is what re-arms it, and a row is claimed before the message
-- is sent so twenty serverless instances noticing the same problem page one
-- human. See `src/opsAlerts.ts` for why this is a second table rather than a
-- second use of `budget_alerts`: nothing here has a threshold, a limit, or a
-- percentage, and widening that table's CHECK constraints to hold both would
-- have made every column optional for one of the two.
--
-- `period` differs by signal on purpose. A staleness alert uses the UTC day, so
-- it repeats daily until someone fixes it. A failure alert uses the id of the
-- thing that failed, so a *second* failure alerts again and a re-check of the
-- same one stays quiet.
CREATE TABLE ops_alerts (
  kind         TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  period       TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  detail       TEXT NOT NULL DEFAULT '',
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error   TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at   TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  PRIMARY KEY (kind, subject_id, period)
);

CREATE INDEX ops_alerts_recent ON ops_alerts (first_seen_at DESC);
CREATE INDEX ops_alerts_undelivered ON ops_alerts (first_seen_at DESC) WHERE delivered_at IS NULL;
