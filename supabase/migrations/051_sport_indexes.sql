-- Migration 051: Additional sport compound indexes for performance
-- Part of MLB/NBA expansion (see docs/mlb-nba-expansion-plan.md)
-- These supplement the indexes created in migration 049 with
-- more specific compound indexes tuned to production query patterns.

-- Wagers: sport + user + status (wager feed query)
CREATE INDEX IF NOT EXISTS idx_wagers_sport_user_status
  ON public.wagers(sport, user_id, status);

-- Follows: sport + user (follow lookup for alert candidate generation)
CREATE INDEX IF NOT EXISTS idx_follows_sport_user
  ON public.follows(sport, user_id);

-- Alert throttle: sport + user + game (throttle check in evaluate-alerts)
CREATE INDEX IF NOT EXISTS idx_alert_throttle_sport
  ON public.alert_throttle(sport, user_id, game_id, alert_type, created_at DESC);

-- Teams: sport + sportradar_id (PBP player resolution)
CREATE INDEX IF NOT EXISTS idx_teams_sport_sportradar
  ON public.teams(sport, sportradar_id)
  WHERE sportradar_id IS NOT NULL;

-- Game snapshots: filtered by game sport via game join (no direct sport column on snapshots,
-- but we index game_id + snapshot_type for fast lookups)
CREATE INDEX IF NOT EXISTS idx_game_snapshots_type
  ON public.game_snapshots(game_id, snapshot_type, created_at DESC);

-- Watcher state: next poll timestamps per sport (orchestrator dispatch optimization)
CREATE INDEX IF NOT EXISTS idx_watcher_pbp_next_sport
  ON public.watcher_state(sport, pbp_next_poll_at)
  WHERE is_active = true AND pbp_next_poll_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_watcher_summary_next_sport
  ON public.watcher_state(sport, summary_next_poll_at)
  WHERE is_active = true AND summary_next_poll_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_watcher_alert_next_sport
  ON public.watcher_state(sport, alert_next_evaluate_at)
  WHERE is_active = true AND alert_next_evaluate_at IS NOT NULL;
