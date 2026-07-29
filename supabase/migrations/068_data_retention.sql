-- Migration 068: purge-old-data cron job.
-- Same params/headers and app.settings.* fixes as 067 and 069.
-- The dry_run body was correct in the original (dry_run:false), verified by
-- invoking the deployed function in dry-run mode before this job went live:
-- 101,809 rows in game_snapshots would be purged on first run, zero elsewhere.

SELECT cron.unschedule('purge-old-impressions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-impressions');

CREATE OR REPLACE FUNCTION public.refresh_daily_impression_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_impression_stats;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_daily_impression_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_daily_impression_stats() TO service_role;

SELECT cron.unschedule('purge-old-data')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-data');

SELECT cron.schedule(
  'purge-old-data',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/purge-old-data',
    body    := '{"dry_run": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'
      )
    )
  );
  $job$
);
