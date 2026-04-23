-- Migration 050: Add sport column to teams, seed correct NBA + MLB team records
--
-- Problem: The teams table has no sport column, so poll-schedule's fuzzy
-- team-matching logic searches ALL teams (NCAA + NBA + MLB) when building
-- ESPN fallback games. This causes NCAA team IDs to be assigned to NBA/MLB
-- games (e.g., espn-mlb-lad used as LA Lakers, sdio-104 used as both
-- Minnesota Timberwolves AND Minnesota Twins).
--
-- This migration:
--   A. Adds a nullable `sport` column to the teams table.
--   B. Inserts all 30 NBA teams with sport='nba' and correct espn-nba-* IDs.
--   C. Inserts all 30 MLB teams with sport='mlb' and correct espn-mlb-* IDs.
--
-- After this migration, run migration 051 to fix broken game team references.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- A. Add sport column
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sport text;

CREATE INDEX IF NOT EXISTS idx_teams_sport ON public.teams(sport);


-- ---------------------------------------------------------------------------
-- B. Seed all 30 NBA teams
-- ---------------------------------------------------------------------------
INSERT INTO public.teams (id, name, market, abbreviation, sport) VALUES
  ('espn-nba-atl',  'Atlanta Hawks',            'Atlanta',       'ATL',  'nba'),
  ('espn-nba-bos',  'Boston Celtics',            'Boston',        'BOS',  'nba'),
  ('espn-nba-bkn',  'Brooklyn Nets',             'Brooklyn',      'BKN',  'nba'),
  ('espn-nba-cha',  'Charlotte Hornets',         'Charlotte',     'CHA',  'nba'),
  ('espn-nba-chi',  'Chicago Bulls',             'Chicago',       'CHI',  'nba'),
  ('espn-nba-cle',  'Cleveland Cavaliers',       'Cleveland',     'CLE',  'nba'),
  ('espn-nba-dal',  'Dallas Mavericks',          'Dallas',        'DAL',  'nba'),
  ('espn-nba-den',  'Denver Nuggets',            'Denver',        'DEN',  'nba'),
  ('espn-nba-det',  'Detroit Pistons',           'Detroit',       'DET',  'nba'),
  ('espn-nba-gs',   'Golden State Warriors',     'Golden State',  'GSW',  'nba'),
  ('espn-nba-hou',  'Houston Rockets',           'Houston',       'HOU',  'nba'),
  ('espn-nba-ind',  'Indiana Pacers',            'Indiana',       'IND',  'nba'),
  ('espn-nba-lac',  'LA Clippers',               'LA',            'LAC',  'nba'),
  ('espn-nba-lal',  'LA Lakers',                 'LA',            'LAL',  'nba'),
  ('espn-nba-mem',  'Memphis Grizzlies',         'Memphis',       'MEM',  'nba'),
  ('espn-nba-mia',  'Miami Heat',                'Miami',         'MIA',  'nba'),
  ('espn-nba-mil',  'Milwaukee Bucks',           'Milwaukee',     'MIL',  'nba'),
  ('espn-nba-min',  'Minnesota Timberwolves',    'Minnesota',     'MIN',  'nba'),
  ('espn-nba-no',   'New Orleans Pelicans',      'New Orleans',   'NOP',  'nba'),
  ('espn-nba-ny',   'New York Knicks',           'New York',      'NYK',  'nba'),
  ('espn-nba-okc',  'Oklahoma City Thunder',     'Oklahoma City', 'OKC',  'nba'),
  ('espn-nba-orl',  'Orlando Magic',             'Orlando',       'ORL',  'nba'),
  ('espn-nba-phi',  'Philadelphia 76ers',        'Philadelphia',  'PHI',  'nba'),
  ('espn-nba-phx',  'Phoenix Suns',              'Phoenix',       'PHX',  'nba'),
  ('espn-nba-por',  'Portland Trail Blazers',    'Portland',      'POR',  'nba'),
  ('espn-nba-sac',  'Sacramento Kings',          'Sacramento',    'SAC',  'nba'),
  ('espn-nba-sa',   'San Antonio Spurs',         'San Antonio',   'SAS',  'nba'),
  ('espn-nba-tor',  'Toronto Raptors',           'Toronto',       'TOR',  'nba'),
  ('espn-nba-utah', 'Utah Jazz',                 'Utah',          'UTA',  'nba'),
  ('espn-nba-wsh',  'Washington Wizards',        'Washington',    'WSH',  'nba')
