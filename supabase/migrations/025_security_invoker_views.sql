-- Migration 025: Fix Security Definer Views
-- Supabase Security Advisor flags views using SECURITY DEFINER because they
-- bypass RLS on underlying tables. Recreate with SECURITY INVOKER so queries
-- run with the calling user's permissions and RLS is enforced.

-- 1. provider_registry
DROP VIEW IF EXISTS public.provider_registry;
CREATE VIEW public.provider_registry
  WITH (security_invoker = true)
  AS SELECT * FROM public.streaming_providers;

-- 2. advertiser_impressions
DROP VIEW IF EXISTS public.advertiser_impressions;
CREATE VIEW public.advertiser_impressions
  WITH (security_invoker = true)
  AS SELECT
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

-- 3. advertiser_reporting (depends on campaign_metrics materialized view + campaigns)
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
      THEN ROUND(cm.total_spent_cents::NUMERIC / cm.total_impressions * 10, 2)
      ELSE 0
    END AS effective_cpm_cents
  FROM public.campaign_metrics cm
  JOIN public.campaigns c ON c.id = cm.campaign_id;

-- Re-grant SELECT to authenticated users
GRANT SELECT ON public.provider_registry TO authenticated;
GRANT SELECT ON public.advertiser_impressions TO authenticated;
GRANT SELECT ON public.advertiser_reporting TO authenticated;
