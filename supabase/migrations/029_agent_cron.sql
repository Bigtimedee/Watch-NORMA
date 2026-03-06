-- pg_cron job: run NORMA Agent evaluation every 60 seconds
SELECT cron.schedule(
  'norma-agent-evaluate',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/norma-agent-evaluate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
