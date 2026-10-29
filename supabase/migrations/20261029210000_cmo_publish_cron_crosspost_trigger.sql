-- Migration 20261029210000: cmo-publish-content cron also fires for the cross-post sweep.
--
-- Bug (PR #80): job 48 only called cmo-publish when an X draft/scheduled row was
-- due, so the IG Reels / FB Page / TikTok sweep never ran for already-published
-- X video rows unless some other X row happened to be due.
--
-- Fix: also call cmo-publish when a twitter row published in the last 6h
-- (= CROSSPOST_WINDOW_MS) has a video media_url (.mp4/.mov/.m4v, query stripped,
-- same as logic.ts isVideoMediaUrl) and some platform with
-- <p>_attempted_at IS NULL AND <p>_post_id IS NULL AND <p>_error <> 'not_configured'.
--
-- not_configured choice: crosspost.ts writes <p>_error='not_configured' without
-- claiming when creds are missing. Treating that as not pending means a
-- platform with no creds costs exactly one cheap no-op call per new row, never
-- a call every 5 min. SQL can't read Edge Function secrets, so we key off the
-- row state instead. After configuring a platform's creds, clear
-- <p>_error on in-window rows to retry them (X-due runs also sweep anyway).
--
-- Stale-guard UPDATE is unchanged. cron.schedule() with an existing name
-- updates job 48 in place.

SELECT cron.schedule(
  'cmo-publish-content',
  '*/5 * * * *',
  $job$
  -- 2026-10-29: + cross-post trigger (see bottom). 2026-10-02 fix: was '0 9 * * *' (daily 04:00 CT sweep). Now every 5 min with a SQL stale guard.
  -- Guard: hold (status='paused', which cmo-publish never tweets) any due twitter draft/scheduled row that is
  --   (a) more than 3h past scheduled_for, or (b) has empty media_urls (checked 1 min ahead to beat the race).
  UPDATE public.content_calendar
     SET status = 'paused',
         human_notes = coalesce(human_notes, '') || E'\n[' || to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') || ' CT stale-guard] Held by cron: '
           || CASE WHEN coalesce(cardinality(media_urls), 0) = 0 THEN 'media_urls empty' ELSE 'more than 3h past scheduled_for' END
           || '. Attach media / reschedule and set status=draft to publish.'
   WHERE platform = 'twitter'
     AND status IN ('draft', 'scheduled')
     AND scheduled_for <= now() + interval '1 minute'
     AND (coalesce(cardinality(media_urls), 0) = 0 OR scheduled_for < now() - interval '3 hours');

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
