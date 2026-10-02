-- Migration 20261002170000: allow cmo-publish guard statuses on content_calendar.
--
-- Adds two statuses used by cmo-publish (twitter publisher):
--   skipped     terminal. Written by the stale guard (scheduled_for > 3h past)
--               and the empty-media guard (media_urls empty 30 min after
--               scheduled_for). An [AUTO-SKIP ...] reason=stale|empty_media
--               note is appended to human_notes. Rows are never deleted.
--               To retry: fix the row and set status back to 'draft' with a
--               current scheduled_for.
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
