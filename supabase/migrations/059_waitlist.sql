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
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist_emails
  FOR INSERT
  WITH CHECK (true);
