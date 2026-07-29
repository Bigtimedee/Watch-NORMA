-- Migration 057: Add CHECK constraint on games.status to prevent invalid values
--
-- ROOT CAUSE: ESPN's API returns machine-code status values like "STATUS_IN_PROGRESS"
-- via status.type.name. When poll-boxscore used this field instead of status.type.description,
-- the mapStatus() function couldn't map them and stored raw values. Games with non-standard
-- statuses became permanently orphaned because poll-boxscore/orchestrator queries only match
-- the canonical set: (scheduled, inprogress, halftime, closed, cancelled, postponed).
--
-- This constraint is the final safeguard: even if the application code regresses,
-- the database will reject any INSERT/UPDATE with an invalid status value,
-- causing a visible error instead of a silent data corruption.

-- First heal any remaining non-standard values (idempotent)
UPDATE games SET status = 'closed' WHERE status IN ('status_in_progress', 'status_halftime', 'end of period')
  AND scheduled_at < now() - interval '6 hours';
UPDATE games SET status = 'inprogress' WHERE status = 'status_in_progress'
  AND scheduled_at >= now() - interval '6 hours';
UPDATE games SET status = 'scheduled' WHERE status IN ('status_scheduled', 'delayed');

-- Add the constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='games_status_valid' AND conrelid='public.games'::regclass
  ) THEN
    ALTER TABLE games ADD CONSTRAINT games_status_valid
      CHECK (status IN ('scheduled', 'inprogress', 'halftime', 'closed', 'cancelled', 'postponed'));
  END IF;
END;
$$;
