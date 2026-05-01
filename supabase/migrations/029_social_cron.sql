-- NORMA Social Media — Cron Jobs
-- Migration 029: three pg_cron jobs for the social media pipeline

-- 1. Generate content daily at 6:00 AM UTC
--    Calls Claude (text only) + selects real NORMA app screenshots from Supabase Storage.
--    No AI image generation. Inserts rows into social_posts with status='generated'
SELECT cron.schedule(
  'generate-social-content',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-social-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 2. Publish posts daily at 8:00 AM UTC
--    Reads social_posts WHERE status='generated', posts to each platform,
--    then updates status to 'published' | 'failed' | 'skipped'
SELECT cron.schedule(
  'publish-social-posts',
  '0 8 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/publish-social-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 3. Refresh expiring OAuth tokens daily at 2:00 AM UTC
--    Finds accounts with token_expires_at within 7 days,
--    calls platform refresh endpoints, updates social_accounts
SELECT cron.schedule(
  'refresh-social-tokens',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-social-tokens',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
