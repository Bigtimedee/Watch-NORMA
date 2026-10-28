-- cmo-publish self-reply: optional reply-bait question posted as a self-reply
-- to the row's main tweet after it publishes. All nullable; additive only.
alter table public.content_calendar
  add column if not exists reply_question text,
  add column if not exists reply_platform_post_id text,
  add column if not exists reply_error text;

comment on column public.content_calendar.reply_question is
  'Optional self-reply text posted under the main tweet after publish. <=270 chars, no #hashtags or @mentions (rows violating this are skipped, never truncated/stripped).';
comment on column public.content_calendar.reply_platform_post_id is
  'X tweet id of the self-reply. Non-null means the reply was posted; cmo-publish never re-replies.';
comment on column public.content_calendar.reply_error is
  'Last self-reply skip/failure reason. Never affects the main post status.';
