-- NORMA Agent: per-user autonomous monitoring of prediction market positions

-- Agent configuration table
CREATE TABLE agent_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT false NOT NULL,
  poll_interval_seconds INT DEFAULT 60 NOT NULL,
  -- Probability thresholds (0–100)
  threshold_high INT DEFAULT 85 NOT NULL,  -- alert when P(YES) >= this
  threshold_low  INT DEFAULT 15 NOT NULL,  -- alert when P(YES) <= this
  swing_pct      INT DEFAULT 20 NOT NULL,  -- alert when P moves ±X% in one cycle
  time_window_minutes INT DEFAULT 10 NOT NULL,  -- alert when market closes within X min
  -- Runtime state
  status TEXT DEFAULT 'idle' NOT NULL,  -- idle | monitoring | alert_triggered
  last_synced_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own agent config"
  ON agent_config FOR ALL USING (auth.uid() = user_id);

-- Agent-generated alert history (distinct from game-based alerts table)
CREATE TABLE agent_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                 -- kalshi | polymarket
  market_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  current_probability INT NOT NULL,       -- 0–100
  position_direction TEXT NOT NULL,       -- yes | no
  position_size_cents INT,
  potential_payout_cents INT,
  alert_type TEXT NOT NULL,               -- imminent_resolution | probability_swing | time_expiry
  linked_streaming_event TEXT,            -- e.g. "UNC vs Duke"
  deep_link_url TEXT,
  push_sent BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE agent_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own agent alerts"
  ON agent_alerts FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_agent_alerts_user ON agent_alerts(user_id, created_at DESC);
CREATE INDEX idx_agent_alerts_dedup ON agent_alerts(user_id, market_id, alert_type, created_at DESC);

-- Extend prediction_positions with agent tracking columns
ALTER TABLE prediction_positions
  ADD COLUMN IF NOT EXISTS last_agent_probability NUMERIC,
  ADD COLUMN IF NOT EXISTS market_close_time TIMESTAMPTZ;
