// generate-social-content: Daily 6am UTC — build platform-native posts via Claude + DALL-E
// Trigger: pg_cron job 'generate-social-content' (migration 029)
//
// Enhancement Pack (migration 030):
//   - Per-platform optimal scheduled_for (replaces fixed 8am UTC for all)
//   - Feedback-based scenario + angle selection (biased by engagement history)
//   - Top-performing hashtag injection per platform
//   - Image style A/B variant rotation (cinematic | graphic | lifestyle)
//   - Platform-native format generation (carousel for IG, poll for X, link for Reddit)
//   - Carousel: generates 2 DALL-E images for slide variety
//   - Content approval workflow (requires_approval flag per account)
//   - Slack notification for posts held for approval

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  generatePostContent,
  buildImagePromptForVariant,
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
    try {
      const body = await req.json();
      reqPostType = body?.post_type ?? null;
      reqScenario = body?.scenario ?? null;
    } catch {
      // No body — pg_cron sends empty body
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -----------------------------------------------------------------------
    // Idempotency guard — skip if we already generated posts today
    // -----------------------------------------------------------------------
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: existingCount } = await supabase
      .from("social_posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .in("status", ["generated", "published"])
      .in("post_type", ["game_preview", "app_promo"]); // Only check regular posts, not recap posts

    if ((existingCount ?? 0) > 0) {
      console.log(JSON.stringify({
        function: "generate-social-content",
        event: "skipped_already_generated",
        existing_posts: existingCount,
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_generated_today", existing_posts: existingCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

        if (postFormat === "carousel" && generated.slides && generated.slides.length > 0) {
          // Generate one image per slide (up to 2 to control cost)
          const slidesWithImages = await generateCarouselImages(
            supabase,
            generated.slides,
            imageVariant,
            scenario,
            games,
            todayStr,
            platform,
          );
          finalImageUrl = slidesWithImages[0]?.image_url ?? null;
          formatMetadata = { slides: slidesWithImages };

        } else if (postFormat === "poll" && generated.poll_options) {
          // Poll posts: generate image for context, store options in metadata
          formatMetadata = {
            options:          generated.poll_options,
            duration_minutes: 1440,
          };
          if (VISUAL_PLATFORMS.has(platform)) {
            try {
              const imgPrompt = generated.image_prompt ??
                buildImagePromptForVariant(imageVariant, scenario, games);
              finalImageUrl = await generateAndUploadImage(supabase, imgPrompt, todayStr, platform, "0");
            } catch (imgErr) {
              console.warn(`Poll image generation failed for ${platform}:`, (imgErr as Error).message);
            }
          }

        } else if (postFormat === "link") {
          // Link posts (Reddit): no image, store link metadata
          formatMetadata = {
            link_title: generated.link_title ?? generated.text.split("\n")[0],
            url:        Deno.env.get("NORMA_APP_URL") ?? "https://norma-app.com",
          };

        } else {
          // Standard post: generate single image
          if (VISUAL_PLATFORMS.has(platform) && (generated.image_prompt || games.length > 0)) {
            try {
              const imgPrompt = generated.image_prompt ??
                buildImagePromptForVariant(imageVariant, scenario, games);
              finalImageUrl = await generateAndUploadImage(supabase, imgPrompt, todayStr, platform, "0");
            } catch (imgErr) {
              console.warn(`Image generation failed for ${platform}:`, (imgErr as Error).message);
            }
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
            image_prompt:    generated.image_prompt ?? null,
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
// generateAndUploadImage — DALL-E 3 + Supabase Storage
// ---------------------------------------------------------------------------

async function generateAndUploadImage(
  supabase: SupabaseClient,
  prompt: string,
  dateStr: string,
  platform: string,
  suffix: string,
): Promise<string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not set");

  const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:           "dall-e-3",
      prompt,
      n:               1,
      size:            "1024x1024",
      quality:         "standard",
      response_format: "url",
    }),
  });

  if (!dalleRes.ok) {
    const err = await dalleRes.text();
    throw new Error(`DALL-E 3 failed ${dalleRes.status}: ${err.slice(0, 200)}`);
  }

  const dalleData = await dalleRes.json();
  const tempUrl: string = dalleData?.data?.[0]?.url;
  if (!tempUrl) throw new Error("DALL-E 3: no url in response");

  const imgRes = await fetch(tempUrl);
  if (!imgRes.ok) throw new Error(`Failed to download DALL-E image: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();

  // Path: {date}/{platform}-{suffix}.png (suffix differentiates carousel slides)
  const storagePath = `${dateStr}/${platform}-${suffix}.png`;

  const { error: uploadError } = await supabase.storage
    .from("social-images")
    .upload(storagePath, imgBytes, {
      contentType: "image/png",
      upsert:      true,
    });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage
    .from("social-images")
    .getPublicUrl(storagePath);

  return publicData.publicUrl as string;
}

// ---------------------------------------------------------------------------
// generateCarouselImages — generates images for each slide
// ---------------------------------------------------------------------------

async function generateCarouselImages(
  supabase: SupabaseClient,
  slides: Array<{ caption: string; image_prompt: string | null; image_url?: string | null }>,
  imageVariant: ImageVariant,
  scenario: Scenario,
  games: GameData[],
  dateStr: string,
  platform: string,
): Promise<Array<{ caption: string; image_prompt: string | null; image_url: string | null }>> {
  const result = [];

  // Generate images for first 2 slides (control cost — slide 3 reuses slide 2 or a static graphic)
  for (let i = 0; i < Math.min(slides.length, 3); i++) {
    const slide = slides[i];
    let imageUrl: string | null = null;

    if (i < 2) {
      // Slides 0 and 1 get unique images
      // Slide 0: primary variant, slide 1: alternate variant for visual variety
      const variant: ImageVariant = i === 0 ? imageVariant : "graphic";
      const prompt = slide.image_prompt ?? buildImagePromptForVariant(variant, scenario, games);

      try {
        imageUrl = await generateAndUploadImage(supabase, prompt, dateStr, platform, String(i));
      } catch (err) {
        console.warn(`Carousel slide ${i} image failed:`, (err as Error).message);
      }
    } else {
      // Slide 2 (CTA): reuse slide 0's image URL (avoid 3rd DALL-E call)
      imageUrl = result[0]?.image_url ?? null;
    }

    result.push({
      caption:      slide.caption,
      image_prompt: slide.image_prompt,
      image_url:    imageUrl,
    });
  }

  return result;
}

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
