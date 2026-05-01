// publish-social-posts: Hourly — push generated posts to each social platform
// Trigger: pg_cron job 'publish-social-posts' (migration 031, runs every hour)
//          Each post carries its own platform-optimal scheduled_for timestamp.
//
// Enhancement Pack (migration 030):
//   - Retry logic with exponential backoff (up to 3 attempts)
//   - Approval gate: skips posts with approval_status='pending_approval'
//   - Carousel and poll routing to appropriate publishers
//   - Slack failure alerting when a run has >1 failure

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  countPublishedToday,
  CADENCE_PLATFORMS,
  DAILY_MAX,
} from "../_shared/daily-cadence.ts";
import {
  publishToX,
  publishToInstagram,
  publishToFacebook,
  publishToTikTok,
  publishToReddit,
  type SocialAccount,
  type SocialPost,
} from "../_shared/social-publishers.ts";

// Exponential backoff delays in minutes for retry attempts
const RETRY_BACKOFF_MINUTES = [15, 60, 240]; // attempt 1, 2, 3

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

    const now = new Date().toISOString();

    // -----------------------------------------------------------------------
    // Fetch posts ready to publish:
    //   a) Generated posts that have reached their scheduled_for time
    //   b) Failed posts eligible for retry (retry_count < 3, next_retry_at <= now)
    // Only include posts that have been approved (auto or manual)
    // -----------------------------------------------------------------------
    const { data: readyPosts, error: readyError } = await supabase
      .from("social_posts")
      .select("id, platform, status, post_type, content_text, image_url, scenario, post_format, format_metadata, retry_count")
      .eq("status", "generated")
      .in("approval_status", ["auto_approved", "approved"])
      .lte("scheduled_for", now)
      .order("id", { ascending: true });

    if (readyError) throw new Error(`social_posts query (ready): ${readyError.message}`);

    const { data: retryPosts, error: retryError } = await supabase
      .from("social_posts")
      .select("id, platform, status, post_type, content_text, image_url, scenario, post_format, format_metadata, retry_count")
      .eq("status", "failed")
      .in("approval_status", ["auto_approved", "approved"])
      .lt("retry_count", 3)
      .lte("next_retry_at", now)
      .order("id", { ascending: true });

    if (retryError) throw new Error(`social_posts query (retry): ${retryError.message}`);

    // -----------------------------------------------------------------------
    // Cadence cap — never publish more than DAILY_MAX cadence-platform posts
    // per day. Retry posts are exempt (they are existing failed attempts, not
    // new quota usage). Only ready (newly-generated) posts are capped.
    // -----------------------------------------------------------------------
    const publishedToday = await countPublishedToday(supabase, [...CADENCE_PLATFORMS]);
    const cadenceSlotsLeft = Math.max(0, DAILY_MAX - publishedToday);

    const readyFiltered = (readyPosts ?? []).filter((_post, idx) => {
      const isCadencePlatform = (CADENCE_PLATFORMS as readonly string[]).includes(_post.platform);
      if (!isCadencePlatform) return true; // TikTok / Reddit always allowed
      // Count how many cadence-platform posts in readyPosts we have already allowed
      const cadenceReadyBefore = (readyPosts ?? [])
        .slice(0, idx)
        .filter((p) => (CADENCE_PLATFORMS as readonly string[]).includes(p.platform))
        .length;
      return cadenceReadyBefore < cadenceSlotsLeft;
    });

    if (readyFiltered.length < (readyPosts ?? []).length) {
      console.log(JSON.stringify({
        function:         "publish-social-posts",
        event:            "cadence_cap_applied",
        ready_total:      (readyPosts ?? []).length,
        ready_allowed:    readyFiltered.length,
        published_today:  publishedToday,
        daily_max:        DAILY_MAX,
        timestamp:        new Date().toISOString(),
      }));
    }

    const posts: SocialPost[] = [...readyFiltered, ...(retryPosts ?? [])];

    if (posts.length === 0) {
      console.log(JSON.stringify({
        function:  "publish-social-posts",
        event:     "no_posts_to_publish",
        timestamp: now,
      }));
      return new Response(
        JSON.stringify({ success: true, published: 0, failed: 0, skipped: 0, retried: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // Fetch all active social accounts (keyed by platform)
    // -----------------------------------------------------------------------
    const { data: accountRows } = await supabase
      .from("social_accounts")
      .select("platform, account_id, account_name, access_token, refresh_token, token_expires_at, metadata")
      .eq("is_active", true);

    const accounts: Record<string, SocialAccount> = {};
    for (const row of accountRows ?? []) {
      accounts[row.platform] = row as SocialAccount;
    }

    // -----------------------------------------------------------------------
    // Publish each post
    // -----------------------------------------------------------------------
    let published = 0;
    let failed    = 0;
    let skipped   = 0;
    let retried   = 0;

    const failedPlatforms: string[] = [];

    for (const post of posts) {
      const account = accounts[post.platform];
      const isRetry = post.status === "failed";

      if (!account) {
        await supabase
          .from("social_posts")
          .update({ status: "skipped", error_detail: "no_active_account" })
          .eq("id", post.id);

        console.log(JSON.stringify({
          function:  "publish-social-posts",
          event:     "skipped",
          post_id:   post.id,
          platform:  post.platform,
          reason:    "no_active_account",
          timestamp: new Date().toISOString(),
        }));

        skipped++;
        continue;
      }

      try {
        const result = await callPublisher(account, post);

        await supabase
          .from("social_posts")
          .update({
            status:           "published",
            platform_post_id: result.platform_post_id,
            published_at:     new Date().toISOString(),
            error_detail:     null,
          })
          .eq("id", post.id);

        console.log(JSON.stringify({
          function:          "publish-social-posts",
          event:             isRetry ? "published_after_retry" : "published",
          post_id:           post.id,
          platform:          post.platform,
          platform_post_id:  result.platform_post_id,
          retry_count:       post.retry_count,
          timestamp:         new Date().toISOString(),
        }));

        published++;
        if (isRetry) retried++;
      } catch (err) {
        const errMsg   = (err as Error).message;
        const newRetryCount = (post.retry_count ?? 0) + 1;
        const backoffMinutes = RETRY_BACKOFF_MINUTES[newRetryCount - 1] ?? 240;
        const nextRetryAt = newRetryCount < 3
          ? new Date(Date.now() + backoffMinutes * 60_000).toISOString()
          : null; // No more retries after 3 attempts

        await supabase
          .from("social_posts")
          .update({
            status:        "failed",
            error_detail:  errMsg.slice(0, 500),
            retry_count:   newRetryCount,
            next_retry_at: nextRetryAt,
          })
          .eq("id", post.id);

        console.log(JSON.stringify({
          function:       "publish-social-posts",
          event:          "failed",
          post_id:        post.id,
          platform:       post.platform,
          error:          errMsg.slice(0, 200),
          retry_count:    newRetryCount,
          next_retry_at:  nextRetryAt,
          timestamp:      new Date().toISOString(),
        }));

        failed++;
        failedPlatforms.push(post.platform);
      }
    }

    // -----------------------------------------------------------------------
    // Send Slack failure alert if any posts failed
    // -----------------------------------------------------------------------
    if (failed > 0) {
      await sendFailureAlert(failed, failedPlatforms, published, posts.length);
    }

    console.log(JSON.stringify({
      function:    "publish-social-posts",
      event:       "completed",
      published,
      failed,
      skipped,
      retried,
      total:       posts.length,
      duration_ms: Date.now() - startedAt,
      timestamp:   new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true, published, failed, skipped, retried }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("publish-social-posts fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Route to the correct publisher based on platform
// ---------------------------------------------------------------------------

async function callPublisher(
  account: SocialAccount,
  post: SocialPost,
): Promise<{ platform_post_id: string }> {
  switch (post.platform) {
    case "x":         return publishToX(account, post);
    case "instagram": return publishToInstagram(account, post);
    case "facebook":  return publishToFacebook(account, post);
    case "tiktok":    return publishToTikTok(account, post);
    case "reddit":    return publishToReddit(account, post);
    default:
      throw new Error(`Unknown platform: ${post.platform}`);
  }
}

// ---------------------------------------------------------------------------
// Slack failure alert
// ---------------------------------------------------------------------------

async function sendFailureAlert(
  failureCount: number,
  failedPlatforms: string[],
  publishedCount: number,
  totalCount: number,
): Promise<void> {
  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!webhookUrl) return;

  const platformList = [...new Set(failedPlatforms)].join(", ").toUpperCase();

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🚨 NORMA CMO: ${failureCount} post(s) failed to publish`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *NORMA CMO Publishing Failures*\n*Failed:* ${failureCount}/${totalCount} posts · *Platforms:* ${platformList}\n*Published successfully:* ${publishedCount}`,
            },
          },
          {
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: "Failed posts with <3 attempts will be retried automatically. Check Supabase logs for details.",
            }],
          },
        ],
      }),
    });
  } catch (err) {
    console.warn("Slack failure alert failed to send:", (err as Error).message);
  }
}
