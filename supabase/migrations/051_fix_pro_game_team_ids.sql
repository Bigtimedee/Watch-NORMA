-- Migration 051: Fix broken home_team_id / away_team_id on NBA and MLB games
--
-- Root cause: poll-schedule's ESPN fallback and SportsDataIO team-lookup share
-- a single numeric ID namespace across all sports. NCAA team IDs from
-- SportsDataIO (sdio-*) and NCAA ESPN IDs (espn-{abbr}-{slug}) were matched
-- against NBA and MLB games, producing incorrect team references.
--
-- This migration uses sport-scoped UPDATE statements (WHERE g.sport = ...)
-- to avoid touching NCAA games. Each broken ID is replaced with the correct
-- espn-nba-* or espn-mlb-* ID seeded by migration 050.
--
-- Run migration 050 first (which also adds the sport column).
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- A. Tag existing NBA and MLB games with the correct sport value.
--    We identify them by joining to their team references. Games whose
--    home or away team is any of the known-broken IDs for a given sport
--    are tagged accordingly.
-- ---------------------------------------------------------------------------

-- Tag games that reference any known NBA team (correct or broken)
UPDATE public.games g
   SET sport = 'nba'
 WHERE sport IS NULL
   AND (
     g.home_team_id IN (
       'espn-nba-atl','espn-nba-bos','espn-nba-bkn','espn-nba-cha',
       'espn-nba-chi','espn-nba-cle','espn-nba-dal','espn-nba-den',
       'espn-nba-det','espn-nba-gs','espn-nba-hou','espn-nba-ind',
       'espn-nba-lac','espn-nba-lal','espn-nba-mem','espn-nba-mia',
       'espn-nba-mil','espn-nba-min','espn-nba-no','espn-nba-ny',
       'espn-nba-okc','espn-nba-orl','espn-nba-phi','espn-nba-phx',
       'espn-nba-por','espn-nba-sac','espn-nba-sa','espn-nba-tor',
       'espn-nba-utah','espn-nba-wsh',
       -- broken NBA team IDs from audit
       'sdio-7','sdio-23','sdio-93','sdio-104','sdio-142','sdio-151',
       'sdio-153','sdio-248','sdio-319',
       'espn-hou-houston-cougars','espn-mlb-chc','espn-mlb-lad',
       'espn-mlb-nym','espn-mlb-phi',
       'espn-uno-new-orleans-privateers','espn-wash-washington-huskies'
     )
     OR g.away_team_id IN (
       'espn-nba-atl','espn-nba-bos','espn-nba-bkn','espn-nba-cha',
       'espn-nba-chi','espn-nba-cle','espn-nba-dal','espn-nba-den',
       'espn-nba-det','espn-nba-gs','espn-nba-hou','espn-nba-ind',
       'espn-nba-lac','espn-nba-lal','espn-nba-mem','espn-nba-mia',
       'espn-nba-mil','espn-nba-min','espn-nba-no','espn-nba-ny',
       'espn-nba-okc','espn-nba-orl','espn-nba-phi','espn-nba-phx',
       'espn-nba-por','espn-nba-sac','espn-nba-sa','espn-nba-tor',
       'espn-nba-utah','espn-nba-wsh',
       'sdio-7','sdio-23','sdio-93','sdio-104','sdio-142','sdio-151',
       'sdio-153','sdio-248','sdio-319',
       'espn-hou-houston-cougars','espn-mlb-chc','espn-mlb-lad',
       'espn-mlb-nym','espn-mlb-phi',
       'espn-uno-new-orleans-privateers','espn-wash-washington-huskies'
     )
   );

