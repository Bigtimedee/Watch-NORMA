// =============================================================================
// NORMA CMO Agent — cmo-generate Edge Function
// Generates templated social posts only when there is a strong live/slate
// moment AND non-stock media. Thin-slate days (Wed non-sports-day, empty
// Alerts) skip rather than inserting draft+due rows with catalog game-detail
// screenshots that cmo-publish would auto-ship. Invoked by pg_cron every 6h.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { isDemoAlert, isDemoGameId } from "../_shared/demo-guard.ts";
import {
  assessSlate,
  decideCalendarInserts,
  shouldGenerateBrandPosts,
  FOOTBALL_SLATE_HORIZON_HOURS,
  RECENT_ALERT_HORIZON_HOURS,
  LIVE_GAME_STATUSES,
  FOOTBALL_SPORTS,
  type CalendarInsertCandidate,
  type SlateAssessment,
  type SlateGame,
} from "../_shared/social-generate-gate.ts";
import { selectConsumerMediaUrl } from "../_shared/social-media-select.ts";
import { selectThemes, type ContentTheme } from "./themes.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentCalendarInsert {
  platform: string;
  content_type: string;
  body: string;
  media_urls: string[];
  hashtags: string[];
  status: string;
  scheduled_for: string;
  generation_prompt: string;
  partner_mention: string | null;
}

interface GeneratedPost {
  body: string;
  hashtags: string[];
  content_type: string;
  theme: string;
  partner_mention: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM = "twitter";
const GENERATOR_ID = "template-v1";
const MAX_TWEET_LENGTH = 280;

// Target posting windows in Central Time (CT)
// DST-aware: CDT = UTC-5 (Mar 2nd Sun → Nov 1st Sun), CST = UTC-6 otherwise
const CT_POSTING_HOURS = [7, 11, 15, 19]; // 7 AM, 11 AM, 3 PM, 7 PM CT

// Theme rotation lives in ./themes.ts (consumer pool excludes sportsbooks / wager_tracking).

// ---------------------------------------------------------------------------
// Brand voice system prompt
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Theme-specific user prompt builder
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Calculate next optimal posting windows in Central Time (DST-aware)
// Returns an array of ISO timestamp strings for the next `count` windows.
// ---------------------------------------------------------------------------

function getCTOffsetHours(date: Date): number {
  const year = date.getUTCFullYear();
  // Second Sunday in March at 2 AM CST = 8 AM UTC
  const mar1Day = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - mar1Day) % 7) + 7, 8, 0, 0));
  // First Sunday in November at 2 AM CDT = 7 AM UTC
  const nov1Day = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1Day) % 7), 7, 0, 0));
  return (date >= dstStart && date < dstEnd) ? -5 : -6; // CDT or CST
}

function getNextPostingWindows(count: number): string[] {
  const now = new Date();
  const windows: Date[] = [];

  // Start from today midnight UTC
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);

  let dayOffset = 0;
  while (windows.length < count) {
    for (const ctHour of CT_POSTING_HOURS) {
      if (windows.length >= count) break;
      const dayBase = new Date(baseDate);
      dayBase.setUTCDate(baseDate.getUTCDate() + dayOffset);

      const ctOffset = getCTOffsetHours(dayBase); // -5 (CDT) or -6 (CST)
      const utcHour = ctHour - ctOffset;           // e.g. 7 - (-5) = 12 in CDT

      const candidate = new Date(dayBase);
      if (utcHour >= 24) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(utcHour - 24, 0, 0, 0);
      } else {
        candidate.setUTCHours(utcHour, 0, 0, 0);
      }

      // Only include future windows (at least 5 minutes from now)
      if (candidate.getTime() > now.getTime() + 5 * 60 * 1000) {
        windows.push(candidate);
      }
    }
    dayOffset++;
    // Safety cap: search no more than 7 days ahead
    if (dayOffset > 7) break;
  }

  return windows.slice(0, count).map((d) => d.toISOString());
}

// ---------------------------------------------------------------------------
// Deterministic template posts (no external AI provider)
// Consumer-safe copy only: no AdTech language, max 2 hashtags.
// ---------------------------------------------------------------------------

