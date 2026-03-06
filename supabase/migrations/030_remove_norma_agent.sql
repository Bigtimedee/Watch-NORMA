-- Rollback: remove NORMA Agent tables and columns added in migrations 028 and 029

-- Remove pg_cron job
SELECT cron.unschedule('norma-agent-evaluate');

-- Remove agent tracking columns from prediction_positions
ALTER TABLE prediction_positions
  DROP COLUMN IF EXISTS last_agent_probability,
  DROP COLUMN IF EXISTS market_close_time;

-- Drop agent tables (CASCADE handles policies and indexes)
DROP TABLE IF EXISTS agent_alerts CASCADE;
DROP TABLE IF EXISTS agent_config CASCADE;
