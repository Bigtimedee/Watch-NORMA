// =============================================================================
// cmo-publish-linkedin/logic.ts — Platform gating for NORMA company-page posts
//
// Sibling of cmo-publish. That function is twitter-only (PR #32) and must never
// tweet LinkedIn rows. This function is linkedin-only and must never post
// twitter rows to LinkedIn, and must never call the X API.
//
// content_calendar.platform CHECK: twitter | instagram | linkedin | tiktok | facebook
// =============================================================================

/** Canonical content_calendar value for LinkedIn. */
export const CONTENT_CALENDAR_LINKEDIN_PLATFORM = "linkedin";

/** Statuses the publisher is allowed to pick up. */
export const PUBLISHABLE_STATUSES = ["draft", "scheduled"] as const;

export type PublishableStatus = (typeof PUBLISHABLE_STATUSES)[number];

/** LinkedIn Posts API commentary hard limit. */
export const LINKEDIN_COMMENTARY_MAX = 3000;

/** Daily cap for company-page posts (same order of magnitude as cmo-publish). */
export const MAX_POSTS_PER_DAY = 8;

export interface CalendarPublishCandidate {
  id: string;
  platform: string;
  status: string;
  body: string | null;
  media_urls?: string[] | null;
  hashtags?: string[] | null;
  platform_post_id?: string | null;
}

export type PublishDisposition =
  | { kind: "publish"; commentary: string; imageUrl?: string }
  | { kind: "skip"; reason: string; mutateStatus: false }
  | { kind: "fail"; reason: string; mutateStatus: true };

/** Query contract for due posts. Tests lock this so platform cannot be dropped. */
export const DUE_POSTS_QUERY = {
  table: "content_calendar",
  statuses: PUBLISHABLE_STATUSES,
  platform: CONTENT_CALENDAR_LINKEDIN_PLATFORM,
} as const;

/**
 * Extra predicates for markPublished / markFailed. Even if a twitter row reached
 * the update path, it must not be stamped published-to-LinkedIn or auto-failed.
 */
export const LINKEDIN_STATUS_MUTATION_FILTER = {
  platform: CONTENT_CALENDAR_LINKEDIN_PLATFORM,
  statuses: PUBLISHABLE_STATUSES,
} as const;

export function isLinkedInPlatform(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return platform.trim().toLowerCase() === CONTENT_CALENDAR_LINKEDIN_PLATFORM;
}

export function isPublishableStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PUBLISHABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Normalize LINKEDIN_ORGANIZATION_ID to an organization URN.
 * Refuses person URNs so we never post as a personal profile.
 */
export function toOrganizationUrn(idOrUrn: string): string {
  const trimmed = idOrUrn.trim();
  if (!trimmed) {
    throw new Error("LINKEDIN_ORGANIZATION_ID is empty");
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("urn:li:person:")) {
    throw new Error(
      "LINKEDIN_ORGANIZATION_ID must be a company page (urn:li:organization:…), not a personal profile",
    );
  }
  if (lower.startsWith("urn:li:organization:")) {
    return trimmed;
  }
  if (lower.startsWith("urn:")) {
    throw new Error(
      "LINKEDIN_ORGANIZATION_ID must be a numeric org id or urn:li:organization:…",
    );
  }
  return `urn:li:organization:${trimmed}`;
}

/** First http(s) media URL, if any. Extra URLs are ignored (single-image posts). */
export function firstImageUrl(mediaUrls: string[] | null | undefined): string | undefined {
  if (!Array.isArray(mediaUrls)) return undefined;
  const url = mediaUrls.find((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()));
  return url?.trim();
}

/**
 * Body plus any hashtags not already present. Truncates to LinkedIn's limit.
 */
export function composeCommentary(
  body: string,
  hashtags: string[] | null | undefined,
): string {
  let text = body.trim();
  if (Array.isArray(hashtags)) {
    for (const raw of hashtags) {
      if (typeof raw !== "string") continue;
      const tag = raw.trim().replace(/^#/, "");
      if (!tag) continue;
      const needle = `#${tag}`;
      if (text.toLowerCase().includes(needle.toLowerCase())) continue;
      const next = `${text} ${needle}`;
      if (next.length > LINKEDIN_COMMENTARY_MAX) break;
      text = next;
    }
  }
  if (text.length > LINKEDIN_COMMENTARY_MAX) {
    text = text.slice(0, LINKEDIN_COMMENTARY_MAX);
  }
  return text;
}

/**
 * Decide whether a calendar row may be posted to the LinkedIn organization API.
 * Twitter/X rows are skipped with no status mutation so cmo-publish still owns them.
 */
export function classifyPublishCandidate(
  post: CalendarPublishCandidate,
): PublishDisposition {
  if (!isLinkedInPlatform(post.platform)) {
    return {
      kind: "skip",
      reason: `non_linkedin_platform:${post.platform || "empty"}`,
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

  if (post.platform_post_id && post.platform_post_id.trim().length > 0) {
    return {
      kind: "skip",
      reason: "already_has_platform_post_id",
      mutateStatus: false,
    };
  }

  if (!post.body || post.body.trim().length === 0) {
    return {
      kind: "fail",
      reason: "Empty LinkedIn post body",
      mutateStatus: true,
    };
  }

  const commentary = composeCommentary(post.body, post.hashtags);
  const imageUrl = firstImageUrl(post.media_urls);
  return { kind: "publish", commentary, imageUrl };
}

/** True when the publisher may write status (fail now, or publish after a post). Skip never writes. */
export function mayMutateCalendarStatus(disposition: PublishDisposition): boolean {
  return disposition.kind !== "skip";
}

export interface PublishResult {
  id: string;
  success: boolean;
  skipped?: boolean;
  platform_post_id?: string;
  error?: string;
}

export interface LinkedInPublishLoopDeps {
  posts: CalendarPublishCandidate[];
  publish: (input: {
    commentary: string;
    imageUrl?: string;
  }) => Promise<{ postId: string }>;
  markPublished: (id: string, postId: string) => Promise<void>;
  markFailed: (id: string, reason: string) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * Core publish loop. Injected `publish` keeps tests off the network.
 * Non-LinkedIn rows are skipped without mutating status.
 */
export async function runLinkedInPublishLoop(
  deps: LinkedInPublishLoopDeps,
): Promise<{
  results: PublishResult[];
  published: number;
  failed: number;
  skipped: number;
}> {
  const log = deps.log ?? (() => {});
  const results: PublishResult[] = [];

  for (const post of deps.posts) {
    const disposition = classifyPublishCandidate(post);

    if (disposition.kind === "skip") {
      log(`Post ${post.id} skipped (${disposition.reason}). Leaving status '${post.status}' unchanged.`);
      results.push({
        id: post.id,
        success: false,
        skipped: true,
        error: disposition.reason,
      });
      continue;
    }

    if (disposition.kind === "fail") {
      log(`Post ${post.id} ${disposition.reason}, marking failed.`);
      await deps.markFailed(post.id, disposition.reason);
      results.push({ id: post.id, success: false, error: disposition.reason });
      continue;
    }

    try {
      log(`Publishing post ${post.id}: "${disposition.commentary.slice(0, 60)}..."`);
      const { postId } = await deps.publish({
        commentary: disposition.commentary,
        imageUrl: disposition.imageUrl,
      });
      await deps.markPublished(post.id, postId);
      results.push({ id: post.id, success: true, platform_post_id: postId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Failed to publish post ${post.id}: ${message}`);
      await deps.markFailed(post.id, message);
      results.push({ id: post.id, success: false, error: message });
    }
  }

  return {
    results,
    published: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
  };
}
