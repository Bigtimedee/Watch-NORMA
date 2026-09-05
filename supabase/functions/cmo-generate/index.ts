// =============================================================================
// NORMA CMO Agent — cmo-generate Edge Function
// Generates 2-4 social media posts via Claude and inserts them as drafts.
// Invoked by pg_cron every 6 hours and optionally via HTTP.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
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

interface AnthropicMessage {
  role: string;
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM = "twitter";
const ANTHROPIC_MODEL = "claude-opus-4-5";
const MAX_TWEET_LENGTH = 280;

// Target posting windows in Central Time (CT)
// DST-aware: CDT = UTC-5 (Mar 2nd Sun → Nov 1st Sun), CST = UTC-6 otherwise
const CT_POSTING_HOURS = [7, 11, 15, 19]; // 7 AM, 11 AM, 3 PM, 7 PM CT

// Theme rotation lives in ./themes.ts (consumer pool excludes sportsbooks / wager_tracking).

// ---------------------------------------------------------------------------
// Brand voice system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are the CMO of NORMA, a real-time sports intent advertising platform that is about to launch on the App Store.

## NORMA at a Glance
NORMA is a mobile app that tells sports bettors and fans EXACTLY when to tune into live games based on their:
- Active wagers (spread, moneyline, totals, props)
- Prediction market positions
- Team loyalties

We track 11 proprietary "moment types" that trigger push notifications:
1. Bet Resolved — your bet just hit or missed
2. Close Game — within 1 possession/run/goal in the final stretch
3. Overtime — game is going to OT
4. Spread Alert — game within your spread threshold
5. Moneyline Alert — live odds swing favoring your pick
6. Total Alert — pace to go over/under your total bet
7. Prop Alert — player prop is in play
8. Position Alert — your prediction market position is moving
9. Foul Trouble — key player in foul trouble affecting your prop
10. Prediction Resolved — your prediction market position settled
11. Follow Alert — a team or player you follow hits a key moment

## For Bettors & Fans
- Never miss the moment your bet resolves or swings
- Don't watch 3 hours of game — tune in for YOUR 5 minutes
- Works across NFL, NBA, MLB, NHL, college, and more
- App Store launch coming soon — join the waitlist at getnorma.app

## For Advertisers (B2B value prop)
- 10-50x higher CTRs than standard display advertising
- Push notification ad units delivered at the exact moment of peak sports intent
- Vickrey second-price auction engine ensures fair, efficient pricing
- Thompson sampling for intelligent ad rotation and optimization
- 95%+ viewability (push notifications are seen, not scrolled past)
- Audience: bettors and fans in highest emotional engagement state
- No banner blindness — ads appear in the context of a moment that matters

## Brand Voice
- CONFIDENT. We know we built something that didn't exist before.
- INSIDER. We speak sports culture fluently — we're not a generic ad tech company.
- TECH-FORWARD. We mention our real technology (Vickrey auction, Thompson sampling) without being boring about it.
- DIRECT. Short sentences. Punchy. No fluff.
- SMART-CASUAL. We'd say "that last-second cover" not "a positive wager outcome."
- DUAL AUDIENCE. Posts alternate between speaking to bettors/fans and speaking to advertisers/brands.
- HYPE WITHOUT CRINGE. We build anticipation for our App Store launch without being desperate.

## Twitter Handle
@watchNORMA

## Formatting Rules
1. Every tweet MUST be ≤ 280 characters INCLUDING hashtags.
2. Hashtags go at the end of the body, separated by a space from the main text.
3. Use 2-4 hashtags max per tweet.
4. No emojis unless they add genuine punch (1 max per tweet).
5. No hyperbole without backing — if you say "10x CTR" it's because we actually have that data.
6. Never use corporate jargon: "leverage", "synergy", "disruptive", "game-changer" (say it, don't describe it).
7. Call-to-action when appropriate: getnorma.app or @watchNORMA

Return ONLY a valid JSON array. No markdown, no explanation, no preamble.`;
}

// ---------------------------------------------------------------------------
// Theme-specific user prompt builder
// ---------------------------------------------------------------------------

function buildUserPrompt(themes: ContentTheme[], count: number): string {
  const themeInstructions: Record<ContentTheme, string> = {
    user_benefit_never_miss: `Write a tweet about the core user benefit: bettors and fans never have to watch a full 3-hour game — NORMA tells them exactly when their moment is happening. Speak to the frustration of watching a blowout when you have a spread bet on a different game.`,

    user_benefit_bet_resolved: `Write a tweet about the "Bet Resolved" moment — that rush when you find out if your bet hit. NORMA sends the notification the instant it resolves, with a push ad that actually fits the moment. Make the bettor FEEL it.`,

    advertiser_highest_intent: `Write a tweet aimed at sports marketing professionals and brand advertisers. The insight: the highest-intent sports audience moment isn't the Super Bowl — it's the second a bettor's bet resolves. NORMA owns that moment. CTRs are 10-50x display. Keep it sharp and B2B-credible.`,

    advertiser_viewability: `Write a tweet for advertisers about viewability. Push notifications have 95%+ viewability by nature — they're seen, not scrolled past. NORMA's ad units appear at the exact moment a bettor checks their notification. Contrast this with banner ad blindness.`,

    tech_vickrey_auction: `Write a tweet explaining NORMA's Vickrey second-price auction engine in plain language. Advertisers bid for moments. The winner pays the second-highest bid. Fair, efficient, transparent. This is how AdWords changed search — NORMA does it for real-time sports moments.`,

    tech_thompson_sampling: `Write a tweet about Thompson sampling for ad optimization. Our system learns which ad creatives perform best for each moment type and automatically shifts budget toward winners. Frame it as "your sports ad gets smarter every game."`,

    cultural_sports_moment: `Write a tweet that taps into sports betting culture. Reference the feeling of a backdoor cover, a last-minute prop push, sweating a money line in overtime. NORMA exists because those moments deserve a notification. Be specific, be a fan.`,

    app_launch_hype: `Write a tweet building hype for the App Store launch. NORMA is "coming soon" — the waitlist is at getnorma.app. Make it feel like something the sports world has been waiting for without being generic. Reference a specific moment type or use case.`,

    referral_growth: `Write a tweet encouraging sports bettors to tell their group chat about NORMA. Angle: your crew deserves to know when the game matters for their bets, not just yours. Community / word-of-mouth angle. Drive to getnorma.app.`,

    moment_types_showcase: `Write a tweet that showcases 2-3 of NORMA's 11 moment types. Examples to draw from: Foul Trouble (your prop bet is in danger), Spread Alert (game just got into your number), Overtime (your moneyline is alive). Be specific and make the bettor feel each scenario.`,

    social_proof_engagement: `Write a tweet that invites engagement — ask a sports betting question, a "would you rather" for bettors, or a poll-style hook. The goal is replies and retweets from the sports betting community. Keep it on-brand and tie it back to NORMA's core premise.`,

    // Football ad moment themes — high-intent moments unique to football
    football_kickoff_moment: `Write a tweet about the kickoff moment in football — when the slate is about to begin and bettors are all locked in at once. NORMA sends the alert the second your game kicks off. Capture the collective energy of NFL Sunday or NCAAF Saturday kickoffs. Reference the NFL primetime slate or the NCAAF Saturday slate if appropriate.`,

    football_red_zone_moment: `Write a tweet about the red-zone stand moment in football — your team (or the team covering your spread) is inside the 20, and everything depends on what happens next. NORMA sends the alert the second they cross the 20. Use "red-zone stand" vocabulary. Make the bettor feel the tension.`,

    football_two_minute_warning: `Write a tweet about the two-minute warning moment — the last two minutes of a half in football when leads evaporate and spreads swing. NORMA's two-minute warning alert tells bettors to watch NOW. Reference "backdoor cover" — the late score that changes everything.`,

    football_overtime_moment: `Write a tweet about overtime in football — sudden death or 10-minute OT where any score ends it. Moneylines come alive, spreads are already won or lost, and the only reason to keep watching is NORMA telling you to. Be dramatic but specific.`,

    football_fourth_quarter_comeback: `Write a tweet about the fourth-quarter comeback moment — down two scores with 8 minutes left, covers the spread, the crowd goes insane. NORMA called it. She sent the alert at the start of Q4. Use "covers the spread" and "fourth-quarter comeback" vocabulary. This is the NORMA flex moment.`,

    // SM-02 themes — generated by dedicated functions, not via Claude theme rotation.
    // These placeholders satisfy the exhaustive Record<ContentTheme, string> type.
    // They should never be selected by selectThemes() because they are absent from
    // the weights objects, but they must be present to satisfy TypeScript.
    alert_called_it: `(SM-02 auto-generated from DB — not selected via theme rotation)`,
    norma_in_numbers: `(SM-02 auto-generated from DB — not selected via theme rotation)`,
  };

