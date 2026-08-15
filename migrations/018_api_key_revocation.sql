-- Attributed API-key revocation — PATHWAYS Pathway 1 item 1 (API keys) and the
-- security posture in FUTURENORMA §5.
--
-- What was missing. `revokeApiKey` was written when the table was created and
-- has never had a caller: keys could be minted and never withdrawn, so a leaked
-- upload key could only be killed by someone with a psql prompt against
-- production. The mechanism worked — `findApiKey` filters on `revoked_at` on
-- every request, with no cache in front of it — and nothing exposed it.
--
-- Revocation is now attributed for the same reason a breaker reset is
-- (migration 010) and a restore rehearsal is (014): it is a claim that a person
-- made a decision, and a claim with no name against it is not evidence. When a
-- key is revoked during an incident, "who pulled it and why" is the first
-- question the review asks.
--
-- Self-declared for now. Behind the admin password there is no session and so
-- no identity to read; the operator types their name. That records who says
-- they made the call, which is worth having and is not authentication. Step 6's
-- session layer should take the actor from the session and stop trusting the
-- field — see `web/app/admin/limits/actions.ts`, which carries the same limit.
ALTER TABLE api_keys ADD COLUMN revoked_by TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN revoked_reason TEXT NOT NULL DEFAULT '';

-- A revoked key must name who revoked it. Existing rows are unaffected: none is
-- revoked, so the constraint is satisfied on arrival and only ever applies to
-- revocations made from here on.
ALTER TABLE api_keys ADD CONSTRAINT api_keys_revocation_attributed
  CHECK (revoked_at IS NULL OR length(trim(revoked_by)) > 0);

-- The operator surface lists an organization's keys newest first, and the
-- interesting ones are the live ones.
CREATE INDEX api_keys_by_org ON api_keys (org_id, created_at DESC);
CREATE INDEX api_keys_live ON api_keys (org_id, created_at DESC) WHERE revoked_at IS NULL;
