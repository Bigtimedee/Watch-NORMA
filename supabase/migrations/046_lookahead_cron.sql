-- Add daily lookahead cron: pre-populate upcoming 5 days of game schedules
-- Runs at 8AM UTC (3AM Eastern) — well before any games tip off

SELECT cron.schedule(
  'poll-schedule-lookahead',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule-lookahead',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"}'::jsonb
  );
  $$
);
