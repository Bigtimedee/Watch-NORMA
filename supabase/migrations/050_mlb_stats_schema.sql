-- Migration 050: MLB-specific game stats schema
-- Part of MLB/NBA expansion (see docs/mlb-nba-expansion-plan.md)
-- Creates mlb_game_stats table for inning-by-inning scoring, pitching lines,
-- at-bat state, and no-hitter tracking. Basketball games never touch this table.

CREATE TABLE IF NOT EXISTS public.mlb_game_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,

  -- Inning-by-inning runs: [{inning: 1, runs: 2}, {inning: 2, runs: 0}, ...]
  home_innings JSONB NOT NULL DEFAULT '[]',
  away_innings JSONB NOT NULL DEFAULT '[]',

  -- Team totals (R/H/E)
  home_runs INT NOT NULL DEFAULT 0,
  away_runs INT NOT NULL DEFAULT 0,
  home_hits INT NOT NULL DEFAULT 0,
  away_hits INT NOT NULL DEFAULT 0,
  home_errors INT NOT NULL DEFAULT 0,
  away_errors INT NOT NULL DEFAULT 0,

  -- Current game state
  current_inning INT,
  inning_half TEXT CHECK (inning_half IN ('T', 'B')),  -- T = top, B = bottom
  outs INT DEFAULT 0 CHECK (outs BETWEEN 0 AND 3),
  balls INT DEFAULT 0 CHECK (balls BETWEEN 0 AND 4),
  strikes INT DEFAULT 0 CHECK (strikes BETWEEN 0 AND 3),
  -- [{base: 1, player_name: "..."}, {base: 2, player_name: "..."}]
  runners_on_base JSONB NOT NULL DEFAULT '[]',

  -- Home team starting pitcher
  home_starter_name TEXT,
  home_starter_pitches INT NOT NULL DEFAULT 0,
  home_starter_ip NUMERIC(4,1),   -- innings pitched, e.g., 6.2 means 6 and 2/3
  home_starter_era NUMERIC(5,2),
  home_starter_whip NUMERIC(5,3),
  home_starter_strikeouts INT NOT NULL DEFAULT 0,
  home_starter_walks INT NOT NULL DEFAULT 0,
  home_starter_hits_allowed INT NOT NULL DEFAULT 0,
  home_starter_runs_allowed INT NOT NULL DEFAULT 0,
  home_starter_still_pitching BOOLEAN NOT NULL DEFAULT true,

  -- Away team starting pitcher
  away_starter_name TEXT,
  away_starter_pitches INT NOT NULL DEFAULT 0,
  away_starter_ip NUMERIC(4,1),
  away_starter_era NUMERIC(5,2),
  away_starter_whip NUMERIC(5,3),
  away_starter_strikeouts INT NOT NULL DEFAULT 0,
  away_starter_walks INT NOT NULL DEFAULT 0,
  away_starter_hits_allowed INT NOT NULL DEFAULT 0,
  away_starter_runs_allowed INT NOT NULL DEFAULT 0,
  away_starter_still_pitching BOOLEAN NOT NULL DEFAULT true,

  -- No-hitter / perfect game tracking
  -- home_no_hitter_active = away team has allowed no hits to home batters
  home_no_hitter_active BOOLEAN NOT NULL DEFAULT false,
  away_no_hitter_active BOOLEAN NOT NULL DEFAULT false,
  home_perfect_game_active BOOLEAN NOT NULL DEFAULT false,
  away_perfect_game_active BOOLEAN NOT NULL DEFAULT false,

  -- Dedup hash (same pattern as game_snapshots)
  payload_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One stats row per game
  UNIQUE(game_id)
);

CREATE INDEX IF NOT EXISTS idx_mlb_game_stats_game
  ON public.mlb_game_stats(game_id);

CREATE INDEX IF NOT EXISTS idx_mlb_game_stats_no_hitter
  ON public.mlb_game_stats(game_id)
  WHERE home_no_hitter_active = true OR away_no_hitter_active = true;

-- RLS: readable by all authenticated users; writable only by service role
ALTER TABLE public.mlb_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read mlb_game_stats"
  ON public.mlb_game_stats FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages mlb_game_stats"
  ON public.mlb_game_stats FOR ALL
  USING (true);
