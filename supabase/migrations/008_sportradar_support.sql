-- Add Sportradar ID columns alongside existing SportsDataIO IDs
ALTER TABLE teams ADD COLUMN sportradar_id text UNIQUE;
ALTER TABLE games ADD COLUMN sportradar_id text UNIQUE;

-- Track coverage tier per game (from Sportradar)
-- Values: 'full', 'extended_boxscore', 'basic'
ALTER TABLE games ADD COLUMN coverage_level text DEFAULT 'basic';

-- Track which data source last updated each game
ALTER TABLE games ADD COLUMN last_pbp_source text;
ALTER TABLE games ADD COLUMN last_summary_source text;

-- Index for Sportradar lookups
CREATE INDEX idx_teams_sportradar ON teams(sportradar_id);
CREATE INDEX idx_games_sportradar ON games(sportradar_id);
