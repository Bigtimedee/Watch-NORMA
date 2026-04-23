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
  status?: string | null;
  post_type: string;
  content_text: string | null;
  image_url: string | null;
  scenario: string | null;
  post_format?: string | null;       // standard | carousel | poll | link
  format_metadata?: Record<string, unknown> | null;
  retry_count?: number | null;       // incremented by publish-social-posts on failure
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
// Image URL pre-flight validation
// ---------------------------------------------------------------------------

/** HEAD-check that an image URL is reachable before handing it to a platform
 *  API. Throws with a clear message if the file is missing (404) so the post
 *  is marked failed rather than sent with a broken URL. */
async function assertImageUrlReachable(url: string): Promise<void> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) {
      throw new Error(
        `image_url returned HTTP ${res.status}. Upload real screenshots via ` +
        `supabase/assets/upload-media-assets.ts before publishing visual posts.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("image_url returned")) throw err;
    throw new Error(`image_url unreachable (${(err as Error).message}). Check Supabase Storage.`);
  }
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
  await assertImageUrlReachable(post.image_url);

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
    await assertImageUrlReachable(slide.image_url);

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
  await assertImageUrlReachable(post.image_url);

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

import { PLATFORM_SUBREDDITS, DEFAULT_SUBREDDIT } from "./social-content-engine.ts";

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
  const token = await getRedditAccessToken();
  const subreddit = PLATFORM_SUBREDDITS[post.post_type] ?? DEFAULT_SUBREDDIT;

  const fullText = post.content_text ?? "";

  // Link post format for app_promo
  if (post.post_format === "link") {
    const linkTitle = (post.format_metadata?.link_title as string) ??
      (fullText.split("\n")[0] ?? fullText).slice(0, 100);
    const appUrl = Deno.env.get("NORMA_APP_URL") ?? "https://norma-app.com";

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
