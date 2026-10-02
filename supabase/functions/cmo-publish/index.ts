// =============================================================================
// NORMA CMO Agent — cmo-publish Edge Function
// Queries twitter-only draft/scheduled posts due for publishing and posts them
// to X (Twitter) v2 API. Non-X content_calendar rows (linkedin, instagram,
// tiktok, facebook) are never selected and must never be tweeted.
// Invoked by pg_cron every 5 minutes (cmo-publish-content, migration
// 20261002170100_cmo_publish_every_5_min_stale_guard) and optionally via HTTP. POST {"dry_run":true,"as_of":ISO}
// classifies due rows without uploading, claiming, tweeting or writing.
//
// The cron job also runs a SQL stale guard before calling this function.
// Guards here (logic.ts) match it so hand-made POSTs are covered: paused rows
// skip untouched; due rows with empty media_urls or > 3h past scheduled_for
// are held (status='paused' + human_notes line) and never tweeted; a media
// upload failure holds without falling back to text-only; each row is
// atomically claimed (draft|scheduled -> publishing) before the X call so
// overlapping runs cannot double-post.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import {
  CLAIM_FILTER,
  CONTENT_CALENDAR_TWITTER_PLATFORM,
  DUE_POSTS_QUERY,
  HOLD_MEDIA_UPLOAD_FAILED,
  POST_CLAIM_STATUSES,
  PUBLISHING_STATUS,
  GUARD_HOLD_STATUS,
  STUCK_PUBLISHING_AFTER_MS,
  TWITTER_STATUS_MUTATION_FILTER,
  appendNote,
  guardHoldNote,
  classifyPublishCandidate,
  describePossibleOrphanTweet,
  interpretClaim,
  isMarkPublishedMiss,
  markPublishedMissError,
  parseRunOptions,
  preflightPublishRow,
  type GuardReason,
} from "./logic.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Untyped DB client (no generated types). ReturnType<typeof createClient>
// resolved to SupabaseClient<unknown, never> and made every .update() `never`.
// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, "public", any>;

interface ContentCalendarRow {
  id: string;
  platform: string;
  content_type: string;
  body: string;
  media_urls: string[];
  hashtags: string[];
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  generation_prompt: string | null;
  human_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TwitterV2Response {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message: string; code?: number }>;
}

interface TwitterMediaUploadResponse {
  media_id_string?: string;
  error?: string;
}

interface PublishResult {
  id: string;
  success: boolean;
  skipped?: boolean;
  /** Set when a guard held the row as status='paused' (stale | empty_media). */
  held_paused?: boolean;
  tweet_id?: string;
  error?: string;
  /** Dry run only: what a live run would do with this row. */
  would?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POSTS_PER_DAY = 10;
const TWITTER_API_BASE = "https://api.twitter.com/2";
const PLATFORM = CONTENT_CALENDAR_TWITTER_PLATFORM;

// ---------------------------------------------------------------------------
// OAuth 1.0a Implementation for Twitter Bot Account
// Twitter v2 API still requires OAuth 1.0a for user-context endpoints (tweets)
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(data));
  // Convert to base64
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function buildOAuthHeader(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): Promise<string> {
  const oauthNonce = encodeHex(
    crypto.getRandomValues(new Uint8Array(16)),
  );
  const oauthTimestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: oauthNonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: oauthTimestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // Combine OAuth params + body params for signature base
  const allParams: Record<string, string> = { ...oauthParams, ...bodyParams };

  // Sort params lexicographically and build parameter string
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  // Build signature base string
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams),
  ].join("&");

  // Build signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;

  // Compute HMAC-SHA1 signature
  const signature = await hmacSha1(signingKey, signatureBase);
  oauthParams["oauth_signature"] = signature;

  // Build Authorization header
  const headerValue =
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
      .join(", ");

  return headerValue;
}

// ---------------------------------------------------------------------------
// Upload an image to Twitter v1.1 media upload endpoint
// Returns the media_id_string on success, or null on any failure (graceful degradation)
// ---------------------------------------------------------------------------

const TWITTER_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

