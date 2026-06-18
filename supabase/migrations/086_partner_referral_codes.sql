-- Migration 086: Partner referral codes for co-marketing user acquisition
-- Separate from user referral_codes (which are tied to auth.users).
-- Partners (sportsbooks, streaming services) get a static code per partner_key
-- that is embedded in co-marketing landing page URLs so app installs are attributed.

CREATE TABLE IF NOT EXISTS public.partner_referral_codes (
  partner_key TEXT PRIMARY KEY,           -- matches provider_registry.key
  code TEXT UNIQUE NOT NULL,              -- short alphanumeric, embedded in App Store URL
  clicks INT DEFAULT 0,                  -- incremented when landing page is visited
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.partner_referral_codes IS
  'Static referral codes for co-marketing partners (sportsbooks, streaming services). '
  'Codes are embedded in App Store deep links on /partners/[partnerKey] landing pages. '
  'Installs attributed via referral_codes.code lookup at signup.';

-- No RLS needed — this is admin-only data read via service role.
-- The landing page reads these server-side; the admin view reads via requireAdmin().

-- Helper function to safely increment click count
CREATE OR REPLACE FUNCTION public.increment_partner_clicks(p_key TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.partner_referral_codes
  SET clicks = clicks + 1
  WHERE partner_key = p_key;
$$;

-- Seed: one code per priority sportsbook partner
INSERT INTO public.partner_referral_codes (partner_key, code) VALUES
  ('draftkings',  'dk2026'),
  ('fanduel',     'fd2026'),
  ('betmgm',      'mgm2026'),
  ('caesars',     'czr2026'),
  ('espnbet',     'espn2026')
ON CONFLICT (partner_key) DO NOTHING;
