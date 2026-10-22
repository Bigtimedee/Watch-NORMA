-- Growth Spec C: pre-signup funnel events, activation definition, weekly funnel.
-- activation = first alert delivered within 7 days of signup.
-- Idempotent and additive.

-- 1. Anonymous (pre-account) app events -> web_events, allowlisted names only.
CREATE OR REPLACE FUNCTION public.track_anon_event(p_event text, p_props jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event NOT IN (
    'welcome_viewed', 'onboarding_welcome_viewed', 'guest_mode_started', 'guest_follow',
    'signup_started', 'signup_prompt_shown', 'referral_link_open'
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.web_events (event_name, properties)
  VALUES (p_event, jsonb_strip_nulls(coalesce(p_props, '{}'::jsonb) || jsonb_build_object('source', 'app')));
END $$;
REVOKE ALL ON FUNCTION public.track_anon_event(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.track_anon_event(text, jsonb) TO anon, authenticated;

-- 2. first_alert_delivered (once per user) + activated (within 7 days of signup).
CREATE OR REPLACE FUNCTION public.app_events_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE signed_up timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_events WHERE user_id = NEW.user_id AND event_name = 'first_alert_delivered') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.app_events (user_id, event_name, properties)
  VALUES (NEW.user_id, 'first_alert_delivered', NEW.properties);
  SELECT created_at INTO signed_up FROM auth.users WHERE id = NEW.user_id;
  IF signed_up IS NOT NULL AND NEW.created_at - signed_up <= interval '7 days' THEN
    INSERT INTO public.app_events (user_id, event_name, properties)
    VALUES (NEW.user_id, 'activated', jsonb_build_object('hours_to_activate',
      round(extract(epoch FROM (NEW.created_at - signed_up)) / 3600.0, 1)));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS app_events_activation ON public.app_events;
CREATE TRIGGER app_events_activation AFTER INSERT ON public.app_events
  FOR EACH ROW WHEN (NEW.event_name = 'first_alert_received')
  EXECUTE FUNCTION public.app_events_activation();

-- Backfill first_alert_delivered / activated for existing users (once).
INSERT INTO public.app_events (user_id, event_name, properties, created_at)
SELECT f.user_id, 'first_alert_delivered', f.properties, f.created_at
FROM (
  SELECT DISTINCT ON (user_id) user_id, properties, created_at
  FROM public.app_events WHERE event_name = 'first_alert_received'
  ORDER BY user_id, created_at
) f
WHERE NOT EXISTS (SELECT 1 FROM public.app_events e WHERE e.user_id = f.user_id AND e.event_name = 'first_alert_delivered');

INSERT INTO public.app_events (user_id, event_name, properties, created_at)
SELECT d.user_id, 'activated',
       jsonb_build_object('hours_to_activate', round(extract(epoch FROM (d.created_at - u.created_at)) / 3600.0, 1), 'backfill', true),
       d.created_at
FROM public.app_events d JOIN auth.users u ON u.id = d.user_id
WHERE d.event_name = 'first_alert_delivered'
  AND d.created_at - u.created_at <= interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM public.app_events e WHERE e.user_id = d.user_id AND e.event_name = 'activated');

CREATE INDEX IF NOT EXISTS app_events_name_user_idx ON public.app_events (event_name, user_id);

-- 3. Weekly funnel: welcome -> signup_completed -> activated (signup-week cohorts).
CREATE OR REPLACE VIEW public.growth_signup_funnel_weekly AS
WITH weeks AS (
  SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS week
),
welcome AS (
  SELECT date_trunc('week', created_at) AS week, count(*) AS n
  FROM (
    SELECT created_at FROM public.web_events WHERE event_name IN ('welcome_viewed')
    UNION ALL
    SELECT created_at FROM public.app_events WHERE event_name = 'welcome_viewed'
  ) w GROUP BY 1
),
signups AS (
  SELECT date_trunc('week', u.created_at) AS week, count(*) AS n,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.app_events a WHERE a.user_id = u.id AND a.event_name = 'activated')) AS activated
  FROM auth.users u GROUP BY 1
),
completed AS (
  SELECT date_trunc('week', created_at) AS week, count(DISTINCT user_id) AS n
  FROM public.app_events WHERE event_name = 'signup_completed' GROUP BY 1
)
SELECT w.week::date AS cohort_week,
       coalesce(we.n, 0) AS welcome_views,
       coalesce(c.n, 0) AS signup_completed_events,
       coalesce(s.n, 0) AS signups,
       coalesce(s.activated, 0) AS activated
FROM weeks w
LEFT JOIN welcome we ON we.week = w.week
LEFT JOIN completed c ON c.week = w.week
LEFT JOIN signups s ON s.week = w.week
ORDER BY w.week DESC;

REVOKE ALL ON public.growth_signup_funnel_weekly FROM anon, authenticated;
GRANT SELECT ON public.growth_signup_funnel_weekly TO service_role;
