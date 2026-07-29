-- Migration 20260729000002: remove the live service role JWT from every
-- remaining cron job that carried it in plaintext.
--
-- Discovered 2026-07-29 while checking whether poll-markets, the ad auction
-- jobs, and several others shared the app.settings.* defect fixed in
-- 20260729000001. They did not: someone had already hand patched all 16 of
-- them with a working hardcoded URL, at some point outside the tracked
-- migration history. But the patch used the literal service role key
-- instead of a secret store, so all 16 carried the live key in plaintext in
-- cron.job.command, readable by anyone with query access to that table.
--
-- Fixed jobs: ad-auto-bidder, ad-budget-pacer, ad-fraud-check,
-- deep-link-health-check, fetch-social-metrics, floor-price-optimizer,
-- game-watcher-orchestrator, generate-recap-content,
-- generate-supply-forecasts, poll-boxscore, poll-markets, poll-schedule,
-- refresh-ad-metrics, refresh-social-tokens, renew-gmail-watch,
-- social-cadence-catchup.
--
-- Schedules and request bodies are copied exactly from the live jobs at the
-- time of this migration. Only the Authorization source changes, from a
-- literal string to a Vault lookup, matching every other cron job touched
-- this session. auto-complete-campaigns and cleanup-expired-oauth-tokens
-- were checked and excluded: both run direct SQL with no HTTP call, so
-- neither ever carried a key.

SELECT cron.unschedule('ad-auto-bidder') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ad-auto-bidder');
SELECT cron.schedule('ad-auto-bidder', '*/30 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/ad-auto-bidder',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('ad-budget-pacer') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ad-budget-pacer');
SELECT cron.schedule('ad-budget-pacer', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/ad-budget-pacer',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('ad-fraud-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ad-fraud-check');
SELECT cron.schedule('ad-fraud-check', '0 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/ad-fraud-check',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('deep-link-health-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deep-link-health-check');
SELECT cron.schedule('deep-link-health-check', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/deep-link-health-check',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('fetch-social-metrics') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-social-metrics');
SELECT cron.schedule('fetch-social-metrics', '0 21 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/fetch-social-metrics',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('floor-price-optimizer') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'floor-price-optimizer');
SELECT cron.schedule('floor-price-optimizer', '0 3 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/floor-price-optimizer',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('game-watcher-orchestrator') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'game-watcher-orchestrator');
SELECT cron.schedule('game-watcher-orchestrator', '*/1 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/game-watcher-orchestrator',
    headers := jsonb_build_object('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'))
  );
$job$);

SELECT cron.unschedule('generate-recap-content') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recap-content');
SELECT cron.schedule('generate-recap-content', '0 23 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/generate-recap-content',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('generate-supply-forecasts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-supply-forecasts');
SELECT cron.schedule('generate-supply-forecasts', '0 2 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/forecast-supply',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('poll-boxscore') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-boxscore');
SELECT cron.schedule('poll-boxscore', '*/1 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-boxscore',
    headers := jsonb_build_object('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'))
  );
$job$);

SELECT cron.unschedule('poll-markets') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-markets');
SELECT cron.schedule('poll-markets', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-markets',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('poll-schedule') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-schedule');
SELECT cron.schedule('poll-schedule', '*/30 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule',
    headers := jsonb_build_object('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026'))
  );
$job$);

SELECT cron.unschedule('refresh-ad-metrics') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ad-metrics');
SELECT cron.schedule('refresh-ad-metrics', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/ad-metrics-refresh',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('refresh-social-tokens') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-social-tokens');
SELECT cron.schedule('refresh-social-tokens', '0 2 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/refresh-social-tokens',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('renew-gmail-watch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'renew-gmail-watch');
SELECT cron.schedule('renew-gmail-watch', '0 2 * * 0', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/renew-gmail-watch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.unschedule('social-cadence-catchup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-cadence-catchup');
SELECT cron.schedule('social-cadence-catchup', '0 21 * * *', $job$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/generate-social-content',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')),
    body := '{"source":"pg_cron_catchup","catch_up":true}'::jsonb
  );
$job$);
