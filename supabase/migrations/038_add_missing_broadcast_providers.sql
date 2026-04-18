-- Add streaming providers for broadcast networks that were missing from the
-- catalog, causing games on FS1, FS2, BTN, Amazon Prime Video, Apple TV+,
-- NFL Network, NBA TV, NHL Network, and DAZN to fall through to the live TV
-- fallback list and show "Watch on YouTube TV" instead of the correct app.
--
-- Providers are inserted with ON CONFLICT (key) DO UPDATE so this migration
-- is safe to re-run and will not fail if a provider was added manually.
--
-- Note: TV providers (provider_type = 'tv') intentionally have universal_link
-- = NULL to prevent the deep-link fallback chain from opening a web URL that
-- redirects unauthenticated users to a sign-up/welcome page.

INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES

-- Fox Sports — carries FS1, FS2, and distributes BTN content
(
  'fox_sports', 'Fox Sports', 'streaming', 'foxsports://',
  'https://apps.apple.com/app/fox-sports-watch-live/id384185834',
  'com.foxsports.antenna',
  'https://www.foxsports.com', true,
  NULL,
  'https://apps.apple.com/app/fox-sports-watch-live/id384185834',
  'deep_link_only', 'streaming'
),

-- Amazon Prime Video — carries Thursday Night Football and select sports
(
  'prime_video', 'Prime Video', 'streaming', 'aiv://',
  'https://apps.apple.com/app/prime-video/id545519333',
  'com.amazon.avod.thirdpartyclient',
  'https://www.amazon.com/gp/video/storefront', true,
  NULL,
  'https://apps.apple.com/app/prime-video/id545519333',
  'deep_link_only', 'streaming'
),

-- Apple TV+ — carries MLS Season Pass and Friday Night Baseball
(
  'apple_tv_plus', 'Apple TV+', 'streaming', 'videos://',
  'https://apps.apple.com/app/apple-tv/id1174078549',
  'com.apple.atve.androidtv.appletv',
  'https://tv.apple.com', true,
  NULL,
  'https://apps.apple.com/app/apple-tv/id1174078549',
  'deep_link_only', 'streaming'
),

-- NFL — NFL Network, NFL RedZone
(
  'nfl_network', 'NFL', 'streaming', 'nfl://',
  'https://apps.apple.com/app/nfl/id389781154',
  'com.nfl.fantasy.core.app',
  'https://www.nfl.com/network', true,
  NULL,
  'https://apps.apple.com/app/nfl/id389781154',
  'deep_link_only', 'streaming'
),

-- NBA — NBA TV
(
  'nba_tv', 'NBA', 'streaming', 'nba://',
  'https://apps.apple.com/app/nba-live-games-scores/id484672289',
  'com.nba.nba',
  'https://www.nba.com/watch', true,
  NULL,
  'https://apps.apple.com/app/nba-live-games-scores/id484672289',
  'deep_link_only', 'streaming'
),

-- NHL — NHL Network, NHL.TV
(
  'nhl_network', 'NHL', 'streaming', 'nhl://',
  'https://apps.apple.com/app/nhl/id283163894',
  'com.nhl.gc.iphone',
  'https://www.nhl.com/tv', true,
  NULL,
  'https://apps.apple.com/app/nhl/id283163894',
  'deep_link_only', 'streaming'
),

-- DAZN — carries boxing, MMA, and select sports in certain markets
(
  'dazn', 'DAZN', 'streaming', 'dazn://',
  'https://apps.apple.com/app/dazn-live-sports-streaming/id1129341562',
  'com.dazn.handball',
  'https://www.dazn.com', true,
  NULL,
  'https://apps.apple.com/app/dazn-live-sports-streaming/id1129341562',
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
