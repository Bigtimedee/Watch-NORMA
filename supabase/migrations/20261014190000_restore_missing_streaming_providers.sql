-- Restore streaming_providers rows that the repo defines but prod never got.
--
-- Root cause (checked 2026-10-14 against supabase_migrations.schema_migrations):
--   * Prod recorded versions 037 = deep_link_observability and
--     038 = deep_link_health_cron. The repo later reused 037/038 for
--     037_add_mlb_tv_provider.sql and 038_add_missing_broadcast_providers.sql,
--     so `db push` treated them as already applied and skipped them.
--   * Prod history ends at 054 before the timestamped versions begin, so
--     numbered migrations 055-099 (incl. 091_football_streaming_providers) were
--     never recorded either; some were hand-applied (e.g. 087's columns exist,
--     but its prime_video UPDATE matched no row).
--   The rows were never inserted; nothing points to them being deleted.
--
-- Rows match 037/038/091 exactly. ON CONFLICT DO NOTHING, so existing rows
-- (and any manual edits) are untouched; safe to re-run.
-- 087's 'norma-20' Amazon tag is NOT applied: it was a placeholder pending
-- enrollment, and no real Associates tag has been confirmed.

INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES
-- 037
('mlb_tv', 'MLB', 'streaming', 'mlbatbat://',
 'https://apps.apple.com/app/mlb/id493619135',
 'com.bamnetworks.mobile.android.gameday.atbat',
 'https://www.mlb.com/tv', true,
 'https://www.mlb.com/tv',
 'https://apps.apple.com/app/mlb/id493619135',
 'deep_link_only', 'streaming'),
-- 038
('fox_sports', 'Fox Sports', 'streaming', 'foxsports://',
 'https://apps.apple.com/app/fox-sports-watch-live/id384185834',
 'com.foxsports.antenna', 'https://www.foxsports.com', true, NULL,
 'https://apps.apple.com/app/fox-sports-watch-live/id384185834',
 'deep_link_only', 'streaming'),
('prime_video', 'Prime Video', 'streaming', 'aiv://',
 'https://apps.apple.com/app/prime-video/id545519333',
 'com.amazon.avod.thirdpartyclient',
 'https://www.amazon.com/gp/video/storefront', true, NULL,
 'https://apps.apple.com/app/prime-video/id545519333',
 'deep_link_only', 'streaming'),
('apple_tv_plus', 'Apple TV+', 'streaming', 'videos://',
 'https://apps.apple.com/app/apple-tv/id1174078549',
 'com.apple.atve.androidtv.appletv', 'https://tv.apple.com', true, NULL,
 'https://apps.apple.com/app/apple-tv/id1174078549',
 'deep_link_only', 'streaming'),
('nfl_network', 'NFL', 'streaming', 'nfl://',
 'https://apps.apple.com/app/nfl/id389781154',
 'com.nfl.fantasy.core.app', 'https://www.nfl.com/network', true, NULL,
 'https://apps.apple.com/app/nfl/id389781154',
 'deep_link_only', 'streaming'),
('nba_tv', 'NBA', 'streaming', 'nba://',
 'https://apps.apple.com/app/nba-live-games-scores/id484672289',
 'com.nba.nba', 'https://www.nba.com/watch', true, NULL,
 'https://apps.apple.com/app/nba-live-games-scores/id484672289',
 'deep_link_only', 'streaming'),
('nhl_network', 'NHL', 'streaming', 'nhl://',
 'https://apps.apple.com/app/nhl/id283163894',
 'com.nhl.gc.iphone', 'https://www.nhl.com/tv', true, NULL,
 'https://apps.apple.com/app/nhl/id283163894',
 'deep_link_only', 'streaming'),
('dazn', 'DAZN', 'streaming', 'dazn://',
 'https://apps.apple.com/app/dazn-live-sports-streaming/id1129341562',
 'com.dazn.handball', 'https://www.dazn.com', true, NULL,
 'https://apps.apple.com/app/dazn-live-sports-streaming/id1129341562',
 'deep_link_only', 'streaming'),
-- 091
('youtube_primetime_channels', 'YouTube Primetime Channels', 'streaming',
 'youtube://', 'https://apps.apple.com/app/youtube/id544007664',
 'com.google.android.youtube', 'https://www.youtube.com/primetime', true,
 'https://www.youtube.com/primetime',
 'https://apps.apple.com/app/youtube/id544007664',
 'deep_link_only', 'streaming'),
('nfl_plus', 'NFL+', 'streaming', 'nfl://',
 'https://apps.apple.com/app/nfl/id389781154',
 'com.nfl.fantasy.core.app', 'https://www.nfl.com/plus', true,
 'https://www.nfl.com/plus',
 'https://apps.apple.com/app/nfl/id389781154',
 'deep_link_only', 'streaming')
ON CONFLICT (key) DO NOTHING;

-- app_universal_link only where the provider's AASA was verified (2026-10-14):
--   app.primevideo.com claims "*" for com.amazon.aiv.AIVApp.
--   www.nfl.com claims "/scores" for com.nfl.mobile3.
-- Not set: fox.com (claimed by FOX One, not the Fox Sports app), mlb.com
-- (only /tv/g* claimed), tv.apple.com (no AASA retrievable).
UPDATE public.streaming_providers
   SET app_universal_link = 'https://app.primevideo.com/'
 WHERE key = 'prime_video' AND app_universal_link IS NULL;

UPDATE public.streaming_providers
   SET app_universal_link = 'https://www.nfl.com/scores'
 WHERE key IN ('nfl_network', 'nfl_plus') AND app_universal_link IS NULL;

-- 087 seeded a placeholder ESPN tag; it was being appended as ?ref=.
UPDATE public.streaming_providers
   SET affiliate_tag = NULL
 WHERE key = 'espn_plus' AND affiliate_tag = 'NORMA_ESPN_TAG';
