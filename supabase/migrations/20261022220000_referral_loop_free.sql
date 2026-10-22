-- Spec B (free parts): referral attribution fixes. No paid deep-link vendor.

-- 1. Click log for /i/[code] (deferred match on first open within 24h).
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_clicks_match_idx ON public.referral_clicks (ip_hash, created_at DESC);
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY; -- service role only

-- 2. referrals: qualification + source.
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS method TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_id_uniq ON public.referrals (referred_id) WHERE referred_id IS NOT NULL;

-- 3. claim_referral(code): covers Apple / Google / any path the signup-metadata trigger misses.
CREATE OR REPLACE FUNCTION public.claim_referral(p_code TEXT, p_method TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_referrer UUID;
  v_created TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR p_code IS NULL OR length(p_code) = 0 THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = v_uid) THEN RETURN FALSE; END IF;
  -- Only new accounts (created within 7 days) can claim.
  SELECT created_at INTO v_created FROM auth.users WHERE id = v_uid;
  IF v_created IS NULL OR v_created < now() - interval '7 days' THEN RETURN FALSE; END IF;
  SELECT user_id INTO v_referrer FROM referral_codes WHERE code = p_code;
  IF v_referrer IS NULL OR v_referrer = v_uid THEN RETURN FALSE; END IF;

  INSERT INTO referrals (referrer_id, referred_id, code, method)
  VALUES (v_referrer, v_uid, p_code || ':' || v_uid::TEXT, COALESCE(p_method, 'oauth'))
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE referral_codes SET uses = uses + 1 WHERE user_id = v_referrer;
  INSERT INTO app_events (user_id, event_name, properties)
  VALUES (v_uid, 'referral_signup', jsonb_build_object('code', p_code, 'method', COALESCE(p_method, 'oauth')));
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_referral(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(TEXT, TEXT) TO authenticated;

-- Email signups (metadata trigger) also log referral_signup.
CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  referral_code TEXT;
  referring_user_id UUID;
BEGIN
  referral_code := NEW.raw_user_meta_data->>'referral_code';
  IF referral_code IS NULL OR referral_code = '' THEN RETURN NEW; END IF;
  SELECT user_id INTO referring_user_id FROM public.referral_codes WHERE code = referral_code;
  IF referring_user_id IS NULL OR referring_user_id = NEW.id THEN RETURN NEW; END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, code, method)
  VALUES (referring_user_id, NEW.id, referral_code || ':' || NEW.id::TEXT, 'email')
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.referral_codes SET uses = uses + 1 WHERE user_id = referring_user_id;
    BEGIN
      INSERT INTO public.app_events (user_id, event_name, properties)
      VALUES (NEW.id, 'referral_signup', jsonb_build_object('code', referral_code, 'method', 'email'));
    EXCEPTION WHEN OTHERS THEN NULL; -- never block signup on analytics
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Qualification: first alert for a referred user sets qualified_at; 3 qualified grants Insider once.
CREATE OR REPLACE FUNCTION public.referral_qualify_on_first_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count INT;
BEGIN
  IF NEW.event_name <> 'first_alert_received' THEN RETURN NEW; END IF;
  UPDATE referrals SET qualified_at = now()
   WHERE referred_id = NEW.user_id AND qualified_at IS NULL
   RETURNING referrer_id, code INTO r;
  IF r.referrer_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO app_events (user_id, event_name, properties)
  VALUES (NEW.user_id, 'referral_qualified', jsonb_build_object('code', split_part(r.code, ':', 1)));

  SELECT count(*) INTO v_count FROM referrals WHERE referrer_id = r.referrer_id AND qualified_at IS NOT NULL;
  IF v_count >= 3 THEN
    INSERT INTO referral_rewards (referrer_user_id, milestone) VALUES (r.referrer_id, 3)
    ON CONFLICT (referrer_user_id, milestone) DO NOTHING;
    IF FOUND THEN
      UPDATE profiles SET insider_status = true WHERE id = r.referrer_id;
      INSERT INTO app_events (user_id, event_name, properties)
      VALUES (r.referrer_id, 'referral_reward_granted', jsonb_build_object('milestone', 3));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS app_events_referral_qualify ON public.app_events;
CREATE TRIGGER app_events_referral_qualify AFTER INSERT ON public.app_events
  FOR EACH ROW WHEN (NEW.event_name = 'first_alert_received')
  EXECUTE FUNCTION public.referral_qualify_on_first_alert();

-- Backfill qualified_at from existing first alerts (no reward events emitted retroactively).
UPDATE public.referrals rf SET qualified_at = e.first_at
FROM (SELECT user_id, min(created_at) first_at FROM public.app_events
      WHERE event_name = 'first_alert_received' GROUP BY user_id) e
WHERE rf.referred_id = e.user_id AND rf.qualified_at IS NULL;

-- 5. Deferred match: app calls on first open after signup; matches a click within 24h by ip hash.
CREATE OR REPLACE FUNCTION public.match_referral_click(p_ip_hash TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT code FROM referral_clicks
  WHERE ip_hash = p_ip_hash AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.match_referral_click(TEXT) FROM PUBLIC, anon, authenticated;


-- 6. Allow referral_install_attributed from signed-out app (deferred match).
CREATE OR REPLACE FUNCTION public.track_anon_event(p_event text, p_props jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event NOT IN (
    'welcome_viewed', 'onboarding_welcome_viewed', 'guest_mode_started', 'guest_follow',
    'signup_started', 'signup_prompt_shown', 'referral_link_open', 'referral_install_attributed'
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.web_events (event_name, properties)
  VALUES (p_event, jsonb_strip_nulls(coalesce(p_props, '{}'::jsonb) || jsonb_build_object('source', 'app')));
END $$;
REVOKE ALL ON FUNCTION public.track_anon_event(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.track_anon_event(text, jsonb) TO anon, authenticated;

-- 7. Admin helper for K-factor denominator (service role only).
CREATE OR REPLACE FUNCTION public.count_distinct_app_users_since(p_since timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT user_id)::int FROM app_events WHERE created_at >= p_since;
$$;
REVOKE ALL ON FUNCTION public.count_distinct_app_users_since(timestamptz) FROM PUBLIC, anon, authenticated;
