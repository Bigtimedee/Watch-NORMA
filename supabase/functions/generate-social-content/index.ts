// generate-social-content: Daily 6am UTC — build platform-native posts via Claude
// Trigger: pg_cron job 'generate-social-content' (migration 029)
//
// Enhancement Pack (migration 030):
//   - Per-platform optimal scheduled_for (replaces fixed 8am UTC for all)
//   - Feedback-based scenario + angle selection (biased by engagement history)
//   - Top-performing hashtag injection per platform
//   - Image style A/B variant rotation (cinematic | graphic | lifestyle)
//   - Platform-native format generation (carousel for IG, poll for X, link for Reddit)
//   - Images: real NORMA app screenshots from Supabase Storage (replaces DALL-E)
//   - Content approval workflow (requires_approval flag per account)
//   - Slack notification for posts held for approval

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  countQueuedToday,
  CADENCE_PLATFORMS,
  DAILY_MAX,
} from "../_shared/daily-cadence.ts";
import {
  generatePostContent,
  selectScreenshotUrl,
  getOptimalPublishTime,
  getImageVariant,
  getPostFormat,
  getDayOfYear,
  getTodayScenario,
  getTodayCharacterAngle,
  VISUAL_PLATFORMS,
  PLATFORM_SUBREDDITS,
  DEFAULT_SUBREDDIT,
  SCENARIOS,
  CHARACTER_ANGLES,
  type GameData,
  type Scenario,
  type CharacterAngle,
  type ImageVariant,
  type PostFormat,
} from "../_shared/social-content-engine.ts";

const PLATFORMS = ["x", "instagram", "facebook", "tiktok", "reddit"] as const;

