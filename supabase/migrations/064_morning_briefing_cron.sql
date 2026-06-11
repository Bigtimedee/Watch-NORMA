-- NORMA Morning Briefing Cron
-- Migration 061: schedule the morning-briefing Edge Function at 6 PM CT = 11 PM UTC

SELECT cron.schedule(
  'morning-briefing',
  '0 23 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/morning-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