-- Tag games that reference any known MLB team (correct or broken)
UPDATE public.games g
   SET sport = 'mlb'
 WHERE sport IS NULL
   AND (
     g.home_team_id IN (
       'espn-mlb-ari','espn-mlb-atl','espn-mlb-bal','espn-mlb-bos',
       'espn-mlb-chc','espn-mlb-chw','espn-mlb-cin','espn-mlb-cle',
       'espn-mlb-col','espn-mlb-det','espn-mlb-hou','espn-mlb-kc',
       'espn-mlb-laa','espn-mlb-lad','espn-mlb-mia','espn-mlb-mil',
       'espn-mlb-min','espn-mlb-nym','espn-mlb-nyy','espn-mlb-oak',
       'espn-mlb-phi','espn-mlb-pit','espn-mlb-sd','espn-mlb-sf',
       'espn-mlb-sea','espn-mlb-stl','espn-mlb-tb','espn-mlb-tex',
       'espn-mlb-tor','espn-mlb-wsh',
       -- broken MLB team IDs from audit
       'espn-cin-cincinnati-bearcats','espn-colo-colorado-buffaloes',
       'espn-hou-houston-cougars','espn-nba-atl','espn-nba-cle',
       'espn-pitt-pittsburgh-panthers','espn-usd-san-diego-toreros',
       'espn-wash-washington-huskies',
       'sdio-104','sdio-109','sdio-151','sdio-153','sdio-23',
       'sdio-247','sdio-338','sdio-347','sdio-362'
     )
     OR g.away_team_id IN (
       'espn-mlb-ari','espn-mlb-atl','espn-mlb-bal','espn-mlb-bos',
       'espn-mlb-chc','espn-mlb-chw','espn-mlb-cin','espn-mlb-cle',
       'espn-mlb-col','espn-mlb-det','espn-mlb-hou','espn-mlb-kc',
       'espn-mlb-laa','espn-mlb-lad','espn-mlb-mia','espn-mlb-mil',
       'espn-mlb-min','espn-mlb-nym','espn-mlb-nyy','espn-mlb-oak',
       'espn-mlb-phi','espn-mlb-pit','espn-mlb-sd','espn-mlb-sf',
       'espn-mlb-sea','espn-mlb-stl','espn-mlb-tb','espn-mlb-tex',
       'espn-mlb-tor','espn-mlb-wsh',
       'espn-cin-cincinnati-bearcats','espn-colo-colorado-buffaloes',
       'espn-hou-houston-cougars','espn-nba-atl','espn-nba-cle',
       'espn-pitt-pittsburgh-panthers','espn-usd-san-diego-toreros',
       'espn-wash-washington-huskies',
       'sdio-104','sdio-109','sdio-151','sdio-153','sdio-23',
       'sdio-247','sdio-338','sdio-347','sdio-362'
     )
   );

-- Tag remaining games without a pro-sport team reference as ncaam
UPDATE public.games g
   SET sport = 'ncaam'
 WHERE sport IS NULL;


-- ---------------------------------------------------------------------------
-- B. Fix NBA game team IDs
--    Each UPDATE is scoped to sport='nba' to avoid touching MLB/NCAA rows
--    with the same broken sdio-* ID (e.g., sdio-104 = MIN Gophers in ncaam,
--    MIN Timberwolves in nba, MIN Twins in mlb).
-- ---------------------------------------------------------------------------

-- sdio-7  → Memphis Grizzlies
UPDATE public.games SET home_team_id = 'espn-nba-mem' WHERE home_team_id = 'sdio-7'   AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-mem' WHERE away_team_id = 'sdio-7'   AND sport = 'nba';

-- sdio-23 → Miami Heat
UPDATE public.games SET home_team_id = 'espn-nba-mia' WHERE home_team_id = 'sdio-23'  AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-mia' WHERE away_team_id = 'sdio-23'  AND sport = 'nba';

-- sdio-93 → Indiana Pacers
UPDATE public.games SET home_team_id = 'espn-nba-ind' WHERE home_team_id = 'sdio-93'  AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-ind' WHERE away_team_id = 'sdio-93'  AND sport = 'nba';

-- sdio-104 → Minnesota Timberwolves
UPDATE public.games SET home_team_id = 'espn-nba-min' WHERE home_team_id = 'sdio-104' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-min' WHERE away_team_id = 'sdio-104' AND sport = 'nba';

-- sdio-142 → Charlotte Hornets
UPDATE public.games SET home_team_id = 'espn-nba-cha' WHERE home_team_id = 'sdio-142' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-cha' WHERE away_team_id = 'sdio-142' AND sport = 'nba';

