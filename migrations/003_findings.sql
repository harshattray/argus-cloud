-- Build 4.0 Phase D — findings attached to runs. This is the substrate of the
-- hosted-only history moat: recurrence answers "did this region drift before
-- and what did we say about it then", which requires stored prior findings.
CREATE TABLE run_findings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  frame       TEXT NOT NULL,
  model       TEXT NOT NULL,
  findings    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX run_findings_frame ON run_findings (org_id, repo_id, frame, created_at);
