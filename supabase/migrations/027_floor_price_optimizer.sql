-- NORMA Advertising — Floor Price Optimizer
-- Migration 027: Automated floor pricing, learned engagement/moment rates
-- Creates feedback loop from auction data back into pricing and predictions

-- ================================================================
-- 1. Floor Price History — audit trail of every floor change
-- ================================================================

CREATE TABLE public.floor_price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moment_type TEXT NOT NULL,
  previous_floor_cents INT NOT NULL,
  new_floor_cents INT NOT NULL,
  reason TEXT NOT NULL,  -- demand_exceeds_supply | rising_demand | unfilled_moments | declining_demand
  metrics_snapshot JSONB NOT NULL DEFAULT '{}',
  -- Snapshot includes: fill_rate, clearing_ratio, trend, impressions, avg_clearing_price
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_floor_price_history_moment ON public.floor_price_history(moment_type);
CREATE INDEX idx_floor_price_history_created ON public.floor_price_history(created_at);

-- ================================================================
-- 2. Learned Engagement Rates — observed CTR/seen-rate per moment type
-- Replaces hardcoded MOMENT_TYPE_BASE_RATES over time
-- ================================================================

CREATE TABLE public.learned_engagement_rates (
  moment_type TEXT PRIMARY KEY,
  observed_ctr FLOAT NOT NULL,       -- tapped / delivered
  observed_seen_rate FLOAT NOT NULL,  -- seen / delivered
  sample_size INT NOT NULL,           -- total impressions observed
  confidence FLOAT NOT NULL DEFAULT 0, -- 0-1, based on sample size
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- 3. Learned Moment Rates — observed rate-per-game per moment type
-- Replaces hardcoded MOMENT_RATES over time
-- ================================================================

CREATE TABLE public.learned_moment_rates (
  moment_type TEXT PRIMARY KEY,
  observed_rate FLOAT NOT NULL,       -- alerts of this type / games
  sample_games INT NOT NULL,          -- games analyzed
  confidence FLOAT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- 4. Materialized View — 30-day rolling aggregates per moment type
-- ================================================================

CREATE MATERIALIZED VIEW public.moment_type_aggregates AS
  SELECT
    i.moment_type,
    COUNT(*) AS impression_count,
    COUNT(i.seen_at) AS seen_count,
    COUNT(i.tapped_at) AS tapped_count,
    COALESCE(AVG(i.clearing_price_cents), 0)::NUMERIC(10,2) AS avg_clearing_price,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY i.clearing_price_cents), 0)::NUMERIC(10,2) AS median_clearing_price,
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY i.clearing_price_cents), 0)::NUMERIC(10,2) AS p25_clearing_price,
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY i.clearing_price_cents), 0)::NUMERIC(10,2) AS p75_clearing_price,
    -- 7-day split for trend detection
    COALESCE(AVG(i.clearing_price_cents) FILTER (WHERE i.delivered_at >= now() - INTERVAL '7 days'), 0)::NUMERIC(10,2) AS avg_clearing_7d,
    COALESCE(AVG(i.clearing_price_cents) FILTER (WHERE i.delivered_at >= now() - INTERVAL '14 days' AND i.delivered_at < now() - INTERVAL '7 days'), 0)::NUMERIC(10,2) AS avg_clearing_prev_7d,
    COUNT(*) FILTER (WHERE i.delivered_at >= now() - INTERVAL '7 days') AS impressions_7d,
    COUNT(*) FILTER (WHERE i.delivered_at >= now() - INTERVAL '14 days' AND i.delivered_at < now() - INTERVAL '7 days') AS impressions_prev_7d
  FROM public.impressions i
  WHERE i.delivered_at >= now() - INTERVAL '30 days'
  GROUP BY i.moment_type;

CREATE UNIQUE INDEX idx_moment_type_aggregates_pk ON public.moment_type_aggregates(moment_type);

-- ================================================================
-- 5. Postgres Functions
-- ================================================================

-- Atomic floor update + history insert
CREATE OR REPLACE FUNCTION public.update_floor_price(
  p_moment_type TEXT,
  p_new_floor_cents INT,
  p_reason TEXT,
  p_metrics_snapshot JSONB DEFAULT '{}'
)
RETURNS void AS $$
DECLARE
  v_previous_floor INT;
BEGIN
  -- Get current floor
  SELECT floor_cents INTO v_previous_floor
  FROM public.floor_prices
  WHERE moment_type = p_moment_type;

  IF v_previous_floor IS NULL THEN
    RAISE EXCEPTION 'Unknown moment_type: %', p_moment_type;
  END IF;

  -- Skip if no change
  IF v_previous_floor = p_new_floor_cents THEN
    RETURN;
  END IF;

  -- Insert history record
  INSERT INTO public.floor_price_history (moment_type, previous_floor_cents, new_floor_cents, reason, metrics_snapshot)
  VALUES (p_moment_type, v_previous_floor, p_new_floor_cents, p_reason, p_metrics_snapshot);

  -- Update floor price
  UPDATE public.floor_prices
  SET floor_cents = p_new_floor_cents, updated_at = now()
  WHERE moment_type = p_moment_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Compute observed moment rates per game from alerts table
CREATE OR REPLACE FUNCTION public.compute_moment_rates()
RETURNS TABLE (
  moment_type TEXT,
  observed_rate FLOAT,
  sample_games INT
) AS $$
BEGIN
  RETURN QUERY
  WITH game_counts AS (
    SELECT COUNT(DISTINCT a.game_id)::INT AS total_games
    FROM public.alerts a
    WHERE a.created_at >= now() - INTERVAL '30 days'
      AND a.game_id IS NOT NULL
  ),
  moment_counts AS (
    SELECT
      a.moment_type,
      COUNT(DISTINCT a.game_id)::INT AS games_with_moment
    FROM public.alerts a
    WHERE a.created_at >= now() - INTERVAL '30 days'
      AND a.game_id IS NOT NULL
      AND a.moment_type IS NOT NULL
    GROUP BY a.moment_type
  )
  SELECT
    mc.moment_type,
    CASE WHEN gc.total_games > 0
      THEN mc.games_with_moment::FLOAT / gc.total_games
      ELSE 0
    END AS observed_rate,
    gc.total_games AS sample_games
  FROM moment_counts mc
  CROSS JOIN game_counts gc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- 6. Cron Job — daily at 3 AM (after supply forecasts at 2 AM)
-- ================================================================

SELECT cron.schedule(
  'floor-price-optimizer',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/floor-price-optimizer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ================================================================
-- 7. RLS + Grants
-- ================================================================

ALTER TABLE public.floor_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_engagement_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_moment_rates ENABLE ROW LEVEL SECURITY;

-- Floor price history readable by authenticated users
CREATE POLICY "Authenticated users read floor price history" ON public.floor_price_history
  FOR SELECT USING (auth.role() = 'authenticated');

-- Learned rates readable by authenticated users
CREATE POLICY "Authenticated users read learned engagement rates" ON public.learned_engagement_rates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users read learned moment rates" ON public.learned_moment_rates
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON public.moment_type_aggregates TO authenticated;
