-- Artifact upload safety and storage quotas — PATHWAYS.md Pathway 2 items 4-6;
-- `BuildV5.md` Phase G2 ("presigned direct-to-R2 upload") and G2b ("upload
-- abuse controls").
--
-- What was missing. Migration 013 created `run_artifacts` for the *retention*
-- side of the story — deleting a run's objects safely. It was never shaped for
-- the *ingest* side, and ingest is the harder half: once a presigned URL is
-- issued the application is out of the byte path entirely. It cannot watch the
-- transfer, cannot cut it off, and cannot ask R2 to stop. Every limit has to be
-- either signed into the URL or reconciled afterwards against something the
-- client committed to in advance.
--
-- Two gaps, both of which make a size limit decorative:
--
-- 1. **One byte count, not two.** `bytes` records a single number, so there is
--    nowhere to put what the client *said* it would send as distinct from what
--    actually arrived. Without that pair there is nothing to compare at commit
--    time: a client declares 1 KB, uploads 200 MB, and the row it leaves behind
--    agrees with itself.
-- 2. **Nothing counts what an org has stored.** Quotas have to be checked
--    *before* a URL is signed, which means the running total must be a row we
--    can read and reserve against, not a SUM over artifacts computed after the
--    fact.

-- ---------------------------------------------------------------------------
-- run_artifacts — declared vs actual
-- ---------------------------------------------------------------------------
--
-- `bytes` keeps its meaning: what is really in storage, verified by a HEAD at
-- commit. `declared_bytes` is the claim made at declare time, before anything
-- was uploaded.
--
-- Deliberately *not* a rename of `bytes` to `actual_bytes`, which is what
-- `BuildV5.md` G2 describes. `retention.ts` selects `bytes` in three places, and
-- `db.ts` promises that a rollback deploy is a no-op — an older bundle starting
-- against this schema must still work. Renaming the column would break exactly
-- that guarantee for the sake of a nicer name.
ALTER TABLE run_artifacts ADD COLUMN declared_bytes BIGINT NOT NULL DEFAULT 0
  CHECK (declared_bytes >= 0);

-- Rows that predate this column have a delivery and no declaration, so the
-- constraint below would reject the table it is being added to. A committed
-- artifact is one whose bytes were already accepted; recording that it declared
-- what it delivered is the only reading that is true of it.
--
-- **`db.ts` forbids application data backfills in migrations, and this is the
-- narrow exception rather than a hole in the rule.** That rule is about work
-- needing progress and retry state — rewriting a large table on a cold-start
-- path. This is a new column's initial value, one bounded statement, and in
-- production it touches **nothing**: `run_artifacts` has no writer outside the
-- test suites, so every real database applies 015 against an empty table. It is
-- written anyway because "it happens to be empty" is not a property a migration
-- may rely on — the disposable test cluster is not empty, and that is exactly
-- where this was caught.
UPDATE run_artifacts SET declared_bytes = bytes WHERE state = 'committed';

-- The whole point of the pair. A committed artifact must weigh what it said it
-- would; the database refuses to hold the alternative, so no future code path
-- can record a verified upload over a size it never checked.
--
-- Only committed rows are constrained. A `pending` row is mid-flight: it has a
-- declaration and no delivery yet, and `bytes` is legitimately 0 until the
-- commit step HEADs the object.
ALTER TABLE run_artifacts ADD CONSTRAINT run_artifacts_committed_size
  CHECK (state <> 'committed' OR bytes = declared_bytes);

-- State and kind were comments in 013, not constraints. A comment claiming an
-- invariant is not the invariant.
--
-- `report` and `regions` come from Phase G2: the rendered HTML report, and the
-- diff-region coordinates that `summary.v2` flattens to a count. They travel as
-- an upload sidecar rather than widening the published JSON Schema.
ALTER TABLE run_artifacts ADD CONSTRAINT run_artifacts_state
  CHECK (state IN ('pending', 'committed'));
ALTER TABLE run_artifacts ADD CONSTRAINT run_artifacts_kind
  CHECK (kind IN ('build', 'reference', 'diff', 'summary', 'thumbnail', 'report', 'regions'));

-- One artifact of each kind per frame per run. Without this a client can
-- declare the same frame's build screenshot twice and reserve its bytes twice,
-- and the second commit silently overwrites the first's accounting.
--
-- Note this is *not* a uniqueness rule on `storage_key`: two runs sharing an
-- identical baseline still point at one object. That is the dedupe rule 013
-- describes, and it stays.
ALTER TABLE run_artifacts ADD CONSTRAINT run_artifacts_one_per_frame_kind
  UNIQUE (run_id, frame, kind);

-- The abandoned-upload sweeper's query: "which pending rows are older than 15
-- minutes?" Partial, because committed rows are the overwhelming majority and
-- none of them are ever the answer.
CREATE INDEX run_artifacts_pending ON run_artifacts (created_at) WHERE state = 'pending';

-- ---------------------------------------------------------------------------
-- org_storage — the running total, reservable before a URL is signed
-- ---------------------------------------------------------------------------
--
-- One row per org, created on first upload. Three counters, each answering a
-- question that must be answered *before* the application gives up control of
-- the byte path.
--
-- **Why `bytes_reserved` is separate from `bytes_stored`.** Between declare and
-- commit the bytes are promised but not present. Counting them as stored would
-- overcharge an org whose upload failed; ignoring them lets twenty concurrent
-- runs each pass the same quota check and collectively blow through it. The
-- reservation is released on commit (moved into `bytes_stored`), on failure, or
-- by the sweeper — the same reserve/settle/release shape `economicPath.ts` uses
-- for provider dollars, for the same reason.
--
-- **Why the day is stored beside the counter.** `runs_today` resets daily, and
-- a scheduled job to zero it is a job that can not run. Storing the day it
-- refers to makes the reset implicit: a counter whose `runs_day` is not today
-- reads as zero, so the reset happens by arithmetic rather than by cron.
CREATE TABLE org_storage (
  org_id         TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  bytes_stored   BIGINT NOT NULL DEFAULT 0 CHECK (bytes_stored >= 0),
  bytes_reserved BIGINT NOT NULL DEFAULT 0 CHECK (bytes_reserved >= 0),
  runs_today     INTEGER NOT NULL DEFAULT 0 CHECK (runs_today >= 0),
  runs_day       DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
