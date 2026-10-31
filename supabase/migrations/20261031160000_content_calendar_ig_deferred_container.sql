-- Migration 20261031160000: deferred IG Reels container publish (cmo-publish).
--
-- Bug: Sat CFB row 9ce97837 lost its IG Reel because container 18073001315600715
-- was not FINISHED within cmo-publish's in-request poll, and ig was marked failed.
-- Fix: the container id is saved, ig_error='ig_container_pending', and later
-- job-48 runs re-check it (lease on ig_checked_at), publishing when FINISHED.
-- Give up after 2h; on ERROR/EXPIRED create one fresh container.

ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS ig_container_id text,
  ADD COLUMN IF NOT EXISTS ig_container_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS ig_container_retried boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ig_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS content_calendar_ig_pending_idx
  ON public.content_calendar (ig_container_created_at)
  WHERE ig_error = 'ig_container_pending' AND ig_post_id IS NULL;

-- Job 48: same as 20261029210000 plus a third trigger for pending IG containers
-- (no 6h window; the edge function enforces the 2h cap).
SELECT cron.schedule(
  'cmo-publish-content',
  '*/5 * * * *',
  $job$
  -- 2026-10-31: + pending IG container trigger. 2026-10-29: + cross-post trigger. 2026-10-02: every 5 min with SQL stale guard.
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
  OR EXISTS (
    SELECT 1 FROM public.content_calendar c
     WHERE c.platform = 'twitter' AND c.status = 'published'
       AND c.published_at >= now() - interval '6 hours'
       AND EXISTS (SELECT 1 FROM unnest(c.media_urls) u
                    WHERE lower(split_part(split_part(u, '?', 1), '#', 1)) ~ '\.(mp4|mov|m4v)$')
       AND (   (c.ig_attempted_at IS NULL AND c.ig_post_id IS NULL AND c.ig_error IS DISTINCT FROM 'not_configured')
            OR (c.fb_attempted_at IS NULL AND c.fb_post_id IS NULL AND c.fb_error IS DISTINCT FROM 'not_configured')
            OR (c.tiktok_attempted_at IS NULL AND c.tiktok_post_id IS NULL AND c.tiktok_error IS DISTINCT FROM 'not_configured'))
  )
  OR EXISTS (
    SELECT 1 FROM public.content_calendar c
     WHERE c.ig_error = 'ig_container_pending' AND c.ig_post_id IS NULL AND c.ig_container_id IS NOT NULL
  );
  $job$
);
