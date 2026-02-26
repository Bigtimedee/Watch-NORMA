-- Migration 026: Remove CPM billing model, replace eCPM with Cost per Moment,
-- add prediction_resolved moment type

-- ================================================================
-- 1. Update billing_model default from 'cpm' to 'cost_per_moment'
-- ================================================================
ALTER TABLE public.advertisers
  ALTER COLUMN billing_model SET DEFAULT 'cost_per_moment';

-- Update existing advertisers that had 'cpm' to 'cost_per_moment'
UPDATE public.advertisers
  SET billing_model = 'cost_per_moment'
  WHERE billing_model = 'cpm';

-- ================================================================
-- 2. Add prediction_resolved floor price
-- ================================================================
INSERT INTO public.floor_prices (moment_type, floor_cents, premium_multiplier)
  VALUES ('prediction_resolved', 60, 1.0)
  ON CONFLICT (moment_type) DO NOTHING;

-- ================================================================
-- 3. Recreate advertiser_reporting view with cost_per_moment metric
-- ================================================================
DROP VIEW IF EXISTS public.advertiser_reporting;
CREATE VIEW public.advertiser_reporting
  WITH (security_invoker = true)
  AS SELECT
    cm.campaign_id,
    cm.advertiser_id,
    cm.campaign_name,
    cm.campaign_status,
    cm.total_impressions,
    cm.seen_impressions,
    cm.tapped_impressions,
    cm.total_conversions,
    cm.unique_users_reached,
    cm.games_covered,
    cm.avg_clearing_price,
    cm.total_spent_cents,
    c.budget_cents,
    c.daily_budget_cents,
    c.flight_start,
    c.flight_end,
    c.targeting_rules,
    c.category_exclusivity,
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.seen_impressions::NUMERIC / cm.total_impressions * 100, 2)
      ELSE 0
    END AS seen_rate_pct,
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.tapped_impressions::NUMERIC / cm.total_impressions * 100, 2)
      ELSE 0
    END AS ctr_pct,
    CASE WHEN cm.total_impressions > 0
      THEN ROUND(cm.total_spent_cents::NUMERIC / cm.total_impressions, 2)
      ELSE 0
    END AS effective_cost_per_moment_cents
  FROM public.campaign_metrics cm
  JOIN public.campaigns c ON c.id = cm.campaign_id;

GRANT SELECT ON public.advertiser_reporting TO authenticated;