// ---------------------------------------------------------------------------
// Retry-safe Supabase client type alias
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    // Allow manual invocation to override defaults
    let reqPostType: string | null = null;
    let reqScenario: Scenario | null = null;
    let reqCatchUp = false;
    try {
      const body = await req.json();
      reqPostType = body?.post_type ?? null;
      reqScenario = body?.scenario ?? null;
      reqCatchUp  = body?.catch_up === true;
    } catch {
      // No body — pg_cron sends empty body
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -----------------------------------------------------------------------
    // Cadence guard — 4 min / 8 max per day across X, Instagram, Facebook
    // -----------------------------------------------------------------------
    // Use ET midnight as the day boundary (consistent with the Postgres RPCs).
    // "America/New_York" handles EST/EDT automatically.
    const _now = new Date();
    // Express current time as ET wall-clock values treated as UTC (to extract date/time components).
    const _etWall = new Date(_now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    // Compute the ET-to-UTC offset in ms (negative for behind UTC, e.g. -4h during EDT).
    const _etOffsetMs = _etWall.getTime() - _now.getTime();
    // Set to ET midnight, then shift back to actual UTC.
    _etWall.setHours(0, 0, 0, 0);
    const todayStart = new Date(_etWall.getTime() - _etOffsetMs);

    const queuedCount = await countQueuedToday(supabase, [...CADENCE_PLATFORMS]);

    if (queuedCount >= DAILY_MAX) {
      console.log(JSON.stringify({
        function:     "generate-social-content",
        event:        "skipped_at_daily_cap",
        queued_today: queuedCount,
        daily_max:    DAILY_MAX,
        timestamp:    new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "daily_cap_reached", queued_today: queuedCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine which platforms already have a post queued today (for dedup)
    const { data: todayPostRows } = await supabase
      .from("social_posts")
      .select("platform")
      .gte("created_at", todayStart.toISOString())
      .in("status", ["generated", "published"])
      .in("post_type", ["game_preview", "app_promo"]);

    const platformsWithPostsToday = new Set(
      (todayPostRows ?? []).map((r: { platform: string }) => r.platform),
    );
    let remainingCadenceSlots = DAILY_MAX - queuedCount;

    // -----------------------------------------------------------------------
    // Fetch active social accounts
    // -----------------------------------------------------------------------
    const { data: accountRows, error: accountsError } = await supabase
      .from("social_accounts")
      .select("platform, account_id, account_name, metadata, requires_approval")
      .eq("is_active", true);

    if (accountsError) throw new Error(`social_accounts query: ${accountsError.message}`);

    const activeAccounts = new Map(
      (accountRows ?? []).map((a) => [a.platform as string, a]),
    );

    if (activeAccounts.size === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_active_platforms" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // Fetch today's scheduled games
    // -----------------------------------------------------------------------
    const todayStr = todayStart.toISOString().split("T")[0];
    const tomorrowStr = new Date(todayStart.getTime() + 86_400_000).toISOString().split("T")[0];

    const { data: gameRows } = await supabase
      .from("games")
      .select("*")
      .eq("status", "scheduled")
      .gte("scheduled_at", `${todayStr}T00:00:00.000Z`)
      .lt("scheduled_at", `${tomorrowStr}T00:00:00.000Z`)
      .limit(10);

    const games: GameData[] = gameRows ?? [];

    // -----------------------------------------------------------------------
    // Determine post type, scenario, character angle — feedback-biased
    // -----------------------------------------------------------------------
    const postType: string = reqPostType ?? (games.length > 0 ? "game_preview" : "app_promo");

    const dayOfYear = getDayOfYear();

    const scenario: Scenario = reqScenario ??
      await getPerformanceBasedScenario(supabase, dayOfYear);

    const characterAngle: CharacterAngle =
      await getPerformanceBasedAngle(supabase, new Date().getDay());

    const imageVariant: ImageVariant = getImageVariant(dayOfYear);

    const primaryGameId: string | null = games[0]?.id ?? null;

    // -----------------------------------------------------------------------
    // Generate content per active platform
    // -----------------------------------------------------------------------
    const results: Array<{
      platform: string;
      status: "generated" | "failed";
      error?: string;
    }> = [];

    for (const platform of PLATFORMS) {
      if (!activeAccounts.has(platform)) continue;

      const isCadencePlatform = (CADENCE_PLATFORMS as readonly string[]).includes(platform);
      if (isCadencePlatform) {
        // Stop generating for cadence platforms once we've filled remaining slots
        if (remainingCadenceSlots <= 0) continue;
        // In normal (non-catch-up) mode, skip platforms that already have a post today
        if (!reqCatchUp && platformsWithPostsToday.has(platform)) continue;
      } else {
        // TikTok / Reddit: keep original per-platform dedup (one post per day)
        if (platformsWithPostsToday.has(platform)) continue;
      }

      const account = activeAccounts.get(platform)!;
      const postFormat: PostFormat = getPostFormat(platform, postType);
      const scheduledFor = getOptimalPublishTime(platform, todayStr);

      try {
        // Fetch top-performing hashtags for this platform
        const topHashtags = await getTopHashtags(supabase, platform);

        // Generate text + image prompt via Claude Sonnet
        const generated = await generatePostContent(
          platform,
          games,
          postType,
          scenario,
          characterAngle,
          postFormat,
          topHashtags,
        );

        // ----------------------------------------------------------------
        // Image generation — with variant style + carousel support
        // ----------------------------------------------------------------
        let finalImageUrl: string | null = null;
        let formatMetadata: Record<string, unknown> = {};

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

        if (postFormat === "carousel" && generated.slides && generated.slides.length > 0) {
          const slidesWithImages = generated.slides.map((slide, i) => ({
            caption:   slide.caption,
            image_url: selectScreenshotUrl(supabaseUrl, postType, i, platform),
          }));
          finalImageUrl = slidesWithImages[0]?.image_url ?? null;
          formatMetadata = { slides: slidesWithImages };

        } else if (postFormat === "poll" && generated.poll_options) {
          // Poll posts: store options in metadata; image only for visual platforms
          formatMetadata = {
            options:          generated.poll_options,
            duration_minutes: 1440,
          };
          if (VISUAL_PLATFORMS.has(platform)) {
            finalImageUrl = selectScreenshotUrl(supabaseUrl, postType, 0, platform);
          }

        } else if (postFormat === "link") {
          // Link posts (Reddit): no image
          formatMetadata = {
            link_title: generated.link_title ?? generated.text.split("\n")[0],
            url:        Deno.env.get("NORMA_APP_URL") ?? "https://norma-app.com",
          };

        } else {
          // Standard post: use real app screenshot
          if (VISUAL_PLATFORMS.has(platform)) {
            finalImageUrl = selectScreenshotUrl(supabaseUrl, postType, 0, platform);
          }
        }

        // ----------------------------------------------------------------
        // Approval workflow
        // ----------------------------------------------------------------
        const requiresApproval: boolean = account.requires_approval === true;
        const approvalStatus = requiresApproval ? "pending_approval" : "auto_approved";

        // ----------------------------------------------------------------
        // Insert post into social_posts
        // ----------------------------------------------------------------
        const { error: insertError } = await supabase
          .from("social_posts")
          .insert({
            platform,
            status:          "generated",
            post_type:       postType,
            scenario,
            character_angle: characterAngle,
            content_text:    generated.text,
            image_url:       finalImageUrl,
            game_id:         primaryGameId,
            scheduled_for:   scheduledFor,
            generated_at:    new Date().toISOString(),
            // Enhancement Pack fields
            image_variant:   imageVariant,
            post_format:     postFormat,
            format_metadata: formatMetadata,
            approval_status: approvalStatus,
          });

        if (insertError) throw new Error(insertError.message);

        // Notify Slack if post is held for approval
        if (requiresApproval) {
          await sendApprovalNotification(platform, postType, generated.text, scheduledFor);
        }

        results.push({ platform, status: "generated" });
        if (isCadencePlatform) remainingCadenceSlots--;
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`generate-social-content: ${platform} error:`, errMsg);

        await supabase
          .from("social_posts")
          .insert({
            platform,
            status:          "failed",
            post_type:       postType,
            scenario,
            character_angle: characterAngle,
            game_id:         primaryGameId,
            scheduled_for:   getOptimalPublishTime(platform, todayStr),
            error_detail:    errMsg.slice(0, 500),
          });

        results.push({ platform, status: "failed", error: errMsg });
      }
    }

    const generated = results.filter((r) => r.status === "generated").length;
    const failed    = results.filter((r) => r.status === "failed").length;

    console.log(JSON.stringify({
      function:         "generate-social-content",
      event:            "completed",
      posts_generated:  generated,
      posts_failed:     failed,
      post_type:        postType,
      scenario,
      character_angle:  characterAngle,
      image_variant:    imageVariant,
      games_found:      games.length,
      duration_ms:      Date.now() - startedAt,
      timestamp:        new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true, generated, failed, post_type: postType, scenario, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-social-content fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Feedback-based scenario selection (biased toward historically high engagement)
// ---------------------------------------------------------------------------

async function getPerformanceBasedScenario(
  supabase: SupabaseClient,
  fallbackDayOfYear: number,
): Promise<Scenario> {
  try {
    const { data } = await supabase
      .from("social_posts")
      .select("scenario, likes_count, reposts_count")
      .eq("status", "published")
      .not("metrics_fetched_at", "is", null)
      .not("scenario", "is", null)
      .gte("published_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

    if (!data || data.length < 15) {
      return SCENARIOS[fallbackDayOfYear % SCENARIOS.length];
    }

    const scores: Record<string, { total: number; count: number }> = {};
    for (const row of data) {
      const s = row.scenario as string;
      const eng = (row.likes_count ?? 0) + (row.reposts_count ?? 0) * 2;
      scores[s] = scores[s] ?? { total: 0, count: 0 };
      scores[s].total += eng;
      scores[s].count += 1;
    }

    const ranked = SCENARIOS
      .filter((s) => scores[s] && scores[s].count >= 3)
      .sort((a, b) => (scores[b].total / scores[b].count) - (scores[a].total / scores[a].count));

    if (ranked.length === 0) return SCENARIOS[fallbackDayOfYear % SCENARIOS.length];

    // 80% top performer, 20% second-best (preserves variety)
    return Math.random() < 0.8
      ? ranked[0]
      : (ranked[1] ?? ranked[0]);
  } catch {
    return SCENARIOS[fallbackDayOfYear % SCENARIOS.length];
  }
}

async function getPerformanceBasedAngle(
  supabase: SupabaseClient,
  dayOfWeek: number,
): Promise<CharacterAngle> {
  try {
    const { data } = await supabase
      .from("social_posts")
      .select("character_angle, likes_count, reposts_count")
      .eq("status", "published")
      .not("metrics_fetched_at", "is", null)
      .not("character_angle", "is", null)
      .gte("published_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

    if (!data || data.length < 15) {
      return CHARACTER_ANGLES[dayOfWeek % CHARACTER_ANGLES.length];
    }

    const scores: Record<string, { total: number; count: number }> = {};
    for (const row of data) {
      const a = row.character_angle as string;
      const eng = (row.likes_count ?? 0) + (row.reposts_count ?? 0) * 2;
      scores[a] = scores[a] ?? { total: 0, count: 0 };
      scores[a].total += eng;
      scores[a].count += 1;
    }

    const ranked = CHARACTER_ANGLES
      .filter((a) => scores[a] && scores[a].count >= 3)
      .sort((a, b) => (scores[b].total / scores[b].count) - (scores[a].total / scores[a].count));

    if (ranked.length === 0) return CHARACTER_ANGLES[dayOfWeek % CHARACTER_ANGLES.length];
    return ranked[0];
  } catch {
    return CHARACTER_ANGLES[dayOfWeek % CHARACTER_ANGLES.length];
  }
}

// ---------------------------------------------------------------------------
// Top hashtags from social_hashtag_performance
// ---------------------------------------------------------------------------

async function getTopHashtags(
  supabase: SupabaseClient,
  platform: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("social_hashtag_performance")
      .select("hashtag")
      .eq("platform", platform)
      .gte("total_posts", 3)
      .order("avg_engagement", { ascending: false })
      .limit(15);

    return (data ?? []).map((r: { hashtag: string }) => r.hashtag);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Slack approval notification
// ---------------------------------------------------------------------------

async function sendApprovalNotification(
  platform: string,
  postType: string,
  contentText: string,
  scheduledFor: string,
): Promise<void> {
  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!webhookUrl) return;

  const preview = contentText.slice(0, 280);
  const scheduledTime = new Date(scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York" });

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🔍 *NORMA Post Awaiting Approval*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🔍 *NORMA Post Awaiting Approval*\n*Platform:* ${platform.toUpperCase()} · *Type:* ${postType}\n*Scheduled:* ${scheduledTime} ET`,
            },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `\`\`\`${preview}\`\`\`` },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Approve or reject in the NORMA admin dashboard." }],
          },
        ],
      }),
    });
  } catch (err) {
    console.warn("Slack approval notification failed:", (err as Error).message);
  }
}
