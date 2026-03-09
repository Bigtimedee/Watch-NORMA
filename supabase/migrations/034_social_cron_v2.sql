-- NORMA Social Media — Updated Cron Schedule
-- Migration 031: per-platform timing, engagement metrics fetch, post-game recap

-- ---------------------------------------------------------------------------
-- Replace fixed 8am publish with hourly job.
-- Each post now carries its own platform-optimal scheduled_for timestamp.
-- The hourly job picks up any post where scheduled_for <= now().
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('publish-social-posts');

SELECT cron.schedule(
  'publish-social-posts',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/publish-social-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- Fetch engagement metrics daily at 9pm UTC
-- Allows ~8–12 hours for posts to accumulate meaningful engagement before
-- we pull numbers back and update social_hashtag_performance.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'fetch-social-metrics',
  '0 21 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-social-metrics',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- Generate post-game recap content daily at 11pm UTC
-- Runs after most NCAA games conclude; creates norma_knew posts with actual
-- scores for each active platform, scheduled for next morning.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'generate-recap-content',
  '0 23 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/generate-recap-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
