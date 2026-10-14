-- Add Netflix as a streaming provider so Netflix-exclusive games (e.g. NFL
-- Christmas games) resolve to an orange "Watch on Netflix" CTA for connected
-- users instead of the grey info button. Mirrors the peacock / max rows.
-- App Store id 363590051 verified via itunes.apple.com/lookup (com.netflix.Netflix).
-- netflix.com is a public universal link (opens the app when installed,
-- otherwise the Netflix site) so it is safe to populate universal_link.
INSERT INTO streaming_providers (
  key, name, provider_type, logo_url, ios_scheme, ios_app_store_url,
  android_package, android_deep_link, web_url, active, universal_link,
  fallback_store_url, auth_mode, category, affiliate_tag
) VALUES (
  'netflix', 'Netflix', 'streaming', NULL, 'nflx://',
  'https://apps.apple.com/app/netflix/id363590051',
  'com.netflix.mediaclient', NULL, 'https://www.netflix.com', true,
  'https://www.netflix.com/',
  'https://apps.apple.com/app/netflix/id363590051',
  'deep_link_only', 'streaming', NULL
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  ios_scheme = EXCLUDED.ios_scheme,
  ios_app_store_url = EXCLUDED.ios_app_store_url,
  android_package = EXCLUDED.android_package,
  web_url = EXCLUDED.web_url,
  active = EXCLUDED.active,
  universal_link = EXCLUDED.universal_link,
  fallback_store_url = EXCLUDED.fallback_store_url,
  auth_mode = EXCLUDED.auth_mode,
  category = EXCLUDED.category;
