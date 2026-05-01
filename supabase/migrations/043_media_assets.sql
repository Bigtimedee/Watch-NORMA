-- Storage: assets are uploaded to the social-images Supabase Storage bucket

CREATE TABLE media_assets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename        TEXT NOT NULL UNIQUE,
  storage_path    TEXT NOT NULL,
  public_url      TEXT,
  description     TEXT NOT NULL,
  theme_tags      TEXT[] NOT NULL DEFAULT '{}',
  platform_tags   TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO media_assets (filename, storage_path, description, theme_tags, platform_tags) VALUES
  (
    'games-list.png',
    'social-images/games-list.png',
    'Live NCAA basketball games list showing 4 live games with real-time scores',
    ARRAY['never_miss', 'live_games', 'user_benefit'],
    ARRAY['twitter']
  ),
  (
    'game-detail-watch.png',
    'social-images/game-detail-watch.png',
    'Game detail screen showing Northern Iowa vs St. John''s with Watch on Paramount+ button',
    ARRAY['never_miss', 'streaming', 'user_benefit'],
    ARRAY['twitter']
  ),
  (
    'prediction-markets.png',
    'social-images/prediction-markets.png',
    'Prediction markets screen showing Kalshi and Polymarket connected positions',
    ARRAY['prediction_markets', 'user_benefit'],
    ARRAY['twitter']
  ),
  (
    'tv-providers.png',
    'social-images/tv-providers.png',
    'TV providers connection screen showing YouTube TV connected',
    ARRAY['streaming', 'user_benefit'],
    ARRAY['twitter']
  ),
  (
    'streaming-services.png',
    'social-images/streaming-services.png',
    'Streaming services screen with CBS Sports, Paramount+, and Peacock connected',
    ARRAY['streaming', 'user_benefit', 'never_miss'],
    ARRAY['twitter']
  ),
  (
    'sportsbooks-email.png',
    'social-images/sportsbooks-email.png',
    'Sportsbooks screen showing email import via bets@getnorma.app',
    ARRAY['sportsbooks', 'wager_tracking', 'user_benefit'],
    ARRAY['twitter']
  ),
  (
    'sportsbooks-manual.png',
    'social-images/sportsbooks-manual.png',
    'Sportsbooks screen showing DraftKings connected for manual bet entry',
    ARRAY['sportsbooks', 'wager_tracking', 'user_benefit'],
    ARRAY['twitter']
  );

CREATE INDEX idx_media_assets_themes ON media_assets USING gin(theme_tags);