ON CONFLICT (id) DO UPDATE
  SET name         = EXCLUDED.name,
      market       = EXCLUDED.market,
      abbreviation = EXCLUDED.abbreviation,
      sport        = EXCLUDED.sport;


-- ---------------------------------------------------------------------------
-- C. Seed all 30 MLB teams
-- ---------------------------------------------------------------------------
INSERT INTO public.teams (id, name, market, abbreviation, sport) VALUES
  ('espn-mlb-ari',  'Arizona Diamondbacks',     'Arizona',       'ARI',  'mlb'),
  ('espn-mlb-atl',  'Atlanta Braves',           'Atlanta',       'ATL',  'mlb'),
  ('espn-mlb-bal',  'Baltimore Orioles',        'Baltimore',     'BAL',  'mlb'),
  ('espn-mlb-bos',  'Boston Red Sox',           'Boston',        'BOS',  'mlb'),
  ('espn-mlb-chc',  'Chicago Cubs',             'Chicago',       'CHC',  'mlb'),
  ('espn-mlb-chw',  'Chicago White Sox',        'Chicago',       'CWS',  'mlb'),
  ('espn-mlb-cin',  'Cincinnati Reds',          'Cincinnati',    'CIN',  'mlb'),
  ('espn-mlb-cle',  'Cleveland Guardians',      'Cleveland',     'CLE',  'mlb'),
  ('espn-mlb-col',  'Colorado Rockies',         'Colorado',      'COL',  'mlb'),
  ('espn-mlb-det',  'Detroit Tigers',           'Detroit',       'DET',  'mlb'),
  ('espn-mlb-hou',  'Houston Astros',           'Houston',       'HOU',  'mlb'),
  ('espn-mlb-kc',   'Kansas City Royals',       'Kansas City',   'KC',   'mlb'),
  ('espn-mlb-laa',  'LA Angels',                'LA',            'LAA',  'mlb'),
  ('espn-mlb-lad',  'Los Angeles Dodgers',      'Los Angeles',   'LAD',  'mlb'),
  ('espn-mlb-mia',  'Miami Marlins',            'Miami',         'MIA',  'mlb'),
  ('espn-mlb-mil',  'Milwaukee Brewers',        'Milwaukee',     'MIL',  'mlb'),
  ('espn-mlb-min',  'Minnesota Twins',          'Minnesota',     'MIN',  'mlb'),
  ('espn-mlb-nym',  'New York Mets',            'New York',      'NYM',  'mlb'),
  ('espn-mlb-nyy',  'New York Yankees',         'New York',      'NYY',  'mlb'),
  ('espn-mlb-oak',  'Oakland Athletics',        'Oakland',       'OAK',  'mlb'),
  ('espn-mlb-phi',  'Philadelphia Phillies',    'Philadelphia',  'PHI',  'mlb'),
  ('espn-mlb-pit',  'Pittsburgh Pirates',       'Pittsburgh',    'PIT',  'mlb'),
  ('espn-mlb-sd',   'San Diego Padres',         'San Diego',     'SD',   'mlb'),
  ('espn-mlb-sf',   'San Francisco Giants',     'San Francisco', 'SF',   'mlb'),
  ('espn-mlb-sea',  'Seattle Mariners',         'Seattle',       'SEA',  'mlb'),
  ('espn-mlb-stl',  'St. Louis Cardinals',      'St. Louis',     'STL',  'mlb'),
  ('espn-mlb-tb',   'Tampa Bay Rays',           'Tampa Bay',     'TB',   'mlb'),
  ('espn-mlb-tex',  'Texas Rangers',            'Texas',         'TEX',  'mlb'),
  ('espn-mlb-tor',  'Toronto Blue Jays',        'Toronto',       'TOR',  'mlb'),
  ('espn-mlb-wsh',  'Washington Nationals',     'Washington',    'WSH',  'mlb')
ON CONFLICT (id) DO UPDATE
  SET name         = EXCLUDED.name,
      market       = EXCLUDED.market,
      abbreviation = EXCLUDED.abbreviation,
      sport        = EXCLUDED.sport;
