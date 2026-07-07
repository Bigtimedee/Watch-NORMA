-- Football moment types: floor prices for NFL and NCAAF.
-- These rows are added as sport-specific overrides alongside the existing global
-- rows from migration 019. The (moment_type, COALESCE(sport, '')) unique index
-- from migration 076 ensures no conflicts with global fallback rows.
--
-- Alert rules are implemented (evaluate-alerts v2) but gated behind ALERTABLE_SPORTS.
-- Production activation target: Sept 1, 2026 (NFL kickoff).

INSERT INTO public.floor_prices (moment_type, sport, floor_cents, min_floor_cents, max_floor_cents)
VALUES
  -- One-score game in Q4/OT: strong intent signal for both sports
  ('football_close_game', 'nfl',   40, 5, 200),
  ('football_close_game', 'ncaaf', 35, 5, 200),

  -- Two-minute drill: highest-intensity football moment
  ('football_two_minute', 'nfl',   45, 5, 200),
  ('football_two_minute', 'ncaaf', 40, 5, 200),

  -- Overtime: universally high drama across both sports
  ('football_overtime',   'nfl',   50, 5, 200),
  ('football_overtime',   'ncaaf', 45, 5, 200)

ON CONFLICT DO NOTHING;
