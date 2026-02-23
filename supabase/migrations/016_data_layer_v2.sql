-- M4: Data Layer Optimization — cache tables + normalized PBP events

-- === game_state_cache: single-row-per-game with pre-computed derived fields ===
-- Updated by poll-boxscore on every score change
-- Alert engine reads this instead of re-computing from games table

CREATE TABLE IF NOT EXISTS public.game_state_cache (
  game_id TEXT PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  home_score INT NOT NULL DEFAULT 0,
  away_score INT NOT NULL DEFAULT 0,
  clock TEXT,
  period INT,

  -- Pre-computed derived fields
  margin INT NOT NULL DEFAULT 0,              -- abs(home_score - away_score)
  clock_minutes NUMERIC,                       -- decimal minutes remaining
  period_label TEXT,                            -- '1H', '2H', 'OT', 'OT2', etc.
  is_close BOOLEAN NOT NULL DEFAULT false,     -- margin <= 6 in 2nd half+
  is_final_minutes BOOLEAN NOT NULL DEFAULT false,  -- under 5:00 in 2nd half+
  is_final_two BOOLEAN NOT NULL DEFAULT false, -- under 2:00 in 2nd half+
  is_overtime BOOLEAN NOT NULL DEFAULT false,
  is_live BOOLEAN NOT NULL DEFAULT false,      -- inprogress or halftime

  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_state_cache_live
  ON public.game_state_cache(is_live) WHERE is_live = true;

-- === game_summary_cache: single-row-per-game with extracted insights ===
-- Updated by poll-summary after each snapshot
-- Alert engine reads insights instead of parsing raw JSONB snapshots

CREATE TABLE IF NOT EXISTS public.game_summary_cache (
  game_id TEXT PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  payload_hash TEXT,

  -- Extracted insights (pre-computed for alert engine)
  home_biggest_lead INT DEFAULT 0,
  away_biggest_lead INT DEFAULT 0,
  home_bench_points INT DEFAULT 0,
  away_bench_points INT DEFAULT 0,
  bench_delta INT DEFAULT 0,                   -- abs difference
  home_efg_pct NUMERIC DEFAULT 0,
  away_efg_pct NUMERIC DEFAULT 0,
  efg_delta NUMERIC DEFAULT 0,                 -- abs difference
  home_turnovers INT DEFAULT 0,
  away_turnovers INT DEFAULT 0,

  -- Foul trouble: starters/key players with 4+ fouls
  foul_trouble JSONB DEFAULT '[]',
  -- [{player_name, team_side, fouls, starter, points, on_court}]

  -- Top scorers currently on court
  top_scorers_on_court JSONB DEFAULT '[]',
  -- [{player_name, team_side, points, rebounds, assists, on_court}]

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- === game_events: normalized PBP events for lead change detection ===
-- Populated by poll-pbp from Sportradar or SportsDataIO data
-- Enables counting lead changes, scoring runs, momentum shifts

CREATE TABLE IF NOT EXISTS public.game_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sequence INT NOT NULL,                       -- event ordering within game
  event_type TEXT NOT NULL,                    -- 'twopointmade', 'threepointmade', 'freethrowmade', 'turnover', 'foul', etc.
  clock TEXT,                                  -- game clock at event time
  period INT,                                  -- 1, 2, 3 (OT), etc.
  team_id TEXT,                                -- attribution team
  player_name TEXT,
  points INT DEFAULT 0,                        -- points scored on this play (0 for non-scoring)
  scoring_play BOOLEAN DEFAULT false,
  home_score_after INT,                        -- running score after this event
  away_score_after INT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(game_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_game_events_game_period
  ON public.game_events(game_id, period, sequence);
CREATE INDEX IF NOT EXISTS idx_game_events_scoring
  ON public.game_events(game_id, scoring_play, sequence)
  WHERE scoring_play = true;

-- RLS: all cache/events tables are readable by anyone, writable by service role
ALTER TABLE public.game_state_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_summary_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads game_state_cache" ON public.game_state_cache FOR SELECT USING (true);
CREATE POLICY "Service role manages game_state_cache" ON public.game_state_cache FOR ALL USING (true);
CREATE POLICY "Anyone reads game_summary_cache" ON public.game_summary_cache FOR SELECT USING (true);
CREATE POLICY "Service role manages game_summary_cache" ON public.game_summary_cache FOR ALL USING (true);
CREATE POLICY "Anyone reads game_events" ON public.game_events FOR SELECT USING (true);
CREATE POLICY "Service role manages game_events" ON public.game_events FOR ALL USING (true);

-- === Token encryption for connections (Tier A preparation) ===
-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted token columns to connections table
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS access_token_enc BYTEA;
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS refresh_token_enc BYTEA;
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Helper functions for token encryption/decryption
-- Uses symmetric encryption with a server-side key stored in Vault or env
-- The encryption key should be set via: ALTER DATABASE postgres SET app.encryption_key = 'your-key';

CREATE OR REPLACE FUNCTION public.encrypt_token(plain_text TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plain_text,
    current_setting('app.encryption_key', true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrypt_token(encrypted BYTEA)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    encrypted,
    current_setting('app.encryption_key', true)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL; -- Return null if decryption fails (wrong key, corrupted data)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
