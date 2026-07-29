-- NORMA Morning Briefing Cron
-- Superseded in place. The original referenced current_setting('app.settings.*'),
-- which does not exist on this database, so this job never once ran
-- successfully. Rescheduled here with the corrected Vault based auth, matching
-- what was actually applied to production on 2026-07-29. Migration 069 also
-- unschedules and reschedules 'morning-briefing' idempotently, so running both
-- in either order is safe; this file is kept at its original number so the
-- history stays intact.

SELECT cron.unschedule('morning-briefing')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-briefing');

SELECT cron.schedule(
  'morning-briefing',
  '0 23 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/morning-briefing',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'
      )
    )
  );
  $job$
);
