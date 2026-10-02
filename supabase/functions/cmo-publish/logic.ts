// =============================================================================
// cmo-publish/logic.ts — Platform gating for the CMO calendar publisher
//
// cmo-publish posts ONLY to X/Twitter. content_calendar.platform is constrained
// to twitter | instagram | linkedin | tiktok | facebook (migration
// 20260307000001). A 2026-09-08 incident posted LinkedIn draft 8c66955e to X
// because fetchDuePosts ignored platform. These helpers are the guardrail.
// =============================================================================

/** Canonical content_calendar value for X. CHECK constraint does not allow "x". */
export const CONTENT_CALENDAR_TWITTER_PLATFORM = "twitter";

/** Statuses the publisher is allowed to pick up. */
export const PUBLISHABLE_STATUSES = ["draft", "scheduled"] as const;

export type PublishableStatus = (typeof PUBLISHABLE_STATUSES)[number];

/**
 * Marketing pause is a real content_calendar status. A paused row must never
 * tweet and must never be auto-failed (incident 310441ec, 2026-09-15).
 */
export const PAUSED_STATUS = "paused";

/** Terminal / non-due statuses that skip without mutation if they leak into the array. */
export const SKIP_WITHOUT_MUTATION_STATUSES = [
  PAUSED_STATUS,
  "failed",
  "published",
  "skipped",
  "publishing",
] as const;

/**
 * Values treated as X/Twitter. "x" is not in the current CHECK constraint but
 * is accepted here so a future alias cannot reintroduce cross-posting.
 */
const TWITTER_PLATFORM_ALIASES = new Set(["twitter", "x"]);

export interface CalendarPublishCandidate {
  id: string;
  platform: string;
  status: string;
  body: string | null;
  /** ISO timestamp. Rows without one are never selected by fetchDuePosts. */
  scheduled_for?: string | null;
  /** Creative URLs. Null/empty means no creative is attached yet. */
  media_urls?: string[] | null;
}

export type PublishDisposition =
  | { kind: "publish"; tweetBody: string }
  | { kind: "skip"; reason: string; mutateStatus: false }
  | { kind: "fail"; reason: string; mutateStatus: true }
  | { kind: "mark_skipped"; reason: SkipReason; mutateStatus: true };

// ---------------------------------------------------------------------------
// Late / empty-media guards (incident 2026-09-26..10-02)
//
// cmo-publish ran only from a 09:00 UTC daily pg_cron sweep, so 11:00 CT slate
// posts went out ~17h late at 04:00 CT the next day, and 3347826d tweeted
// text-only because its creative was never attached. Once the cron runs every
// 5 minutes these guards make sure a late or creative-less row is never
// tweeted:
//   - stale:        scheduled_for is more than STALE_AFTER_MS in the past.
//                   Marked status='skipped' with an [AUTO-SKIP] note.
//   - empty_media:  media_urls null/empty. Held (no mutation) for
//                   EMPTY_MEDIA_GRACE_MS after scheduled_for so a creative
//                   attached a few minutes late still ships, then marked
//                   status='skipped'. Never tweeted text-only.
// To re-run a skipped row: attach media and/or bump scheduled_for, then set
// status back to 'draft'.
// ---------------------------------------------------------------------------

export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
export const EMPTY_MEDIA_GRACE_MS = 30 * 60 * 1000;

/** Terminal status written by the stale / empty-media guards. */
export const SKIPPED_STATUS = "skipped";

/**
 * Transient claim status. The publisher atomically flips a row
 * draft|scheduled -> publishing before calling the X API, so two overlapping
 * runs (5-minute cron + a manual kick) can never both tweet the same row.
 * A row stuck in publishing means a run died mid-flight; it is never retried
 * automatically (at-most-once) and is reported as stuck_publishing.
 */
export const PUBLISHING_STATUS = "publishing";

export const SKIP_REASON_STALE = "stale";
export const SKIP_REASON_EMPTY_MEDIA = "empty_media";
export type SkipReason = typeof SKIP_REASON_STALE | typeof SKIP_REASON_EMPTY_MEDIA;

/** Hold reasons (skip with no status change; re-evaluated next run). */
export const HOLD_EMPTY_MEDIA_WAITING = "empty_media_waiting";
export const HOLD_MEDIA_UPLOAD_FAILED = "media_upload_failed";

export function hasMedia(mediaUrls: string[] | null | undefined): boolean {
  return Array.isArray(mediaUrls) &&
    mediaUrls.some((u) => typeof u === "string" && u.trim().length > 0);
}

