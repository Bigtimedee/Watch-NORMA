-- Phase 3 / F3: Floor prices for football_red_zone and football_upset_watch alert types.
-- Added 2026-08-29. Follows the pattern from 20260706000004_football_floor_prices.sql.
--
-- football_red_zone: possession-based, fires any quarter → lower intent premium than 4th-quarter alerts.
-- football_upset_watch: Q4-only, ranked team trailing — high viewer intent (watch-party urgency).
--
-- The (moment_type, COALESCE(sport, '')) unique index from migration 076 ensures no conflicts
-- with global fallback rows. ON CONFLICT DO NOTHING is safe for repeated deploys.

INSERT INTO public.floor_prices (moment_type, sport, floor_cents, min_floor_cents, max_floor_cents)
VALUES
  -- Red Zone: moderate floor (fires throughout the game, not just final minutes)
  ('football_red_zone', 'nfl',   25, 5, 150),
  ('football_red_zone', 'ncaaf', 20, 5, 150),

  -- Upset Watch: higher floor (Q4 only, ranked team — strong viewer intent)
  ('football_upset_watch', 'ncaaf', 40, 5, 200)

ON CONFLICT DO NOTHING;
