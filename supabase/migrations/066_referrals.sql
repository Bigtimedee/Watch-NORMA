CREATE TABLE IF NOT EXISTS public.referrals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id),
  referred_id UUID REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(4), 'hex'),
  uses INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own referral code"
  ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_referral_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referral_code TEXT;
  referring_user_id UUID;
BEGIN
  referral_code := NEW.raw_user_meta_data->>'referral_code';

  IF referral_code IS NULL OR referral_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO referring_user_id
  FROM public.referral_codes
  WHERE code = referral_code;

  IF referring_user_id IS NULL OR referring_user_id = NEW.id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, code)
  VALUES (referring_user_id, NEW.id, referral_code || ':' || NEW.id::TEXT)
  ON CONFLICT (code) DO NOTHING;

  UPDATE public.referral_codes
  SET uses = uses + 1
  WHERE user_id = referring_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_referral_signup ON auth.users;
CREATE TRIGGER on_auth_user_referral_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_signup();
