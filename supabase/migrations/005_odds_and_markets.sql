-- Game odds from The Odds API
CREATE TABLE game_odds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id text REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  sportsbook text NOT NULL,
  market_type text NOT NULL,
  home_line numeric,
  away_line numeric,
  home_price numeric,
  away_price numeric,
  over_under numeric,
  over_price numeric,
  under_price numeric,
  last_update timestamptz DEFAULT now(),
  UNIQUE(game_id, sportsbook, market_type)
);

-- Prediction market positions (Kalshi + Polymarket)
CREATE TABLE prediction_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  market_id text NOT NULL,
  market_title text NOT NULL,
  game_id text REFERENCES games(id) ON DELETE SET NULL,
  position_side text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  current_price numeric,
  pnl numeric,
  settled boolean DEFAULT false,
  fetched_at timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE game_odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read odds" ON game_odds FOR SELECT USING (true);
CREATE POLICY "Service role inserts odds" ON game_odds FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role updates odds" ON game_odds FOR UPDATE USING (true);

ALTER TABLE prediction_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own positions" ON prediction_positions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages positions" ON prediction_positions
  FOR ALL USING (true);

-- Unique constraint for upserts
ALTER TABLE prediction_positions
  ADD CONSTRAINT prediction_positions_unique
  UNIQUE (user_id, platform, market_id);

-- Indexes
CREATE INDEX idx_game_odds_game ON game_odds(game_id);
CREATE INDEX idx_prediction_positions_user ON prediction_positions(user_id);

-- Enable realtime for odds
ALTER PUBLICATION supabase_realtime ADD TABLE game_odds;
