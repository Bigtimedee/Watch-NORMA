-- Migration 067: monitor-health cron job and ops_alert_state table.
-- Rewritten from the version applied to production 2026-07-29.
-- Original referenced current_setting('app.supabase_url' / 'app.service_role_key'),
-- neither of which exists on this database, and passed Authorization through
-- params (pg_net's URL query string, not headers). Both fixed: URL is
-- hardcoded, auth is read from Vault, and it goes through headers.

CREATE TABLE IF NOT EXISTS public.ops_alert_state (
  fingerprint    TEXT        PRIMARY KEY,
  severity       TEXT        NOT NULL CHECK (severity IN ('warning', 'critical')),
  title          TEXT        NOT NULL,
  last_paged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_alert_state ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ops_alert_state'
      AND policyname='ops_alert_state: service role only'
  ) THEN
    CREATE POLICY "ops_alert_state: service role only"
      ON public.ops_alert_state FOR ALL USING (false);
  END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS idx_ops_alert_state_fingerprint_time
  ON public.ops_alert_state (fingerprint, last_paged_at DESC);

SELECT cron.unschedule('monitor-health')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-health');

SELECT cron.schedule(
  'monitor-health',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/monitor-health',
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
