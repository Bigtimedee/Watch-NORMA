-- Fix incorrect `market` values for NBA/MLB teams whose mascot is more than one word.
-- The poll-schedule ensureTeamForSport() function derived `market` by dropping only the
-- last word of ESPN's displayName (treating it as the mascot).  This produces wrong
-- markets for: "Portland Trail Blazers", "Boston Red Sox", "Chicago White Sox",
-- "Toronto Blue Jays".  This migration corrects those rows.

UPDATE teams SET market = 'Portland' WHERE id = 'espn-nba-por' AND name = 'Portland Trail Blazers';
UPDATE teams SET market = 'Boston'   WHERE id = 'espn-mlb-bos' AND name = 'Boston Red Sox';
UPDATE teams SET market = 'Chicago'  WHERE id = 'espn-mlb-chw' AND name = 'Chicago White Sox';
UPDATE teams SET market = 'Toronto'  WHERE id = 'espn-mlb-tor' AND name = 'Toronto Blue Jays';
