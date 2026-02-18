-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Poll schedule every 30 minutes
SELECT cron.schedule(
  'poll-schedule',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"}'::jsonb
  );
  $$
);

-- Poll boxscore every minute
SELECT cron.schedule(
  'poll-boxscore',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-boxscore',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"}'::jsonb
  );
  $$
);

-- Evaluate alerts every minute
SELECT cron.schedule(
  'evaluate-alerts',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/evaluate-alerts',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"}'::jsonb
  );
  $$
);
