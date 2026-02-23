-- NORMA Advertising Marketplace — Core Tables
-- Migration 019: advertisers, campaigns, creatives, bids, impressions,
--   conversions, supply_forecasts, floor_prices, ad_fraud_events
--   + atomic Postgres functions

-- Advertisers
CREATE TABLE public.advertisers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,  -- sportsbook | streaming | qsr | beer | auto | financial | apparel
  billing_model TEXT DEFAULT 'cpm',  -- cpm | cpti | cpwa | flat_rate
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  logo_url TEXT,
  website_url TEXT,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_advertisers_auth_user ON public.advertisers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Campaigns
CREATE TABLE public.campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  budget_cents BIGINT NOT NULL,
  spent_cents BIGINT DEFAULT 0,
  daily_budget_cents BIGINT,  -- pacing: max spend per day (null = no daily cap)
  flight_start TIMESTAMPTZ,
  flight_end TIMESTAMPTZ,
  targeting_rules JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'draft',  -- draft | pending_review | active | paused | completed | archived
  category_exclusivity BOOLEAN DEFAULT false,
  priority_tier INT DEFAULT 0,  -- direct deals: higher tier = evaluated first
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaigns_advertiser ON public.campaigns(advertiser_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_flight ON public.campaigns(flight_start, flight_end);

-- Creatives
CREATE TABLE public.creatives (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  format TEXT,  -- notification_sponsor | tune_in_card | insight_sponsor | recap_sponsor
  sponsor_text TEXT NOT NULL,  -- "Presented by DraftKings"
  cta_text TEXT,  -- "Bet Now"
  cta_url TEXT,  -- deep link or web URL
  logo_url TEXT,
  variant_label TEXT,  -- A/B test label: "variant_a", "variant_b"
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  review_notes TEXT,
  performance_score FLOAT DEFAULT 0,  -- AI-computed: CTR * engagement_weight
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_creatives_campaign ON public.creatives(campaign_id);
CREATE INDEX idx_creatives_status ON public.creatives(status);

-- Bids (auction system)
CREATE TABLE public.bids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creative_id BIGINT NOT NULL REFERENCES public.creatives(id) ON DELETE CASCADE,
  moment_type TEXT NOT NULL,
  bid_cents INT NOT NULL,  -- max willingness to pay per impression
  floor_aware BOOLEAN DEFAULT true,  -- auto-adjust to floor if bid < floor
  game_id TEXT REFERENCES public.games(id) ON DELETE SET NULL,  -- null = all matching games
  user_segment TEXT,  -- null = all segments
  status TEXT DEFAULT 'active',  -- active | paused | exhausted
  daily_impressions_cap INT,
  impressions_delivered INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bids_campaign ON public.bids(campaign_id);
CREATE INDEX idx_bids_moment_type ON public.bids(moment_type);
CREATE INDEX idx_bids_status ON public.bids(status);
CREATE INDEX idx_bids_game ON public.bids(game_id) WHERE game_id IS NOT NULL;

-- Impressions
CREATE TABLE public.impressions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bid_id BIGINT NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  alert_id BIGINT REFERENCES public.alerts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,  -- NOT exposed to advertisers via RLS
  user_segment TEXT,  -- aggregate label: "wager_holder", "team_follower", "position_holder"
  game_id TEXT,
  moment_type TEXT,
  moment_score NUMERIC,  -- alert score at time of delivery
  clearing_price_cents INT NOT NULL,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  seen_at TIMESTAMPTZ,
  tapped_at TIMESTAMPTZ
);

CREATE INDEX idx_impressions_campaign ON public.impressions(campaign_id);
CREATE INDEX idx_impressions_bid ON public.impressions(bid_id);
CREATE INDEX idx_impressions_user ON public.impressions(user_id);
CREATE INDEX idx_impressions_game ON public.impressions(game_id);
CREATE INDEX idx_impressions_delivered ON public.impressions(delivered_at);
CREATE INDEX idx_impressions_campaign_day ON public.impressions(campaign_id, delivered_at);

-- Conversions
CREATE TABLE public.conversions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  impression_id BIGINT NOT NULL REFERENCES public.impressions(id) ON DELETE CASCADE,
  conversion_type TEXT NOT NULL,  -- stream_open | sportsbook_open | wager_placed | cta_tap | app_return
  converted_at TIMESTAMPTZ DEFAULT now(),
  attribution_window_ms INT,  -- time between impression and conversion
  metadata JSONB  -- { sportsbook_key, deep_link_method, etc. }
);

CREATE INDEX idx_conversions_impression ON public.conversions(impression_id);
CREATE INDEX idx_conversions_type ON public.conversions(conversion_type);

-- Supply Forecasts (for campaign planning)
CREATE TABLE public.supply_forecasts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_date DATE NOT NULL,
  moment_type TEXT NOT NULL,
  league TEXT DEFAULT 'ncaa_basketball',
  predicted_moments INT,
  predicted_eligible_users INT,
  confidence FLOAT,  -- 0-1
  games_scheduled INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(forecast_date, moment_type, league)
);

CREATE INDEX idx_supply_forecasts_date ON public.supply_forecasts(forecast_date);

