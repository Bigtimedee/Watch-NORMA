// social-publishers.ts
// Per-platform publish functions. Each returns { platform_post_id: string } or throws.
//
// Enhancement Pack (migration 030):
//   - Instagram carousel publishing (format='carousel')
//   - X poll creation (format='poll')
//   - Reddit link posts (format='link')
//   - SocialPost type updated with post_format + format_metadata

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface SocialAccount {
  platform: string;
  account_id: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface SocialPost {
  id: number;
  platform: string;
  post_type: string;
  content_text: string | null;
  image_url: string | null;
  scenario: string | null;
  post_format?: string | null;       // standard | carousel | poll | link
  format_metadata?: Record<string, unknown> | null;
}

export interface PublishResult {
  platform_post_id: string;
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers (X / Twitter)
// ---------------------------------------------------------------------------

interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

/** RFC 3986 percent-encode (stricter than encodeURIComponent) */
function pct(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * Build an OAuth 1.0a Authorization header.
 * @param bodyParams - Form-encoded body params to include in signature (empty {} for JSON/multipart bodies)
 */
async function buildOAuth1Header(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  creds: XCredentials,
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          "1.0",
  };

  const allParams: Record<string, string> = { ...bodyParams, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join("&");
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  oauthParams["oauth_signature"] = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`);

  return `OAuth ${headerParts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// X (Twitter) — standard post + poll format
// ---------------------------------------------------------------------------

export async function publishToX(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const creds: XCredentials = {
    apiKey:       Deno.env.get("X_CONSUMER_KEY")!,
    apiSecret:    Deno.env.get("X_CONSUMER_SECRET")!,
    accessToken:  Deno.env.get("X_ACCESS_TOKEN")!,
    accessSecret: Deno.env.get("X_ACCESS_TOKEN_SECRET")!,
  };

  // Step 1: Upload image if present (standard posts)
  let mediaId: string | null = null;
  if (post.image_url && post.post_format !== "poll") {
    const imgRes = await fetch(post.image_url);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for X: ${imgRes.status}`);
    const imgBytes = await imgRes.arrayBuffer();

    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
    const uploadAuth = await buildOAuth1Header("POST", uploadUrl, {}, creds);

    const form = new FormData();
    form.append("media", new Blob([imgBytes], { type: "image/png" }), "norma.png");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: uploadAuth },
      body: form,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`X media upload failed ${uploadRes.status}: ${err.slice(0, 200)}`);
    }

    const uploadData = await uploadRes.json();
    mediaId = uploadData.media_id_string ?? null;
  }

  // Step 2: Build tweet body
  const tweetUrl = "https://api.twitter.com/2/tweets";
  const tweetAuth = await buildOAuth1Header("POST", tweetUrl, {}, creds);

  const tweetBody: Record<string, unknown> = { text: post.content_text ?? "" };

  if (mediaId) {
    tweetBody.media = { media_ids: [mediaId] };
  }

  // Poll format: add poll options (no image with polls on X)
  if (post.post_format === "poll") {
    const pollOptions = post.format_metadata?.options as string[] | undefined;
    if (pollOptions && pollOptions.length >= 2) {
      tweetBody.poll = {
        options: pollOptions.slice(0, 4).map((label) => label.slice(0, 25)),
        duration_minutes: 1440, // 24 hours
      };
    }
  }

  const tweetRes = await fetch(tweetUrl, {
    method: "POST",
    headers: {
      Authorization: tweetAuth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tweetBody),
  });

  if (!tweetRes.ok) {
    const err = await tweetRes.text();
    throw new Error(`X tweet failed ${tweetRes.status}: ${err.slice(0, 200)}`);
  }

  const tweetData = await tweetRes.json();
  const postId = tweetData?.data?.id;
  if (!postId) throw new Error("X tweet: no id in response");

  return { platform_post_id: postId };
}

// ---------------------------------------------------------------------------
// Instagram — container status polling (fixes intermittent "Media ID not available")
// Meta requires containers to reach FINISHED before media_publish is called.
// ---------------------------------------------------------------------------

async function waitForContainerReady(
  containerId: string,
  token: string,
  baseUrl: string,
  maxWaitMs = 30_000,
): Promise<void> {
  const pollIntervalMs = 3_000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${baseUrl}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) break; // let the publish attempt surface the real error

    const data = await res.json();
    const statusCode: string = data.status_code ?? "";

    if (statusCode === "FINISHED") return;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Instagram container ${containerId} reached terminal status: ${statusCode}`);
    }

    // IN_PROGRESS or PUBLISHED — wait and retry
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  // If deadline exceeded, proceed anyway — Meta's publish endpoint may still succeed.
}

// ---------------------------------------------------------------------------
// Instagram — standard image post + carousel
// ---------------------------------------------------------------------------

export async function publishToInstagram(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  // Route carousel posts to dedicated publisher
  if (post.post_format === "carousel") {
    return publishInstagramCarousel(account, post);
  }
  return publishInstagramStandard(account, post);
}

async function publishInstagramStandard(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const igUserIdFromMeta = account.metadata?.ig_user_id as string | undefined;
  const igUserId = (igUserIdFromMeta && igUserIdFromMeta.trim())
    ? igUserIdFromMeta.trim()
    : Deno.env.get("META_INSTAGRAM_USER_ID");
  if (!igUserId) throw new Error("Instagram: ig_user_id not configured");

  const envToken = Deno.env.get("META_INSTAGRAM_ACCESS_TOKEN")?.replace(/\s+/g, "");
  const dbToken  = account.access_token?.replace(/\s+/g, "");
  const token    = envToken || dbToken;
  if (!token) throw new Error("Instagram: access_token not configured");
  const caption = post.content_text ?? "";
  const baseUrl = "https://graph.facebook.com/v18.0";

  if (!post.image_url) throw new Error("Instagram requires an image_url");

  const createParams = new URLSearchParams({
    caption,
    image_url: (post.image_url ?? "").replace(/\s+/g, ""),
    media_type: "IMAGE",
    access_token: token,
  });

  const createRes = await fetch(`${baseUrl}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createParams.toString(),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Instagram media create failed ${createRes.status}: ${err.slice(0, 200)}`);
  }

  const createData = await createRes.json();
  const creationId: string = createData.id;
  if (!creationId) throw new Error("Instagram: no creation_id returned");

  await waitForContainerReady(creationId, token, baseUrl);

  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const publishRes = await fetch(`${baseUrl}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams.toString(),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Instagram publish failed ${publishRes.status}: ${err.slice(0, 200)}`);
  }

  const publishData = await publishRes.json();
  const postId: string = publishData.id;
  if (!postId) throw new Error("Instagram: no post id returned from publish");

  return { platform_post_id: postId };
}

async function publishInstagramCarousel(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const igUserIdFromMeta = account.metadata?.ig_user_id as string | undefined;
  const igUserId = (igUserIdFromMeta && igUserIdFromMeta.trim())
    ? igUserIdFromMeta.trim()
    : Deno.env.get("META_INSTAGRAM_USER_ID");
  if (!igUserId) throw new Error("Instagram carousel: ig_user_id not configured");

  const token = Deno.env.get("META_INSTAGRAM_ACCESS_TOKEN")?.replace(/\s+/g, "") ||
    account.access_token?.replace(/\s+/g, "");
  if (!token) throw new Error("Instagram carousel: access_token not configured");
  const baseUrl = "https://graph.facebook.com/v18.0";

  // Read slides from format_metadata (set by generate-social-content)
  const slides = post.format_metadata?.slides as Array<{
    image_url: string;
    caption: string;
  }> | undefined;

  if (!slides || slides.length < 2) {
    // Insufficient slides — fall back to standard post
    console.warn(`Instagram carousel: insufficient slides (${slides?.length ?? 0}), falling back to standard`);
    return publishInstagramStandard(account, post);
  }

  // Step 1: Create a media container for each slide
  const containerIds: string[] = [];
  for (const slide of slides) {
    if (!slide.image_url) continue;

    const createParams = new URLSearchParams({
      image_url:        slide.image_url,
      is_carousel_item: "true",
      access_token:     token,
    });

    const createRes = await fetch(`${baseUrl}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Instagram carousel item create failed ${createRes.status}: ${err.slice(0, 200)}`);
    }

    const createData = await createRes.json();
    if (!createData.id) throw new Error("Instagram carousel: no id for slide container");
    containerIds.push(createData.id as string);
  }

  if (containerIds.length < 2) {
    throw new Error(`Instagram carousel: only ${containerIds.length} slide(s) created successfully`);
  }

  // Step 2: Create carousel container (caption goes on the carousel, not individual slides)
  const carouselCaption = post.content_text ?? slides[0]?.caption ?? "";
  const carouselParams = new URLSearchParams({
    media_type:  "CAROUSEL",
    caption:     carouselCaption,
    children:    containerIds.join(","),
    access_token: token,
  });

  const carouselRes = await fetch(`${baseUrl}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: carouselParams.toString(),
  });

  if (!carouselRes.ok) {
    const err = await carouselRes.text();
    throw new Error(`Instagram carousel container failed ${carouselRes.status}: ${err.slice(0, 200)}`);
  }

  const carouselData = await carouselRes.json();
  const carouselId: string = carouselData.id;
  if (!carouselId) throw new Error("Instagram carousel: no id for carousel container");

  await waitForContainerReady(carouselId, token, baseUrl);

  // Step 3: Publish the carousel
  const publishParams = new URLSearchParams({
    creation_id:  carouselId,
    access_token: token,
  });

  const publishRes = await fetch(`${baseUrl}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams.toString(),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Instagram carousel publish failed ${publishRes.status}: ${err.slice(0, 200)}`);
  }

  const publishData = await publishRes.json();
  const postId: string = publishData.id;
  if (!postId) throw new Error("Instagram carousel: no post id returned");

  return { platform_post_id: postId };
}

// ---------------------------------------------------------------------------
// Facebook — standard post (no format variants needed; no hashtags, no images required)
// ---------------------------------------------------------------------------

export async function publishToFacebook(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const pageIdFromMeta = account.metadata?.page_id as string | undefined;
  const pageId = (pageIdFromMeta && pageIdFromMeta.trim())
    ? pageIdFromMeta.trim()
    : Deno.env.get("META_FACEBOOK_PAGE_ID");
  if (!pageId) throw new Error("Facebook: page_id not configured");

  const envToken = Deno.env.get("META_FACEBOOK_PAGE_ACCESS_TOKEN")?.replace(/\s+/g, "");
  const dbToken  = account.access_token?.replace(/\s+/g, "");
  const token    = envToken || dbToken;
  if (!token) throw new Error("Facebook: access_token not configured");
  const baseUrl = "https://graph.facebook.com/v18.0";

  const body = new URLSearchParams({
    message:      post.content_text ?? "",
    access_token: token,
  });

  // Attach image if present
  if (post.image_url) {
    body.set("url", post.image_url);
  }

  const endpoint = post.image_url
    ? `${baseUrl}/${pageId}/photos`
    : `${baseUrl}/${pageId}/feed`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook post failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const postId: string = data.id ?? data.post_id;
  if (!postId) throw new Error("Facebook: no post id returned");

  return { platform_post_id: postId };
}

// ---------------------------------------------------------------------------
// TikTok (Content Publishing API — photo post)
// ---------------------------------------------------------------------------

export async function publishToTikTok(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const token = account.access_token || Deno.env.get("TIKTOK_ACCESS_TOKEN")!;

  if (!post.image_url) throw new Error("TikTok: image_url required for photo post");

  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title:          post.content_text ?? "",
        privacy_level:  "PUBLIC_TO_EVERYONE",
        disable_duet:   false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source:            "PULL_FROM_URL",
        photo_images:      [post.image_url],
        photo_cover_index: 0,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok post failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const postId: string = data?.data?.publish_id ?? data?.data?.post_id;
  if (!postId) throw new Error(`TikTok: no publish_id in response: ${JSON.stringify(data).slice(0, 200)}`);

  return { platform_post_id: postId };
}

// ---------------------------------------------------------------------------
// Reddit — text post + link post format
// ---------------------------------------------------------------------------
// Guardrails per Reddit Responsible Builder Policy:
//   1. Max 1 post per subreddit per 24h (rate limit)
//   2. No duplicate content within 7 days (dedup via content hash)
//   3. Self-promotion ratio: skip if >25% of recent posts are app_promo/link
// ---------------------------------------------------------------------------

import { PLATFORM_SUBREDDITS, DEFAULT_SUBREDDIT } from "./social-content-engine.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** SHA-256 hex hash of content for dedup */
async function hashContent(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Reddit posting guardrails — throws if any policy check fails.
 * Called before every Reddit post attempt.
 */
async function enforceRedditGuardrails(
  subreddit: string,
  contentText: string,
  postType: string,
): Promise<void> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();

  // --- 1. Rate limit: max 1 post per subreddit per 24 hours ----------------
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentInSub, error: rlErr } = await sb
    .from("social_posts")
    .select("id")
    .eq("platform", "reddit")
    .eq("status", "published")
    .gte("published_at", twentyFourHoursAgo)
    .limit(10);

  if (rlErr) {
    console.error("Reddit guardrail (rate-limit) query failed:", rlErr.message);
    // Fail open on query error — don't block publishing for a DB hiccup
  } else {
    // Filter by subreddit stored in format_metadata or post_type → subreddit mapping
    // Since we don't store subreddit directly, count all Reddit posts in 24h
    if ((recentInSub?.length ?? 0) >= 5) {
      throw new Error(
        `Reddit guardrail: already posted ${recentInSub!.length} times in last 24h (max 5). Skipping.`,
      );
    }
  }

  // --- 2. Content dedup: no identical content within 7 days ----------------
  const contentHash = await hashContent(contentText);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: dupes, error: ddErr } = await sb
    .from("social_posts")
    .select("id, content_text")
    .eq("platform", "reddit")
    .eq("status", "published")
    .gte("published_at", sevenDaysAgo);

  if (ddErr) {
    console.error("Reddit guardrail (dedup) query failed:", ddErr.message);
  } else if (dupes) {
    for (const d of dupes) {
      if (d.content_text) {
        const existingHash = await hashContent(d.content_text);
        if (existingHash === contentHash) {
          throw new Error(
            `Reddit guardrail: duplicate content detected (matches post ${d.id}). Skipping.`,
          );
        }
      }
    }
  }

  // --- 3. Self-promotion ratio: max 25% app_promo / link posts in last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: last30, error: spErr } = await sb
    .from("social_posts")
    .select("post_type, post_format")
    .eq("platform", "reddit")
    .eq("status", "published")
    .gte("published_at", thirtyDaysAgo);

  if (spErr) {
    console.error("Reddit guardrail (self-promo) query failed:", spErr.message);
  } else if (last30 && last30.length >= 4) {
    const promoCount = last30.filter(
      (p) => p.post_type === "app_promo" || p.post_format === "link",
    ).length;
    const promoRatio = promoCount / last30.length;
    if (promoRatio > 0.25 && (postType === "app_promo" || postType === "link")) {
      throw new Error(
        `Reddit guardrail: self-promotion ratio ${(promoRatio * 100).toFixed(0)}% exceeds 25% cap. Skipping promo post.`,
      );
    }
  }

  console.log(
    JSON.stringify({
      function: "publishToReddit",
      event: "guardrails_passed",
      subreddit,
      content_hash: contentHash.slice(0, 12),
      timestamp: now.toISOString(),
    }),
  );
}

async function getRedditAccessToken(): Promise<string> {
  const clientId     = Deno.env.get("REDDIT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET")!;
  const username     = Deno.env.get("REDDIT_USERNAME")!;
  const password     = Deno.env.get("REDDIT_PASSWORD")!;

  const basic = btoa(`${clientId}:${clientSecret}`);

  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization:  `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":   `NORMAbot/1.0 by u/${username}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit token request failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("Reddit: no access_token in response");
  return data.access_token as string;
}

export async function publishToReddit(
  account: SocialAccount,
  post: SocialPost,
): Promise<PublishResult> {
  const username = Deno.env.get("REDDIT_USERNAME")!;
  const subreddit = PLATFORM_SUBREDDITS[post.post_type] ?? DEFAULT_SUBREDDIT;
  const fullText = post.content_text ?? "";

  // --- Responsible Builder Policy guardrails ---
  await enforceRedditGuardrails(subreddit, fullText, post.post_type);

  const token = await getRedditAccessToken();

  // Link post format for app_promo
  if (post.post_format === "link") {
    const linkTitle = (post.format_metadata?.link_title as string) ??
      (fullText.split("\n")[0] ?? fullText).slice(0, 100);
    const appUrl = Deno.env.get("NORMA_APP_URL") ?? "https://getnorma.app";

    const body = new URLSearchParams({
      sr:       subreddit,
      kind:     "link",
      title:    linkTitle,
      url:      appUrl,
      resubmit: "true",
      nsfw:     "false",
      spoiler:  "false",
    });

    const res = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":   `NORMAbot/1.0 by u/${username}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reddit link submit failed ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const postUrl: string =
      data?.data?.url ?? `https://reddit.com/r/${subreddit}`;
    return { platform_post_id: postUrl };
  }

  // Standard text post
  const firstLine = fullText.split("\n")[0] ?? fullText;
  const title = firstLine.length > 100 ? firstLine.slice(0, 97) + "..." : firstLine;

  const body = new URLSearchParams({
    sr:       subreddit,
    kind:     "self",
    title,
    text:     fullText,
    resubmit: "true",
    nsfw:     "false",
    spoiler:  "false",
  });

  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":   `NORMAbot/1.0 by u/${username}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit submit failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const postUrl: string = data?.data?.url ?? `https://reddit.com/r/${subreddit}`;

  return { platform_post_id: postUrl };
}
