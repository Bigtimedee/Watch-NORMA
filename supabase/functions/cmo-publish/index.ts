// =============================================================================
// NORMA CMO Agent — cmo-publish Edge Function
// Queries draft posts due for publishing and posts them to X (Twitter) v2 API.
// Invoked by pg_cron every 30 minutes and optionally via HTTP.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  tweet_id?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POSTS_PER_DAY = 10;
const TWITTER_API_BASE = "https://api.twitter.com/2";
const PLATFORM = "twitter";

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
  supabase: SupabaseClient,
  platform: string,
): Promise<number> {
  // Delegate to the SQL function which uses AT TIME ZONE 'America/New_York'
  // and therefore handles EST/EDT transitions correctly.
  const { data, error } = await supabase.rpc("content_calendar_published_today", {
    p_platform: platform,
  });

  if (error) {
    console.error(`[cmo-publish] Error counting today's posts: ${error.message}`);
    return 0;
  }

  return (data as number) ?? 0;
}

// ---------------------------------------------------------------------------
// Fetch posts ready to publish
// A post is publishable when:
//   status = 'draft' AND scheduled_for <= now()
// We also return posts with status = 'scheduled' for forward compatibility.
// ---------------------------------------------------------------------------

async function fetchDuePosts(
  supabase: SupabaseClient,
  limit: number,
): Promise<ContentCalendarRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("content_calendar")
    .select("*")
    .in("status", ["draft", "scheduled"])
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
  supabase: SupabaseClient,
  postId: string,
  tweetId: string,
): Promise<void> {
  const { error } = await supabase
    .from("content_calendar")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      platform_post_id: tweetId,
    })
    .eq("id", postId);

  if (error) {
    throw new Error(`Failed to mark post ${postId} as published: ${error.message}`);
  }
}

async function markFailed(
  supabase: SupabaseClient,
  postId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("content_calendar")
    .update({
      status: "failed",
      human_notes: `[AUTO-FAIL ${new Date().toISOString()}] ${reason.slice(0, 500)}`,
    })
    .eq("id", postId);

  if (error) {
    console.error(`[cmo-publish] Failed to mark post ${postId} as failed: ${error.message}`);
  }
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
  const xConsumerKey = Deno.env.get("X_API_KEY");
  const xConsumerSecret = Deno.env.get("X_API_SECRET");
  const xAccessToken = Deno.env.get("X_ACCESS_TOKEN");
  const xAccessTokenSecret = Deno.env.get("X_ACCESS_TOKEN_SECRET");

  const missing = [
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !xConsumerKey && "X_API_KEY",
    !xConsumerSecret && "X_API_SECRET",
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
  console.log(
    `[cmo-publish] Run started at ${now.toISOString()}, source=${requestPayload.source ?? "direct"}`,
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
    duePosts = await fetchDuePosts(supabase, remainingSlots);
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
      JSON.stringify({ success: true, published: 0, message: "No posts due" }),
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

    // Double-check status hasn't changed (race condition guard)
    if (!["draft", "scheduled"].includes(post.status)) {
      console.log(
        `[cmo-publish] Post ${post.id} has status '${post.status}', skipping.`,
      );
      results.push({
        id: post.id,
        success: false,
        error: `Skipped: unexpected status '${post.status}'`,
      });
      continue;
    }

    // Validate body
    if (!post.body || post.body.trim().length === 0) {
      console.error(`[cmo-publish] Post ${post.id} has empty body, marking failed.`);
      await markFailed(supabase, post.id, "Empty tweet body");
      results.push({ id: post.id, success: false, error: "Empty body" });
      continue;
    }

    if (post.body.length > 280) {
      console.warn(
        `[cmo-publish] Post ${post.id} exceeds 280 chars (${post.body.length}), truncating.`,
      );
      post.body = post.body.slice(0, 280);
    }

    try {
      console.log(
        `[cmo-publish] Publishing post ${post.id}: "${post.body.slice(0, 60)}..."`,
      );

      // Attempt to upload the first media attachment if present
      const mediaIds: string[] = [];
      if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
        const mediaId = await uploadMediaToTwitter(post.media_urls[0], credentials);
        if (mediaId) {
          mediaIds.push(mediaId);
        }
      }

      const { tweetId } = await postTweet(post.body, credentials, mediaIds.length > 0 ? mediaIds : undefined);

      await markPublished(supabase, post.id, tweetId);

      console.log(
        `[cmo-publish] Post ${post.id} published successfully. Tweet ID: ${tweetId}`,
      );

      results.push({ id: post.id, success: true, tweet_id: tweetId });
    } catch (publishErr) {
      const message =
        publishErr instanceof Error ? publishErr.message : String(publishErr);
      console.error(`[cmo-publish] Failed to publish post ${post.id}: ${message}`);

      // Mark as failed so it doesn't get stuck in a retry loop
      await markFailed(supabase, post.id, message);

      results.push({ id: post.id, success: false, error: message });
    }

    // Respect Twitter rate limits: add a 1-second delay between tweets
    // Twitter free tier allows ~17 tweets/day at ~1/tweet per push;
    // Basic tier allows significantly more. We space them to be safe.
    if (i < duePosts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  const publishedCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  console.log(
    `[cmo-publish] Run complete. Published: ${publishedCount}, Failed: ${failedCount}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      published: publishedCount,
      failed: failedCount,
      total_today: publishedTodayCount + publishedCount,
      results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
