-- Migration 056: Cron job for deep link health check
-- Guarded by extension existence checks: pg_cron and pg_net are available in
-- Supabase cloud but may be absent in CI test environments. The DO block
-- silently skips scheduling when either extension is not installed, allowing
-- the migration to succeed in all environments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'deep-link-health-check',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/deep-link-health-check',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END
$$;
