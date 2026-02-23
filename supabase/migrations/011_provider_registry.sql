-- Upgrade streaming_providers with deep link fallback and auth metadata
-- NOTE: We do NOT rename the table — all existing code references streaming_providers.
-- We add a provider_registry VIEW for new code to use.

ALTER TABLE public.streaming_providers ADD COLUMN universal_link TEXT;
ALTER TABLE public.streaming_providers ADD COLUMN fallback_store_url TEXT;
ALTER TABLE public.streaming_providers ADD COLUMN auth_mode TEXT DEFAULT 'deep_link_only';
ALTER TABLE public.streaming_providers ADD COLUMN category TEXT;

-- Backfill category from existing provider_type
UPDATE public.streaming_providers SET category = provider_type;
-- Kalshi and Polymarket are prediction markets, not sportsbooks
UPDATE public.streaming_providers SET category = 'prediction_market'
  WHERE key IN ('kalshi', 'polymarket');

-- Backfill fallback_store_url from ios_app_store_url (same value for now)
UPDATE public.streaming_providers SET fallback_store_url = ios_app_store_url
  WHERE ios_app_store_url IS NOT NULL;

-- Backfill universal_link from web_url for streaming/tv providers
-- These are the direct watch pages, not marketing pages
UPDATE public.streaming_providers SET universal_link = web_url
  WHERE provider_type IN ('streaming', 'tv') AND web_url IS NOT NULL;

-- Set auth_mode for special providers
UPDATE public.streaming_providers SET auth_mode = 'manual'
  WHERE provider_type = 'sportsbook' AND key NOT IN ('kalshi', 'polymarket');
UPDATE public.streaming_providers SET auth_mode = 'partner_api'
  WHERE key = 'kalshi';
UPDATE public.streaming_providers SET auth_mode = 'manual'
  WHERE key = 'polymarket';

-- Create provider_registry VIEW for new code
CREATE VIEW public.provider_registry AS SELECT * FROM public.streaming_providers;
