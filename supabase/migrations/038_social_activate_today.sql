-- NORMA Social Media — Activate pipeline for today
-- Migration 038
--
-- Migration 037 seeded social_accounts with placeholder access_token strings
-- (e.g. 'REPLACE_WITH_IG_ACCESS_TOKEN'). social-publishers.ts uses the
-- pattern:
--
--   const token = account.access_token || Deno.env.get("META_INSTAGRAM_ACCESS_TOKEN")!;
--
-- A non-empty string is truthy in JavaScript/TypeScript, so the placeholder
-- wins and the real env-var credential is never reached. Setting access_token
-- to '' (empty string) makes the || fall through to the env var for
-- Instagram, Facebook, and TikTok. X and Reddit read their credentials
-- directly from env vars and are unaffected.
--
-- The generate-social-content cron fires at 06:00 UTC daily. It already
-- fired today while social_accounts was empty and returned
-- { skipped: true, reason: "no_active_platforms" } — no social_posts rows
-- were created. The idempotency guard only fires early when rows with
-- status IN ('generated','published') exist for today, so it will NOT
-- block a manual trigger right now.
--
-- This migration:
--   1. Clears placeholder access_token values so env-var fallback works.
--   2. Fires generate-social-content immediately so today's content is
--      created without waiting for tomorrow's 06:00 UTC cron.
--   3. The existing hourly publish-social-posts cron (migration 034,
--      schedule '0 * * * *') will pick up the generated posts
--      automatically at each platform's scheduled_for time today.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Fix placeholder access_token values
--    Only touches rows still carrying the migration-037 placeholder strings.
--    Real credentials written by operators are not affected.
-- ---------------------------------------------------------------------------
UPDATE public.social_accounts
   SET access_token = ''
 WHERE access_token LIKE 'REPLACE_WITH_%';


-- ---------------------------------------------------------------------------
-- 2. Trigger generate-social-content right now
--    net.http_post is fire-and-forget; the function runs asynchronously in
--    the Edge Function runtime. Errors are logged in Supabase Edge Function
--    logs — they do not abort this migration.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND current_setting('app.settings.supabase_url', true) IS NOT NULL
     AND current_setting('app.settings.service_role_key', true) IS NOT NULL THEN
    PERFORM net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/generate-social-content',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  END IF;
END
$$;
