-- NORMA Test Seed Data
-- Idempotent — safe to run on every `supabase db reset`
-- Provides a realistic game-day scenario for E2E testing

-- ─── Test User ───
-- Must exist in auth.users first (Supabase trigger creates profile)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at, instance_id, aud, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'testuser@norma.dev',
  '{"full_name": "Test User"}'::jsonb,
  now(), now(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Ensure profile exists with push token
INSERT INTO public.profiles (id, display_name, push_token, notifications_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test User',
  'ExponentPushToken[test-token-001]',
  true
)
ON CONFLICT (id) DO UPDATE SET
  push_token = EXCLUDED.push_token,
  notifications_enabled = EXCLUDED.notifications_enabled;

-- ─── Teams (8) ───
INSERT INTO public.teams (id, name, market, abbreviation, conference, sportsdataio_id, sportradar_id) VALUES
  ('team-duke',    'Duke Blue Devils',           'Duke',           'DUKE', 'ACC',     1,  'sr-duke'),
  ('team-unc',     'North Carolina Tar Heels',   'North Carolina', 'UNC',  'ACC',     2,  'sr-unc'),
  ('team-uconn',   'Connecticut Huskies',        'Connecticut',    'CONN', 'Big East', 3,  'sr-uconn'),
  ('team-uk',      'Kentucky Wildcats',          'Kentucky',       'UK',   'SEC',     4,  'sr-uk'),
  ('team-kansas',  'Kansas Jayhawks',            'Kansas',         'KU',   'Big 12',  5,  'sr-kansas'),
  ('team-baylor',  'Baylor Bears',               'Baylor',         'BAY',  'Big 12',  6,  'sr-baylor'),
  ('team-purdue',  'Purdue Boilermakers',        'Purdue',         'PUR',  'Big Ten', 7,  'sr-purdue'),
  ('team-houston', 'Houston Cougars',            'Houston',        'HOU',  'Big 12',  8,  'sr-houston')
ON CONFLICT (id) DO UPDATE SET
  sportradar_id = EXCLUDED.sportradar_id,
  sportsdataio_id = EXCLUDED.sportsdataio_id;

-- ─── Games (4) ───

-- Game 1: LIVE close game — Duke vs UNC, 68-65, 4:30 left in 2nd half
INSERT INTO public.games (id, sportsdataio_id, sportradar_id, status, home_team_id, away_team_id,
  home_score, away_score, clock, period, scheduled_at, venue, broadcast, coverage_level)
VALUES (
  'game-1', 10001, 'sr-game-1', 'inprogress', 'team-duke', 'team-unc',
  68, 65, '4:30', 2,
  now() - interval '2 hours', 'Cameron Indoor Stadium, Durham, NC',
  'ESPN', 'full'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score,
  clock = EXCLUDED.clock,
  period = EXCLUDED.period;

-- Game 2: LIVE high-scoring — UConn vs Kentucky, 82-78
INSERT INTO public.games (id, sportsdataio_id, sportradar_id, status, home_team_id, away_team_id,
  home_score, away_score, clock, period, scheduled_at, venue, broadcast, coverage_level)
VALUES (
  'game-2', 10002, 'sr-game-2', 'inprogress', 'team-uconn', 'team-uk',
  82, 78, '6:15', 2,
  now() - interval '90 minutes', 'Gampel Pavilion, Storrs, CT',
  'CBS', 'full'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score,
  clock = EXCLUDED.clock,
  period = EXCLUDED.period;

-- Game 3: CLOSED — Kansas beat Baylor 75-72
INSERT INTO public.games (id, sportsdataio_id, sportradar_id, status, home_team_id, away_team_id,
  home_score, away_score, clock, period, scheduled_at, venue, broadcast, coverage_level)
VALUES (
  'game-3', 10003, 'sr-game-3', 'closed', 'team-kansas', 'team-baylor',
  75, 72, '0:00', 2,
  now() - interval '4 hours', 'Allen Fieldhouse, Lawrence, KS',
  'ESPN2', 'full'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score;

-- Game 4: SCHEDULED — Purdue vs Houston (tonight)
INSERT INTO public.games (id, sportsdataio_id, sportradar_id, status, home_team_id, away_team_id,
  home_score, away_score, scheduled_at, venue, broadcast, coverage_level)
VALUES (
  'game-4', 10004, 'sr-game-4', 'scheduled', 'team-purdue', 'team-houston',
  0, 0,
  now() + interval '3 hours', 'Mackey Arena, West Lafayette, IN',
  'FS1', 'basic'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status;

-- ─── Wagers (5) ───

INSERT INTO public.wagers (user_id, game_id, sportsbook, wager_type, description, team_id, line, odds, status) VALUES
  -- Wager 1: Duke -3.5 (spread on game-1)
  ('00000000-0000-0000-0000-000000000001', 'game-1', 'DraftKings', 'spread',
   'Duke -3.5', 'team-duke', -3.5, '-110', 'active'),
  -- Wager 2: Duke ML (moneyline on game-1)
  ('00000000-0000-0000-0000-000000000001', 'game-1', 'FanDuel', 'moneyline',
   'Duke to win', 'team-duke', NULL, '-180', 'active'),
  -- Wager 3: Over 155.5 (total on game-1)
  ('00000000-0000-0000-0000-000000000001', 'game-1', 'DraftKings', 'over_under',
   'Over 155.5', NULL, 155.5, '-110', 'active'),
  -- Wager 4: Clingan pts prop (on game-1, using Duke home team player)
  ('00000000-0000-0000-0000-000000000001', 'game-1', 'BetMGM', 'prop',
   'Donovan Clingan over 15.5 points', NULL, 15.5, '-115', 'active'),
  -- Wager 5: Kansas ML (moneyline on closed game-3)
  ('00000000-0000-0000-0000-000000000001', 'game-3', 'DraftKings', 'moneyline',
   'Kansas to win', 'team-kansas', NULL, '-150', 'active');

-- ─── Prediction Position (1) ───
INSERT INTO public.prediction_positions (user_id, platform, market_id, market_title, game_id,
  position_side, quantity, avg_price, settled, fetched_at)
VALUES (
  '00000000-0000-0000-0000-000000000001', 'kalshi', 'DUKE-UNC-2026',
  'Duke to win vs UNC', 'game-1',
  'yes', 10, 0.62, false, now()
)
ON CONFLICT (user_id, platform, market_id) DO UPDATE SET
  settled = EXCLUDED.settled;

-- ─── Game Odds (3 rows) ───
INSERT INTO public.game_odds (game_id, sportsbook, market_type, home_line, away_line, home_price, away_price)
VALUES
  ('game-1', 'DraftKings', 'spreads', -3.5, 3.5, -110, -110),
  ('game-1', 'DraftKings', 'h2h', NULL, NULL, -180, 155),
  ('game-1', 'FanDuel', 'spreads', -3.5, 3.5, -108, -112)
ON CONFLICT (game_id, sportsbook, market_type) DO NOTHING;

-- ─── Connections (3) ───
INSERT INTO public.connections (user_id, provider_type, provider_key, provider_name, connected, metadata) VALUES
  ('00000000-0000-0000-0000-000000000001', 'streaming', 'espn_plus', 'ESPN+', true, NULL),
  ('00000000-0000-0000-0000-000000000001', 'streaming', 'youtube_tv', 'YouTube TV', true, NULL),
  ('00000000-0000-0000-0000-000000000001', 'sportsbook', 'draftkings', 'DraftKings', true, NULL)
ON CONFLICT (user_id, provider_type, provider_key) DO NOTHING;
