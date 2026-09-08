-- Migration 20260908160000: schedule cmo-publish-linkedin (LinkedIn company page).
--
-- content_calendar.platform already allows 'linkedin' (20260307000001).
-- cmo-publish is twitter-only (PR #32) and must keep that guard. This job
-- invokes a sibling Edge Function that selects
--   platform = 'linkedin' AND status IN ('draft','scheduled') AND scheduled_for <= now()
-- and posts to the NORMA LinkedIn organization page via the Posts API.
--
-- Cadence matches the original cmo-publish-content design (every 30 minutes)
-- so scheduled_for timestamps throughout the day still ship. Production
-- twitter cmo-publish-content currently runs daily at 09:00 UTC
-- (20260729000001); this LinkedIn job is independent and does not change it.
--
-- Auth follows the Vault pattern from 20260729000001. Requires secrets:
--   LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORGANIZATION_ID
-- Optional: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN,
--           LINKEDIN_API_VERSION

SELECT cron.unschedule('cmo-publish-linkedin')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cmo-publish-linkedin');

SELECT cron.schedule(
  'cmo-publish-linkedin',
  '*/30 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-publish-linkedin',
    body    := '{"source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);