async function uploadMediaToTwitter(
  imageUrl: string,
  credentials: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  },
): Promise<string | null> {
  try {
    // Fetch the image bytes from the CDN URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.warn(
        `[cmo-publish] Failed to fetch image for upload (status ${imageResponse.status}): ${imageUrl}`,
      );
      return null;
    }

    const imageBytes = await imageResponse.arrayBuffer();

    // Build multipart/form-data body with field name "media"
    const boundary = `NORMABoundary${Date.now()}`;
    const imageBuffer = new Uint8Array(imageBytes);

    // Detect MIME type from Content-Type header; default to jpeg
    const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();

    const encoder = new TextEncoder();
    const preamble = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);

    const multipartBody = new Uint8Array(
      preamble.byteLength + imageBuffer.byteLength + epilogue.byteLength,
    );
    multipartBody.set(preamble, 0);
    multipartBody.set(imageBuffer, preamble.byteLength);
    multipartBody.set(epilogue, preamble.byteLength + imageBuffer.byteLength);

    // OAuth signature for the upload endpoint uses no body params
    // (multipart bodies are excluded from OAuth signature per spec)
    const authHeader = await buildOAuthHeader(
      "POST",
      TWITTER_UPLOAD_URL,
      {},
      credentials.consumerKey,
      credentials.consumerSecret,
      credentials.accessToken,
      credentials.accessTokenSecret,
    );

    const uploadResponse = await fetch(TWITTER_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "NORMA-CMO-Bot/1.0",
      },
      body: multipartBody,
    });

    const uploadText = await uploadResponse.text();
    let uploadData: TwitterMediaUploadResponse;

    try {
      uploadData = JSON.parse(uploadText);
    } catch {
      console.warn(
        `[cmo-publish] Media upload returned non-JSON (status ${uploadResponse.status}): ${uploadText.slice(0, 200)}`,
      );
      return null;
    }

    if (!uploadResponse.ok || !uploadData.media_id_string) {
      console.warn(
        `[cmo-publish] Media upload failed (status ${uploadResponse.status}): ${uploadText.slice(0, 200)}`,
      );
      return null;
    }

    console.log(`[cmo-publish] Media uploaded. ID: ${uploadData.media_id_string}`);
    return uploadData.media_id_string;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[cmo-publish] Media upload threw an error: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Post a single tweet via Twitter v2 API
// ---------------------------------------------------------------------------

async function postTweet(
  text: string,
  credentials: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  },
  mediaIds?: string[],
): Promise<{ tweetId: string }> {
  const url = `${TWITTER_API_BASE}/tweets`;
  const method = "POST";

  // For JSON body requests, body params are NOT included in OAuth signature.
  // The OAuth spec only includes application/x-www-form-urlencoded body params.
  // With JSON bodies, we sign only OAuth params + query params (none here).
  const authHeader = await buildOAuthHeader(
    method,
    url,
    {}, // No form body params: we are sending JSON
    credentials.consumerKey,
    credentials.consumerSecret,
    credentials.accessToken,
    credentials.accessTokenSecret,
  );

  const payload: Record<string, unknown> = { text };
  if (mediaIds && mediaIds.length > 0) {
    payload.media = { media_ids: mediaIds };
  }

  const body = JSON.stringify(payload);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      "User-Agent": "NORMA-CMO-Bot/1.0",
    },
    body,
  });

  const responseText = await response.text();
  let responseData: TwitterV2Response;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Twitter API returned non-JSON response (status ${response.status}): ${responseText.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const errorMessages = responseData.errors
      ?.map((e) => `[${e.code ?? "?"}] ${e.message}`)
      .join("; ");
    throw new Error(
      `Twitter API error ${response.status}: ${errorMessages ?? responseText.slice(0, 200)}`,
    );
  }

  if (!responseData.data?.id) {
    throw new Error(
      `Twitter API succeeded but returned no tweet ID: ${JSON.stringify(responseData)}`,
    );
  }

  return { tweetId: responseData.data.id };
}

// ---------------------------------------------------------------------------
// Count posts published today for a given platform (local DB check)
// ---------------------------------------------------------------------------

