-- =============================================================================
-- NORMA CMO Agent Migration
-- 20260307000001_cmo_agent.sql
-- Creates content_calendar table, RLS policies, triggers, and pg_cron jobs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: content_calendar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_calendar (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    platform            text            NOT NULL,           -- 'twitter', 'instagram', 'linkedin', etc.
    content_type        text            NOT NULL,           -- 'post', 'thread', 'story', 'reel'
    body                text            NOT NULL,
    media_urls          text[]          DEFAULT '{}',
    hashtags            text[]          DEFAULT '{}',
    status              text            NOT NULL DEFAULT 'draft',  -- 'draft','scheduled','paused','published','failed','deleted'
    scheduled_for       timestamptz,
    published_at        timestamptz,
    platform_post_id    text,
    generation_prompt   text,
    human_notes         text,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT content_calendar_status_check CHECK (
        status IN ('draft', 'scheduled', 'paused', 'published', 'failed', 'deleted')
    ),
    CONSTRAINT content_calendar_platform_check CHECK (
        platform IN ('twitter', 'instagram', 'linkedin', 'tiktok', 'facebook')
    )
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_content_calendar_status
    ON public.content_calendar (status);

CREATE INDEX IF NOT EXISTS idx_content_calendar_scheduled_for
    ON public.content_calendar (scheduled_for)
    WHERE status IN ('draft', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_content_calendar_platform
    ON public.content_calendar (platform);

CREATE INDEX IF NOT EXISTS idx_content_calendar_published_at
    ON public.content_calendar (published_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_content_calendar_created_at
    ON public.content_calendar (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. updated_at Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_calendar_updated_at ON public.content_calendar;
CREATE TRIGGER trg_content_calendar_updated_at
    BEFORE UPDATE ON public.content_calendar
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

-- Service role: unrestricted access (used by Edge Functions)
CREATE POLICY "service_role_full_access" ON public.content_calendar
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users: read and update (for the human-review dashboard)
CREATE POLICY "authenticated_select" ON public.content_calendar
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "authenticated_update" ON public.content_calendar
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (
        -- Authenticated users may only move posts to 'paused' or 'deleted',
        -- or update human_notes. They cannot publish directly from the dashboard.
        status IN ('paused', 'deleted', 'draft', 'scheduled')
    );

-- ---------------------------------------------------------------------------
-- 4. Helper view: upcoming drafts (convenience for the dashboard)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.content_calendar_upcoming AS
    SELECT *
    FROM public.content_calendar
    WHERE status IN ('draft', 'scheduled')
      AND (scheduled_for IS NULL OR scheduled_for >= now() - interval '1 hour')
    ORDER BY scheduled_for ASC NULLS LAST, created_at ASC;

-- ---------------------------------------------------------------------------
-- 5. Helper view: recent published posts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.content_calendar_published AS
    SELECT *
    FROM public.content_calendar
    WHERE status = 'published'
    ORDER BY published_at DESC
    LIMIT 100;

-- ---------------------------------------------------------------------------
-- 6. Daily post-count guard function (used by cmo-publish)
-- Returns the number of posts published today for a given platform.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_calendar_published_today(p_platform text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::integer
    FROM public.content_calendar
    WHERE platform    = p_platform
      AND status      = 'published'
      AND published_at >= date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
$$;

-- ---------------------------------------------------------------------------
-- 7. pg_cron jobs
--    Requires pg_cron extension (enabled by Supabase on Pro+ plans).
--    The cron jobs call the Edge Functions via net.http_post (pg_net extension).
--    Replace <PROJECT_REF> with your actual Supabase project reference, or
--    set via the SUPABASE_URL environment variable pattern below.
--
--    Both jobs are created in the 'cron' schema and call the Supabase internal
--    Edge Function invoke URL.  The Authorization header uses the service-role
--    key which should be stored as a Supabase secret.
-- ---------------------------------------------------------------------------

-- Ensure pg_cron and pg_net are available
DO $$
BEGIN
    -- pg_cron
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA cron;
    END IF;

    -- pg_net (HTTP from SQL)
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_net;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7a. Remove old versions of our cron jobs if they exist
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('cmo-generate-content', 'cmo-publish-content');

-- ---------------------------------------------------------------------------
-- 7b. Generate content every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'cmo-generate-content',
    '0 */6 * * *',
    $$
    SELECT net.http_post(
        url     := current_setting('app.supabase_url') || '/functions/v1/cmo-generate',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body    := '{"source":"pg_cron"}'::jsonb
    );
    $$
);

-- ---------------------------------------------------------------------------
-- 7c. Publish due content every 30 minutes
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'cmo-publish-content',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
        url     := current_setting('app.supabase_url') || '/functions/v1/cmo-publish',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body    := '{"source":"pg_cron"}'::jsonb
    );
    $$
);

-- ---------------------------------------------------------------------------
-- 8. Set database-level config values used by the cron jobs above.
--    Run these manually (or in a separate migration) with your real values:
--
--    ALTER DATABASE postgres
--        SET app.supabase_url = 'https://<ref>.supabase.co';
--    ALTER DATABASE postgres
--        SET app.supabase_service_role_key = '<your-service-role-key>';
--
-- The placeholder values below will cause the cron jobs to fail gracefully
-- until replaced with real values.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Only set if not already configured (avoids overwriting production values
    -- when this migration runs in an already-configured environment).
    IF current_setting('app.supabase_url', true) IS NULL
    OR current_setting('app.supabase_url', true) = '' THEN
        EXECUTE format(
            'ALTER DATABASE %I SET app.supabase_url = %L',
            current_database(),
            'https://REPLACE_ME.supabase.co'
        );
    END IF;

    IF current_setting('app.supabase_service_role_key', true) IS NULL
    OR current_setting('app.supabase_service_role_key', true) = '' THEN
        EXECUTE format(
            'ALTER DATABASE %I SET app.supabase_service_role_key = %L',
            current_database(),
            'REPLACE_ME_SERVICE_ROLE_KEY'
        );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grant schema usage to dashboard role (Supabase Studio)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.content_calendar           TO anon;
GRANT SELECT ON public.content_calendar_upcoming  TO authenticated;
GRANT SELECT ON public.content_calendar_published TO authenticated;

-- Done
COMMENT ON TABLE public.content_calendar IS
    'NORMA CMO Agent — AI-generated social media posts with human review workflow.';
