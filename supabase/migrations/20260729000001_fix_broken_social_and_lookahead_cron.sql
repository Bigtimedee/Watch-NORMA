-- Migration 20260729000001: repoint five cron jobs to Vault based auth.
--
-- This is a NEW migration, not an edit to any prior one. 063_social_cron_schedule.sql
-- (and the older 029/034/040/044/045/046/047/048/057/20260307000001 migrations
-- that preceded it) were already applied to production before this session,
-- so per the non negotiable rule against editing shipped migrations, they are
-- left untouched. This file supersedes their scheduling at runtime instead.
--
-- Five jobs were broken or insecure, found and fixed 2026-07-29:
--   cmo-generate-content, cmo-publish-content, generate-social-content,
--   poll-schedule-lookahead: referenced current_setting('app.settings.*'),
--   which does not exist on this database. Every run had failed since
--   creation (cmo-publish-content: 336 failures in the prior 7 days alone).
--   publish-social-posts: this one worked, but only because a prior repair
--   attempt hardcoded the live service role JWT directly into the job
--   command in plaintext, readable by anyone with query access to cron.job.
--
-- All five now read the key from Vault, matching every other cron job
-- touched this session.

SELECT cron.unschedule('cmo-generate-content')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cmo-generate-content');

SELECT cron.schedule(
  'cmo-generate-content',
  '0 8 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-generate',
    body    := '{"source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);

SELECT cron.unschedule('cmo-publish-content')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cmo-publish-content');

SELECT cron.schedule(
  'cmo-publish-content',
  '0 9 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-publish',
    body    := '{"source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);

SELECT cron.unschedule('generate-social-content')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-social-content');

SELECT cron.schedule(
  'generate-social-content',
  '0 */6 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/generate-social-content',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);

SELECT cron.unschedule('poll-schedule-lookahead')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-schedule-lookahead');

SELECT cron.schedule(
  'poll-schedule-lookahead',
  '0 4 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule-lookahead',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);

SELECT cron.unschedule('publish-social-posts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-social-posts');

SELECT cron.schedule(
  'publish-social-posts',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/publish-social-posts',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);
