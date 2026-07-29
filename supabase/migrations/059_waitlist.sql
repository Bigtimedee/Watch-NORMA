-- NORMA Waitlist — Landing page email capture
-- Migration 059: waitlist_emails table for launch notification signups

CREATE TABLE IF NOT EXISTS public.waitlist_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'landing_page',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.waitlist_emails ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own email; only service role can read the list
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='waitlist_emails'
      AND policyname='Anyone can join waitlist'
  ) THEN
    CREATE POLICY "Anyone can join waitlist"
      ON public.waitlist_emails
      FOR INSERT
      WITH CHECK (true);
  END IF;
END;
$$;
