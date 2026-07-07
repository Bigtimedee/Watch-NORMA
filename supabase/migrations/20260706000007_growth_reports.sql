-- growth_reports: one row per weekly internal growth report.
CREATE TABLE IF NOT EXISTS public.growth_reports (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  report_json  JSONB       NOT NULL DEFAULT '{}',
  email_status TEXT        NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  email_error  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_start)
);

ALTER TABLE public.growth_reports ENABLE ROW LEVEL SECURITY;
-- Only service role reads/writes growth_reports.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END;
$$;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'growth-weekly-report';

-- Mondays at 8 AM ET = 12:00 UTC (summer/DST, UTC-4).
-- Shift to 13:00 UTC in winter (UTC-5).
SELECT cron.schedule(
  'growth-weekly-report',
  '0 12 * * 1',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/growth-weekly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body    := '{"source":"pg_cron"}'::jsonb
  );
  $$
);
