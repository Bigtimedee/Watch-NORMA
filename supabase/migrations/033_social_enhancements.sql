-- NORMA Social Media — CMO Enhancement Pack
-- Migration 030: retry logic, engagement metrics, approval workflow,
--                platform-native formats, image A/B testing, hashtag tracking

-- ---------------------------------------------------------------------------
-- 1. Retry logic for transient failures
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN retry_count   INTEGER     DEFAULT 0;
ALTER TABLE public.social_posts ADD COLUMN next_retry_at TIMESTAMPTZ DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 2. Engagement metrics (populated by fetch-social-metrics function at 9pm UTC)
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN likes_count        INTEGER     DEFAULT 0;
ALTER TABLE public.social_posts ADD COLUMN reposts_count      INTEGER     DEFAULT 0;
ALTER TABLE public.social_posts ADD COLUMN replies_count      INTEGER     DEFAULT 0;
ALTER TABLE public.social_posts ADD COLUMN impressions        INTEGER     DEFAULT 0;
ALTER TABLE public.social_posts ADD COLUMN metrics_fetched_at TIMESTAMPTZ DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 3. Content approval workflow
--    social_accounts.requires_approval = true → post held for admin review
--    before publishing
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_accounts ADD COLUMN requires_approval BOOLEAN DEFAULT false;

ALTER TABLE public.social_posts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'auto_approved';
  -- Values: auto_approved | pending_approval | approved | rejected
ALTER TABLE public.social_posts ADD COLUMN approved_at TIMESTAMPTZ DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 4. Platform-native post formats
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN post_format     TEXT  NOT NULL DEFAULT 'standard';
  -- Values: standard | carousel | poll | link
ALTER TABLE public.social_posts ADD COLUMN format_metadata JSONB NOT NULL DEFAULT '{}';
  -- carousel: { slides: [{ image_url, caption, image_prompt }] }
  -- poll:     { options: string[], duration_minutes: number }
  -- link:     { url, link_title }

-- ---------------------------------------------------------------------------
-- 5. Image style A/B testing
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts ADD COLUMN image_variant TEXT NOT NULL DEFAULT 'cinematic';
  -- Values: cinematic | graphic | lifestyle

-- ---------------------------------------------------------------------------
-- 6. Hashtag performance tracking table
-- ---------------------------------------------------------------------------
CREATE TABLE public.social_hashtag_performance (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hashtag          TEXT    NOT NULL,
  platform         TEXT    NOT NULL,
  total_posts      INTEGER NOT NULL DEFAULT 1,
  total_engagement INTEGER NOT NULL DEFAULT 0,
  avg_engagement   NUMERIC NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hashtag, platform)
);

CREATE INDEX idx_hashtag_perf_lookup
  ON public.social_hashtag_performance (platform, avg_engagement DESC)
  WHERE total_posts >= 3;

-- ---------------------------------------------------------------------------
-- Additional indexes for new query patterns
-- ---------------------------------------------------------------------------

-- Retry candidates: failed posts eligible for retry
CREATE INDEX idx_social_posts_retry
  ON public.social_posts (status, next_retry_at)
  WHERE status = 'failed' AND retry_count < 3;

-- Approval workflow: find posts awaiting approval
CREATE INDEX idx_social_posts_approval
  ON public.social_posts (approval_status, status, scheduled_for);

-- Engagement analytics: scenario / angle performance queries
CREATE INDEX idx_social_posts_performance
  ON public.social_posts (scenario, character_angle, published_at)
  WHERE status = 'published' AND metrics_fetched_at IS NOT NULL;

-- Scheduled lookup (used by hourly publish job)
CREATE INDEX idx_social_posts_scheduled_v2
  ON public.social_posts (scheduled_for, status, approval_status);

-- ---------------------------------------------------------------------------
-- Postgres RPC: atomic hashtag engagement upsert
-- Called by fetch-social-metrics after pulling engagement for a post.
-- Upserts the hashtag row and recalculates avg_engagement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_hashtag_performance(
  p_hashtag    TEXT,
  p_platform   TEXT,
  p_engagement INTEGER
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.social_hashtag_performance (hashtag, platform, total_posts, total_engagement, avg_engagement, last_used_at, updated_at)
  VALUES (p_hashtag, p_platform, 1, p_engagement, p_engagement, now(), now())
  ON CONFLICT (hashtag, platform) DO UPDATE
    SET total_posts      = social_hashtag_performance.total_posts + 1,
        total_engagement = social_hashtag_performance.total_engagement + p_engagement,
        avg_engagement   = (social_hashtag_performance.total_engagement + p_engagement)::NUMERIC
                           / (social_hashtag_performance.total_posts + 1),
        last_used_at     = now(),
        updated_at       = now();
END;
$$;
