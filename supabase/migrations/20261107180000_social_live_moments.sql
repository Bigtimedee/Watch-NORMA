-- Migration 20261107180000: growth-plan social formats (Live Moments + Today's Games).
-- Dave 2026-11-07: "Implement NORMA's growth plan starting now".
--
-- Additive only:
--   1. content_calendar: platform_captions (per-platform utility captions for
--      IG/FB/TikTok, enforced by _shared/social-copy-guard.ts), game_id,
--      moment_key (+ unique (platform, moment_key) safety index).
--   2. social_live_moments: idempotency ledger. moment_key UNIQUE:
--        live_moment:<game_id>:<overtime|two_minute|close_finish>
--        todays_games:<ET date>
--      RLS on, no policies => service_role only.
--   3. pg_cron:
--        cmo-live-moments  every minute, ONLY while an NFL/NCAAF/NBA/NCAAM game
--                          is in progress in its final regulation period or OT.
--        cmo-todays-games  13:30 UTC daily (07:30 CST / 08:30 CDT).
--   4. cmo-publish-content (job 48) re-scheduled in place with ONE change: the
--      SQL empty-media hold skips content_type live_moment / todays_games (X
--      text-only growth-plan formats). The 3h stale hold and the cross-post
--      trigger are unchanged. cmo-publish itself applies the 20-min Live Moment
--      stale window and the video-only rule for every other row.
--
-- Auth: same vault secret ('New Secret 2026') as every other cron job.

-- 1. content_calendar columns -------------------------------------------------
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS platform_captions jsonb,
  ADD COLUMN IF NOT EXISTS game_id text,
  ADD COLUMN IF NOT EXISTS moment_key text;

COMMENT ON COLUMN public.content_calendar.platform_captions IS
  'Per-platform captions {"ig":..,"fb":..,"tiktok":..}. Cross-post uses these instead of the X body; each must pass the utility-only guard (no betting terms on IG/FB/TikTok).';
COMMENT ON COLUMN public.content_calendar.game_id IS 'games.id a Live Moment row is about (null for other formats).';
COMMENT ON COLUMN public.content_calendar.moment_key IS 'Idempotency key from social_live_moments (live_moment / todays_games rows).';

CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_platform_moment_key_uidx
  ON public.content_calendar (platform, moment_key)
  WHERE moment_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_calendar_content_type_created_idx
  ON public.content_calendar (content_type, created_at DESC);

-- 2. ledger -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_live_moments (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moment_key          text NOT NULL UNIQUE,
  kind                text NOT NULL CHECK (kind IN ('live_moment', 'todays_games')),
  game_id             text,
  sport               text,
  moment_type         text CHECK (moment_type IS NULL OR moment_type IN ('overtime', 'two_minute', 'close_finish')),
  outcome             text NOT NULL CHECK (outcome IN ('queued', 'rate_capped', 'guard_blocked', 'no_games', 'skipped', 'insert_failed')),
  content_calendar_id uuid REFERENCES public.content_calendar(id) ON DELETE SET NULL,
  detail              jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_live_moments_created_idx ON public.social_live_moments (created_at DESC);

ALTER TABLE public.social_live_moments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_live_moments FROM anon, authenticated;
GRANT ALL ON TABLE public.social_live_moments TO service_role;

COMMENT ON TABLE public.social_live_moments IS
  'cmo-live-moments idempotency ledger: one row per game+moment type (or per ET day for todays_games). RLS on, service_role only.';

-- 3. cron: producer jobs --------------------------------------------------------
SELECT cron.schedule(
  'cmo-live-moments',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-live-moments',
    body    := '{"mode":"live","source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  )
  WHERE EXISTS (
    SELECT 1 FROM public.games g
     WHERE g.status = 'inprogress'
       AND g.sport IN ('nfl', 'ncaaf', 'nba', 'ncaam')
       AND g.id NOT LIKE 'demo-%'
       AND g.period >= CASE WHEN g.sport = 'ncaam' THEN 2 ELSE 4 END
  );
  $job$
);

SELECT cron.schedule(
  'cmo-todays-games',
  '30 13 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/cmo-live-moments',
    body    := '{"mode":"todays_games","source":"pg_cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'New Secret 2026')
    )
  );
  $job$
);

-- 4. cmo-publish-content: text formats exempt from the SQL empty-media hold ----
SELECT cron.schedule(
  'cmo-publish-content',
  '*/5 * * * *',
  $job$
  -- 2026-11-07: empty-media hold skips content_type live_moment / todays_games (X text-only growth-plan formats).
  -- 2026-10-29: + cross-post trigger (see bottom). 2026-10-02 fix: was '0 9 * * *' (daily 04:00 CT sweep). Now every 5 min with a SQL stale guard.
  -- Guard: hold (status='paused', which cmo-publish never tweets) any due twitter draft/scheduled row that is
  --   (a) more than 3h past scheduled_for, or (b) has empty media_urls and is not a text format (checked 1 min ahead to beat the race).
  UPDATE public.content_calendar
     SET status = 'paused',
         human_notes = coalesce(human_notes, '') || E'\n[' || to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') || ' CT stale-guard] Held by cron: '
           || CASE WHEN coalesce(cardinality(media_urls), 0) = 0
                    AND coalesce(content_type, '') NOT IN ('live_moment', 'todays_games')
                   THEN 'media_urls empty' ELSE 'more than 3h past scheduled_for' END
           || '. Attach media / reschedule and set status=draft to publish.'
   WHERE platform = 'twitter'
     AND status IN ('draft', 'scheduled')
     AND scheduled_for <= now() + interval '1 minute'
     AND (   (coalesce(cardinality(media_urls), 0) = 0 AND coalesce(content_type, '') NOT IN ('live_moment', 'todays_games'))
          OR scheduled_for < now() - interval '3 hours');

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
  )
  -- 2026-10-29: also fire for the IG/FB/TikTok cross-post sweep (PR #80) when a recently
  -- published X video row still has an unattempted platform. A platform skipped as
  -- 'not_configured' (no creds; cmo-publish writes <p>_error, no claim) is NOT pending,
  -- so a missing TikTok token costs one call per new row, never a call every 5 min.
  OR EXISTS (
    SELECT 1 FROM public.content_calendar c
     WHERE c.platform = 'twitter' AND c.status = 'published'
       AND c.published_at >= now() - interval '6 hours'
       AND EXISTS (SELECT 1 FROM unnest(c.media_urls) u
                    WHERE lower(split_part(split_part(u, '?', 1), '#', 1)) ~ '\.(mp4|mov|m4v)$')
       AND (   (c.ig_attempted_at IS NULL AND c.ig_post_id IS NULL AND c.ig_error IS DISTINCT FROM 'not_configured')
            OR (c.fb_attempted_at IS NULL AND c.fb_post_id IS NULL AND c.fb_error IS DISTINCT FROM 'not_configured')
            OR (c.tiktok_attempted_at IS NULL AND c.tiktok_post_id IS NULL AND c.tiktok_error IS DISTINCT FROM 'not_configured'))
  );
  $job$
);
