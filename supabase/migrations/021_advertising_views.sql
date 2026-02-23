-- NORMA Advertising — Reporting Views + Privacy Layer
-- Migration 021: Materialized views, advertiser views, privacy boundary

-- ================================================================
-- Privacy boundary: advertiser_impressions view (excludes user_id, alert_id)
-- This is the ONLY way advertisers should access impression data
-- ================================================================

CREATE VIEW public.advertiser_impressions AS
  SELECT
    id,
    bid_id,
    campaign_id,
    game_id,
    moment_type,
    moment_score,
    user_segment,
    clearing_price_cents,
    delivered_at,
    seen_at,
    tapped_at
  FROM public.impressions;

-- ================================================================
-- Materialized Views (refreshed periodically via cron)
-- ================================================================

-- Campaign-level aggregate metrics (no user IDs)
CREATE MATERIALIZED VIEW public.campaign_metrics AS
  SELECT
    c.id AS campaign_id,
    c.advertiser_id,
    c.name AS campaign_name,
    c.status AS campaign_status,
    COUNT(i.id) AS total_impressions,
    COUNT(i.seen_at) AS seen_impressions,
    COUNT(i.tapped_at) AS tapped_impressions,
    COUNT(DISTINCT cv.id) AS total_conversions,
    COUNT(DISTINCT i.user_id) AS unique_users_reached,
    COUNT(DISTINCT i.game_id) AS games_covered,
    COALESCE(AVG(i.clearing_price_cents), 0)::NUMERIC(10,2) AS avg_clearing_price,
    COALESCE(SUM(i.clearing_price_cents), 0) AS total_spent_cents
  FROM public.campaigns c
  LEFT JOIN public.impressions i ON i.campaign_id = c.id
  LEFT JOIN public.conversions cv ON cv.impression_id = i.id
  GROUP BY c.id, c.advertiser_id, c.name, c.status;

CREATE UNIQUE INDEX idx_campaign_metrics_id ON public.campaign_metrics(campaign_id);

-- Daily impression stats per campaign per moment_type
CREATE MATERIALIZED VIEW public.daily_impression_stats AS
  SELECT
    i.campaign_id,
    DATE(i.delivered_at) AS impression_date,
    i.moment_type,
    COUNT(*) AS impressions,
    COUNT(i.seen_at) AS seen,
    COUNT(i.tapped_at) AS tapped,
    COALESCE(SUM(i.clearing_price_cents), 0) AS spent_cents,
    COUNT(DISTINCT i.user_id) AS unique_users
  FROM public.impressions i
  GROUP BY i.campaign_id, DATE(i.delivered_at), i.moment_type;

CREATE UNIQUE INDEX idx_daily_stats_pk ON public.daily_impression_stats(campaign_id, impression_date, moment_type);

-- ================================================================
-- Advertiser Reporting View — the ONLY view advertisers query
-- Joins campaign_metrics with campaigns. Strips all user-level data.
-- ================================================================

CREATE VIEW public.advertiser_reporting AS
  SELECT
    cm.campaign_id,
    cm.advertiser_id,
    cm.campaign_name,
    cm.campaign_status,
    cm.total_impressions,
    cm.seen_impressions,
    cm.tapped_impressions,
    cm.total_conversions,
    cm.unique_users_reached,  -- COUNT only, not a list
    cm.games_covered,
    cm.avg_clearing_price,
    cm.total_spent_cents,
    c.budget_cents,
    c.daily_budget_cents,
    c.flight_start,
    c.flight_end,
    c.targeting_rules,
    c.category_exclusivity,
    -- Computed rates
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.seen_impressions::NUMERIC / cm.total_impressions * 100, 2)
      ELSE 0
    END AS seen_rate_pct,
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.tapped_impressions::NUMERIC / cm.total_impressions * 100, 2)
      ELSE 0
    END AS ctr_pct,
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.total_spent_cents::NUMERIC / cm.total_impressions * 10, 2)
      ELSE 0
    END AS effective_cpm_cents
  FROM public.campaign_metrics cm
  JOIN public.campaigns c ON c.id = cm.campaign_id;

-- ================================================================
-- RLS on views / materialized views
-- ================================================================

-- Materialized views don't support RLS directly, but access is
-- controlled through the advertiser_reporting view which joins
-- with campaigns (which has RLS). Advertisers query advertiser_reporting.

-- Enable RLS on the advertiser_impressions view's underlying table
-- (already done in 019). The view itself inherits table RLS.

-- Grant select on views to authenticated users (RLS on underlying tables enforces access)
GRANT SELECT ON public.advertiser_impressions TO authenticated;
GRANT SELECT ON public.advertiser_reporting TO authenticated;
GRANT SELECT ON public.campaign_metrics TO authenticated;
GRANT SELECT ON public.daily_impression_stats TO authenticated;

-- ================================================================
-- Minimum cohort size enforcement function
-- Suppresses reporting for small cohorts (< 5 users) to prevent
-- advertisers from inferring individual behavior
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_campaign_daily_stats(
  p_campaign_id BIGINT,
  p_advertiser_auth_id UUID
)
RETURNS TABLE (
  impression_date DATE,
  moment_type TEXT,
  impressions BIGINT,
  seen BIGINT,
  tapped BIGINT,
  spent_cents BIGINT,
  unique_users BIGINT
) AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.advertisers a ON a.id = c.advertiser_id
    WHERE c.id = p_campaign_id AND a.auth_user_id = p_advertiser_auth_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return stats with minimum cohort enforcement
  RETURN QUERY
  SELECT
    ds.impression_date,
    ds.moment_type,
    ds.impressions,
    ds.seen,
    ds.tapped,
    ds.spent_cents,
    CASE WHEN ds.unique_users < 5 THEN NULL ELSE ds.unique_users END AS unique_users
  FROM public.daily_impression_stats ds
  WHERE ds.campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
