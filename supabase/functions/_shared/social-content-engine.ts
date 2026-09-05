// social-content-engine.ts
// Claude API integration + NORMA brand voice for social media content generation
//
// Enhancement Pack (migration 030):
//   - Model upgraded: claude-haiku → claude-sonnet-4-6
//   - Platform-optimal publish times
//   - Image style A/B variants (cinematic | graphic | lifestyle)
//   - Platform-native format support (carousel | poll | link | standard)
//   - Hashtag injection from social_hashtag_performance
//   - Updated system prompt includes format instructions + top hashtags

import { pickConsumerScreenshotFilename } from "./social-media-select.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Scenario rotation — ordered to prevent weekly repeats (rotated by day-of-year) */
export const SCENARIOS = [
  "dinner",
  "gym",
  "grocery_store",
  "wedding_reception",
  "work_meeting",
  "bar_trivia",
  "kids_soccer_game",
  "treadmill",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

/** Character archetypes — rotated by day */
export const CHARACTER_ANGLES = [
  "hero",             // User who checked NORMA and won
  "jealous_partner",  // Someone watching their friend use NORMA
  "late_friend",      // Person who didn't use NORMA and paid for it
] as const;

export type CharacterAngle = (typeof CHARACTER_ANGLES)[number];

/** Post format per platform + post type */
export type PostFormat = "standard" | "carousel" | "poll" | "link";

/** Image style variant for A/B testing */
export type ImageVariant = "cinematic" | "graphic" | "lifestyle";

/**
 * Subreddit selection by sport key.
 * - ncaaf → r/CFB (game discussion; r/CFBBetting for wager content)
 * - nfl   → r/sportsbook (r/nfl bans self-promo; stay on sportsbook for NFL)
 * - ncaam → r/CollegeBasketball
 * - nba   → r/sportsbook (per existing default)
 * - mlb   → r/sportsbook (per existing default)
 */
export const SPORT_SUBREDDITS: Record<string, string> = {
  ncaaf: "CFB",
  nfl:   "sportsbook",
  ncaam: "CollegeBasketball",
  nba:   "sportsbook",
  mlb:   "sportsbook",
};

/**
 * Legacy post_type → subreddit map (used as fallback when sport is unknown).
 * Kept for backward compatibility with callers that don't pass a sport.
 */
export const PLATFORM_SUBREDDITS: Record<string, string> = {
  game_preview: "CollegeBasketball",
  norma_knew:   "CollegeBasketball",
  recap:        "CollegeBasketballPicks",
  app_promo:    "sportsbetting",
};
export const DEFAULT_SUBREDDIT = "sportsbook";

/**
 * Resolve the subreddit for a Reddit post, sport-first.
 * Falls back to post_type map, then DEFAULT_SUBREDDIT.
 */
export function resolveSubreddit(sport: string | null | undefined, postType: string): string {
  if (sport && SPORT_SUBREDDITS[sport]) return SPORT_SUBREDDITS[sport];
  return PLATFORM_SUBREDDITS[postType] ?? DEFAULT_SUBREDDIT;
}

/** Platforms that require branded images */
export const VISUAL_PLATFORMS = new Set(["instagram", "tiktok", "x"]);

// ---------------------------------------------------------------------------
// Platform-optimal publish times (Central Time, DST-aware)
// Four daily CT windows: 7 AM, 11 AM, 3 PM, 7 PM
// ---------------------------------------------------------------------------

/** Returns -5 (CDT, summer) or -6 (CST, winter) for the given UTC date */
function getCTOffsetHours(date: Date): number {
  const year = date.getUTCFullYear();
  // Second Sunday in March at 2 AM CST = 8 AM UTC
  const mar1Day = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - mar1Day) % 7) + 7, 8, 0, 0));
  // First Sunday in November at 2 AM CDT = 7 AM UTC
  const nov1Day = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1Day) % 7), 7, 0, 0));
  return (date >= dstStart && date < dstEnd) ? -5 : -6;
}

/** Each platform is assigned to one of the four daily CT posting windows */
const PLATFORM_CT_HOURS: Record<string, number> = {
  x:         7,  // 7 AM CT — morning news cycle
  instagram: 11, // 11 AM CT — midday engagement peak
  facebook:  15, // 3 PM CT — afternoon peak
  tiktok:    19, // 7 PM CT — evening scroll session
  reddit:    11, // 11 AM CT — active discussion window
};

