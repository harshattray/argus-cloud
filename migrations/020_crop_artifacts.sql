-- Crops are an artifact kind, because the server must never decode a customer
-- image. BuildV5 G3; decision 2026-08-19.
--
-- BuildV5's G3 says the server fetches the uploaded build and reference PNGs
-- and crops the flagged regions itself. That was written before the sharp
-- decision on 2026-08-19: uploaded artifacts render as plain `<img>` from
-- presigned URLs precisely so customer bytes never reach libvips. Cropping on
-- the server is the same hazard with the worse payload — an attacker-supplied
-- PNG decoded inside our function rather than inside a browser sandbox.
--
-- So the crops are cut where the images already are and already decoded: in the
-- CLI, during `upload`, by the same code its local `explain` uses. They arrive
-- as one JSON sidecar per frame carrying base64 crops and the region rectangle
-- each came from. The server parses JSON, bounds it, and forwards the bytes.
--
-- **One sidecar per frame, not one artifact per crop.** `run_artifacts` already
-- holds UNIQUE (run_id, frame, kind) — one artifact of each kind per frame —
-- and that constraint is what stops a client declaring the same frame twice and
-- reserving its bytes twice (migration 015). A crop-per-row shape would have
-- needed that constraint relaxed to buy nothing: the crops for one frame are
-- always fetched together, always sent together, and are meaningless apart.
--
-- The kind list was already a CHECK rather than a comment (015), so adding a
-- kind is a migration. That is the constraint working.

ALTER TABLE run_artifacts DROP CONSTRAINT run_artifacts_kind;

ALTER TABLE run_artifacts ADD CONSTRAINT run_artifacts_kind
  CHECK (kind IN ('build', 'reference', 'diff', 'summary', 'thumbnail', 'report', 'regions', 'crops'));
