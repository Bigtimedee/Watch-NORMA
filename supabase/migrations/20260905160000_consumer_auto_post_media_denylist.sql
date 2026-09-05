-- Consumer auto-post media denylist (2026-09-05)
--
-- generate-social-content + cmo-generate were attaching settings chrome
-- (sportsbooks-manual.png Tier C toggles) to @watchNORMA auto-posts.
-- Code now hard-excludes those filenames. This migration persists the same
-- policy in media_assets so tag-based queries cannot resurrect them.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS eligible_for_consumer_auto_post BOOLEAN NOT NULL DEFAULT true;

UPDATE media_assets
SET
  eligible_for_consumer_auto_post = false,
  is_active = false
WHERE filename IN (
  'sportsbooks-manual.png',
  'sportsbooks-email.png'
);

UPDATE media_assets
SET
  eligible_for_consumer_auto_post = false,
  theme_tags = ARRAY['settings', 'connections']
WHERE filename IN (
  'tv-providers.png',
  'prediction-markets.png',
  'streaming-services.png'
);

-- Alert / Why Now / red-zone screenshot used for football-aware consumer posts.
UPDATE media_assets
SET
  eligible_for_consumer_auto_post = true,
  is_active = true,
  theme_tags = ARRAY[
    'never_miss',
    'streaming',
    'user_benefit',
    'alerts',
    'why_now',
    'red_zone'
  ]
WHERE filename = 'game-detail-watch.png';

UPDATE media_assets
SET
  eligible_for_consumer_auto_post = true,
  is_active = true,
  theme_tags = ARRAY['never_miss', 'live_games', 'user_benefit', 'alerts']
WHERE filename = 'games-list.png';

COMMENT ON COLUMN media_assets.eligible_for_consumer_auto_post IS
  'False for settings/connections/Tier-C chrome. Consumer auto-posts must not default to these rows.';