/** Returns an ISO timestamp for a post to be published at the platform's CT posting window */
export function getOptimalPublishTime(platform: string, dateStr: string): string {
  const ctHour = PLATFORM_CT_HOURS[platform] ?? 11;
  const refDate = new Date(`${dateStr}T00:00:00.000Z`);
  const ctOffset = getCTOffsetHours(refDate); // -5 or -6
  const utcHour = ctHour - ctOffset;          // e.g. 7 - (-5) = 12 in CDT
  if (utcHour >= 24) {
    // 7 PM CT rolls past UTC midnight — publish on the next UTC day
    const next = new Date(refDate);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextStr = next.toISOString().split("T")[0];
    return `${nextStr}T${String(utcHour - 24).padStart(2, "0")}:00:00.000Z`;
  }
  return `${dateStr}T${String(utcHour).padStart(2, "0")}:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Image variant A/B testing
// ---------------------------------------------------------------------------

/** Rotate image style by day-of-year: 0=cinematic, 1=graphic, 2=lifestyle */
export function getImageVariant(dayOfYear: number): ImageVariant {
  const variants: ImageVariant[] = ["cinematic", "graphic", "lifestyle"];
  return variants[dayOfYear % 3];
}


// ---------------------------------------------------------------------------
// Platform-native post format selection
// ---------------------------------------------------------------------------

/** Determine the best post format for a platform + post type combination */
export function getPostFormat(platform: string, postType: string): PostFormat {
  if (platform === "instagram" && postType === "game_preview") return "carousel";
  if (platform === "x"         && postType === "game_preview") return "poll";
  if (platform === "reddit"    && postType === "app_promo")    return "link";
  return "standard";
}

// ---------------------------------------------------------------------------
// Platform rules
// ---------------------------------------------------------------------------

const PLATFORM_RULES: Record<string, string> = {
  x: `- Maximum 280 characters (count carefully — this is a hard limit)
- Punchy and direct — no filler, every word earns its place
- 2–3 hashtags max, placed at the very end
- No emojis unless they genuinely add meaning
- Strong hook in the first 5 words`,

  instagram: `- 150–300 character caption body (before hashtags)
- Emoji-forward: 3–5 emojis woven naturally into the text
- 8–12 hashtags at end (mix: branded #NORMAapp, broad #SportsBetting #NBA #MLB, niche #NBAPlayoffs #GameDay)
- Hook in first 125 chars (everything after is hidden behind "more")
- Conversational, vibey, feels like a smart friend's story`,

  facebook: `- 200–400 characters total
- Conversational, emotionally resonant — write like a smart friend sharing something
- NO hashtags (they don't help on Facebook)
- Soft call to action at the end (not a hard sell)
- Storytelling tone — paint the scene briefly`,

  tiktok: `- Hook FIRST — first 3 words MUST stop the scroll
- Maximum 150 characters total
- 3–5 hashtags: #fyp and 2–4 niche ones (#NBA #MLB #SportsBetting #GameDay #NBAPlayoffs)
- TikTok-native: use "POV:" or "the way" framing when it fits naturally
- High energy, present tense`,

  reddit: `- ZERO hashtags — they look like spam on Reddit
- Community-first: add genuine value, don't hard sell
- Write like a real community member sharing something interesting
- Mention NORMA naturally once — not as an ad, as a tool you actually use
- Match subreddit voice: collegial on r/CFB and r/CollegeBasketball, analytical on r/sportsbook`,
};

// ---------------------------------------------------------------------------
// System prompt builder (updated: format + hashtag injection)
// ---------------------------------------------------------------------------

function getFormatInstructions(platform: string, format: PostFormat): string {
  if (format === "carousel" && platform === "instagram") {
    return `

FORMAT: CAROUSEL (3 slides — each gets its own image and caption)
Return ONLY this JSON structure (no "text" key for carousels):
{
  "slides": [
    { "caption": "Slide 1 — the hook, shown on feed preview. Make this the best line." },
    { "caption": "Slide 2 — the key stat, game detail, or NORMA's insight." },
    { "caption": "Slide 3 — CTA: download NORMA, be like the hero. End strong." }
  ]
}
Use all Instagram platform rules for each caption. Include the full hashtag block only on slide 3.`;
  }

  if (format === "poll" && platform === "x") {
    return `

FORMAT: TWEET + POLL
Return ONLY this JSON structure:
{
  "text": "The tweet body (max 220 chars — leave room for the poll). End before the poll choices.",
  "poll_options": ["Option A (max 25 chars)", "Option B (max 25 chars)"]
}
The poll should ask fans to predict a game outcome or pick a winner. 2 options only. Keep each option under 25 characters.`;
  }

  if (format === "link" && platform === "reddit") {
    return `

FORMAT: REDDIT LINK POST
Return ONLY this JSON structure:
{
  "text": "The post body — community-first, genuine value, mention NORMA naturally. No hashtags.",
  "link_title": "A compelling Reddit title (max 100 chars) — hook without clickbait"
}`;
  }

  return `
OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "text": "[complete post content ready to publish]"
}`;
}

/** Map a sport key to the human-readable league label used in prompts. */
function getSportLabel(sport: string | null | undefined): string {
  const labels: Record<string, string> = {
    ncaaf: "NCAA Football",
    nfl:   "NFL Football",
    nba:   "NBA Basketball",
    mlb:   "MLB Baseball",
    ncaam: "NCAA Basketball",
  };
  return labels[sport ?? ""] ?? "sports";
}

export function buildSystemPrompt(
  platform: string,
  format: PostFormat = "standard",
  topHashtags: string[] = [],
  sport?: string | null,
): string {
  const rules = PLATFORM_RULES[platform] ?? PLATFORM_RULES.x;
  const formatInstructions = getFormatInstructions(platform, format);

  const hashtagHint = topHashtags.length > 0
    ? `\nTOP-PERFORMING HASHTAGS — prioritize these when selecting hashtags (they have proven engagement on ${platform}):\n${topHashtags.slice(0, 12).join("  ")}\n`
    : "";

  // Sport-conditional prompt header (item 2)
  const sportLabel = getSportLabel(sport);

  return `You are crafting social media content for NORMA — a sports prediction app for NCAA football, NFL, NCAA basketball, NBA, and MLB.

NORMA PERSONA:
- NORMA is she/her. Brilliant, calm, omniscient. She already knows what's going to happen.
- Tagline: "This B*tch is Brilliant"
- Tone: Dry wit meets quiet confidence. Think: poker prodigy who never loses but never brags.
- Voice: Sophisticated without being aloof. Never surprised — she already knew.
- Humor rules: Never mean-spirited. Never tech-bro. Never cringe. NORMA is absurdly competent and you know it.

WHAT NORMA DOES:
- Sends real-time alerts for NCAA football, NFL, NCAA basketball, NBA, and MLB — exactly when to tune in
- Tracks wagers and tells users when their bet is live and on the line
- Cuts through noise: no endless stats, just the one moment that actually matters
- She's not a chatbot. She's a precision instrument in human form.

TODAY'S SPORT CONTEXT: ${sportLabel}
WRITE CONTENT ABOUT THE ACTUAL GAMES PROVIDED BELOW. Match the sport's vocabulary — football uses downs, red zone, covers the spread, backdoor cover, red-zone stand, primetime slate, RedZone channel window; basketball uses possessions, fouls, buzzer; baseball uses innings and runs. Do not force one sport's framing onto another.

FOOTBALL BETTING VOCABULARY (use when sport is ncaaf or nfl):
- "backdoor cover" — late scoring that changes the spread outcome
- "red-zone stand" — defense holds inside the 20
- "primetime slate" — Sunday or Monday night nationally-televised games
- "RedZone channel window" — multi-game simultaneous coverage
- "covers the spread" — team beats the point spread

THREE CHARACTER ARCHETYPES:
🏆 HERO — The user who checked NORMA at the perfect moment and won big
💔 JEALOUS PARTNER — Watching your friend use NORMA while you sit there without it
⏰ LATE FRIEND — Didn't check NORMA. Missed the moment. Suffered the completely avoidable consequences.

PLATFORM RULES FOR ${platform.toUpperCase()}:
${rules}
${hashtagHint}${formatInstructions}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameData {
  id: string;
  home_team?: string | null;
  away_team?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  /** Sport key from the games.sport column (ncaaf, nfl, ncaam, nba, mlb). */
  sport?: string | null;
  [key: string]: unknown;
}

export interface CarouselSlide {
  caption: string;
  /**
   * DISPLAY ONLY — stored as DB metadata from Claude's JSON response.
   * NEVER pass this to an image generation API (DALL-E, Stable Diffusion, etc.).
   * All images come exclusively from real NORMA app screenshots via selectScreenshotUrl().
   */
  image_prompt: string | null;
  image_url?: string | null; // filled in by selectScreenshotUrl
}

export interface GeneratedContent {
  text: string;
  /**
   * DISPLAY ONLY — stored as DB metadata from Claude's JSON response.
   * NEVER pass this to an image generation API (DALL-E, Stable Diffusion, etc.).
   * All images come exclusively from real NORMA app screenshots via selectScreenshotUrl().
   */
  image_prompt: string | null;
  // Carousel format
  slides?: CarouselSlide[];
  // Poll format
  poll_options?: string[];
  // Link format (Reddit)
  link_title?: string;
}

// ---------------------------------------------------------------------------
// generatePostContent — calls Claude Sonnet to produce platform-native copy
// ---------------------------------------------------------------------------

export async function generatePostContent(
  platform: string,
  gameData: GameData[],
  postType: string,
  scenario: Scenario,
  characterAngle: CharacterAngle,
  format: PostFormat = "standard",
  topHashtags: string[] = [],
  /** Optional sport override. If omitted, derived from the first game's sport field. */
  sportOverride?: string | null,
): Promise<GeneratedContent> {
  // Derive the active sport from the override, then from the first game, then null.
  const activeSport: string | null =
    sportOverride ?? gameData[0]?.sport ?? null;

  const systemPrompt = buildSystemPrompt(platform, format, topHashtags, activeSport);

  const gamesText = gameData.length > 0
    ? gameData
        .map((g) => {
          const home = g.home_team ?? "Home Team";
          const away = g.away_team ?? "Away Team";
          const time = g.scheduled_at
            ? new Date(g.scheduled_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
              }) + " ET"
            : "TBD";
          const scores = (g.home_score != null && g.away_score != null)
            ? ` (Final: ${away} ${g.away_score}, ${home} ${g.home_score})`
            : "";
          return `${away} @ ${home} — ${time}${scores}`;
        })
        .join("\n")
    : "No games scheduled today — general NORMA content day";

  const scenarioLabel = scenario.replace(/_/g, " ");
  const angleDescriptions: Record<CharacterAngle, string> = {
    hero:            "THE HERO — the person who used NORMA and won (celebrate them, make readers want to be them)",
    jealous_partner: "THE JEALOUS PARTNER — watching someone else use NORMA with barely concealed envy",
    late_friend:     "THE LATE FRIEND — the one who skipped NORMA and suffered the completely predictable consequences",
  };

  // Sport-conditional section header for the user prompt (item 2)
  const sportSectionLabel = getSportLabel(activeSport).toUpperCase() + " GAMES";

  const userPrompt = `Generate a ${platform} post for NORMA.

TODAY'S ${sportSectionLabel}:
${gamesText}

POST TYPE: ${postType}
${postType === "game_preview" ? "Write a preview post hyping today's games through NORMA's perspective." : ""}
${postType === "norma_knew"  ? "Write a post about NORMA correctly predicting something — she knew before anyone else did. Use actual scores if provided above." : ""}
${postType === "recap"       ? "Write a post recapping today's completed games from NORMA's 'I told you so' perspective. Reference actual scores." : ""}
${postType === "app_promo"   ? "Write a post promoting NORMA — what she does, why you need her." : ""}

SCENARIO: ${scenarioLabel}
The scene is set at a ${scenarioLabel}. Ground the NORMA moment in this real-life context.

CHARACTER ANGLE: ${angleDescriptions[characterAngle]}

Create content that feels completely native to ${platform}. The scenario sets the scene. The character angle tells you whose story this is. Make it feel real, not like an ad.`;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text ?? "";

  // Strip markdown fences if Claude wraps the JSON
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: {
    text?: string;
    image_prompt?: string | null;
    slides?: CarouselSlide[];
    poll_options?: string[];
    link_title?: string;
  };

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    parsed = { text: rawText.trim(), image_prompt: null };
  }

  // Carousel format
  if (format === "carousel" && parsed.slides && parsed.slides.length > 0) {
    return {
      text: parsed.slides[0]?.caption ?? rawText.trim(),
      image_prompt: parsed.slides[0]?.image_prompt ?? null,
      slides: parsed.slides,
    };
  }

  // Poll format
  if (format === "poll" && parsed.poll_options && parsed.poll_options.length >= 2) {
    return {
      text: parsed.text ?? rawText.trim(),
      image_prompt: parsed.image_prompt ?? null,
      poll_options: parsed.poll_options,
    };
  }

  // Link format (Reddit)
  if (format === "link" && parsed.link_title) {
    return {
      text: parsed.text ?? rawText.trim(),
      image_prompt: null,
      link_title: parsed.link_title,
    };
  }

  return {
    text: parsed.text ?? rawText.trim(),
    image_prompt: parsed.image_prompt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Screenshot selection — maps post type to real app screenshot URLs
// ---------------------------------------------------------------------------

const SCREENSHOT_BASE = "norma-screenshots";

/**
 * Returns a public Supabase Storage URL for the screenshot that best fits
 * the post type. slideIndex allows carousel slides to get different images.
 *
 * Consumer auto-posts never receive settings / connections / Tier-C chrome
 * (sportsbooks-manual.png, sportsbooks-email.png, tv-providers.png, etc.).
 * Football-aware callers should pass `{ sport }` so alert / Why Now / red-zone
 * assets stay first.
 *
 * ENFORCEMENT: This is the ONLY function permitted to provide image URLs for
 * social posts. It exclusively returns real NORMA app screenshots stored in
 * Supabase Storage. No AI image generation (DALL-E, Stable Diffusion, etc.)
 * is used anywhere in the social publishing pipeline.
 */
export function selectScreenshotUrl(
  supabaseUrl: string,
  postType: string,
  slideIndex = 0,
  options?: { sport?: string | null },
): string {
  const filename = pickConsumerScreenshotFilename(postType, slideIndex, options);
  return `${supabaseUrl}/storage/v1/object/public/social-images/${SCREENSHOT_BASE}/${filename}`;
}

// ---------------------------------------------------------------------------
// Helpers — scenario + angle rotation by day
// ---------------------------------------------------------------------------

/** Get today's scenario by rotating through SCENARIOS based on day-of-year */
export function getTodayScenario(): Scenario {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return SCENARIOS[dayOfYear % SCENARIOS.length];
}

/** Get today's character angle by day-of-week */
export function getTodayCharacterAngle(): CharacterAngle {
  const dow = new Date().getDay(); // 0=Sun ... 6=Sat
  return CHARACTER_ANGLES[dow % CHARACTER_ANGLES.length];
}

/** Get the day-of-year for today (used for image variant + scenario rotation) */
export function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Day-of-week cadence weighting (item 7)
// ---------------------------------------------------------------------------

/**
 * Returns the recommended number of social posts to generate for a given
 * day-of-week and active sport set.
 *
 * Rationale: NFL Sundays and NCAAF Saturdays concentrate 10-60+ games into
 * a single day — the standard 4-post minimum is too low to capture that
 * energy, and the standard 8-post ceiling is appropriate only for game days.
 * Weekday practice/news days warrant a lighter schedule (4 posts).
 *
 * @param dayOfWeek  0 = Sunday … 6 = Saturday (matches Date.getDay())
 * @param activeSports  Array of sport keys active this season (e.g. ['ncaaf', 'nfl', 'ncaam'])
 * @returns Recommended post count for the day (between 4 and 8 inclusive)
 */
export function getDailyPostCount(
  dayOfWeek: number,
  activeSports: string[],
): number {
  const hasFootball = activeSports.some((s) => s === "ncaaf" || s === "nfl");
  const hasBasketball = activeSports.some((s) => s === "ncaam" || s === "nba");

  if (hasFootball) {
    // Saturday: NCAAF slate (50+ games) → max posts
    if (dayOfWeek === 6) return 8;
    // Sunday: NFL primary slate + SNF → max posts
    if (dayOfWeek === 0) return 8;
    // Thursday: TNF single game — still elevated
    if (dayOfWeek === 4) return 6;
    // Monday: MNF recap + hype → slightly elevated
    if (dayOfWeek === 1) return 6;
  }

  if (hasBasketball) {
    // NBA/NCAAB games cluster Tue–Sat; slight boost on those days
    if (dayOfWeek >= 2 && dayOfWeek <= 6) return 6;
  }

  // Default: standard minimum
  return 4;
}
