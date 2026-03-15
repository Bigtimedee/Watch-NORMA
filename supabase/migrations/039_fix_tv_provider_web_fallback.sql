-- Fix TV provider deep-link data.
--
-- Migration 011 backfilled universal_link = web_url for all streaming/tv providers,
-- which set youtube_tv.universal_link = 'https://tv.youtube.com/live'.
-- That URL is not a registered Apple Universal Link for the YouTube TV app, and
-- when opened in Safari it redirects unauthenticated users to:
--   https://tv.youtube.com/welcome/?utm_servlet=prod&rd_rsn=lo&zipcode=...
--
-- The deep-link code now skips Step 2 (web/universal-link) for provider_type='tv'
-- and goes straight to the App Store (Step 3). Clearing universal_link here makes
-- the intent explicit and prevents any future code from accidentally using it as a
-- web fallback for these providers.

UPDATE public.streaming_providers
SET
  universal_link      = NULL,
  -- Ensure fallback_store_url is set so Step 3 (App Store) always has a target.
  fallback_store_url  = COALESCE(fallback_store_url, ios_app_store_url)
WHERE provider_type = 'tv';
