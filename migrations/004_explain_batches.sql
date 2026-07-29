-- Build 4.0 Phase D — CI auto-explain via the Message Batches API (D2).
-- A batch is enqueued with credits already reserved per frame; the collect
-- step meters at the 50% batch rate or refunds. Reservations are stored so a
-- crash between enqueue and collect can be reconciled (refund on expiry).
CREATE TABLE explain_batches (
  id            TEXT PRIMARY KEY,               -- provider batch id
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | collected
  entries       JSONB NOT NULL,                 -- per-frame: frame, cacheKey, model, credits, reservation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at  TIMESTAMPTZ
);
CREATE INDEX explain_batches_org ON explain_batches (org_id, status, created_at);
