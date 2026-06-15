-- Migration 070: Alert feedback table
-- Stores thumbs-up / thumbs-down ratings users give to alerts.
-- One row per (alert, user) — re-rating via upsert updates the existing row.
-- Used downstream to tune scoring weights; does NOT alter current scoring behavior.

CREATE TABLE IF NOT EXISTS public.alert_feedback (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id    BIGINT NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  user_id     UUID   NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  rating      TEXT   NOT NULL CHECK (rating IN ('up', 'down')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT  alert_feedback_alert_user_unique UNIQUE (alert_id, user_id)
);

ALTER TABLE public.alert_feedback ENABLE ROW LEVEL SECURITY;

-- Users can read, insert, and update only their own rows.
CREATE POLICY "Users manage own alert feedback" ON public.alert_feedback
  FOR ALL USING (auth.uid() = user_id);

-- alert_id lookup (for future aggregate queries: "how was this alert rated?")
CREATE INDEX IF NOT EXISTS idx_alert_feedback_alert
  ON public.alert_feedback(alert_id);

-- user + time lookup (for feedback history)
CREATE INDEX IF NOT EXISTS idx_alert_feedback_user
  ON public.alert_feedback(user_id, created_at DESC);
