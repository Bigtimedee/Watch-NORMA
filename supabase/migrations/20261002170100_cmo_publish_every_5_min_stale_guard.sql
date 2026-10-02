-- Migration 20261002170100: cmo-publish-content every 5 min + SQL stale guard.
--
-- MIRRORS PRODUCTION. Norma Content changed prod pg_cron job 48
-- (cmo-publish-content) at 2026-10-02 11:45 CT via cron.alter_job. This file
-- reproduces that live job byte-for-byte (command md5
-- a41a834205627455a24335d74351a287) so a future `db push` / fresh environment
-- does not revert it to the old daily sweep.
--
-- Root cause of the 2026-09-26..10-02 late posts: 20260729000001 created this
-- job as '0 9 * * *' (09:00 UTC = 04:00 CT daily). On-time posts through 9/24
-- came only from agents hand-POSTing cmo-publish at slot time; once those
-- stopped, every row waited for the next 04:00 CT sweep (f7c0d4ed, 393cb5d6,
-- 5c4d7dc8, 3347826d; 3347826d also went out with empty media).
--
-- Each run:
--   1) holds (status='paused' + human_notes line) any due twitter
--      draft/scheduled row whose media_urls is empty (checked 1 min ahead) or
--      that is more than 3h past scheduled_for;
--   2) calls cmo-publish only when a twitter draft/scheduled row is due.
-- cmo-publish/logic.ts classifyPublishCandidate applies the same guards so
-- hand-made POSTs are covered too.
--
-- Idempotent: pg_cron >= 1.4 cron.schedule() with an existing job name updates
-- that job in place (same jobid), so applying this to prod is a no-op in effect.
-- cmo-publish-linkedin (*/30) is a separate job and is not touched.

SELECT cron.schedule(
  'cmo-publish-content',
  '*/5 * * * *',
  $job$
  -- 2026-10-02 fix: was '0 9 * * *' (daily 04:00 CT sweep). Now every 5 min with a SQL stale guard.
  -- Guard: hold (status='paused', which cmo-publish never tweets) any due twitter draft/scheduled row that is
  --   (a) more than 3h past scheduled_for, or (b) has empty media_urls (checked 1 min ahead to beat the race).
  UPDATE public.content_calendar
     SET status = 'paused',
         human_notes = coalesce(human_notes, '') || E'\n[' || to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') || ' CT stale-guard] Held by cron: '
           || CASE WHEN coalesce(cardinality(media_urls), 0) = 0 THEN 'media_urls empty' ELSE 'more than 3h past scheduled_for' END
           || '. Attach media / reschedule and set status=draft to publish.'
   WHERE platform = 'twitter'
     AND status IN ('draft', 'scheduled')
     AND scheduled_for <= now() + interval '1 minute'
     AND (coalesce(cardinality(media_urls), 0) = 0 OR scheduled_for < now() - interval '3 hours');

  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-publish',
    body    := '{"source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  )
  WHERE EXISTS (
    SELECT 1 FROM public.content_calendar
     WHERE platform = 'twitter' AND status IN ('draft', 'scheduled') AND scheduled_for <= now()
  );
  $job$
);
