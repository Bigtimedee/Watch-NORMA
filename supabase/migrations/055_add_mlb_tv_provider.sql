-- Add MLB.TV (MLB.com) as a streaming provider.
--
-- MLB games broadcast exclusively on MLB.com were falling through the
-- getBroadcastProviderKeys() mapping in lib/deep-links.ts with no match,
-- causing the live TV fallback list (YouTube TV, Fubo, Sling, etc.) to be
-- returned instead. Users with YouTube TV connected saw "Watch on YouTube TV"
-- for games that are only available on MLB.com.
--
-- The MLB app uses the "mlbatbat" URL scheme on iOS and is a subscription
-- streaming provider (not a live TV bundle), so it belongs in category='streaming'.

INSERT INTO public.streaming_providers (
  key,
  name,
  provider_type,
  ios_scheme,
  ios_app_store_url,
  android_package,
  web_url,
  active,
  universal_link,
  fallback_store_url,
  auth_mode,
  category
) VALUES (
  'mlb_tv',
  'MLB',
  'streaming',
  'mlbatbat://',
  'https://apps.apple.com/app/mlb/id493619135',
  'com.bamnetworks.mobile.android.gameday.atbat',
  'https://www.mlb.com/tv',
  true,
  'https://www.mlb.com/tv',
  'https://apps.apple.com/app/mlb/id493619135',
  'deep_link_only',
  'streaming'
)
ON CONFLICT (key) DO UPDATE SET
  name             = EXCLUDED.name,
  ios_scheme       = EXCLUDED.ios_scheme,
  ios_app_store_url= EXCLUDED.ios_app_store_url,
  android_package  = EXCLUDED.android_package,
  web_url          = EXCLUDED.web_url,
  active           = EXCLUDED.active,
  universal_link   = EXCLUDED.universal_link,
  fallback_store_url = EXCLUDED.fallback_store_url,
  auth_mode        = EXCLUDED.auth_mode,
  category         = EXCLUDED.category;
