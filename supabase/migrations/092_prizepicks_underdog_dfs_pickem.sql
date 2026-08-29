-- Migration 092: seed PrizePicks and Underdog rows in provider_registry
-- (streaming_providers table, aliased via the existing compat view).
--
-- Category: dfs_pickem — legally distinct from sportsbooks in many states.
-- Geo-gating (FX3) can treat this category independently from sportsbook CTAs,
-- allowing compliant presentation in states where pick'em apps are permitted
-- but traditional sportsbooks are not (and vice versa).
--
-- PrizePicks — largest DFS pick'em operator (player projection over/under).
-- Underdog Fantasy — pick'em / best-ball platform (already in FANTASY_PLATFORMS).
--
-- Both rows use ON CONFLICT (key) DO UPDATE so this migration is safe to re-run.

INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES

-- PrizePicks
(
  'prizepicks',
  'PrizePicks',
  'sportsbook',
  'prizepicks://',
  'https://apps.apple.com/us/app/prizepicks-daily-fantasy-sports/id1300527512',
  'com.prizepicks.game',
  'https://app.prizepicks.com',
  true,
  'https://app.prizepicks.com',
  'https://apps.apple.com/us/app/prizepicks-daily-fantasy-sports/id1300527512',
  'deep_link_only',
  'dfs_pickem'
),

-- Underdog Fantasy
(
  'underdog',
  'Underdog',
  'sportsbook',
  'underdog://',
  'https://apps.apple.com/us/app/underdog-fantasy-sports-app/id1485606624',
  'com.underdogfantasy.app',
  'https://app.underdogfantasy.com',
  true,
  'https://app.underdogfantasy.com',
  'https://apps.apple.com/us/app/underdog-fantasy-sports-app/id1485606624',
  'deep_link_only',
  'dfs_pickem'
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