/** Milliseconds scheduled_for is in the past (negative if in the future, null if unparseable). */
export function lateByMs(
  scheduledFor: string | null | undefined,
  now: Date,
): number | null {
  if (!scheduledFor) return null;
  const t = Date.parse(scheduledFor);
  if (Number.isNaN(t)) return null;
  return now.getTime() - t;
}

export function isStale(
  scheduledFor: string | null | undefined,
  now: Date,
): boolean {
  const late = lateByMs(scheduledFor, now);
  return late !== null && late > STALE_AFTER_MS;
}

/** Note appended to human_notes when a guard marks a row skipped. */
export function autoSkipNote(
  reason: SkipReason,
  scheduledFor: string | null | undefined,
  now: Date,
): string {
  const late = lateByMs(scheduledFor, now);
  const lateMin = late === null ? "?" : Math.round(late / 60000).toString();
  const detail = reason === SKIP_REASON_STALE
    ? `scheduled_for ${scheduledFor} is ${lateMin} min past due (> ${STALE_AFTER_MS / 60000} min); not posting late`
    : `media_urls empty ${lateMin} min after scheduled_for (grace ${EMPTY_MEDIA_GRACE_MS / 60000} min); not posting text-only`;
  return `[AUTO-SKIP ${now.toISOString()}] cmo-publish reason=${reason}: ${detail}. ` +
    `To retry: fix and set status back to 'draft' with a current scheduled_for.`;
}

export function appendNote(existing: string | null | undefined, note: string): string {
  const base = (existing ?? "").trimEnd();
  return base.length > 0 ? `${base}\n${note}` : note;
}

/** Query contract for due posts. Tests lock this so platform cannot be dropped. */
export const DUE_POSTS_QUERY = {
  table: "content_calendar",
  statuses: PUBLISHABLE_STATUSES,
  platform: CONTENT_CALENDAR_TWITTER_PLATFORM,
} as const;

/**
 * Extra predicates for markPublished / markFailed. Even if a non-X row reached
 * the update path, it must not be stamped published-to-X or auto-failed.
 */
export const TWITTER_STATUS_MUTATION_FILTER = {
  platform: CONTENT_CALENDAR_TWITTER_PLATFORM,
  statuses: PUBLISHABLE_STATUSES,
} as const;

export function isTwitterPlatform(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return TWITTER_PLATFORM_ALIASES.has(platform.trim().toLowerCase());
}

export function isPublishableStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PUBLISHABLE_STATUSES as readonly string[]).includes(status);
}

export function isPausedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.trim().toLowerCase() === PAUSED_STATUS;
}

/**
 * Decide whether a calendar row may be posted to the X API.
 * Non-X platforms are skipped with no status mutation (left as draft/scheduled
 * for a future LinkedIn/etc. publisher). Empty Twitter bodies are failed so
 * they cannot retry forever.
 *
 * `paused` is handled explicitly (mutateStatus false) so a junk/due row that
 * Design paused after fetchDuePosts cannot be tweeted or stamped failed.
 */
export function classifyPublishCandidate(
  post: CalendarPublishCandidate,
  now: Date = new Date(),
): PublishDisposition {
  if (!isTwitterPlatform(post.platform)) {
    return {
      kind: "skip",
      reason: `non_twitter_platform:${post.platform || "empty"}`,
      mutateStatus: false,
    };
  }

  if (isPausedStatus(post.status)) {
    return {
      kind: "skip",
      reason: "status_paused",
      mutateStatus: false,
    };
  }

  if (!isPublishableStatus(post.status)) {
    return {
      kind: "skip",
      reason: `unexpected_status:${post.status}`,
      mutateStatus: false,
    };
  }

  // Late guard: a row that missed its slot by more than STALE_AFTER_MS is
  // never tweeted (the 04:00 CT next-day sweep incident).
  if (isStale(post.scheduled_for, now)) {
    return { kind: "mark_skipped", reason: SKIP_REASON_STALE, mutateStatus: true };
  }

  if (!post.body || post.body.trim().length === 0) {
    return {
      kind: "fail",
      reason: "Empty tweet body",
      mutateStatus: true,
    };
  }

  // Creative guard: never tweet text-only (incident 3347826d). Hold through
  // a short grace window for a late attach, then mark skipped.
  if (!hasMedia(post.media_urls)) {
    const late = lateByMs(post.scheduled_for, now);
    if (late !== null && late > EMPTY_MEDIA_GRACE_MS) {
      return { kind: "mark_skipped", reason: SKIP_REASON_EMPTY_MEDIA, mutateStatus: true };
    }
    return { kind: "skip", reason: HOLD_EMPTY_MEDIA_WAITING, mutateStatus: false };
  }

  const tweetBody = post.body.length > 280 ? post.body.slice(0, 280) : post.body;
  return { kind: "publish", tweetBody };
}

