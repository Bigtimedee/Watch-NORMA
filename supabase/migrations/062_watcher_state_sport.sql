-- Add sport column to watcher_state for orchestrator filtering
ALTER TABLE public.watcher_state
  ADD COLUMN IF NOT EXISTS sport TEXT;

-- Backfill from games table
UPDATE public.watcher_state ws
SET sport = g.sport
FROM public.games g
WHERE g.id = ws.game_id;
