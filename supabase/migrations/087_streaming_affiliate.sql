-- Migration 087: Streaming affiliate tracking infrastructure
-- Adds affiliate_tag to provider_registry and a streaming_affiliate_events table
-- to track tap and conversion events for commission attribution.

-- Add affiliate_tag to provider_registry (streaming_providers)
ALTER TABLE public.streaming_providers
  ADD COLUMN IF NOT EXISTS affiliate_tag TEXT;

COMMENT ON COLUMN public.streaming_providers.affiliate_tag IS
  'Affiliate parameter appended to universal_link for tracking. '
  'e.g., ESPN+ affiliate tag or Amazon Associates tag (norma-20). '
  'NULL = no affiliate program enrolled. Appended as ?ref={tag} (or ?tag={tag} for Amazon). '
  'Do NOT append to ios_scheme — affiliate tracking applies to web fallback only.';

-- Seed known affiliate programs (tags to be replaced with real values after enrollment)
UPDATE public.streaming_providers
SET affiliate_tag = 'NORMA_ESPN_TAG'
WHERE key = 'espn_plus';

UPDATE public.streaming_providers
SET affiliate_tag = 'norma-20'
WHERE key = 'prime_video';

-- youtube_tv and peacock have no public affiliate programs — affiliate_tag stays NULL

-- Streaming affiliate events table
-- Separate from deep_link_events because it carries revenue-tracking intent
-- and needs to be queryable for commission reporting.
CREATE TABLE IF NOT EXISTS public.streaming_affiliate_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('tap', 'subscription_confirmed')),
  affiliate_tag TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_streaming_affiliate_events_provider
  ON public.streaming_affiliate_events(provider_key, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_streaming_affiliate_events_user
  ON public.streaming_affiliate_events(user_id, created_at DESC);

ALTER TABLE public.streaming_affiliate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own affiliate events"
  ON public.streaming_affiliate_events
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.streaming_affiliate_events IS
  'Tracks streaming deep link taps and subscription confirmations for affiliate commission attribution. '
  'tap = user tapped Watch Now on a provider that has an affiliate_tag. '
  'subscription_confirmed = server-to-server callback from provider (future; requires partnership).';
