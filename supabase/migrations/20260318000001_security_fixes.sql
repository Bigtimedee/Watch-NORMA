-- Migration 041: Security Fixes
-- Addresses Supabase security linter findings:
--   1. Three views created without SECURITY INVOKER (security_definer_view lint)
--   2. RLS not enabled on backend-only social tables and job_queue (rls_disabled_in_public lint)

-- ---------------------------------------------------------------------------
-- 1. Fix SECURITY DEFINER views → SECURITY INVOKER
--
-- Views created without WITH (security_invoker = true) default to SECURITY
-- DEFINER, meaning they query the underlying tables as the view owner (postgres)
-- rather than as the calling user, bypassing RLS. Recreating with
-- security_invoker = true ensures the caller's RLS policies are enforced.
-- ---------------------------------------------------------------------------

-- 1a. deep_link_fallback_rates (created in 037_deep_link_observability.sql)
DROP VIEW IF EXISTS public.deep_link_fallback_rates;
CREATE VIEW public.deep_link_fallback_rates
  WITH (security_invoker = true)
  AS
  SELECT
    provider_key,
    method,
    platform,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE fallback_triggered) AS fallback_count,
    ROUND(COUNT(*) FILTER (WHERE fallback_triggered)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS fallback_rate_pct,
    MAX(created_at) AS last_event_at
  FROM public.deep_link_events
  WHERE created_at > now() - interval '7 days'
  GROUP BY provider_key, method, platform
  ORDER BY fallback_count DESC;

GRANT SELECT ON public.deep_link_fallback_rates TO authenticated;

-- 1b. content_calendar_upcoming (created in 20260307000001_cmo_agent.sql)
DROP VIEW IF EXISTS public.content_calendar_upcoming;
CREATE VIEW public.content_calendar_upcoming
  WITH (security_invoker = true)
  AS
  SELECT *
  FROM public.content_calendar
  WHERE status IN ('draft', 'scheduled')
    AND (scheduled_for IS NULL OR scheduled_for >= now() - interval '1 hour')
  ORDER BY scheduled_for ASC NULLS LAST, created_at ASC;

GRANT SELECT ON public.content_calendar_upcoming TO authenticated;

-- 1c. content_calendar_published (created in 20260307000001_cmo_agent.sql)
DROP VIEW IF EXISTS public.content_calendar_published;
CREATE VIEW public.content_calendar_published
  WITH (security_invoker = true)
  AS
  SELECT *
  FROM public.content_calendar
  WHERE status = 'published'
  ORDER BY published_at DESC
  LIMIT 100;

GRANT SELECT ON public.content_calendar_published TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on backend-only tables
--
-- These tables are written and read exclusively by Edge Functions running as
-- the service role, which bypasses RLS entirely. Enabling RLS with no
-- authenticated/anon policies means the API exposes nothing to app users,
-- while service-role access is completely unaffected.
-- ---------------------------------------------------------------------------

ALTER TABLE public.social_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_hashtag_performance ENABLE ROW LEVEL SECURITY;

-- job_queue may have been created outside migrations; guard with a DO block
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_queue'
  ) THEN
    EXECUTE 'ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;
