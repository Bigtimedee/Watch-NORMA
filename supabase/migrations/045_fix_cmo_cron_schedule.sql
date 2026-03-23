-- migration 045: fix CMO generate cron schedule + pass count=4
--
-- The cmo-generate-content cron (migration 044) fires every 6 hours, which means
-- it generates content at unpredictable UTC times that may not align with the four
-- CT posting windows (7 AM, 11 AM, 3 PM, 7 PM CT).
--
-- Fix:
--   1. Reschedule cmo-generate-content to fire once daily at 5:00 UTC
--      (~midnight to 1 AM CT depending on DST). This is safely before the first
--      posting window so all 4 posts for the day are generated in a single batch.
--   2. Pass count=4 in the request body so getNextPostingWindows() returns slots
--      for all four CT windows (7 AM, 11 AM, 3 PM, 7 PM).
--
-- cmo-publish-content remains unchanged at */30 * * * *.

-- ---------------------------------------------------------------------------
-- Drop old generate job (fails silently if it does not exist)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cmo-generate-content';

-- ---------------------------------------------------------------------------
-- Recreate: generate 4 posts once daily at 05:00 UTC
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'cmo-generate-content',
    '0 5 * * *',
    $$
    SELECT net.http_post(
        url     := current_setting('app.settings.supabase_url') || '/functions/v1/cmo-generate',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body    := '{"source":"pg_cron","count":4}'::jsonb
    );
    $$
);
