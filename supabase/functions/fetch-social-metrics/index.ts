// fetch-social-metrics: Daily 9pm UTC — pull engagement data back from each platform
// Trigger: pg_cron job 'fetch-social-metrics' (migration 031)
//
// For each post published today or yesterday with a platform_post_id:
//   1. Calls the platform's analytics API
//   2. Writes likes/reposts/replies/impressions back to social_posts
//   3. Extracts hashtags from post content and updates social_hashtag_performance
//
// Platform support:
//   X (Twitter API v2):  public_metrics (likes, reposts, replies, impressions)
//   Instagram Graph API: insights (engagement, impressions)
//   Facebook Graph API:  likes summary + shares + comments summary
//   TikTok / Reddit:     not supported (no accessible engagement API for these)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildOAuth1HeaderForMetrics } from "../_shared/x-oauth.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

interface PostMetrics {
  likes_count:   number;
  reposts_count: number;
  replies_count: number;
  impressions:   number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch posts published in the last 48 hours that have a platform_post_id
    // and haven't had metrics fetched yet today
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: posts, error } = await supabase
      .from("social_posts")
      .select("id, platform, platform_post_id, content_text")
      .eq("status", "published")
      .not("platform_post_id", "is", null)
      .gte("published_at", cutoff)
      .or(`metrics_fetched_at.is.null,metrics_fetched_at.lt.${todayStr}T00:00:00.000Z`)
      .order("published_at", { ascending: false })
      .limit(50); // Rate limit buffer

    if (error) throw new Error(`social_posts query: ${error.message}`);

    const postsToCheck = posts ?? [];

    if (postsToCheck.length === 0) {
      console.log(JSON.stringify({
        function:  "fetch-social-metrics",
        event:     "no_posts_to_check",
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, updated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let updated = 0;
    let skippedPlatforms = 0;

    for (const post of postsToCheck) {
      try {
        let metrics: PostMetrics | null = null;

        switch (post.platform) {
          case "x":
            metrics = await fetchXMetrics(post.platform_post_id);
            break;
          case "instagram":
            metrics = await fetchInstagramMetrics(post.platform_post_id, supabase);
            break;
          case "facebook":
            metrics = await fetchFacebookMetrics(post.platform_post_id, supabase);
            break;
          default:
            // TikTok and Reddit don't expose accessible engagement APIs
            skippedPlatforms++;
            continue;
        }

        if (!metrics) {
          skippedPlatforms++;
          continue;
        }

        // Write metrics back to social_posts
        await supabase
          .from("social_posts")
          .update({
            likes_count:        metrics.likes_count,
            reposts_count:      metrics.reposts_count,
            replies_count:      metrics.replies_count,
            impressions:        metrics.impressions,
            metrics_fetched_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        // Update hashtag performance table
        if (post.content_text) {
          await updateHashtagPerformance(supabase, post.platform, post.content_text, metrics);
        }

        updated++;
      } catch (err) {
        console.warn(JSON.stringify({
          function:  "fetch-social-metrics",
          event:     "metric_fetch_failed",
          post_id:   post.id,
          platform:  post.platform,
          error:     (err as Error).message.slice(0, 200),
          timestamp: new Date().toISOString(),
        }));
      }
    }

    console.log(JSON.stringify({
      function:          "fetch-social-metrics",
      event:             "completed",
      posts_checked:     postsToCheck.length,
      updated,
      skipped_platforms: skippedPlatforms,
      duration_ms:       Date.now() - startedAt,
      timestamp:         new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true, updated, skipped: skippedPlatforms }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("fetch-social-metrics fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// X (Twitter API v2) — public_metrics
// ---------------------------------------------------------------------------

async function fetchXMetrics(tweetId: string): Promise<PostMetrics | null> {
  const apiKey       = Deno.env.get("X_CONSUMER_KEY")!;
  const apiSecret    = Deno.env.get("X_CONSUMER_SECRET")!;
  const accessToken  = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessSecret = Deno.env.get("X_ACCESS_TOKEN_SECRET")!;

  const url = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`;

  // Build OAuth 1.0a header for GET
  const authHeader = await buildOAuth1HeaderForMetrics("GET", url, {}, {
    apiKey, apiSecret, accessToken, accessSecret,
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X metrics fetch failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const m = data?.data?.public_metrics;
  if (!m) return null;

  return {
    likes_count:   m.like_count   ?? 0,
    reposts_count: m.retweet_count ?? 0,
    replies_count: m.reply_count  ?? 0,
    impressions:   m.impression_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Instagram (Graph API) — media insights
// ---------------------------------------------------------------------------

async function fetchInstagramMetrics(
  mediaId: string,
  supabase: SupabaseClient,
): Promise<PostMetrics | null> {
  // Get the account access token
  const { data: accountRow } = await supabase
    .from("social_accounts")
    .select("access_token")
    .eq("platform", "instagram")
    .eq("is_active", true)
    .single();

  const token = accountRow?.access_token || Deno.env.get("META_INSTAGRAM_ACCESS_TOKEN");
  if (!token) throw new Error("Instagram: no access token available");

  const url = `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=impressions,reach,saved`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram metrics fetch failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const metrics = data?.data ?? [];

  const getValue = (name: string): number => {
    const item = metrics.find((m: { name: string; values?: Array<{ value: number }> }) => m.name === name);
    return item?.values?.[0]?.value ?? 0;
  };

  // Also fetch likes from the media object directly
  const likeRes = await fetch(
    `https://graph.facebook.com/v18.0/${mediaId}?fields=like_count,comments_count`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const likeData = likeRes.ok ? await likeRes.json() : {};

  return {
    likes_count:   likeData.like_count     ?? 0,
    reposts_count: getValue("saved"),        // Saves are closest to "reposts" for IG
    replies_count: likeData.comments_count ?? 0,
    impressions:   getValue("impressions"),
  };
}

// ---------------------------------------------------------------------------
// Facebook (Graph API) — post insights
// ---------------------------------------------------------------------------

async function fetchFacebookMetrics(
  postId: string,
  supabase: SupabaseClient,
): Promise<PostMetrics | null> {
  const { data: accountRow } = await supabase
    .from("social_accounts")
    .select("access_token")
    .eq("platform", "facebook")
    .eq("is_active", true)
    .single();

  const token = accountRow?.access_token || Deno.env.get("META_FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!token) throw new Error("Facebook: no access token available");

  const url = `https://graph.facebook.com/v18.0/${postId}?fields=likes.summary(true),shares,comments.summary(true),insights.metric(post_impressions)&access_token=${token}`;

  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook metrics fetch failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();

  const impressions = data?.insights?.data?.find(
    (d: { name: string }) => d.name === "post_impressions",
  )?.values?.[0]?.value ?? 0;

  return {
    likes_count:   data?.likes?.summary?.total_count    ?? 0,
    reposts_count: data?.shares?.count                  ?? 0,
    replies_count: data?.comments?.summary?.total_count ?? 0,
    impressions,
  };
}

// ---------------------------------------------------------------------------
// Hashtag performance tracking
// ---------------------------------------------------------------------------

async function updateHashtagPerformance(
  supabase: SupabaseClient,
  platform: string,
  contentText: string,
  metrics: PostMetrics,
): Promise<void> {
  // Extract hashtags from post content
  const hashtags = [...contentText.matchAll(/#(\w+)/g)].map((m) => `#${m[1]}`);
  if (hashtags.length === 0) return;

  const engagement = metrics.likes_count + metrics.reposts_count * 2 + metrics.replies_count;

  for (const hashtag of hashtags) {
    await supabase.rpc("upsert_hashtag_performance", {
      p_hashtag:    hashtag.toLowerCase(),
      p_platform:   platform,
      p_engagement: engagement,
    });
  }
}
