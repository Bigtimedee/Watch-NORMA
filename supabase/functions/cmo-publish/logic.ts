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

/**
 * Decide whether a calendar row may be posted to the X API.
 * Non-X platforms are skipped with no status mutation (left as draft/scheduled
 * for a future LinkedIn/etc. publisher). Empty Twitter bodies are failed so
 * they cannot retry forever.
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
