-- Migration 049: Add sport discriminator column to all sport-aware tables
-- Part of MLB/NBA expansion (see docs/mlb-nba-expansion-plan.md)
-- Fully backward compatible: all existing rows receive DEFAULT 'ncaam'

-- Create the sport enum type
DO $$ BEGIN
  CREATE TYPE public.sport_key AS ENUM ('ncaam', 'nba', 'mlb');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- games table: primary sport discriminator + ESPN ID for exact dedup
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam',
  ADD COLUMN IF NOT EXISTS espn_id TEXT;

CREATE INDEX IF NOT EXISTS idx_games_espn_id ON public.games(espn_id) WHERE espn_id IS NOT NULL;

-- teams table: disambiguates NBA vs NCAAM teams sharing abbreviations
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- alerts table: alert feed is sport-scoped
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- wagers table: wager context (run-line vs spread) differs by sport
ALTER TABLE public.wagers
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- follows table: user follows are sport-scoped
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- watcher_state table: polling intervals differ by sport
ALTER TABLE public.watcher_state
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- alert_throttle table: dedup keys are sport-scoped
ALTER TABLE public.alert_throttle
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- Primary sport indexes
CREATE INDEX IF NOT EXISTS idx_games_sport ON public.games(sport);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON public.teams(sport);
CREATE INDEX IF NOT EXISTS idx_alerts_sport ON public.alerts(sport);
CREATE INDEX IF NOT EXISTS idx_wagers_sport ON public.wagers(sport);
CREATE INDEX IF NOT EXISTS idx_follows_sport ON public.follows(sport);
CREATE INDEX IF NOT EXISTS idx_watcher_state_sport ON public.watcher_state(sport);

-- Compound indexes for most common query patterns
-- Games: sport + scheduled date range (primary feed query)
CREATE INDEX IF NOT EXISTS idx_games_sport_scheduled
  ON public.games(sport, scheduled_at);

-- Games: sport + status (active game orchestrator query)
CREATE INDEX IF NOT EXISTS idx_games_sport_status
  ON public.games(sport, status);

-- Alerts: sport + user + created_at DESC (alert feed)
CREATE INDEX IF NOT EXISTS idx_alerts_sport_user
  ON public.alerts(sport, user_id, created_at DESC);

-- Teams: sport + sportsdataio_id (upsert lookup)
CREATE INDEX IF NOT EXISTS idx_teams_sport_sdio
  ON public.teams(sport, sportsdataio_id)
  WHERE sportsdataio_id IS NOT NULL;

-- Watcher state: sport + active games (orchestrator dispatch)
CREATE INDEX IF NOT EXISTS idx_watcher_sport_active
  ON public.watcher_state(sport, is_active)
  WHERE is_active = true;

-- NOTE: All existing rows automatically receive sport='ncaam' via the DEFAULT clause.
-- No data backfill query is needed.
-- No existing constraints are violated.
-- No existing queries break (sport filter is additive).
