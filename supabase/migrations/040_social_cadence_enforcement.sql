-- =============================================================================
-- Migration 040: Social Cadence Enforcement
-- Adds Postgres RPCs for daily post counting + catch-up cron job.
-- Enforces 4-post minimum and 8-post maximum per day across X, Instagram,
-- and Facebook combined (TikTok and Reddit are excluded from the cap).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. social_posts_published_today
--    Count posts already published today for the given platforms (ET day boundary)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_posts_published_today(p_platforms text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.social_posts
  WHERE platform = ANY(p_platforms)
    AND status = 'published'
    AND published_at >= (
      date_trunc('day', now() AT TIME ZONE 'America/New_York')
      AT TIME ZONE 'America/New_York'
    );
$$;

-- ---------------------------------------------------------------------------
-- 2. social_posts_queued_today
--    Count posts generated OR published today for the given platforms (ET day boundary).
--    "Queued" = generated (not yet published) + already published.
--    Used by generate-social-content to check how many slots remain.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_posts_queued_today(p_platforms text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.social_posts
  WHERE platform = ANY(p_platforms)
    AND status IN ('generated', 'published')
    AND created_at >= (
      date_trunc('day', now() AT TIME ZONE 'America/New_York')
      AT TIME ZONE 'America/New_York'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Catch-up cron — 9pm UTC (4pm ET / 5pm EDT)
--    Fires once per day. If we're below the 4-post minimum, it triggers
--    generate-social-content with catch_up=true, which bypasses the
--    per-platform dedup and fills remaining cadence slots.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old version if present
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'social-cadence-catchup';

    PERFORM cron.schedule(
      'social-cadence-catchup',
      '0 21 * * *',
      $cron$
      SELECT net.http_post(
        url     := current_setting('app.supabase_url') || '/functions/v1/generate-social-content',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body    := '{"source":"pg_cron_catchup","catch_up":true}'::jsonb
      );
      $cron$
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grant execute to authenticated + service roles
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.social_posts_published_today(text[]) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.social_posts_queued_today(text[]) TO service_role, authenticated;

COMMENT ON FUNCTION public.social_posts_published_today IS
  'Count social posts published today (ET) for the given platforms. Used by the cadence enforcement system.';

COMMENT ON FUNCTION public.social_posts_queued_today IS
  'Count social posts queued (generated or published) today (ET) for the given platforms. Used by generate-social-content cadence guard.';
