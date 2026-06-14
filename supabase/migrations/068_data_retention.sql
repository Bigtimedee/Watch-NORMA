-- 068_data_retention.sql
-- Adds daily data-retention cleanup job (P1-04).
-- Tables covered: game_snapshots (30d), deep_link_events (90d),
--   delivery_log (180d), impressions (13mo / 397d).
-- Conversions cascade-delete with impressions (ON DELETE CASCADE).
--
-- The existing 'purge-old-impressions' cron (migration 022) did a single
-- unbatched DELETE with a 90-day window. This migration:
--   1. Removes that job (replaced by the new batched Edge Function).
--   2. Adds a helper function so the Edge Function can refresh the
--      daily_impression_stats materialized view via supabase.rpc().
--   3. Schedules purge-old-data daily at 9 AM UTC (4 AM ET).

-- ---------------------------------------------------------------------------
-- Remove the old unbatched impression purge (migration 022)
-- ---------------------------------------------------------------------------

SELECT cron.unschedule('purge-old-impressions');

-- ---------------------------------------------------------------------------
-- RPC helper: refresh_daily_impression_stats
-- Allows the Edge Function to trigger a materialized-view refresh via rpc()
-- without needing raw SQL exec privileges.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_daily_impression_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_impression_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_daily_impression_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_daily_impression_stats() TO service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: schedule purge-old-data daily at 9 AM UTC (4 AM ET)
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'purge-old-data',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/purge-old-data',
    body   := '{"dry_run": false}'::jsonb,
    params := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  );
  $$
);
