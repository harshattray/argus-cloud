-- Retention and deletion (PATHWAYS.md Pathway 1 item 9 / §10.3 "1D" second
-- half; FUTURENORMA.md §5 "run/repo/org delete removes objects from storage as
-- well as rows; a 90-day sweep with a dry-run mode").

-- ---------------------------------------------------------------------------
-- run_artifacts — which stored objects belong to which run
-- ---------------------------------------------------------------------------
--
-- Until now nothing recorded it. Storage keys were derivable
-- (`org/{orgId}/blob/{sha256}.{ext}`) but not enumerable: given a run there was
-- no way to say which bytes were its own, so "delete this run" could not
-- delete anything from storage. A retention sweep without this table frees
-- rows and leaks every object forever.
--
-- §10.4 (Pathway 2) asks for `run_artifacts` "in a new append-only migration if
-- not already present" and owns the upload protocol that fills it. This is the
-- deletion half of the same table: the columns deletion needs, and no others.
-- Pathway 2 adds its own with a later migration.
--
-- **`storage_key` is not unique.** Blobs are content-addressed per org, so two
-- runs uploading identical bytes share one object — that is the dedupe rule in
-- `storage/keys.ts`, and it is why deleting a run may not simply delete its
-- objects. See `retention.ts`.
CREATE TABLE run_artifacts (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  frame       TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'build',   -- build | reference | diff | summary | thumbnail
  storage_key TEXT NOT NULL,
  sha256      TEXT NOT NULL DEFAULT '',
  bytes       BIGINT NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  state       TEXT NOT NULL DEFAULT 'committed',  -- pending | committed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Deletion walks a run's artifacts in id order (the resume cursor)…
CREATE INDEX run_artifacts_run ON run_artifacts (run_id, id);
-- …and asks "does any other row in this org still point at this object?"
-- before it deletes one. That question is the whole reason for this index.
CREATE INDEX run_artifacts_key ON run_artifacts (org_id, storage_key);

-- ---------------------------------------------------------------------------
-- deletion_jobs — resumable work, and the receipt afterwards
-- ---------------------------------------------------------------------------
--
-- §10.3 1D: "Add a resumable deletion job… Test retries, partial failure, and
-- idempotency." One row is both the unit of work and, once finished, the
-- record that the work happened — FUTURENORMA §5 requires a completion receipt
-- for a customer-initiated organization deletion.
--
-- **`org_id` deliberately has no foreign key.** Every other org-scoped table in
-- this schema cascades from `orgs`, which is what makes deletion a single
-- statement. A receipt that cascades away with its subject is not a receipt.
CREATE TABLE deletion_jobs (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL CHECK (scope IN ('run', 'repo', 'org', 'retention')),
  -- run id, repo id or org id. NULL for a retention sweep, which is not
  -- targeted at one thing.
  target_id    TEXT,
  org_id       TEXT,
  -- Fixed when the job is created, never recomputed. A sweep that resumed the
  -- next day and re-derived "90 days ago" would delete a different set of runs
  -- than the dry run reported.
  cutoff_at    TIMESTAMPTZ,
  dry_run      BOOLEAN NOT NULL DEFAULT false,
  state        TEXT NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'running', 'done', 'failed')),
  -- Resume point: the last id this job finished with. Advances only past work
  -- that actually completed, so a retry re-does the row that failed and not the
  -- ones before it.
  cursor       TEXT NOT NULL DEFAULT '',
  objects_deleted INTEGER NOT NULL DEFAULT 0 CHECK (objects_deleted >= 0),
  rows_deleted    INTEGER NOT NULL DEFAULT 0 CHECK (rows_deleted >= 0),
  bytes_deleted   BIGINT  NOT NULL DEFAULT 0 CHECK (bytes_deleted >= 0),
  -- What the org was worth to us, snapshotted before the cascade takes the
  -- usage and grant rows with it. See `retention.ts`; the open question it
  -- raises is recorded in FinishedSPEC §3j.
  financials   JSONB,
  -- How many times this job has been claimed. Not a failure count: a large
  -- deletion is claimed once per batch, and a receipt that called that ten
  -- "attempts" would read like ten things went wrong.
  claims       INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT NOT NULL DEFAULT '',
  claimed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX deletion_jobs_state ON deletion_jobs (state, created_at);
CREATE INDEX deletion_jobs_org ON deletion_jobs (org_id, created_at);
