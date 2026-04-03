-- migration 044: fix CMO cron jobs to use correct pg config key names
--
-- Migration 20260307000001_cmo_agent.sql created cron jobs that read
-- app.supabase_url and app.supabase_service_role_key. These keys are never
-- set. Every other cron job in the codebase uses app.settings.supabase_url
-- and app.settings.service_role_key, which ARE set. The CMO cron jobs have
-- been silently no-oping since deployment.
--
-- Fix: drop and recreate both jobs with the correct key names.

-- ---------------------------------------------------------------------------
-- Drop old jobs (fails silently if they do not exist)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('cmo-generate-content', 'cmo-publish-content');

-- ---------------------------------------------------------------------------
-- Recreate: generate content every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'cmo-generate-content',
    '0 */6 * * *',
    $$
    SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/cmo-generate',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body    := '{"source":"pg_cron"}'::jsonb
    );
    $$
);

-- ---------------------------------------------------------------------------
-- Recreate: publish due content every 30 minutes
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'cmo-publish-content',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/cmo-publish',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body    := '{"source":"pg_cron"}'::jsonb
    );
    $$
);