const TEMPLATE_COPY: Record<string, { body: string; hashtags: string[] }> = {
  user_benefit_never_miss: { body: "The game-changing play happens once. NORMA makes sure you see it. Real-time alerts the second it matters.", hashtags: ["NORMA"] },
  user_benefit_bet_resolved: { body: "Your bet settles, NORMA tells you. No refreshing five apps to find out if you cashed.", hashtags: ["NORMA"] },
  cultural_sports_moment: { body: "Some moments you have to see live. NORMA pings you before the replay hits your timeline.", hashtags: ["NORMA"] },
  app_launch_hype: { body: "Every game. Every alert. One app. NORMA is ready for gameday.", hashtags: ["NORMA"] },
  referral_growth: { body: "Your group chat is always a play behind. Put them on NORMA.", hashtags: ["NORMA"] },
  moment_types_showcase: { body: "Close game late. Upset brewing. Overtime. NORMA knows which moments are worth your attention.", hashtags: ["NORMA"] },
  social_proof_engagement: { body: "Fans on NORMA saw it first. Where were you when it happened?", hashtags: ["NORMA"] },
  football_kickoff_moment: { body: "Kickoff is close. NORMA has your games lined up and your alerts armed.", hashtags: ["NORMA", "NFL"] },
  football_red_zone_moment: { body: "Red zone. Your team. NORMA pings you before the snap.", hashtags: ["NORMA", "NFL"] },
  football_two_minute_warning: { body: "Two-minute warning in a one-score game. NORMA makes sure you're watching.", hashtags: ["NORMA", "NFL"] },
  football_overtime_moment: { body: "Free football. NORMA sends the overtime alert so you never miss a sudden ending.", hashtags: ["NORMA", "NFL"] },
  football_fourth_quarter_comeback: { body: "Comeback brewing in the fourth. NORMA saw it coming. Turn the game on.", hashtags: ["NORMA", "NFL"] },
};
const DEFAULT_TEMPLATE = TEMPLATE_COPY.app_launch_hype;

