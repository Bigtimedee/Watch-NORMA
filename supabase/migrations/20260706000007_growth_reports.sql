-- Migration 20260706000007: growth_reports table, report_log table, and the
-- two weekly report cron jobs (growth-weekly-report, advertiser-weekly-report).
--
-- Rewritten from the version applied to production 2026-07-29. Three changes
-- from the original file:
--
--   1. Same app.settings.* / params-vs-headers fix as every other cron
--      migration touched this session.
--   2. report_log did not exist anywhere in this repository despite
--      advertiser-weekly-report/index.ts writing to it directly, and despite
--      that function being one of the eight this migration set out to
--      unblock. Its schema is reconstructed here from exactly the fields the
--      function inserts. If the originally intended schema differed, treat
--      this table as a candidate for review, not as settled.
--   3. advertiser-weekly-report's cron schedule (Monday 13:00 UTC) was never
--      defined in any migration. It is taken from the comment at the top of
--      advertiser-weekly-report/index.ts, which documents its own intended
--      schedule. This is an inference from the function's source, not from a
--      tracked scheduling decision, and is worth confirming against actual
--      product intent.

CREATE TABLE IF NOT EXISTS public.growth_reports (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  report_json  JSONB       NOT NULL DEFAULT '{}',
  email_status TEXT        NOT NULL DEFAULT 'pending',
  email_error  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_start)
);

ALTER TABLE public.growth_reports ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='growth_reports'
      AND policyname='growth_reports: service role only'
  ) THEN
    CREATE POLICY "growth_reports: service role only"
      ON public.growth_reports FOR ALL USING (false);
  END IF;
END;
$do$;

CREATE TABLE IF NOT EXISTS public.report_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT      NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  report_type   TEXT        NOT NULL,
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  email_to      TEXT        NOT NULL,
  impressions   INT         NOT NULL DEFAULT 0,
  spend_cents   INT         NOT NULL DEFAULT 0,
  conversions   INT         NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL CHECK (status IN ('sent', 'failed')),
  error_detail  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_log_advertiser_period
  ON public.report_log (advertiser_id, period_start DESC);

ALTER TABLE public.report_log ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='report_log'
      AND policyname='report_log: advertiser reads own'
  ) THEN
    CREATE POLICY "report_log: advertiser reads own"
      ON public.report_log FOR SELECT
      USING (advertiser_id IN (SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()));
  END IF;
END;
$do$;

SELECT cron.unschedule('growth-weekly-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growth-weekly-report');

SELECT cron.schedule(
  'growth-weekly-report',
  '0 12 * * 1',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/growth-weekly-report',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'
      )
    )
  );
  $job$
);

SELECT cron.unschedule('advertiser-weekly-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'advertiser-weekly-report');

SELECT cron.schedule(
  'advertiser-weekly-report',
  '0 13 * * 1',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/advertiser-weekly-report',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'
      )
    )
  );
  $job$
);
