-- Durable per-game polling orchestration state
-- Replaces in-memory polling-state.ts with crash-safe Postgres-backed state

CREATE TABLE public.watcher_state (
  game_id TEXT PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,

  -- PBP polling state
  pbp_last_polled_at TIMESTAMPTZ,
  pbp_next_poll_at TIMESTAMPTZ,
  pbp_error_count INT DEFAULT 0,

  -- Summary polling state
  summary_last_polled_at TIMESTAMPTZ,
  summary_next_poll_at TIMESTAMPTZ,
  summary_error_count INT DEFAULT 0,

  -- Alert evaluation state
  alert_last_evaluated_at TIMESTAMPTZ,
  alert_next_evaluate_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_watcher_state_active ON public.watcher_state(is_active)
  WHERE is_active = true;
CREATE INDEX idx_watcher_state_pbp_next ON public.watcher_state(pbp_next_poll_at)
  WHERE is_active = true AND pbp_next_poll_at IS NOT NULL;
CREATE INDEX idx_watcher_state_summary_next ON public.watcher_state(summary_next_poll_at)
  WHERE is_active = true AND summary_next_poll_at IS NOT NULL;
CREATE INDEX idx_watcher_state_alert_next ON public.watcher_state(alert_next_evaluate_at)
  WHERE is_active = true AND alert_next_evaluate_at IS NOT NULL;

-- Persistent alert throttle / dedup state
-- Replaces simple 10-minute in-memory cooldown

CREATE TABLE public.alert_throttle (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  dedup_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, game_id, alert_type, dedup_hash)
);

CREATE INDEX idx_alert_throttle_lookup
  ON public.alert_throttle(user_id, game_id, alert_type, created_at DESC);

-- Sportradar API rate tracking
-- Simple per-minute counter that the orchestrator checks before dispatching

CREATE TABLE public.api_rate_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'sportradar',
  calls_made INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', now()),
  UNIQUE(provider, window_start)
);

CREATE INDEX idx_api_rate_log_window
  ON public.api_rate_log(provider, window_start DESC);

-- RLS: watcher_state and alert_throttle are service-role only
ALTER TABLE public.watcher_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (Edge Functions use service role key)
CREATE POLICY "Service role manages watcher_state" ON public.watcher_state FOR ALL USING (true);
CREATE POLICY "Service role manages alert_throttle" ON public.alert_throttle FOR ALL USING (true);
CREATE POLICY "Service role manages api_rate_log" ON public.api_rate_log FOR ALL USING (true);