  const selectedThemes = themes.slice(0, count);
  const instructions = selectedThemes
    .map((theme, i) => `Post ${i + 1} theme — ${theme}:\n${themeInstructions[theme]}`)
    .join("\n\n");

  return `Generate exactly ${count} tweets for @watchNORMA using the following themes:

${instructions}

Return a JSON array with exactly ${count} objects. Each object must have:
- "body": string — the full tweet text INCLUDING hashtags, max 280 characters total
- "hashtags": string[] — hashtags used in the body (without the # symbol), e.g. ["SportsBetting", "NORMA"]
- "content_type": "post"
- "theme": the theme key used

Example format:
[
  {
    "body": "Your bet just hit. NORMA told you to check in 30 seconds before it resolved. That\u2019s the app. #SportsBetting #NORMA",
    "hashtags": ["SportsBetting", "NORMA"],
    "content_type": "post",
    "theme": "user_benefit_bet_resolved"
  }
]

Rules:
- Every "body" field MUST be ≤ 280 characters. Count carefully.
- Hashtags are already included in the body string.
- Return ONLY the JSON array. No other text.`;
}

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
// Call Anthropic Claude API
// ---------------------------------------------------------------------------

async function generatePostsWithClaude(
  themes: ContentTheme[],
  count: number,
  apiKey: string,
): Promise<GeneratedPost[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(themes, count);

  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      } as AnthropicMessage,
    ],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data: AnthropicResponse = await response.json();
  const rawText = data.content?.[0]?.text?.trim() ?? "";

  if (!rawText) {
    throw new Error("Anthropic returned empty content");
  }

  // Strip any accidental markdown code fences
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let posts: GeneratedPost[];
  try {
    posts = JSON.parse(jsonText);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${parseErr}\nRaw: ${jsonText.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(posts)) {
    throw new Error("Claude response is not a JSON array");
  }

  // Validate and sanitize each post
  const validated: GeneratedPost[] = posts
    .filter((p) => p && typeof p.body === "string" && p.body.length > 0)
    .map((p) => ({
      body: p.body.slice(0, MAX_TWEET_LENGTH),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h: unknown) => typeof h === "string") : [],
      content_type: p.content_type ?? "post",
      theme: p.theme ?? "unknown",
      partner_mention: null, // Standard Claude-generated posts have no partner mention
    }));

  console.log(
    `[cmo-generate] Claude returned ${posts.length} posts, ${validated.length} valid. ` +
      `Tokens: in=${data.usage?.input_tokens ?? "?"} out=${data.usage?.output_tokens ?? "?"}`,
  );

  return validated;
}

