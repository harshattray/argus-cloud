-- A run is not queryable until it commits — `BuildV5.md` Phase G2 step 3;
-- PATHWAYS.md Pathway 2 items 4-5.
--
-- The three-phase upload is declare → transfer → commit. Between the first and
-- the third a run exists, has rows, and is a lie: its artifacts are promised and
-- not present. Without a state on the run itself there is nothing to hide it
-- behind, and a client that crashes after declaring leaves a report that renders
-- with missing images — which is worse than one that never appeared, because it
-- looks like data loss rather than an unfinished upload.
--
-- **The default is `pending`, and that direction is the point.** Existing rows
-- are backfilled to `committed` because they arrived through the summary-only
-- path and were complete on arrival. From here on, a code path that forgets to
-- commit produces an invisible run rather than a visible broken one. Failing
-- closed costs an upload; failing open shows a customer a report with holes in
-- it and no explanation.
--
-- `web/app/api/upload/route.ts` is updated in the same change to say
-- `'committed'` explicitly. It carries no artifacts, so there is nothing for it
-- to wait for — but it now has to say so rather than inherit it.
ALTER TABLE runs ADD COLUMN state TEXT NOT NULL DEFAULT 'committed';
UPDATE runs SET state = 'committed';
ALTER TABLE runs ALTER COLUMN state SET DEFAULT 'pending';
ALTER TABLE runs ADD CONSTRAINT runs_state CHECK (state IN ('pending', 'committed'));

-- Every read of a run list filters on this, and the pending ones are a small
-- minority that the sweeper wants by age.
CREATE INDEX runs_visible ON runs (org_id, created_at DESC) WHERE state = 'committed';
CREATE INDEX runs_pending ON runs (created_at) WHERE state = 'pending';

-- ---------------------------------------------------------------------------
-- The presigned-URL nonce, so a signature is single-use
-- ---------------------------------------------------------------------------
--
-- `storage.ts` already threads a nonce through `presignPut` and calls a
-- presigned URL what it is: a bearer credential, usable by whoever holds it with
-- no session and no further check. The nonce is what lets the protocol retire
-- one after a single use — but only if the used ones are written down somewhere,
-- which is here.
--
-- Kept on the artifact row rather than in a table of its own: the nonce has
-- exactly the lifetime of the artifact it was issued for, and a separate table
-- would need its own sweeper for no gain.
ALTER TABLE run_artifacts ADD COLUMN put_nonce TEXT NOT NULL DEFAULT '';
ALTER TABLE run_artifacts ADD COLUMN put_expires_at TIMESTAMPTZ;
