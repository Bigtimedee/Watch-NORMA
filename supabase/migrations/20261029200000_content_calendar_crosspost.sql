-- cmo-publish cross-post (Dave rule 2026-10-29): every X video row also goes
-- to Instagram Reels, the Facebook Page and TikTok. Per-platform, additive,
-- all nullable. <p>_attempted_at is the atomic idempotency claim.
alter table public.content_calendar
  add column if not exists ig_post_id text,
  add column if not exists ig_error text,
  add column if not exists ig_attempted_at timestamptz,
  add column if not exists fb_post_id text,
  add column if not exists fb_error text,
  add column if not exists fb_attempted_at timestamptz,
  add column if not exists tiktok_post_id text,
  add column if not exists tiktok_error text,
  add column if not exists tiktok_attempted_at timestamptz;

comment on column public.content_calendar.ig_post_id is 'Instagram Reels media id posted by cmo-publish cross-post.';
comment on column public.content_calendar.fb_post_id is 'Facebook Page video id posted by cmo-publish cross-post.';
comment on column public.content_calendar.tiktok_post_id is 'TikTok Content Posting API publish_id (Direct Post).';
comment on column public.content_calendar.ig_error is 'Last IG cross-post skip/failure (not_configured, guard reason, API error). Never affects X status.';
comment on column public.content_calendar.fb_error is 'Last FB cross-post skip/failure. Never affects X status.';
comment on column public.content_calendar.tiktok_error is 'Last TikTok cross-post skip/failure. Never affects X status.';
comment on column public.content_calendar.ig_attempted_at is 'Claim timestamp; non-null = attempted, never auto-retried. Clear with ig_error to retry.';
comment on column public.content_calendar.fb_attempted_at is 'Claim timestamp; non-null = attempted, never auto-retried. Clear with fb_error to retry.';
comment on column public.content_calendar.tiktok_attempted_at is 'Claim timestamp; non-null = attempted, never auto-retried. Clear with tiktok_error to retry.';
