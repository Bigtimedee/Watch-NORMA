-- 067_monitor_health.sql
-- Adds ops_alert_state dedup table and pg_cron job for monitor-health (P1-03).
-- ops_alert_state tracks when each alert fingerprint was last paged so that
-- monitor-health can suppress repeated identical alerts within a cooldown window.

-- ---------------------------------------------------------------------------
-- ops_alert_state: dedup table for health monitor alerts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ops_alert_state (
  fingerprint    TEXT        PRIMARY KEY,
  severity       TEXT        NOT NULL CHECK (severity IN ('warning', 'critical')),
  title          TEXT        NOT NULL,
  last_paged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the service role may read or write this table.
ALTER TABLE public.ops_alert_state ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — the service role bypasses RLS by default.
-- Explicitly deny all authenticated/anon access.
CREATE POLICY "ops_alert_state: service role only"
  ON public.ops_alert_state
  FOR ALL
  USING (false);

-- Index for fast fingerprint + time range lookups
CREATE INDEX IF NOT EXISTS idx_ops_alert_state_fingerprint_time
  ON public.ops_alert_state (fingerprint, last_paged_at DESC);

-- ---------------------------------------------------------------------------
-- pg_cron: schedule monitor-health every 5 minutes
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'monitor-health',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/monitor-health',
    body   := '{}'::jsonb,
    params := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  );
  $$
);