async function countPublishedToday(
  supabase: Db,
  platform: string,
): Promise<number> {
  const startOfDayET = new Date();
  // Approximate ET by subtracting 5 hours from UTC (conservative — uses EST year-round)
  // A production implementation would use a proper timezone library.
  startOfDayET.setUTCHours(startOfDayET.getUTCHours() - 5);
  startOfDayET.setUTCHours(0, 0, 0, 0);
  startOfDayET.setUTCHours(startOfDayET.getUTCHours() + 5);

  const { count, error } = await supabase
    .from("content_calendar")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("status", "published")
    .gte("published_at", startOfDayET.toISOString());

  if (error) {
    console.error(`[cmo-publish] Error counting today's posts: ${error.message}`);
    return 0;
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Fetch posts ready to publish to X.
// A post is publishable when:
//   platform = 'twitter' AND status IN ('draft','scheduled') AND scheduled_for <= now()
// Non-X platforms (linkedin, instagram, tiktok, facebook) are never selected.
//
// TOCTOU (incident 310441ec, 2026-09-15): this query is a snapshot. Marketing
// uses status='paused' heavily; Design can pause a junk/due draft after this
// select and before postTweet. The publish loop re-reads the row immediately
// before tweeting (revalidateDuePost). Do not treat paused as failed.
// Drafts still auto-publish when due — paused is the only hold.
// ---------------------------------------------------------------------------

async function fetchDuePosts(
  supabase: Db,
  limit: number,
  asOf: Date,
): Promise<ContentCalendarRow[]> {
  const now = asOf.toISOString();

  const { data, error } = await supabase
    .from(DUE_POSTS_QUERY.table)
    .select("*")
    .eq("platform", DUE_POSTS_QUERY.platform)
    .in("status", [...DUE_POSTS_QUERY.statuses])
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch due posts: ${error.message}`);
  }

  return (data as ContentCalendarRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// Update a post record after a publish attempt
// ---------------------------------------------------------------------------

async function markPublished(
  supabase: Db,
  postId: string,
  tweetId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      platform_post_id: tweetId,
    })
    .eq("id", postId)
    .eq("platform", TWITTER_STATUS_MUTATION_FILTER.platform)
    .in("status", [...POST_CLAIM_STATUSES])
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark post ${postId} as published: ${error.message}`);
  }
  if (!data) {
    throw new Error(markPublishedMissError(postId));
  }
}

/**
 * Last look before postTweet. fetchDuePosts already filtered draft|scheduled,
 * but status can change to paused in that window (310441ec). Skip = no tweet,
 * no markFailed.
 */
async function revalidateDuePost(
  supabase: Db,
  postId: string,
): Promise<ReturnType<typeof preflightPublishRow>> {
  const { data, error } = await supabase
    .from("content_calendar")
    .select("id, platform, status")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error(
      `[cmo-publish] Preflight revalidate failed for ${postId}: ${error.message}`,
    );
    return { ok: false, skipped: true, reason: `preflight_error:${error.message}` };
  }

  return preflightPublishRow(
    (data as { id: string; platform: string | null; status: string | null } | null) ??
      null,
    postId,
  );
}

/**
 * Atomic claim: draft|scheduled -> publishing for exactly one caller. This is
 * the idempotency gate; a second overlapping run (or a pause that landed after
 * revalidate) matches zero rows and must not tweet.
 */
async function claimForPublish(
  supabase: Db,
  postId: string,
): Promise<ReturnType<typeof interpretClaim>> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({ status: CLAIM_FILTER.toStatus })
    .eq("id", postId)
    .eq("platform", CLAIM_FILTER.platform)
    .in("status", [...CLAIM_FILTER.fromStatuses])
    .select("id")
    .maybeSingle();
  return interpretClaim(
    (data as { id: string } | null) ?? null,
    error ? { message: error.message } : null,
    postId,
  );
}

/**
 * Guard hold (empty_media | stale): status -> 'paused' plus a stale-guard
 * line appended to human_notes, same as the cron's SQL guard. Only from
 * twitter draft|scheduled, so a row paused/claimed in the meantime is left
 * alone. Rows are never deleted.
 */