-- Floor Prices (anti-exploitation)
CREATE TABLE public.floor_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moment_type TEXT NOT NULL UNIQUE,
  floor_cents INT NOT NULL,
  premium_multiplier FLOAT DEFAULT 1.0,  -- applied during high-demand windows
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default floor prices
INSERT INTO public.floor_prices (moment_type, floor_cents) VALUES
  ('bet_resolved', 50),
  ('close_game', 35),
  ('overtime', 40),
  ('spread_alert', 30),
  ('moneyline_alert', 30),
  ('total_alert', 25),
  ('prop_alert', 25),
  ('position_alert', 20),
  ('foul_trouble', 15),
  ('follow_alert', 10);

-- Ad Fraud Events (fraud detection log)
CREATE TABLE public.ad_fraud_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,  -- rapid_click | impression_stuffing | bid_manipulation | budget_drain
  campaign_id BIGINT REFERENCES public.campaigns(id) ON DELETE SET NULL,
  details JSONB,
  flagged_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false
);

CREATE INDEX idx_fraud_events_campaign ON public.ad_fraud_events(campaign_id);
CREATE INDEX idx_fraud_events_type ON public.ad_fraud_events(event_type);

-- ================================================================
-- Postgres Functions for atomic operations
-- ================================================================

-- Atomic increment bid impressions + auto-exhaust when cap reached
CREATE OR REPLACE FUNCTION public.increment_bid_impressions(p_bid_id BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE public.bids
  SET impressions_delivered = impressions_delivered + 1,
      status = CASE
        WHEN daily_impressions_cap IS NOT NULL
             AND impressions_delivered + 1 >= daily_impressions_cap
        THEN 'exhausted'
        ELSE status
      END
  WHERE id = p_bid_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic auction result: update campaign spend
CREATE OR REPLACE FUNCTION public.record_auction_result(
  p_bid_id BIGINT,
  p_clearing_price INT
)
RETURNS void AS $$
DECLARE
  v_campaign_id BIGINT;
BEGIN
  -- Get campaign from bid
  SELECT campaign_id INTO v_campaign_id FROM public.bids WHERE id = p_bid_id;

  -- Update campaign spend atomically
  UPDATE public.campaigns
  SET spent_cents = spent_cents + p_clearing_price,
      updated_at = now()
  WHERE id = v_campaign_id;

  -- Increment bid impressions
  PERFORM public.increment_bid_impressions(p_bid_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if campaign has exceeded daily budget
CREATE OR REPLACE FUNCTION public.check_daily_budget(p_campaign_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_daily_budget BIGINT;
  v_today_spent BIGINT;
BEGIN
  SELECT daily_budget_cents INTO v_daily_budget
  FROM public.campaigns WHERE id = p_campaign_id;

  -- No daily cap = always allowed
  IF v_daily_budget IS NULL THEN
    RETURN true;
  END IF;

  SELECT COALESCE(SUM(clearing_price_cents), 0) INTO v_today_spent
  FROM public.impressions
  WHERE campaign_id = p_campaign_id
    AND delivered_at >= CURRENT_DATE;

  RETURN v_today_spent < v_daily_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- Row Level Security
-- ================================================================

ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_fraud_events ENABLE ROW LEVEL SECURITY;

-- Advertisers: users see only their own advertiser record
CREATE POLICY "Advertisers read own record" ON public.advertisers
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Advertisers update own record" ON public.advertisers
  FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY "Users can create advertiser" ON public.advertisers
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- Campaigns: advertisers see only their own campaigns
CREATE POLICY "Advertisers manage own campaigns" ON public.campaigns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.advertisers a
      WHERE a.id = campaigns.advertiser_id AND a.auth_user_id = auth.uid()
    )
  );

-- Creatives: through campaign ownership
CREATE POLICY "Advertisers manage own creatives" ON public.creatives
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.advertisers a ON a.id = c.advertiser_id
      WHERE c.id = creatives.campaign_id AND a.auth_user_id = auth.uid()
    )
  );

-- Bids: through campaign ownership
CREATE POLICY "Advertisers manage own bids" ON public.bids
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.advertisers a ON a.id = c.advertiser_id
      WHERE c.id = bids.campaign_id AND a.auth_user_id = auth.uid()
    )
  );

-- Impressions: advertisers see own campaign impressions (user_id hidden via view)
CREATE POLICY "Advertisers see own impressions" ON public.impressions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.advertisers a ON a.id = c.advertiser_id
      WHERE c.id = impressions.campaign_id AND a.auth_user_id = auth.uid()
    )
  );

-- Conversions: through impression/campaign chain
CREATE POLICY "Advertisers see own conversions" ON public.conversions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.impressions i
      JOIN public.campaigns c ON c.id = i.campaign_id
      JOIN public.advertisers a ON a.id = c.advertiser_id
      WHERE i.id = conversions.impression_id AND a.auth_user_id = auth.uid()
    )
  );

-- Supply forecasts: readable by all authenticated users
CREATE POLICY "Authenticated users read forecasts" ON public.supply_forecasts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Floor prices: readable by all authenticated users
CREATE POLICY "Authenticated users read floor prices" ON public.floor_prices
  FOR SELECT USING (auth.role() = 'authenticated');

-- Fraud events: advertisers see only their own
CREATE POLICY "Advertisers see own fraud events" ON public.ad_fraud_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.advertisers a ON a.id = c.advertiser_id
      WHERE c.id = ad_fraud_events.campaign_id AND a.auth_user_id = auth.uid()
    )
  );