-- sdio-151 → Milwaukee Bucks
UPDATE public.games SET home_team_id = 'espn-nba-mil' WHERE home_team_id = 'sdio-151' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-mil' WHERE away_team_id = 'sdio-151' AND sport = 'nba';

-- sdio-153 → Detroit Pistons
UPDATE public.games SET home_team_id = 'espn-nba-det' WHERE home_team_id = 'sdio-153' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-det' WHERE away_team_id = 'sdio-153' AND sport = 'nba';

-- sdio-248 → Utah Jazz
UPDATE public.games SET home_team_id = 'espn-nba-utah' WHERE home_team_id = 'sdio-248' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-utah' WHERE away_team_id = 'sdio-248' AND sport = 'nba';

-- sdio-319 → Denver Nuggets
UPDATE public.games SET home_team_id = 'espn-nba-den' WHERE home_team_id = 'sdio-319' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-den' WHERE away_team_id = 'sdio-319' AND sport = 'nba';

-- espn-hou-houston-cougars → Houston Rockets
UPDATE public.games SET home_team_id = 'espn-nba-hou' WHERE home_team_id = 'espn-hou-houston-cougars' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-hou' WHERE away_team_id = 'espn-hou-houston-cougars' AND sport = 'nba';

-- espn-mlb-chc → Chicago Bulls
UPDATE public.games SET home_team_id = 'espn-nba-chi' WHERE home_team_id = 'espn-mlb-chc' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-chi' WHERE away_team_id = 'espn-mlb-chc' AND sport = 'nba';

-- espn-mlb-lad → LA Lakers
UPDATE public.games SET home_team_id = 'espn-nba-lal' WHERE home_team_id = 'espn-mlb-lad' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-lal' WHERE away_team_id = 'espn-mlb-lad' AND sport = 'nba';

-- espn-mlb-nym → New York Knicks
UPDATE public.games SET home_team_id = 'espn-nba-ny'  WHERE home_team_id = 'espn-mlb-nym' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-ny'  WHERE away_team_id = 'espn-mlb-nym' AND sport = 'nba';

-- espn-mlb-phi → Philadelphia 76ers
UPDATE public.games SET home_team_id = 'espn-nba-phi' WHERE home_team_id = 'espn-mlb-phi' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-phi' WHERE away_team_id = 'espn-mlb-phi' AND sport = 'nba';

-- espn-uno-new-orleans-privateers → New Orleans Pelicans
UPDATE public.games SET home_team_id = 'espn-nba-no'  WHERE home_team_id = 'espn-uno-new-orleans-privateers' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-no'  WHERE away_team_id = 'espn-uno-new-orleans-privateers' AND sport = 'nba';

-- espn-wash-washington-huskies → Washington Wizards
UPDATE public.games SET home_team_id = 'espn-nba-wsh' WHERE home_team_id = 'espn-wash-washington-huskies' AND sport = 'nba';
UPDATE public.games SET away_team_id = 'espn-nba-wsh' WHERE away_team_id = 'espn-wash-washington-huskies' AND sport = 'nba';


-- ---------------------------------------------------------------------------
-- C. Fix MLB game team IDs
--    Each UPDATE is scoped to sport='mlb'.
-- ---------------------------------------------------------------------------

-- espn-cin-cincinnati-bearcats → Cincinnati Reds
UPDATE public.games SET home_team_id = 'espn-mlb-cin' WHERE home_team_id = 'espn-cin-cincinnati-bearcats'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-cin' WHERE away_team_id = 'espn-cin-cincinnati-bearcats'  AND sport = 'mlb';

-- espn-colo-colorado-buffaloes → Colorado Rockies
UPDATE public.games SET home_team_id = 'espn-mlb-col' WHERE home_team_id = 'espn-colo-colorado-buffaloes'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-col' WHERE away_team_id = 'espn-colo-colorado-buffaloes'  AND sport = 'mlb';

