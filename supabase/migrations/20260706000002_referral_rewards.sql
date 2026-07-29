-- referral_rewards: tracks which referral milestones each user has been granted.
-- Milestone 3 = "NORMA Insider" (3 qualifying referrals: referred user signed up + received first alert).
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone INTEGER NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_user_id, milestone)
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_rewards'
      AND policyname='Users read own rewards'
  ) THEN
    CREATE POLICY "Users read own rewards" ON public.referral_rewards
      FOR SELECT USING (auth.uid() = referrer_user_id);
  END IF;
END;
$$;

-- Add insider_status to profiles for NORMA Insider badge display
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS insider_status BOOLEAN DEFAULT false;
