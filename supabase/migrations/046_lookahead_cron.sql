-- Add daily lookahead cron: pre-populate upcoming 5 days of game schedules
-- Runs at 8AM UTC (3AM Eastern) — well before any games tip off

SELECT cron.schedule(
  'poll-schedule-lookahead',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-schedule-lookahead',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
