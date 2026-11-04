-- Migration 20261104170000: social engagement tracking (Dave approved 2026-11-04).
-- social_metrics: one row per post per capture (cmo-metrics, daily 06:00 CT).
-- social_follower_daily: one follower count per channel per CT date.
-- social_metrics_runs: per-run log incl. per-platform permission/tier errors.
-- RLS on, no policies => only service_role (bypasses RLS) can read/write.

CREATE TABLE IF NOT EXISTS public.social_metrics (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform            text NOT NULL CHECK (platform IN ('x','ig','fb','tiktok','snapchat')),
  post_id             text NOT NULL,
  content_calendar_id uuid REFERENCES public.content_calendar(id) ON DELETE SET NULL,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  impressions         bigint,
  likes               bigint,
  replies             bigint,
  reposts             bigint,
  views               bigint,
  follows             bigint,
  link_clicks         bigint,
  raw                 jsonb
);
CREATE INDEX IF NOT EXISTS social_metrics_platform_post_captured_idx ON public.social_metrics (platform, post_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS social_metrics_cc_idx ON public.social_metrics (content_calendar_id);

CREATE TABLE IF NOT EXISTS public.social_follower_daily (
  platform       text NOT NULL CHECK (platform IN ('x','ig','fb','tiktok','snapchat')),
  date           date NOT NULL,
  follower_count bigint NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, date)
);

CREATE TABLE IF NOT EXISTS public.social_metrics_runs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at           timestamptz NOT NULL DEFAULT now(),
  source           text,
  posts_considered int,
  metrics_written  int,
  per_platform     jsonb,
  followers        jsonb,
  errors           jsonb
);

ALTER TABLE public.social_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_follower_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metrics_runs   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_metrics, public.social_follower_daily, public.social_metrics_runs FROM anon, authenticated;

-- Per-channel daily summary: latest snapshot per post per CT capture date, summed per channel,
-- joined to that day's follower count and day-over-day follower delta.
CREATE OR REPLACE VIEW public.social_metrics_daily_summary
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (platform, post_id, (captured_at AT TIME ZONE 'America/Chicago')::date)
         platform, post_id, (captured_at AT TIME ZONE 'America/Chicago')::date AS date,
         impressions, likes, replies, reposts, views, follows, link_clicks
    FROM public.social_metrics
   ORDER BY platform, post_id, (captured_at AT TIME ZONE 'America/Chicago')::date, captured_at DESC
), agg AS (
  SELECT platform, date, count(*) AS posts_tracked,
         sum(impressions) AS impressions, sum(likes) AS likes, sum(replies) AS replies,
         sum(reposts) AS reposts, sum(views) AS views, sum(follows) AS follows, sum(link_clicks) AS link_clicks
    FROM latest GROUP BY platform, date
), f AS (
  SELECT platform, date, follower_count,
         follower_count - lag(follower_count) OVER (PARTITION BY platform ORDER BY date) AS follower_delta
    FROM public.social_follower_daily
)
SELECT coalesce(agg.platform, f.platform) AS platform,
       coalesce(agg.date, f.date)         AS date,
       coalesce(agg.posts_tracked, 0)     AS posts_tracked,
       agg.impressions, agg.likes, agg.replies, agg.reposts, agg.views, agg.follows, agg.link_clicks,
       f.follower_count, f.follower_delta
  FROM agg FULL JOIN f ON f.platform = agg.platform AND f.date = agg.date;

REVOKE ALL ON public.social_metrics_daily_summary FROM anon, authenticated;

-- Daily 06:00 America/Chicago. pg_cron runs in UTC, so fire at 11:00 and 12:00 UTC
-- and only call when the CT hour is 6: 12:00 UTC in CST (UTC-6), 11:00 UTC in CDT (UTC-5).
-- cmo-metrics re-checks the same gate, so exactly one run per day year-round.
SELECT cron.schedule(
  'cmo-metrics-daily',
  '0 11,12 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-metrics',
    body    := '{"source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    ),
    timeout_milliseconds := 120000
  )
  WHERE extract(hour FROM now() AT TIME ZONE 'America/Chicago') = 6;
  $job$
);