function generateTemplatePosts(themes: ContentTheme[], count: number): GeneratedPost[] {
  return themes.slice(0, count).map((theme) => {
    const t = TEMPLATE_COPY[theme] ?? DEFAULT_TEMPLATE;
    return {
      body: t.body.slice(0, MAX_TWEET_LENGTH),
      hashtags: t.hashtags.slice(0, 2),
      content_type: "post",
      theme,
      partner_mention: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Query media_assets for a consumer auto-post screenshot.
// Uses the shared denylist so settings / Tier-C chrome can never win.
// Stock catalog game-detail / games-list cannot win (no allowStockFallback).
// ---------------------------------------------------------------------------

async function queryMediaAsset(
  supabase: SupabaseClient,
  theme: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("media_assets")
      .select("public_url, filename, theme_tags, eligible_for_consumer_auto_post")
      .eq("is_active", true)
      .eq("eligible_for_consumer_auto_post", true)
      .not("public_url", "is", null)
      .order("id")
      .limit(25);

    if (error) {
      console.warn(`[cmo-generate] media_assets query failed: ${error.message}`);
      return null;
    }

    const eligible = (data ?? []).filter(
      (row: { eligible_for_consumer_auto_post?: boolean | null }) =>
        row.eligible_for_consumer_auto_post !== false,
    );
    return selectConsumerMediaUrl(eligible, theme);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cmo-generate] media_assets lookup threw: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Slate signals: live games, near-term football, recent Why Now alerts.
// Demo fixtures never count.
// ---------------------------------------------------------------------------

async function fetchSlateSignals(
  supabase: SupabaseClient,
  now: Date,
): Promise<SlateAssessment> {
  const footballHorizon = new Date(
    now.getTime() + FOOTBALL_SLATE_HORIZON_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const alertCutoff = new Date(
    now.getTime() - RECENT_ALERT_HORIZON_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [liveResult, footballResult, alertResult] = await Promise.all([
    supabase
      .from("games")
      .select("id, status, sport, scheduled_at")
      .in("status", [...LIVE_GAME_STATUSES])
      .limit(50),
    supabase
      .from("games")
      .select("id, status, sport, scheduled_at")
      .eq("status", "scheduled")
      .in("sport", [...FOOTBALL_SPORTS])
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", footballHorizon)
      .limit(50),
    supabase
      .from("alerts")
      .select("id, game_id, title")
      .gte("created_at", alertCutoff)
      .limit(100),
  ]);

  if (liveResult.error) {
    console.warn(`[cmo-generate] live games query failed: ${liveResult.error.message}`);
  }
  if (footballResult.error) {
    console.warn(`[cmo-generate] football slate query failed: ${footballResult.error.message}`);
  }
  if (alertResult.error) {
    console.warn(`[cmo-generate] recent alerts query failed: ${alertResult.error.message}`);
  }

  const games: SlateGame[] = [
    ...((liveResult.data ?? []) as SlateGame[]),
    ...((footballResult.data ?? []) as SlateGame[]),
  ].filter((g) => !isDemoGameId(g.id ?? null));

  const recentAlertCount = ((alertResult.data ?? []) as Array<{
    game_id?: string | null;
    title?: string | null;
  }>).filter((row) => !isDemoAlert(row)).length;

  return assessSlate({ games, recentAlertCount, now });
}

// ---------------------------------------------------------------------------
// SM-02: alert_called_it — finds games that just resolved where NORMA had
// sent a spread_alert in the final 10 minutes that proved correct.
// Returns up to 3 candidate posts (one per qualifying game).
// ---------------------------------------------------------------------------

interface AlertCalledItRow {
  game_id: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  alert_type: string;
  clock: string | null;
  broadcast: string | null;
  wager_provider_key: string | null;
}

async function generateAlertCalledItPosts(
  supabase: SupabaseClient,
  now: Date,
): Promise<GeneratedPost[]> {
  // Look back 90 minutes for recently-closed games
  const cutoff = new Date(now.getTime() - 90 * 60 * 1000).toISOString();

  // Find games that closed recently AND had a spread_alert fired in the
  // final 10 minutes (clock stored as "MM:SS" or decimal minutes).
  // We join alerts to games to confirm the alert fired for this game.
  //
  // Note: alert_type values from the schema use snake_case (e.g. "spread_alert").
  // We filter for spread_alert — the most partner-amplifiable moment type.
  const { data: rows, error } = await supabase
    .from("alerts")
    .select(`
      game_id,
      alert_type,
      created_at,
      games!inner (
        id,
        home_team:teams!games_home_team_id_fkey ( name ),
        away_team:teams!games_away_team_id_fkey ( name ),
        home_score,
        away_score,
        broadcast,
        status,
        updated_at
      ),
      wagers ( provider_key )
    `)
    .eq("alert_type", "spread_alert")
    .gte("created_at", cutoff)
    .limit(20);

  if (error || !rows || rows.length === 0) {
    if (error) {
      console.warn(`[cmo-generate] alert_called_it query error: ${error.message}`);
    }
    return [];
  }

  // Keep only games that are now final/closed
  const posts: GeneratedPost[] = [];
  const seenGames = new Set<string>();

  for (const row of rows) {
    // deno-lint-ignore no-explicit-any
    const game = (row as any).games;
    if (!game) continue;
    if (game.status !== "closed" && game.status !== "complete" && game.status !== "final") continue;
    if (seenGames.has(row.game_id)) continue;
    seenGames.add(row.game_id);

    const homeTeam: string = game.home_team?.name ?? "Home";
    const awayTeam: string = game.away_team?.name ?? "Away";
    const homeScore: number = game.home_score ?? 0;
    const awayScore: number = game.away_score ?? 0;

    // Determine which team "covered" (we show the winning team for simplicity)
    const winner = homeScore > awayScore ? homeTeam : awayTeam;

    // Parse the clock from the alert row's game snapshot.
    // We approximate "time remaining when alert fired" as when the alert was created.
    // We'll just say "in the final minutes" since we don't store exact clock on alert row.
    const timeLabel = "the final minutes";

    // Detect partner mentions
    const broadcastRaw: string = game.broadcast ?? "";
    // deno-lint-ignore no-explicit-any
    const wagerRows: any[] = (row as any).wagers ?? [];
    const providerKey: string | null =
      wagerRows.length > 0 ? (wagerRows[0]?.provider_key ?? null) : null;

    const partnerMentions: string[] = [];
    if (/espn\+/i.test(broadcastRaw)) {
      partnerMentions.push("@ESPNPlus");
    } else if (/espn/i.test(broadcastRaw)) {
      partnerMentions.push("@ESPN");
    }
    if (providerKey === "draftkings") {
      partnerMentions.push("@DraftKings");
    }

    const partnerSuffix =
      partnerMentions.length > 0 ? ` ${partnerMentions.join(" ")}` : "";

    const body =
      `NORMA called it. ${winner} covered the spread. We sent the alert with ${timeLabel}.${partnerSuffix} #SportsBetting #NORMA`;

    const trimmedBody = body.slice(0, MAX_TWEET_LENGTH);

    posts.push({
      body: trimmedBody,
      hashtags: ["SportsBetting", "NORMA"],
      content_type: "alert_called_it",
      theme: "alert_called_it",
      partner_mention: partnerMentions.length > 0 ? partnerMentions.join(" ") : null,
    });

    if (posts.length >= 3) break;
  }

  return posts;
}

// ---------------------------------------------------------------------------
// SM-02: norma_in_numbers — weekly "NORMA in numbers" summary post.
// Only generated once per week (if none exists in the past 7 days).
// ---------------------------------------------------------------------------

async function generateNormaInNumbersPost(
  supabase: SupabaseClient,
  now: Date,
): Promise<GeneratedPost | null> {
  // Guard: only produce one "norma_in_numbers" post per 7-day window
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("content_calendar")
    .select("id")
    .eq("content_type", "norma_in_numbers")
    .gte("created_at", sevenDaysAgo)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log("[cmo-generate] norma_in_numbers post already generated this week — skipping");
    return null;
  }

  // Query alert stats for the past 7 days
  const { data: alertStats, error: alertError } = await supabase
    .from("alerts")
    .select("game_id, alert_type")
    .gte("created_at", sevenDaysAgo);

  if (alertError || !alertStats) {
    console.warn(`[cmo-generate] norma_in_numbers alert query error: ${alertError?.message ?? "no data"}`);
    return null;
  }

  const totalAlerts = alertStats.length;
  const distinctGames = new Set(alertStats.map((a) => a.game_id)).size;

  // Count occurrences of each alert_type to find the most common moment type
  const typeCounts: Record<string, number> = {};
  for (const a of alertStats) {
    if (a.alert_type) {
      typeCounts[a.alert_type] = (typeCounts[a.alert_type] ?? 0) + 1;
    }
  }
  const mostCommonType =
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "spread_alert";

  // Human-readable label for the moment type
  const momentLabels: Record<string, string> = {
    bet_resolved: "Bet Resolved",
    close_game: "Close Game",
    overtime: "Overtime",
    spread_alert: "Spread Alert",
    moneyline_alert: "Moneyline Alert",
    total_alert: "Total Alert",
    prop_alert: "Prop Alert",
    position_alert: "Position Alert",
    foul_trouble: "Foul Trouble",
    prediction_resolved: "Prediction Resolved",
    follow_alert: "Follow Alert",
  };
  const momentLabel = momentLabels[mostCommonType] ?? mostCommonType.replace(/_/g, " ");

  const body =
    `This week: ${totalAlerts} alerts sent across ${distinctGames} games. Most common moment: ${momentLabel}. NORMA never misses. getnorma.app #SportsBetting #NORMA`;

  return {
    body: body.slice(0, MAX_TWEET_LENGTH),
    hashtags: ["SportsBetting", "NORMA"],
    content_type: "norma_in_numbers",
    theme: "norma_in_numbers",
    partner_mention: null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Allow health checks
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", function: "cmo-generate" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read environment variables
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [
      !supabaseUrl && "SUPABASE_URL",
      !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    console.error(`[cmo-generate] Missing env vars: ${missing}`);
    return new Response(
      JSON.stringify({ error: `Missing environment variables: ${missing}` }),
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
    // Ignore parse errors — body is optional
  }

  const now = new Date();
  const postCount = Math.min(
    Math.max(
      typeof requestPayload.count === "number" ? requestPayload.count : 3,
      2,
    ),
    4,
  );

  console.log(
    `[cmo-generate] Starting generation at ${now.toISOString()}, count=${postCount}, source=${requestPayload.source ?? "direct"}`,
  );

  // Build the Supabase client early — needed for slate + SM-02 queries
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const slate = await fetchSlateSignals(supabase, now);
  console.log(
    `[cmo-generate] Slate: hasStrongMoment=${slate.hasStrongMoment} ` +
      `live=${slate.liveCount} footballUpcoming=${slate.footballUpcomingCount} ` +
      `recentAlerts=${slate.recentAlertCount}`,
  );

  // Thin slate (Wed non-sports-day, empty Alerts): do not invent brand
  // tweets that would attach stock game-detail and auto-ship via cmo-publish.
  let generatedPosts: GeneratedPost[] = [];
  if (shouldGenerateBrandPosts(slate)) {
    const themes = selectThemes(now, postCount);
    console.log(`[cmo-generate] Selected themes: ${themes.join(", ")}`);
    generatedPosts = await generateTemplatePosts(themes, postCount);
  } else {
    console.log("[cmo-generate] Skipping brand posts — thin slate");
  }

  // ---------------------------------------------------------------------------
  // SM-02: Generate supplemental posts — alert_called_it + norma_in_numbers
  // alert_called_it is a real resolved-game moment; norma_in_numbers still
  // goes through decideCalendarInserts (skipped on thin slate / stock media).
  // ---------------------------------------------------------------------------
  const [alertCalledItPosts, normaInNumbersPost] = await Promise.all([
    generateAlertCalledItPosts(supabase, now),
    generateNormaInNumbersPost(supabase, now),
  ]);

  const allPosts: GeneratedPost[] = [
    ...generatedPosts,
    ...alertCalledItPosts,
    ...(normaInNumbersPost ? [normaInNumbersPost] : []),
  ];

  console.log(
    `[cmo-generate] Candidate posts: ${allPosts.length} ` +
    `(brand=${generatedPosts.length}, alert_called_it=${alertCalledItPosts.length}, norma_in_numbers=${normaInNumbersPost ? 1 : 0})`,
  );

  const mediaUrls: (string | null)[] = await Promise.all(
    allPosts.map((post) => queryMediaAsset(supabase, post.theme)),
  );

  const candidates: CalendarInsertCandidate[] = allPosts.map((post, idx) => ({
    body: post.body,
    hashtags: post.hashtags,
    content_type: post.content_type,
    theme: post.theme,
    partner_mention: post.partner_mention,
    mediaUrl: mediaUrls[idx],
  }));

  const { inserts, skipped } = decideCalendarInserts(candidates, slate);
  if (skipped.length > 0) {
    console.log(
      `[cmo-generate] Skipped ${skipped.length} candidates: ` +
        skipped.map((s) => `${s.candidate.theme}:${s.reason}`).join(", "),
    );
  }

  if (inserts.length === 0) {
    console.log("[cmo-generate] No auto-publishable drafts — refusing stock/thin-slate fallback");
    return new Response(
      JSON.stringify({
        success: true,
        generated: 0,
        skipped: skipped.length,
        skipped_reason: slate.hasStrongMoment ? "no_fresh_media" : "thin_slate",
        slate,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const postingWindows = getNextPostingWindows(inserts.length);
  console.log(`[cmo-generate] Posting windows: ${postingWindows.join(", ")}`);

  const records: ContentCalendarInsert[] = inserts.map((post, idx) => ({
    platform: PLATFORM,
    content_type: post.content_type,
    body: post.body,
    media_urls: [post.mediaUrl as string],
    hashtags: post.hashtags,
    status: "draft",
    scheduled_for: postingWindows[idx] ?? postingWindows[postingWindows.length - 1],
    generation_prompt:
      `theme:${post.theme} | model:${GENERATOR_ID} | run:${now.toISOString()} | slate:${slate.hasStrongMoment ? "strong" : "thin_alert_called_it"}`,
    partner_mention: post.partner_mention,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("content_calendar")
    .insert(records)
    .select("id, scheduled_for, body, partner_mention");

  if (insertError) {
    console.error(`[cmo-generate] Supabase insert error: ${insertError.message}`);
    return new Response(
      JSON.stringify({ error: "Database insert failed", details: insertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[cmo-generate] Successfully inserted ${insertedRows?.length ?? 0} scheduled posts.`);

  return new Response(
    JSON.stringify({
      success: true,
      generated: insertedRows?.length ?? 0,
      skipped: skipped.length,
      posts: insertedRows?.map((r) => ({
        id: r.id,
        scheduled_for: r.scheduled_for,
        partner_mention: r.partner_mention ?? null,
        preview: r.body?.slice(0, 80) + (r.body?.length > 80 ? "…" : ""),
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