async function markGuardHold(
  supabase: Db,
  post: ContentCalendarRow,
  reason: GuardReason,
  now: Date,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({
      status: GUARD_HOLD_STATUS,
      human_notes: appendNote(post.human_notes, guardHoldNote(reason, now)),
    })
    .eq("id", post.id)
    .eq("platform", TWITTER_STATUS_MUTATION_FILTER.platform)
    .in("status", [...TWITTER_STATUS_MUTATION_FILTER.statuses])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[cmo-publish] Failed to hold post ${post.id} (${reason}): ${error.message}`);
    return false;
  }
  return !!data;
}

/**
 * fromStatuses: draft|scheduled for pre-claim failures (empty body),
 * publishing for failures after the claim (X API error). The failure note is
 * appended so Content's creative/caption notes are preserved.
 */
async function markFailed(
  supabase: Db,
  post: ContentCalendarRow,
  reason: string,
  fromStatuses: readonly string[] = TWITTER_STATUS_MUTATION_FILTER.statuses,
): Promise<void> {
  const { error } = await supabase
    .from("content_calendar")
    .update({
      status: "failed",
      human_notes: appendNote(
        post.human_notes,
        `[AUTO-FAIL ${new Date().toISOString()}] ${reason.slice(0, 500)}`,
      ),
    })
    .eq("id", post.id)
    .eq("platform", TWITTER_STATUS_MUTATION_FILTER.platform)
    .in("status", [...fromStatuses]);

  if (error) {
    console.error(`[cmo-publish] Failed to mark post ${post.id} as failed: ${error.message}`);
  }
}

/** Rows claimed but never resolved (run died mid-flight). Reported, never auto-retried. */
async function findStuckPublishing(
  supabase: Db,
  now: Date,
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STUCK_PUBLISHING_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from("content_calendar")
    .select("id")
    .eq("platform", CONTENT_CALENDAR_TWITTER_PLATFORM)
    .eq("status", PUBLISHING_STATUS)
    .lt("updated_at", cutoff);
  if (error) {
    console.error(`[cmo-publish] stuck_publishing check failed: ${error.message}`);
    return [];
  }
  return ((data as { id: string }[]) ?? []).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", function: "cmo-publish" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------------------------------------------------------------------------
  // Validate environment variables
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const xConsumerKey = Deno.env.get("X_CONSUMER_KEY");
  const xConsumerSecret = Deno.env.get("X_CONSUMER_SECRET");
  const xAccessToken = Deno.env.get("X_ACCESS_TOKEN");
  const xAccessTokenSecret = Deno.env.get("X_ACCESS_TOKEN_SECRET");

  const missing = [
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !xConsumerKey && "X_CONSUMER_KEY",
    !xConsumerSecret && "X_CONSUMER_SECRET",
    !xAccessToken && "X_ACCESS_TOKEN",
    !xAccessTokenSecret && "X_ACCESS_TOKEN_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(`[cmo-publish] Missing env vars: ${missing.join(", ")}`);
    return new Response(
      JSON.stringify({ error: `Missing environment variables: ${missing.join(", ")}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Parse optional request body
  let requestPayload: Record<string, unknown> = {};
  try {
    const bodyText = await req.text();
    if (bodyText.trim()) {
      requestPayload = JSON.parse(bodyText);
    }
  } catch {
    // Ignore
  }

  const now = new Date();
  const { dryRun, asOf } = parseRunOptions(requestPayload, now);
  console.log(
    `[cmo-publish] Run started at ${now.toISOString()}, source=${requestPayload.source ?? "direct"}` +
      (dryRun ? `, DRY RUN as_of=${asOf.toISOString()}` : ""),
  );

  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
  const credentials = {
    consumerKey: xConsumerKey!,
    consumerSecret: xConsumerSecret!,
    accessToken: xAccessToken!,
    accessTokenSecret: xAccessTokenSecret!,
  };

  // ---------------------------------------------------------------------------
  // Check daily post limit
  // ---------------------------------------------------------------------------
  const stuckPublishing = await findStuckPublishing(supabase, now);
  if (stuckPublishing.length > 0) {
    console.warn(
      `[cmo-publish] stuck_publishing: ${stuckPublishing.join(", ")} claimed > ${STUCK_PUBLISHING_AFTER_MS / 60000} min ago with no outcome. Check X before resetting.`,
    );
  }

  const publishedTodayCount = await countPublishedToday(supabase, PLATFORM);
  console.log(`[cmo-publish] Published today: ${publishedTodayCount}/${MAX_POSTS_PER_DAY}`);

  if (publishedTodayCount >= MAX_POSTS_PER_DAY) {
    console.log("[cmo-publish] Daily post limit reached. Skipping run.");
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: "daily_limit_reached",
        published_today: publishedTodayCount,
        limit: MAX_POSTS_PER_DAY,
        dry_run: dryRun,
        stuck_publishing: stuckPublishing,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const remainingSlots = MAX_POSTS_PER_DAY - publishedTodayCount;

  // ---------------------------------------------------------------------------
  // Fetch posts due for publishing
  // ---------------------------------------------------------------------------
  let duePosts: ContentCalendarRow[];
  try {
    duePosts = await fetchDuePosts(supabase, remainingSlots, asOf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cmo-publish] Failed to fetch due posts: ${message}`);
    return new Response(
      JSON.stringify({ error: "Failed to fetch posts", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (duePosts.length === 0) {
    console.log("[cmo-publish] No posts due for publishing.");
    return new Response(
      JSON.stringify({
        success: true,
        published: 0,
        message: "No posts due",
        dry_run: dryRun,
        as_of: asOf.toISOString(),
        stuck_publishing: stuckPublishing,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[cmo-publish] Found ${duePosts.length} post(s) due for publishing.`);

  // ---------------------------------------------------------------------------
  // Publish each post with rate limiting between requests
  // ---------------------------------------------------------------------------
  const results: PublishResult[] = [];

  for (let i = 0; i < duePosts.length; i++) {
    const post = duePosts[i];

    // Defense in depth: never tweet (or mutate) a non-X calendar row even if
    // the due-posts query regresses and drops the platform filter.
    const disposition = classifyPublishCandidate(post, asOf);

    // Dry run: report the disposition and stop. No media upload, no claim,
    // no tweet, no status write.
    if (dryRun) {
      results.push({
        id: post.id,
        success: false,
        skipped: true,
        would: disposition.kind === "publish" ? "publish" : `${disposition.kind}:${disposition.reason}`,
      });
      continue;
    }

    if (disposition.kind === "pause") {
      const wrote = await markGuardHold(supabase, post, disposition.reason, now);
      console.log(
        `[cmo-publish] Post ${post.id} NOT posted (${disposition.reason}); ` +
          (wrote ? "held as status='paused'." : "row changed concurrently; left as-is."),
      );
      results.push({
        id: post.id,
        success: false,
        skipped: true,
        held_paused: wrote,
        error: disposition.reason,
      });
      continue;
    }

    if (disposition.kind === "skip") {
      console.log(
        `[cmo-publish] Post ${post.id} skipped (${disposition.reason}). Leaving status '${post.status}' unchanged.`,
      );
      results.push({
        id: post.id,
        success: false,
        skipped: true,
        error: disposition.reason,
      });
      continue;
    }

    if (disposition.kind === "fail") {
      console.error(`[cmo-publish] Post ${post.id} ${disposition.reason}, marking failed.`);
      await markFailed(supabase, post, disposition.reason);
      results.push({ id: post.id, success: false, error: disposition.reason });
      continue;
    }

    const tweetBody = disposition.tweetBody;
    if (post.body.length > 280) {
      console.warn(
        `[cmo-publish] Post ${post.id} exceeds 280 chars (${post.body.length}), truncating.`,
      );
    }

    let claimed = false;
    try {
      console.log(
        `[cmo-publish] Publishing post ${post.id}: "${tweetBody.slice(0, 60)}..."`,
      );

      // classifyPublishCandidate guarantees media_urls is non-empty here.
      // Upload failure holds the row (no tweet, no status change) so the next
      // 5-minute run retries; the stale guard holds it after 3h. Never fall
      // back to a text-only tweet for a row that carries a creative.
      const mediaIds: string[] = [];
      const firstMedia = (post.media_urls ?? []).find((u) => typeof u === "string" && u.trim().length > 0);
      const mediaId = firstMedia ? await uploadMediaToTwitter(firstMedia, credentials) : null;
      if (!mediaId) {
        console.warn(
          `[cmo-publish] Post ${post.id} held (${HOLD_MEDIA_UPLOAD_FAILED}). Not tweeting text-only; will retry next run.`,
        );
        results.push({ id: post.id, success: false, skipped: true, error: HOLD_MEDIA_UPLOAD_FAILED });
        continue;
      }
      mediaIds.push(mediaId);

      // Re-select immediately before the X API call. A pause after fetchDuePosts
      // (or during media upload) must skip — never tweet, never markFailed.
      const preflight = await revalidateDuePost(supabase, post.id);
      if (!preflight.ok) {
        console.log(
          `[cmo-publish] Post ${post.id} skipped at preflight (${preflight.reason}). Not tweeting, not marking failed.`,
        );
        results.push({
          id: post.id,
          success: false,
          skipped: true,
          error: preflight.reason,
        });
        continue;
      }

      // Idempotency gate: only the run that wins the claim may tweet.
      const claim = await claimForPublish(supabase, post.id);
      if (!claim.ok) {
        console.log(
          `[cmo-publish] Post ${post.id} skipped at claim (${claim.reason}). Another run owns it or it changed; not tweeting.`,
        );
        results.push({ id: post.id, success: false, skipped: true, error: claim.reason });
        continue;
      }
      claimed = true;

      const { tweetId } = await postTweet(tweetBody, credentials, mediaIds);

      try {
        await markPublished(supabase, post.id, tweetId);
      } catch (markErr) {
        // Tweet already sent. If the row left draft/scheduled (paused mid-flight),
        // markFailed would no-op or overwrite a pause — log the orphan and skip.
        if (isMarkPublishedMiss(markErr)) {
          const message = describePossibleOrphanTweet(post.id, tweetId);
          console.error(`[cmo-publish] ${message}`);
          results.push({
            id: post.id,
            success: false,
            skipped: true,
            tweet_id: tweetId,
            error: message,
          });
          continue;
        }
        throw markErr;
      }

      console.log(
        `[cmo-publish] Post ${post.id} published successfully. Tweet ID: ${tweetId}`,
      );

      results.push({ id: post.id, success: true, tweet_id: tweetId });
    } catch (publishErr) {
      const message =
        publishErr instanceof Error ? publishErr.message : String(publishErr);
      console.error(`[cmo-publish] Failed to publish post ${post.id}: ${message}`);

      // Mark as failed so it doesn't get stuck in a retry loop.
      // Preflight skip, claim loss and markPublished-miss-on-paused never
      // reach here. Pre-claim errors fail from draft|scheduled, post-claim
      // errors (X API) fail from publishing.
      await markFailed(
        supabase,
        post,
        message,
        claimed ? POST_CLAIM_STATUSES : TWITTER_STATUS_MUTATION_FILTER.statuses,
      );

      results.push({ id: post.id, success: false, error: message });
    }

    // Respect Twitter rate limits: add a 1-second delay between tweets
    // Twitter free tier allows ~17 tweets/day at ~1/tweet per push;
    // Basic tier allows significantly more. We space them to be safe.
    if (i < duePosts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({
        success: true,
        dry_run: true,
        as_of: asOf.toISOString(),
        due: results.length,
        results,
        stuck_publishing: stuckPublishing,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const publishedCount = results.filter((r) => r.success).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const failedCount = results.filter((r) => !r.success && !r.skipped).length;

  console.log(
    `[cmo-publish] Run complete. Published: ${publishedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      published: publishedCount,
      failed: failedCount,
      skipped: skippedCount,
      total_today: publishedTodayCount + publishedCount,
      results,
      stuck_publishing: stuckPublishing,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
