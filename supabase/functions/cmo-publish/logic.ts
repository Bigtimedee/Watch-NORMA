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
}

export type PublishDisposition =
  | { kind: "publish"; tweetBody: string }
  | { kind: "skip"; reason: string; mutateStatus: false }
  | { kind: "fail"; reason: string; mutateStatus: true };

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

  if (!post.body || post.body.trim().length === 0) {
    return {
      kind: "fail",
      reason: "Empty tweet body",
      mutateStatus: true,
    };
  }

  const tweetBody = post.body.length > 280 ? post.body.slice(0, 280) : post.body;
  return { kind: "publish", tweetBody };
}

/** True when the publisher may write status (fail now, or publish after a tweet). Skip never writes. */
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

/** Substring thrown when markPublished matches zero twitter draft/scheduled rows. */
export const MARK_PUBLISHED_MISS_DETAIL =
  "no matching twitter draft/scheduled row";

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
    `calendar row is no longer twitter draft/scheduled (paused mid-flight?). ` +
    `Not marking failed.`
  );
}
