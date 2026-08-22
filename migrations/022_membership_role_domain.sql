-- `memberships.role` gets the constraint that migration 001 only described.
--
-- 001 wrote the domain in a comment:
--
--   role TEXT NOT NULL DEFAULT 'member',  -- admin | member | designer
--
-- and the column accepted anything. CLAUDE.md rule 1 is about exactly this: *a
-- comment claiming an invariant is not the invariant.* `invitations.role` and
-- every other role-like column in 021 carries a real CHECK; this one did not,
-- and the gap was found the way these are always found — by something breaking.
--
-- **What broke.** `scripts/dev-membership.mjs` wrote `role: 'owner'`, which is
-- not a role at all. §10.7 5A.5 and 021's own note are explicit: *"the owner is
-- also an `admin` membership, but ownership is a separate invariant from the
-- role"*, and it lives in `orgs.owner_user_id` because a role column cannot
-- express "exactly one". So every locally seeded owner held a role no
-- authorization path recognises. Nothing failed loudly. The organization
-- console simply refused them every area, including the ones an owner most
-- needs, and the reason was invisible — `hasRole(m, ['admin'])` is false for
-- `'owner'` and there is nothing in that answer that says why.
--
-- In production the value was never written, so this repairs a local hazard and
-- closes the hole that let it exist. The seed script now calls
-- `claimOwnership`, which sets the invariant *and* the admin membership in one
-- transaction, which is what it was always for.
--
-- The UPDATE runs first and is deliberately not conditional on the constraint
-- succeeding: a row that says `owner` means an admin who also owns the
-- organization, so `admin` is the honest translation and nothing is lost.
-- Ownership itself is not invented here — a row whose `owner_user_id` is null
-- stays null, because guessing which member is the owner is exactly the kind of
-- silent decision 5A.5 forbids.

UPDATE memberships SET role = 'admin' WHERE role NOT IN ('admin', 'member', 'designer');

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_domain CHECK (role IN ('admin', 'member', 'designer'));