/** True when the publisher may write status (fail/mark_skipped now, or publish after a tweet). Skip never writes. */
export function mayMutateCalendarStatus(disposition: PublishDisposition): boolean {
  return disposition.kind !== "skip";
}

/** Live row shape for the pre-tweet revalidate (id + platform + status only). */
export interface LiveCalendarRow {
  id: string;
  platform: string | null;
  status: string | null;
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string };

/**
 * Last-look check against a freshly loaded calendar row.
 *
 * fetchDuePosts only selects twitter draft|scheduled, but that is a snapshot.
 * Design can set status='paused' (or published/failed) before postTweet —
 * incident 310441ec-b198-4f32-a35d-d721c92d4cdd (2026-09-15): tweet path ran,
 * then markPublished missed because the row was no longer draft/scheduled,
 * then markFailed no-op'd on paused. If this helper says skip, do not tweet
 * and do not markFailed.
 */
export function preflightPublishRow(
  live: LiveCalendarRow | null,
  expectedId: string,
): PreflightResult {
  if (!live) {
    return { ok: false, skipped: true, reason: "row_missing" };
  }
  if (live.id !== expectedId) {
    return { ok: false, skipped: true, reason: "id_mismatch" };
  }
  if (!isTwitterPlatform(live.platform)) {
    return {
      ok: false,
      skipped: true,
      reason: `non_twitter_platform:${live.platform || "empty"}`,
    };
  }
  if (isPausedStatus(live.status)) {
    return { ok: false, skipped: true, reason: "status_paused" };
  }
  if (!isPublishableStatus(live.status)) {
    return {
      ok: false,
      skipped: true,
      reason: `not_publishable_status:${live.status || "empty"}`,
    };
  }
  return { ok: true };
}

/** Substring thrown when markPublished matches zero claimed (publishing) twitter rows. */
export const MARK_PUBLISHED_MISS_DETAIL =
  "no matching claimed twitter row";

/**
 * Predicates for the atomic claim (draft|scheduled -> publishing). The UPDATE
 * only succeeds for one caller; everyone else gets zero rows and must skip.
 */
export const CLAIM_FILTER = {
  platform: CONTENT_CALENDAR_TWITTER_PLATFORM,
  fromStatuses: PUBLISHABLE_STATUSES,
  toStatus: PUBLISHING_STATUS,
} as const;

/** Statuses markPublished / post-claim markFailed may transition from. */
export const POST_CLAIM_STATUSES = [PUBLISHING_STATUS] as const;

/** A claim older than this with no publish/fail outcome means a run died mid-flight. */
export const STUCK_PUBLISHING_AFTER_MS = 15 * 60 * 1000;

export type ClaimResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string };

/** Interpret the result of the claim UPDATE ... RETURNING id. */
export function interpretClaim(
  claimed: { id: string } | null,
  error: { message: string } | null,
  expectedId: string,
): ClaimResult {
  if (error) return { ok: false, skipped: true, reason: `claim_error:${error.message}` };
  if (!claimed) return { ok: false, skipped: true, reason: "claim_lost" };
  if (claimed.id !== expectedId) return { ok: false, skipped: true, reason: "claim_id_mismatch" };
  return { ok: true };
}

/**
 * Dry run: classify only. Never uploads media, claims, tweets or writes.
 * `as_of` (ISO) lets an operator ask "what would happen at 11:00 CT Sat?".
 * as_of is honoured ONLY in dry runs.
 */
export interface RunOptions {
  dryRun: boolean;
  asOf: Date;
}

export function parseRunOptions(
  payload: Record<string, unknown>,
  now: Date,
): RunOptions {
  const dryRun = payload.dry_run === true || payload.dry_run === "true";
  let asOf = now;
  if (dryRun && typeof payload.as_of === "string") {
    const t = Date.parse(payload.as_of);
    if (!Number.isNaN(t)) asOf = new Date(t);
  }
  return { dryRun, asOf };
}

export function markPublishedMissError(postId: string): string {
  return `Failed to mark post ${postId} as published: ${MARK_PUBLISHED_MISS_DETAIL}`;
}

export function isMarkPublishedMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(MARK_PUBLISHED_MISS_DETAIL);
}

/**
 * Result copy when a tweet already went out but the calendar row was paused
 * (or otherwise left draft/scheduled) before markPublished. Never call markFailed.
 */
export function describePossibleOrphanTweet(postId: string, tweetId: string): string {
  return (
    `possible_orphan_tweet: tweet ${tweetId} posted for ${postId} but the ` +
    `calendar row is no longer claimed (publishing) for twitter (paused mid-flight?). ` +
    `Not marking failed.`
  );
}
