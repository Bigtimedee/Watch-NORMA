-- Migration 091: seed the two football streaming tiers that were missing from
-- provider_registry, causing broadcast strings like "NFL Sunday Ticket" and
-- "NFL+" to fall through to the generic live-TV list (H-8 in the 2026-08-23
-- season-readiness audit).
--
-- youtube_primetime_channels — where YouTube distributes NFL Sunday Ticket.
--   Distinct from youtube_tv (Google's live-TV MVPD) which cannot carry the
--   Sunday Ticket out-of-market NFL games.
--
-- nfl_plus — the standalone NFL+ subscription (mobile-only live game viewing
--   for phone/tablet, RedZone, replays). Distinct from nfl_network, which is
--   the linear TV channel.
--
-- Rows use ON CONFLICT (key) DO UPDATE so this migration is safe to re-run
-- and will not fail if a provider was added manually.

INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES

-- YouTube Primetime Channels (NFL Sunday Ticket exclusive distribution)
(
  'youtube_primetime_channels', 'YouTube Primetime Channels', 'streaming',
  'youtube://',
  'https://apps.apple.com/app/youtube/id544007664',
  'com.google.android.youtube',
  'https://www.youtube.com/primetime', true,
  'https://www.youtube.com/primetime',
  'https://apps.apple.com/app/youtube/id544007664',
  'deep_link_only', 'streaming'
),

-- NFL+ (mobile-only live NFL viewing, RedZone, replays)
(
  'nfl_plus', 'NFL+', 'streaming',
  'nfl://',
  'https://apps.apple.com/app/nfl/id389781154',
  'com.nfl.fantasy.core.app',
  'https://www.nfl.com/plus', true,
  'https://www.nfl.com/plus',
  'https://apps.apple.com/app/nfl/id389781154',
  'deep_link_only', 'streaming'
)

ON CONFLICT (key) DO UPDATE SET
  name               = EXCLUDED.name,
  provider_type      = EXCLUDED.provider_type,
  ios_scheme         = EXCLUDED.ios_scheme,
  ios_app_store_url  = EXCLUDED.ios_app_store_url,
  android_package    = EXCLUDED.android_package,
  web_url            = EXCLUDED.web_url,
  active             = EXCLUDED.active,
  universal_link     = EXCLUDED.universal_link,
  fallback_store_url = EXCLUDED.fallback_store_url,
  auth_mode          = EXCLUDED.auth_mode,
  category           = EXCLUDED.category;
