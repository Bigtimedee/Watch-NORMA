-- NORMA Geo-Compliance Foundation for Sportsbook Ads
-- Migration 058: user timezone storage, advertiser jurisdiction restrictions,
--   sportsbook legal state reference table

-- User timezone for geo-targeting (collected from device on first launch)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Advertisers: which jurisdictions they can serve ads in
-- NULL = unrestricted (non-sportsbook advertisers like streaming, apparel, etc.)
-- Array of state codes = restricted (sportsbook advertisers must comply with state law)
ALTER TABLE public.advertisers
  ADD COLUMN IF NOT EXISTS allowed_jurisdictions TEXT[] DEFAULT NULL;

-- Reference table: which sportsbooks are legal in which states
-- Used by the auction engine to filter bids before ranking
CREATE TABLE IF NOT EXISTS public.sportsbook_restrictions (
  sportsbook_key TEXT NOT NULL,   -- e.g. 'draftkings', 'fanduel', 'betmgm'
  allowed_states TEXT[] NOT NULL, -- e.g. ARRAY['NJ','PA','CO','MI',...]
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sportsbook_key)
);

-- Seed: known legal states for major sportsbooks (as of 2025)
-- Sources: American Gaming Association state tracker + individual operator pages
INSERT INTO public.sportsbook_restrictions (sportsbook_key, allowed_states) VALUES
  ('draftkings', ARRAY['AZ','CO','CT','IL','IN','IA','KS','LA','MD','MA','MI','NH','NJ','NY','NC','OH','OR','PA','TN','VA','WV','WY']),
  ('fanduel',    ARRAY['AZ','CO','CT','IL','IN','IA','KS','LA','MD','MA','MI','NJ','NY','NC','OH','PA','TN','VA','WV','WY']),
  ('betmgm',     ARRAY['AZ','CO','DC','IL','IN','IA','KS','LA','MD','MA','MI','MS','NJ','NY','OH','OR','PA','TN','VA','WV','WY']),
  ('caesars',    ARRAY['AZ','CO','CT','IL','IN','IA','KS','LA','MD','MA','MI','NJ','NY','NC','OH','PA','TN','VA','WV','WY']),
  ('pointsbet',  ARRAY['CO','IL','IN','IA','MI','NJ','NY','PA','VA','WV'])
ON CONFLICT (sportsbook_key) DO NOTHING;

-- No RLS needed on sportsbook_restrictions (public reference data read by service role)
-- Index for fast auction-engine lookups
CREATE INDEX IF NOT EXISTS idx_sportsbook_restrictions_key
  ON public.sportsbook_restrictions(sportsbook_key);