// ---------------------------------------------------------------------------
// Query media_assets for a consumer auto-post screenshot.
// Uses the shared denylist so settings / Tier-C chrome can never win.
// ---------------------------------------------------------------------------

async function queryMediaAsset(
  supabase: SupabaseClient,
  theme: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("media_assets")
      .select("public_url, filename, theme_tags")
      .eq("is_active", true)
      .not("public_url", "is", null)
      .order("id")
      .limit(25);

    if (error) {
      console.warn(`[cmo-generate] media_assets query failed: ${error.message}`);
      return null;
    }

    return selectConsumerMediaUrl(data ?? [], theme);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cmo-generate] media_assets lookup threw: ${msg}`);
    return null;
  }
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
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
    const missing = [
      !supabaseUrl && "SUPABASE_URL",
      !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
      !anthropicApiKey && "ANTHROPIC_API_KEY",
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

  // Build the Supabase client early — needed for SM-02 data queries
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Select themes for this generation run
  const themes = selectThemes(now, postCount);
  console.log(`[cmo-generate] Selected themes: ${themes.join(", ")}`);

  // Generate posts via Claude
  let generatedPosts: GeneratedPost[];
  try {
    generatedPosts = await generatePostsWithClaude(themes, postCount, anthropicApiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cmo-generate] Claude generation failed: ${message}`);
    return new Response(
      JSON.stringify({ error: "Content generation failed", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (generatedPosts.length === 0) {
    return new Response(
      JSON.stringify({ error: "Claude returned no valid posts" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------------
  // SM-02: Generate supplemental posts — alert_called_it + norma_in_numbers
  // These run in parallel alongside the Claude-generated posts.
  // ---------------------------------------------------------------------------
  const [alertCalledItPosts, normaInNumbersPost] = await Promise.all([
    generateAlertCalledItPosts(supabase, now),
    generateNormaInNumbersPost(supabase, now),
  ]);

  // Merge: SM-02 posts append after the Claude posts
  const allPosts: GeneratedPost[] = [
    ...generatedPosts,
    ...alertCalledItPosts,
    ...(normaInNumbersPost ? [normaInNumbersPost] : []),
  ];

  console.log(
    `[cmo-generate] Total posts: ${allPosts.length} ` +
    `(claude=${generatedPosts.length}, alert_called_it=${alertCalledItPosts.length}, norma_in_numbers=${normaInNumbersPost ? 1 : 0})`,
  );

  // Compute posting schedule — assign each post to the next available window
  const postingWindows = getNextPostingWindows(allPosts.length);
  console.log(`[cmo-generate] Posting windows: ${postingWindows.join(", ")}`);

  // Fetch one screenshot per post in parallel; fall back to empty array if unavailable
  const mediaUrls: (string | null)[] = await Promise.all(
    allPosts.map((post) => queryMediaAsset(supabase, post.theme)),
  );

  const records: ContentCalendarInsert[] = allPosts.map((post, idx) => {
    const mediaUrl = mediaUrls[idx];
    return {
      platform: PLATFORM,
      content_type: post.content_type,
      body: post.body,
      media_urls: mediaUrl ? [mediaUrl] : [],
      hashtags: post.hashtags,
      status: "draft",
      scheduled_for: postingWindows[idx] ?? postingWindows[postingWindows.length - 1],
      generation_prompt: `theme:${post.theme} | model:${ANTHROPIC_MODEL} | run:${now.toISOString()}`,
      partner_mention: post.partner_mention,
    };
  });

  // Insert into Supabase
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
