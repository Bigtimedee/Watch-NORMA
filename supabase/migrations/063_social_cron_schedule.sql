-- NORMA Social Cron — Correct schedules
-- Migration 060: ensure generate-social-content runs every 6 hours
--   and publish-social-posts runs every hour (already set, re-pin for safety).
--
-- Current state after migration 047:
--   generate-social-content: '0 6 * * *'  (once daily at 6 AM UTC)
--   publish-social-posts:    '0 * * * *'  (hourly — correct)
--
-- Required state:
--   generate-social-content: '0 */6 * * *' (every 6 hours)
--   publish-social-posts:    '0 * * * *'   (hourly — no change)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Re-schedule generate-social-content to every 6 hours
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'generate-social-content';

    PERFORM cron.schedule(
      'generate-social-content',
      '0 */6 * * *',
      $cron$
        SELECT net.http_post(
          url     := current_setting('app.settings.supabase_url') || '/functions/v1/generate-social-content',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body    := '{}'::jsonb
        );
      $cron$
    );

    -- Re-pin publish-social-posts (idempotent, already hourly)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'publish-social-posts';

    PERFORM cron.schedule(
      'publish-social-posts',
      '0 * * * *',
      $cron$
        SELECT net.http_post(
          url     := current_setting('app.settings.supabase_url') || '/functions/v1/publish-social-posts',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body    := '{}'::jsonb
        );
      $cron$
    );

  END IF;
END;
$$;
