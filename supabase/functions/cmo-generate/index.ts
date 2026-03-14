// =============================================================================
// NORMA CMO Agent — cmo-generate Edge Function
// Generates 2-4 social media posts via Claude and inserts them as drafts.
// Invoked by pg_cron every 6 hours and optionally via HTTP.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
}

interface GeneratedPost {
  body: string;
  hashtags: string[];
  content_type: string;
  theme: string;
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
const ANTHROPIC_MODEL = "claude-opus-4-6";
const MAX_TWEET_LENGTH = 280;

// Optimal posting windows in Eastern Time (converted to UTC offset logic handled at scheduling)
// 11:00 AM ET = 16:00 UTC (EST) / 15:00 UTC (EDT)
// 2:00 PM ET  = 19:00 UTC (EST) / 18:00 UTC (EDT)
// 6:00 PM ET  = 23:00 UTC (EST) / 22:00 UTC (EDT)
// 9:00 PM ET  = 02:00 UTC next day (EST) / 01:00 UTC (EDT)
const POSTING_WINDOWS_UTC_EST = [16, 19, 23, 26]; // 26 = 02:00 next day

// Content theme rotation — we pick themes based on the day of week + hour
// so content stays varied across the week.
const CONTENT_THEMES = [
  "user_benefit_never_miss",
  "user_benefit_bet_resolved",
  "advertiser_highest_intent",
  "advertiser_viewability",
  "tech_vickrey_auction",
  "tech_thompson_sampling",
  "cultural_sports_moment",
  "app_launch_hype",
  "referral_growth",
  "moment_types_showcase",
  "social_proof_engagement",
] as const;

type ContentTheme = typeof CONTENT_THEMES[number];

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
// Select themes to generate based on time of day / day of week
// ---------------------------------------------------------------------------

function selectThemes(now: Date, count: number): ContentTheme[] {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
  const hourUTC = now.getUTCHours();

  // Weight themes by context
  // Weekends: heavier sports culture and user benefit
  // Weekdays morning: advertiser-focused (brand planners read Twitter AM)
  // Evenings: user-facing / launch hype (bettors are active)

  let weights: Partial<Record<ContentTheme, number>> = {};

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend: heavy user and cultural content
    weights = {
      cultural_sports_moment: 5,
      user_benefit_never_miss: 4,
      user_benefit_bet_resolved: 4,
      moment_types_showcase: 3,
      app_launch_hype: 3,
      social_proof_engagement: 3,
      referral_growth: 2,
      advertiser_highest_intent: 1,
      advertiser_viewability: 1,
      tech_vickrey_auction: 1,
      tech_thompson_sampling: 1,
    };
  } else if (hourUTC >= 12 && hourUTC <= 16) {
    // Weekday business hours: advertiser-forward
    weights = {
      advertiser_highest_intent: 5,
      advertiser_viewability: 4,
      tech_vickrey_auction: 4,
      tech_thompson_sampling: 3,
      app_launch_hype: 2,
      user_benefit_never_miss: 2,
      moment_types_showcase: 2,
      cultural_sports_moment: 1,
      referral_growth: 1,
      user_benefit_bet_resolved: 1,
      social_proof_engagement: 1,
    };
  } else {
    // Weekday evenings/nights: mixed, slightly user-forward
    weights = {
      user_benefit_never_miss: 4,
      user_benefit_bet_resolved: 4,
      moment_types_showcase: 3,
      app_launch_hype: 3,
      cultural_sports_moment: 3,
      referral_growth: 2,
      social_proof_engagement: 2,
      advertiser_highest_intent: 2,
      tech_vickrey_auction: 2,
      advertiser_viewability: 1,
      tech_thompson_sampling: 1,
    };
  }

  // Weighted random selection without replacement
  const pool: ContentTheme[] = [];
  for (const [theme, weight] of Object.entries(weights)) {
    for (let i = 0; i < (weight as number); i++) {
      pool.push(theme as ContentTheme);
    }
  }

  // Fisher-Yates shuffle then pick `count` unique themes
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected: ContentTheme[] = [];
  const seen = new Set<ContentTheme>();
  for (const theme of shuffled) {
    if (!seen.has(theme)) {
      selected.push(theme);
      seen.add(theme);
    }
    if (selected.length >= count) break;
  }

  // Fallback if somehow we don't have enough unique themes
  for (const theme of CONTENT_THEMES) {
    if (selected.length >= count) break;
    if (!seen.has(theme)) {
      selected.push(theme);
      seen.add(theme);
    }
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Calculate next optimal posting windows
// Returns an array of ISO timestamp strings for the next `count` windows.
// ---------------------------------------------------------------------------

function getNextPostingWindows(count: number): string[] {
  const now = new Date();
  const windows: Date[] = [];

  // We define windows in UTC hours, approximating ET (EST = UTC-5)
  // 11 AM ET => 16:00 UTC, 2 PM ET => 19:00 UTC,
  // 6 PM ET => 23:00 UTC, 9 PM ET => 02:00 UTC next day
  const windowHoursUTC = [16, 19, 23, 26]; // 26 means next day 02:00

  // Start from today (UTC)
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);

  let dayOffset = 0;
  while (windows.length < count) {
    for (const hour of windowHoursUTC) {
      if (windows.length >= count) break;
      const candidate = new Date(baseDate);
      candidate.setUTCDate(baseDate.getUTCDate() + dayOffset);
      // Handle hour >= 24 (wraps to next day)
      if (hour >= 24) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(hour - 24, 0, 0, 0);
      } else {
        candidate.setUTCHours(hour, 0, 0, 0);
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
    }));

  console.log(
    `[cmo-generate] Claude returned ${posts.length} posts, ${validated.length} valid. ` +
      `Tokens: in=${data.usage?.input_tokens ?? "?"} out=${data.usage?.output_tokens ?? "?"}`,
  );

  return validated;
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

  // Compute posting schedule — assign each post to the next available window
  const postingWindows = getNextPostingWindows(generatedPosts.length);
  console.log(`[cmo-generate] Posting windows: ${postingWindows.join(", ")}`);

  // Build database records
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const records: ContentCalendarInsert[] = generatedPosts.map((post, idx) => ({
    platform: PLATFORM,
    content_type: post.content_type,
    body: post.body,
    media_urls: [],
    hashtags: post.hashtags,
    status: "draft",
    scheduled_for: postingWindows[idx] ?? postingWindows[postingWindows.length - 1],
    generation_prompt: `theme:${post.theme} | model:${ANTHROPIC_MODEL} | run:${now.toISOString()}`,
  }));

  // Insert into Supabase
  const { data: insertedRows, error: insertError } = await supabase
    .from("content_calendar")
    .insert(records)
    .select("id, scheduled_for, body");

  if (insertError) {
    console.error(`[cmo-generate] Supabase insert error: ${insertError.message}`);
    return new Response(
      JSON.stringify({ error: "Database insert failed", details: insertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[cmo-generate] Successfully inserted ${insertedRows?.length ?? 0} draft posts.`);

  return new Response(
    JSON.stringify({
      success: true,
      generated: insertedRows?.length ?? 0,
      posts: insertedRows?.map((r) => ({
        id: r.id,
        scheduled_for: r.scheduled_for,
        preview: r.body?.slice(0, 80) + (r.body?.length > 80 ? "…" : ""),
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
