-- Migration 017: Add parsed_target JSONB column for wager-outcome proximity alerts
-- Stores structured WagerTarget parsed from free-text descriptions

ALTER TABLE wagers ADD COLUMN parsed_target JSONB;
ALTER TABLE prediction_positions ADD COLUMN parsed_target JSONB;
