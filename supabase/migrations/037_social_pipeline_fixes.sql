-- NORMA Social Media — Pipeline Fixes
-- Migration 037
--
-- Fixes three root causes that prevented all social media posts from being
-- created or published:
--
--   1. Re-pin generate-social-content cron (idempotent) using the same
--      app.settings.supabase_url / app.settings.service_role_key pattern
--      that every other cron job in this project uses.
--
--   2. Fix CMO cron jobs (cmo-generate-content, cmo-publish-content).
--      Migration 20260307000001_cmo_agent.sql scheduled them using the
--      wrong GUC keys: app.supabase_url / app.supabase_service_role_key.
--      Those keys are never set, so both CMO functions receive a null URL
--      and every HTTP call silently fails.  Replace with the correct keys.
--
--   3. Seed social_accounts with one placeholder row per platform.
--      generate-social-content queries social_accounts WHERE is_active = true
--      to know which platforms to target.  With an empty table the function
--      returns { skipped: true, reason: "no_active_platforms" } on every run
--      and no posts are ever created.
--
--      The placeholder rows have is_active = true so the generation pipeline
--      runs immediately (Claude only needs ANTHROPIC_API_KEY, not platform
--      tokens).  Publishing will fail gracefully until real OAuth tokens are
--      written into each access_token column.
--
--      TO ACTIVATE A PLATFORM:
--        UPDATE public.social_accounts
--           SET access_token  = '<real token>',
--               account_id    = '<real id>',
--               account_name  = '<real handle>',
--               metadata      = '<platform-specific json>'
--         WHERE platform = '<x|instagram|facebook|tiktok|reddit>';
--
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Re-pin generate-social-content cron
--    Unschedule any existing version first (safe no-op if absent), then
--    re-create with the canonical settings keys.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'generate-social-content';

SELECT cron.schedule(
  'generate-social-content',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/generate-social-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);


-- ---------------------------------------------------------------------------
-- 2. Fix CMO cron jobs
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN ('cmo-generate-content', 'cmo-publish-content');

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


-- ---------------------------------------------------------------------------
-- 3. Seed social_accounts with placeholder rows
--    ON CONFLICT DO NOTHING so this is safe to re-run and will never
--    overwrite rows that already have real credentials.
-- ---------------------------------------------------------------------------
INSERT INTO public.social_accounts
  (platform, account_id, account_name, access_token, is_active, requires_approval, metadata)
VALUES
  ('x',
   'REPLACE_WITH_X_USER_ID',
   '@norma_app',
   'REPLACE_WITH_X_ACCESS_TOKEN',
   true,
   false,
   '{}'::jsonb),

  ('instagram',
   'REPLACE_WITH_IG_USER_ID',
   'norma_app',
   'REPLACE_WITH_IG_ACCESS_TOKEN',
   true,
   false,
   '{"ig_user_id": "REPLACE_WITH_IG_USER_ID"}'::jsonb),

  ('facebook',
   'REPLACE_WITH_FB_PAGE_ID',
   'NORMA',
   'REPLACE_WITH_FB_PAGE_ACCESS_TOKEN',
   true,
   false,
   '{"page_id": "REPLACE_WITH_FB_PAGE_ID"}'::jsonb),

  ('tiktok',
   'REPLACE_WITH_TIKTOK_OPEN_ID',
   'norma_app',
   'REPLACE_WITH_TIKTOK_ACCESS_TOKEN',
   true,
   false,
   '{}'::jsonb),

  ('reddit',
   'REPLACE_WITH_REDDIT_USERNAME',
   'u/norma_app',
   'REPLACE_WITH_REDDIT_ACCESS_TOKEN',
   true,
   false,
   '{}'::jsonb)

ON CONFLICT (platform) DO NOTHING;

COMMENT ON TABLE public.social_accounts IS
  'One row per platform. Seeded with placeholder tokens by migration 037. '
  'Replace REPLACE_WITH_* values with real OAuth credentials for each platform. '
  'is_active = true allows generate-social-content to create posts immediately; '
  'publish-social-posts will fail with auth errors until real tokens are set.';
