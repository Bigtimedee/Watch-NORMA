-- 069_provider_link_checks.sql
-- Adds provider_link_checks table and pg_cron job for verify-provider-links (P1-05).
-- Stores the result of each proactive universal-link health check so that
-- verify-provider-links can detect status changes and avoid repeated Slack noise.

-- ---------------------------------------------------------------------------
-- provider_link_checks: history of universal-link verification runs
-- ---------------------------------------------------------------------------

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

-- Index for fast per-provider time-ordered lookups (used by change-detection query)
CREATE INDEX IF NOT EXISTS idx_provider_link_checks_provider_time
  ON public.provider_link_checks (provider_key, checked_at DESC);

-- Service role only — no user-facing queries needed
ALTER TABLE public.provider_link_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_link_checks: service role only"
  ON public.provider_link_checks
  FOR ALL
  USING (false);

-- ---------------------------------------------------------------------------
-- pg_cron: schedule verify-provider-links every 6 hours
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'verify-provider-links',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/verify-provider-links',
    body   := '{}'::jsonb,
    params := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  );
  $$
);
