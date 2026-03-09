// generate-recap-content: Daily 11pm UTC — post-game norma_knew content
// Trigger: pg_cron job 'generate-recap-content' (migration 031)
//
// Runs after most NCAA games conclude. Generates "norma_knew" posts with
// actual final scores for each active platform, scheduled for the next
// morning's platform-optimal publish window.
//
// This is NORMA's highest-value content type: "She told you. Final: Duke 78, UNC 71."
// Real results make the brand promise concrete.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  generatePostContent,
  buildImagePromptForVariant,
  getOptimalPublishTime,
  getImageVariant,
  getDayOfYear,
  getTodayCharacterAngle,
  VISUAL_PLATFORMS,
  type GameData,
  type Scenario,
} from "../_shared/social-content-engine.ts";

// Game status values that indicate a completed game
const COMPLETED_STATUSES = ["final", "closed", "complete", "F", "STATUS_FINAL"];

const PLATFORMS = ["x", "instagram", "facebook", "tiktok", "reddit"] as const;

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

    // -----------------------------------------------------------------------
    // Idempotency — skip if recap posts already exist for tomorrow
    // -----------------------------------------------------------------------
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { count: existingRecapCount } = await supabase
      .from("social_posts")
      .select("*", { count: "exact", head: true })
      .eq("post_type", "norma_knew")
      .gte("scheduled_for", `${tomorrowStr}T00:00:00.000Z`);

    if ((existingRecapCount ?? 0) > 0) {
      console.log(JSON.stringify({
        function:       "generate-recap-content",
        event:          "skipped_already_generated",
        existing_posts: existingRecapCount,
        timestamp:      new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "recap_already_generated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // Fetch today's completed games with final scores
    // -----------------------------------------------------------------------
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStr   = todayStart.toISOString().split("T")[0];
    const tomorrowEnd = new Date(todayStart.getTime() + 86_400_000).toISOString();

    const { data: completedGames } = await supabase
      .from("games")
      .select("id, home_team, away_team, home_score, away_score, status, scheduled_at")
      .in("status", COMPLETED_STATUSES)
      .gte("scheduled_at", `${todayStr}T00:00:00.000Z`)
      .lt("scheduled_at", tomorrowEnd)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    const games: GameData[] = completedGames ?? [];

    if (games.length === 0) {
      console.log(JSON.stringify({
        function:  "generate-recap-content",
        event:     "no_completed_games",
        date:      todayStr,
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_completed_games", date: todayStr }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // Fetch active social accounts
    // -----------------------------------------------------------------------
    const { data: accountRows, error: accountsError } = await supabase
      .from("social_accounts")
      .select("platform, account_id, metadata, requires_approval")
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
    // Determine scenario + angle for recap content
    // For norma_knew posts, HERO angle almost always wins — she called it,
    // user who listened won. Override to hero on recap day.
    // -----------------------------------------------------------------------
    const dayOfYear       = getDayOfYear();
    const imageVariant    = getImageVariant(dayOfYear);
    const characterAngle  = "hero" as const; // NORMA knew — hero angle fits perfectly
    const scenario: Scenario = pickRecapScenario(games);
    const primaryGameId   = games[0]?.id ?? null;

    // -----------------------------------------------------------------------
    // Generate recap content per active platform
    // -----------------------------------------------------------------------
    const results: Array<{ platform: string; status: "generated" | "failed"; error?: string }> = [];

    for (const platform of PLATFORMS) {
      if (!activeAccounts.has(platform)) continue;

      const account = activeAccounts.get(platform)!;
      // Schedule for tomorrow morning at platform-optimal time
      const scheduledFor = getOptimalPublishTime(platform, tomorrowStr);

      try {
        // Top hashtags for this platform
        const topHashtags = await getTopHashtags(supabase, platform);

        // Generate norma_knew content with actual scores
        const generated = await generatePostContent(
          platform,
          games,        // includes final scores
          "norma_knew",
          scenario,
          characterAngle,
          "standard",   // recap posts are always standard format
          topHashtags,
        );

        // Generate image for visual platforms
        let finalImageUrl: string | null = null;
        if (VISUAL_PLATFORMS.has(platform)) {
          try {
            const imgPrompt = generated.image_prompt ??
              buildImagePromptForVariant(imageVariant, scenario, games);
            finalImageUrl = await generateAndUploadImage(
              supabase,
              imgPrompt,
              `${tomorrowStr}-recap`,
              platform,
            );
          } catch (imgErr) {
            console.warn(`Recap image failed for ${platform}:`, (imgErr as Error).message);
          }
        }

        const approvalStatus = account.requires_approval ? "pending_approval" : "auto_approved";

        const { error: insertError } = await supabase
          .from("social_posts")
          .insert({
            platform,
            status:          "generated",
            post_type:       "norma_knew",
            scenario,
            character_angle: characterAngle,
            content_text:    generated.text,
            image_prompt:    generated.image_prompt ?? null,
            image_url:       finalImageUrl,
            game_id:         primaryGameId,
            scheduled_for:   scheduledFor,
            generated_at:    new Date().toISOString(),
            image_variant:   imageVariant,
            post_format:     "standard",
            format_metadata: {},
            approval_status: approvalStatus,
          });

        if (insertError) throw new Error(insertError.message);

        results.push({ platform, status: "generated" });
      } catch (err) {
        const errMsg = (err as Error).message;
        console.error(`generate-recap-content: ${platform} error:`, errMsg);

        await supabase
          .from("social_posts")
          .insert({
            platform,
            status:          "failed",
            post_type:       "norma_knew",
            scenario,
            character_angle: characterAngle,
            game_id:         primaryGameId,
            scheduled_for:   getOptimalPublishTime(platform, tomorrowStr),
            error_detail:    errMsg.slice(0, 500),
          });

        results.push({ platform, status: "failed", error: errMsg });
      }
    }

    const generatedCount = results.filter((r) => r.status === "generated").length;
    const failedCount    = results.filter((r) => r.status === "failed").length;

    console.log(JSON.stringify({
      function:        "generate-recap-content",
      event:           "completed",
      posts_generated: generatedCount,
      posts_failed:    failedCount,
      games_used:      games.length,
      scheduled_for:   tomorrowStr,
      duration_ms:     Date.now() - startedAt,
      timestamp:       new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true, generated: generatedCount, failed: failedCount, games_used: games.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-recap-content fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Pick a relevant scenario for recap posts
// "Bar trivia" and "work meeting" feel right for post-game morning content
// ---------------------------------------------------------------------------

function pickRecapScenario(games: GameData[]): Scenario {
  const RECAP_SCENARIOS: Scenario[] = ["bar_trivia", "work_meeting", "gym", "treadmill"];
  const dayOfYear = getDayOfYear();
  return RECAP_SCENARIOS[dayOfYear % RECAP_SCENARIOS.length];
}

// ---------------------------------------------------------------------------
// generateAndUploadImage — DALL-E 3 + Supabase Storage
// ---------------------------------------------------------------------------

async function generateAndUploadImage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  prompt: string,
  datePrefix: string,
  platform: string,
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

  const storagePath = `${datePrefix}/${platform}-recap.png`;

  const { error: uploadError } = await supabase.storage
    .from("social-images")
    .upload(storagePath, imgBytes, { contentType: "image/png", upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage
    .from("social-images")
    .getPublicUrl(storagePath);

  return publicData.publicUrl as string;
}

// ---------------------------------------------------------------------------
// Top hashtags from social_hashtag_performance
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function getTopHashtags(supabase: any, platform: string): Promise<string[]> {
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
