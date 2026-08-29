-- Migration 092: Add AP poll rankings to games table
-- Used by morning-briefing F4 (Saturday NCAAF edition) to surface ranked matchups.
-- Populated by poll-schedule when ESPN scoreboard data includes team ranks.
-- NULL for non-NCAAF games and unranked teams — all consumers guard accordingly.
-- Additive only; no existing columns touched.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS home_rank SMALLINT,
  ADD COLUMN IF NOT EXISTS away_rank SMALLINT;

-- Sparse index: only ranked games. NULL values are excluded automatically.
CREATE INDEX IF NOT EXISTS idx_games_home_rank ON public.games(home_rank)
  WHERE home_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_away_rank ON public.games(away_rank)
  WHERE away_rank IS NOT NULL;

-- Compound: useful for "all ranked NCAAF games today" query in morning-briefing.
CREATE INDEX IF NOT EXISTS idx_games_ncaaf_ranked
  ON public.games(sport, scheduled_at)
  WHERE (home_rank IS NOT NULL OR away_rank IS NOT NULL);

COMMENT ON COLUMN public.games.home_rank IS
  'AP poll or similar ranking for the home team (NCAAF). NULL if unranked or not applicable.';
COMMENT ON COLUMN public.games.away_rank IS
  'AP poll or similar ranking for the away team (NCAAF). NULL if unranked or not applicable.';
