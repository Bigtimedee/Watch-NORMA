-- Migration 089: Partners table for full BD pipeline management
-- Separate from partner_referral_codes (which is co-marketing attribution only).
-- This is the CRM-style record for every organization NORMA has or may have a partnership with.

CREATE TABLE IF NOT EXISTS public.partners (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('sportsbook', 'streaming', 'prediction_market', 'media', 'fantasy', 'tech')),
  partnership_status TEXT NOT NULL DEFAULT 'prospect' CHECK (partnership_status IN ('prospect', 'negotiating', 'active', 'churned')),
  referral_code TEXT,                -- matches partner_referral_codes.code when set
  bd_contact_name TEXT,
  bd_contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.partners IS
  'BD pipeline CRM for NORMA partnerships. One row per partner org. '
  'referral_code (when set) joins to partner_referral_codes.code for attribution data. '
  'Admin-only; no RLS needed — read via requireAdmin() service role.';

-- Seed: 5 initial partners
INSERT INTO public.partners (name, tier, partnership_status, referral_code, notes) VALUES
  ('FanDuel',     'sportsbook',        'prospect', 'fd2026',  'Largest US sportsbook by handle. Co-marketing target for Q3 2026.'),
  ('DraftKings',  'sportsbook',        'prospect', 'dk2026',  'Second-largest US sportsbook. Strong NCAA basketball vertical.'),
  ('ESPN+',       'streaming',         'prospect', NULL,      'Primary streaming partner candidate for NCAA live game coverage.'),
  ('Kalshi',      'prediction_market', 'active',   NULL,      'NORMA has live Kalshi integration — users can sync prediction market positions.'),
  ('Polymarket',  'prediction_market', 'active',   NULL,      'Polymarket CLOB API integration in progress. Positions sync partially supported.')
ON CONFLICT DO NOTHING;
