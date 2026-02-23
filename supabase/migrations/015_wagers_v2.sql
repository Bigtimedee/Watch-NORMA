-- M3: Wagers v2 — multi-tier wager support, parlay legs, source tracking

-- Source tracking: how was this wager created?
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
  -- Values: manual | bet_slip_scan | partner_api

-- Provider association
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS provider_key TEXT;
  -- e.g., draftkings, fanduel, betmgm

-- External dedup (for Tier A partner API imports)
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS external_bet_id TEXT;

-- Financial details
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS stake NUMERIC;
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS potential_payout NUMERIC;

-- Parlay support: array of leg objects
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS legs JSONB;
  -- [{game_id, team_id, market_type, line, odds, description}]

-- Entity mapping for alert targeting
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS mapped_entities JSONB;
  -- {game_ids: [], team_ids: [], player_names: []}

-- When the bet was placed (vs when it was entered in NORMA)
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS placed_at TIMESTAMPTZ;

-- Structured market type (replaces free-text wager_type for new entries)
ALTER TABLE public.wagers ADD COLUMN IF NOT EXISTS market_type TEXT;
  -- spread | total | moneyline | player_prop | futures | parlay

-- Backfill existing wagers
UPDATE public.wagers SET source = 'manual' WHERE source IS NULL;
UPDATE public.wagers SET market_type = wager_type WHERE market_type IS NULL AND wager_type IS NOT NULL;

-- Unique constraint for external dedup (Tier A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wagers_external
  ON public.wagers(provider_key, external_bet_id)
  WHERE external_bet_id IS NOT NULL;

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_wagers_source ON public.wagers(source);
