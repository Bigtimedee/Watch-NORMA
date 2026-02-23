-- v2 cron jobs: Add game-watcher-orchestrator, remove standalone evaluate-alerts cron
-- The orchestrator now handles dispatching PBP, summary, and alert evaluation

-- Remove the standalone evaluate-alerts cron job
-- (evaluate-alerts is now invoked by the orchestrator per-game, not globally)
SELECT cron.unschedule('evaluate-alerts');

-- Add game-watcher-orchestrator (runs every minute)
SELECT cron.schedule(
  'game-watcher-orchestrator',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/game-watcher-orchestrator',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g"}'::jsonb
  );
  $$
);

-- poll-schedule (30 min) and poll-boxscore (1 min) remain unchanged
-- poll-odds (5 min) from migration 007 remains unchanged
