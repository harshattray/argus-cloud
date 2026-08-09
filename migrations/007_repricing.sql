-- Repricing, 2026-08-05. Decisions recorded in docs/FUTURENORMA.md §3 and §10.
--
-- 1. Subscription is $59/mo (was $29). Single tier, no ladder, no trial.
-- 2. pack_50 ($3) retired: Paddle's flat $0.50 fee left it at ~51% margin,
--    the worst of the three. pack_100 ($7) replaces it as the entry pack.
-- 3. Floor rule unchanged: pack price >= 3x measured blended COGS at
--    POST-INTRO list prices ($0.0164/analysis), so no pack can lose money
--    when Sonnet 5 intro pricing ends 2026-08-31.
--
-- Unit economics at list COGS, after Paddle (5% + $0.50):
--   pack_100  $7  -> fee $0.85, COGS $1.64, keep $4.51  (64%)  $0.070/credit
--   pack_200  $12 -> fee $1.10, COGS $3.28, keep $7.62  (64%)  $0.060/credit
--   pack_1000 $55 -> fee $3.25, COGS $16.40, keep $35.35 (64%) $0.055/credit
-- pack_1000 drops $60 -> $55 so the ladder actually rewards volume; at the old
-- price it matched pack_200's unit rate and gave nobody a reason to size up.
--
-- ids stay provisional slugs; remap to real MoR product ids once the Paddle
-- sandbox catalog exists (the webhook grant path looks products up by this id).

UPDATE products SET active = false WHERE id = 'pack_50';

INSERT INTO products (id, credits, price_microdollars, active) VALUES
  ('pack_100', 100, 7000000, true)     -- $7  (floor $4.92)
ON CONFLICT (id) DO UPDATE
  SET credits = EXCLUDED.credits,
      price_microdollars = EXCLUDED.price_microdollars,
      active = EXCLUDED.active;

UPDATE products SET price_microdollars = 55000000 WHERE id = 'pack_1000';
