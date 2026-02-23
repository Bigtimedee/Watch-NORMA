-- M2: Alert Engine v2 — follows entity support, alerts scoring/explanation, delivery_log

-- === Follows v2: entity-based follows (player, league) ===
-- Add entity_type/entity_id alongside existing game_id/team_id columns
-- This is additive — existing rows keep working with follow_type + game_id/team_id

ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Backfill existing rows
UPDATE public.follows SET entity_type = 'game', entity_id = game_id WHERE follow_type = 'game' AND entity_type IS NULL;
UPDATE public.follows SET entity_type = 'team', entity_id = team_id WHERE follow_type = 'team' AND entity_type IS NULL;

-- Relax the CHECK constraint to allow new follow types (player, league)
-- Drop old constraint and add a broader one
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_game_or_team;
ALTER TABLE public.follows ADD CONSTRAINT follows_valid_type CHECK (
  follow_type IN ('game', 'team', 'player', 'league')
);

-- Index for entity-based queries (e.g., "find all users following team X")
CREATE INDEX IF NOT EXISTS idx_follows_entity ON public.follows(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_follows_user_entity ON public.follows(user_id, entity_type);

-- === Alerts v2: scoring + structured explanation ===
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS score NUMERIC;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS explanation JSONB;
  -- {headline, bullets: [], stats_used: {}, confidence: 0-1, wager_impact: {}}
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS suppressed_reason TEXT;

-- Service role needs INSERT access for alert engine
-- (existing RLS policies cover user SELECT/UPDATE; service role bypasses RLS)

-- === Delivery Log ===
CREATE TABLE IF NOT EXISTS public.delivery_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id BIGINT REFERENCES public.alerts(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL,         -- 'push' | 'in_app'
  provider_message_id TEXT,      -- Expo push ticket ID
  status TEXT NOT NULL,          -- 'sent' | 'failed' | 'throttled'
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own delivery logs (via alert join)
CREATE POLICY "Users read own delivery logs" ON public.delivery_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.alerts WHERE alerts.id = delivery_log.alert_id AND alerts.user_id = auth.uid())
  );

-- Service role manages delivery_log (Edge Functions use service role key)
CREATE POLICY "Service role manages delivery_log" ON public.delivery_log FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_delivery_log_alert ON public.delivery_log(alert_id);
CREATE INDEX IF NOT EXISTS idx_delivery_log_status ON public.delivery_log(status, created_at DESC);
