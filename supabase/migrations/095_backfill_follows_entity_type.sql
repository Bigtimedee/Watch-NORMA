-- Backfill entity_type and entity_id on follows rows created before the v2 migration.
-- Rows created by old app versions only have game_id or team_id populated; the new
-- evaluate-alerts candidate query requires entity_type + entity_id.
-- This is the root cause of zero alerts during NCAAF Week 1 (2026-08-29).

UPDATE follows
SET
  entity_type = 'game',
  entity_id   = game_id
WHERE entity_type IS NULL
  AND game_id IS NOT NULL
  AND entity_id IS NULL;

UPDATE follows
SET
  entity_type = 'team',
  entity_id   = team_id
WHERE entity_type IS NULL
  AND team_id IS NOT NULL
  AND entity_id IS NULL;

-- Verify: any remaining NULL rows with a populated game/team id are data-model
-- ambiguities left for manual review. Do not backfill both columns at once
-- (a follow can't be both a game-follow and a team-follow).