-- espn-hou-houston-cougars → Houston Astros
UPDATE public.games SET home_team_id = 'espn-mlb-hou' WHERE home_team_id = 'espn-hou-houston-cougars'      AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-hou' WHERE away_team_id = 'espn-hou-houston-cougars'      AND sport = 'mlb';

-- espn-nba-atl → Atlanta Braves
UPDATE public.games SET home_team_id = 'espn-mlb-atl' WHERE home_team_id = 'espn-nba-atl'                  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-atl' WHERE away_team_id = 'espn-nba-atl'                  AND sport = 'mlb';

-- espn-nba-cle → Cleveland Guardians
UPDATE public.games SET home_team_id = 'espn-mlb-cle' WHERE home_team_id = 'espn-nba-cle'                  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-cle' WHERE away_team_id = 'espn-nba-cle'                  AND sport = 'mlb';

-- espn-pitt-pittsburgh-panthers → Pittsburgh Pirates
UPDATE public.games SET home_team_id = 'espn-mlb-pit' WHERE home_team_id = 'espn-pitt-pittsburgh-panthers' AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-pit' WHERE away_team_id = 'espn-pitt-pittsburgh-panthers' AND sport = 'mlb';

-- espn-usd-san-diego-toreros → San Diego Padres
UPDATE public.games SET home_team_id = 'espn-mlb-sd'  WHERE home_team_id = 'espn-usd-san-diego-toreros'    AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-sd'  WHERE away_team_id = 'espn-usd-san-diego-toreros'    AND sport = 'mlb';

-- espn-wash-washington-huskies → Washington Nationals
UPDATE public.games SET home_team_id = 'espn-mlb-wsh' WHERE home_team_id = 'espn-wash-washington-huskies'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-wsh' WHERE away_team_id = 'espn-wash-washington-huskies'  AND sport = 'mlb';

-- sdio-23 → Miami Marlins
UPDATE public.games SET home_team_id = 'espn-mlb-mia' WHERE home_team_id = 'sdio-23'   AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-mia' WHERE away_team_id = 'sdio-23'   AND sport = 'mlb';

-- sdio-104 → Minnesota Twins
UPDATE public.games SET home_team_id = 'espn-mlb-min' WHERE home_team_id = 'sdio-104'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-min' WHERE away_team_id = 'sdio-104'  AND sport = 'mlb';

-- sdio-109 → Texas Rangers
UPDATE public.games SET home_team_id = 'espn-mlb-tex' WHERE home_team_id = 'sdio-109'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-tex' WHERE away_team_id = 'sdio-109'  AND sport = 'mlb';

-- sdio-151 → Milwaukee Brewers
UPDATE public.games SET home_team_id = 'espn-mlb-mil' WHERE home_team_id = 'sdio-151'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-mil' WHERE away_team_id = 'sdio-151'  AND sport = 'mlb';

-- sdio-153 → Detroit Tigers
UPDATE public.games SET home_team_id = 'espn-mlb-det' WHERE home_team_id = 'sdio-153'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-det' WHERE away_team_id = 'sdio-153'  AND sport = 'mlb';

-- sdio-247 → Arizona Diamondbacks
UPDATE public.games SET home_team_id = 'espn-mlb-ari' WHERE home_team_id = 'sdio-247'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-ari' WHERE away_team_id = 'sdio-247'  AND sport = 'mlb';

-- sdio-338 → San Francisco Giants
UPDATE public.games SET home_team_id = 'espn-mlb-sf'  WHERE home_team_id = 'sdio-338'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-sf'  WHERE away_team_id = 'sdio-338'  AND sport = 'mlb';

-- sdio-347 → Seattle Mariners
UPDATE public.games SET home_team_id = 'espn-mlb-sea' WHERE home_team_id = 'sdio-347'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-sea' WHERE away_team_id = 'sdio-347'  AND sport = 'mlb';

-- sdio-362 → Kansas City Royals
UPDATE public.games SET home_team_id = 'espn-mlb-kc'  WHERE home_team_id = 'sdio-362'  AND sport = 'mlb';
UPDATE public.games SET away_team_id = 'espn-mlb-kc'  WHERE away_team_id = 'sdio-362'  AND sport = 'mlb';
