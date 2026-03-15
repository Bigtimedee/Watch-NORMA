-- Migration 038: Cron job for deep link health check
-- Run deep link health check every 15 minutes
SELECT cron.schedule(
  'deep-link-health-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/deep-link-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
