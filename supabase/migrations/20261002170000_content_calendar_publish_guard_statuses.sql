-- Migration 20261002170000: allow cmo-publish guard statuses on content_calendar.
--
-- Adds two statuses for cmo-publish (twitter publisher). Applied to prod
-- 2026-10-02 ~11:50 CT.
--   skipped     reserved (allowed, currently unused). The stale / empty-media
--               guards hold rows with status='paused' + a human_notes line,
--               matching the SQL guard in cron job cmo-publish-content
--               (20261002170100).
--   publishing  transient claim. cmo-publish atomically flips
--               draft|scheduled -> publishing before calling the X API so two
--               overlapping runs cannot double-post. A row left in publishing
--               > 15 min means a run died mid-flight; it is reported as
--               stuck_publishing and never auto-retried.
--
-- Must be applied BEFORE the cmo-publish version that writes these statuses.
-- Backward compatible: only widens the allowed set.

ALTER TABLE public.content_calendar
  DROP CONSTRAINT IF EXISTS content_calendar_status_check;

ALTER TABLE public.content_calendar
  ADD CONSTRAINT content_calendar_status_check CHECK (
    status IN (
      'draft', 'scheduled', 'paused', 'published', 'failed', 'deleted',
      'skipped', 'publishing'
    )
  );
