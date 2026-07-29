-- Activation-funnel analytics: first-party event stream
-- Privacy: user_id is required; no PII may be stored in properties.
-- Service role bypasses RLS for server-side inserts (evaluate-alerts).

CREATE TABLE IF NOT EXISTS app_events (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name  TEXT        NOT NULL,
  properties  JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

-- Mobile app users insert their own events (anon key / user JWT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_events'
      AND policyname='Users insert own events'
  ) THEN
    CREATE POLICY "Users insert own events" ON app_events
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- Admin web portal (user JWT with app_metadata.role = admin) reads all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_events'
      AND policyname='Admin reads all events'
  ) THEN
    CREATE POLICY "Admin reads all events" ON app_events
      FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_app_events_user     ON app_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_name_ts  ON app_events(event_name, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- daily_activation_funnel
-- Per signup cohort-day: how many users completed each activation step.
-- Reads from profiles (signup) joined to app_events (step completion).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW daily_activation_funnel AS
SELECT
  (p.created_at AT TIME ZONE 'UTC')::date AS cohort_date,
  COUNT(DISTINCT p.id)             AS signups,
  COUNT(DISTINCT e_conn.user_id)   AS added_connection,
  COUNT(DISTINCT e_follow.user_id) AS followed_team,
  COUNT(DISTINCT e_alert.user_id)  AS received_alert,
  COUNT(DISTINCT e_watch.user_id)  AS watch_tapped
FROM profiles p
LEFT JOIN app_events e_conn   ON e_conn.user_id   = p.id AND e_conn.event_name   = 'first_connection_added'
LEFT JOIN app_events e_follow ON e_follow.user_id  = p.id AND e_follow.event_name = 'first_team_followed'
LEFT JOIN app_events e_alert  ON e_alert.user_id   = p.id AND e_alert.event_name  = 'first_alert_received'
LEFT JOIN app_events e_watch  ON e_watch.user_id   = p.id AND e_watch.event_name  = 'watch_tap'
GROUP BY 1
ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- retention_cohorts
-- D1 / D7 / D30 retention by signup week (any app_event counts as active).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW retention_cohorts AS
WITH cohorts AS (
  SELECT
    id                                                          AS user_id,
    date_trunc('week', created_at AT TIME ZONE 'UTC')::date    AS cohort_week,
    (created_at AT TIME ZONE 'UTC')::date                      AS signup_date
  FROM profiles
),
activity AS (
  SELECT user_id, (created_at AT TIME ZONE 'UTC')::date AS active_date
  FROM app_events
  GROUP BY 1, 2
)
SELECT
  c.cohort_week,
  COUNT(DISTINCT c.user_id)                                                             AS cohort_size,
  COUNT(DISTINCT a1.user_id)                                                            AS retained_d1,
  COUNT(DISTINCT a7.user_id)                                                            AS retained_d7,
  COUNT(DISTINCT a30.user_id)                                                           AS retained_d30,
  ROUND(100.0 * COUNT(DISTINCT a1.user_id)  / NULLIF(COUNT(DISTINCT c.user_id), 0), 1) AS d1_pct,
  ROUND(100.0 * COUNT(DISTINCT a7.user_id)  / NULLIF(COUNT(DISTINCT c.user_id), 0), 1) AS d7_pct,
  ROUND(100.0 * COUNT(DISTINCT a30.user_id) / NULLIF(COUNT(DISTINCT c.user_id), 0), 1) AS d30_pct
FROM cohorts c
LEFT JOIN activity a1
  ON a1.user_id    = c.user_id
 AND a1.active_date BETWEEN c.signup_date + INTERVAL '1 day'  AND c.signup_date + INTERVAL '2 days'
LEFT JOIN activity a7
  ON a7.user_id    = c.user_id
 AND a7.active_date BETWEEN c.signup_date + INTERVAL '6 days' AND c.signup_date + INTERVAL '8 days'
LEFT JOIN activity a30
  ON a30.user_id   = c.user_id
 AND a30.active_date BETWEEN c.signup_date + INTERVAL '28 days' AND c.signup_date + INTERVAL '32 days'
GROUP BY 1
ORDER BY 1 DESC;
