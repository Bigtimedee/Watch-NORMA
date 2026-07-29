-- Migration 069: provider_link_checks table, verify-provider-links cron,
-- and morning-briefing cron (originally migration 064, folded in here
-- since both were applied together and both had the same params/headers
-- and app.settings.* bugs). Same fix pattern as 067.

CREATE TABLE IF NOT EXISTS public.provider_link_checks (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_key           TEXT        NOT NULL,
  universal_link_tested  TEXT        NOT NULL,
  final_url              TEXT,
  http_status            INT,
  status                 TEXT        NOT NULL CHECK (status IN ('ok', 'suspect', 'broken')),
  reason                 TEXT,
  checked_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_link_checks_provider_time
  ON public.provider_link_checks (provider_key, checked_at DESC);

ALTER TABLE public.provider_link_checks ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='provider_link_checks'
      AND policyname='provider_link_checks: service role only'
  ) THEN
    CREATE POLICY "provider_link_checks: service role only"
      ON public.provider_link_checks FOR ALL USING (false);
  END IF;
END;
$do$;

SELECT cron.unschedule('verify-provider-links')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-provider-links');

SELECT cron.schedule(
  'verify-provider-links',
  '0 */6 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/verify-provider-links',
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

SELECT cron.unschedule('morning-briefing')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-briefing');

SELECT cron.schedule(
  'morning-briefing',
  '0 23 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/morning-briefing',
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
