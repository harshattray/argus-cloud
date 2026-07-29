-- Build 4.0 — credit packs priced from docs/calibration.md (Phase B measured,
-- 2026-07-29). Floor rule: pack price ≥ 3× measured blended COGS, computed at
-- POST-INTRO list prices (worst case: $0.0164/review) so no pack can lose
-- money when Sonnet 5 intro pricing ends 2026-08-31.
--
-- ids are provisional slugs; when the MoR (Paddle vs Lemon Squeezy) sandbox
-- is chosen, remap to the MoR product ids in a follow-up migration — the
-- webhook grant path looks products up by this id.
INSERT INTO products (id, credits, price_microdollars, active) VALUES
  ('pack_50',   50,   3000000,  true),   -- $3  (floor $2.46)
  ('pack_200',  200,  12000000, true),   -- $12 (floor $9.86)
  ('pack_1000', 1000, 60000000, true);   -- $60 (floor $49.29)
