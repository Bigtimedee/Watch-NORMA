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

/** Subreddit selection by post_type */
export const PLATFORM_SUBREDDITS: Record<string, string> = {
  game_preview: "CollegeBasketball",
  norma_knew:   "CollegeBasketball",
  recap:        "CollegeBasketballPicks",
  app_promo:    "sportsbetting",
};
export const DEFAULT_SUBREDDIT = "sportsbook";

/** Platforms that require branded images */
export const VISUAL_PLATFORMS = new Set(["instagram", "tiktok", "x"]);

// ---------------------------------------------------------------------------
// Platform-optimal publish times (UTC)
// Targeting US Eastern audience (EST = UTC-5, EDT = UTC-4)
// ---------------------------------------------------------------------------

/** Returns an ISO timestamp for a post to be published at the platform's optimal time */
export function getOptimalPublishTime(platform: string, dateStr: string): string {
  const PLATFORM_UTC_HOURS: Record<string, number> = {
    x:         13, // 8 AM EST — morning news cycle
    instagram: 14, // 9 AM EST — morning engagement peak
    facebook:  18, // 1 PM EST — lunch-hour peak
    tiktok:    23, // 6 PM EST — evening scroll session
    reddit:    14, // 9 AM EST — active discussion window
  };
  const hour = PLATFORM_UTC_HOURS[platform] ?? 14;
  return `${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Image variant A/B testing
// ---------------------------------------------------------------------------

/** Rotate image style by day-of-year: 0=cinematic, 1=graphic, 2=lifestyle */
export function getImageVariant(dayOfYear: number): ImageVariant {
  const variants: ImageVariant[] = ["cinematic", "graphic", "lifestyle"];
  return variants[dayOfYear % 3];
}

/** Build a DALL-E 3 prompt for the given image style variant */
export function buildImagePromptForVariant(
  variant: ImageVariant,
  scenario: Scenario,
  games: GameData[],
): string {
  const visual = SCENARIO_VISUAL_MAP[scenario] ?? {
    lighting: "warm ambient lighting",
    context: "casual everyday setting",
  };
  const gameContext = games.length > 0
    ? `${games[0]?.away_team ?? "Away Team"} vs ${games[0]?.home_team ?? "Home Team"} NCAA basketball`
    : "NCAA basketball alert";

  switch (variant) {
    case "cinematic":
      return (
        `Cinematic Apple-aesthetic smartphone screen close-up, ` +
        `${visual.lighting}, ` +
        `thin glowing NORMA notification line on phone display, ` +
        `close-up finger-tap moment on screen, ` +
        `${gameContext}, ` +
        `${visual.context}, ` +
        `broadcast sports color palette (deep navy, bright white, electric orange accent), ` +
        `premium minimalist photography style, no visible text overlays, ` +
        `shallow depth of field, 8K resolution quality`
      );

    case "graphic":
      return (
        `Bold graphic design sports poster, deep navy background, ` +
        `electric orange geometric accent lines, ` +
        `large clean modern sans-serif typography layout, ` +
        `NORMA app icon centered, ` +
        `${gameContext} — stats and matchup displayed as clean data visualization, ` +
        `premium broadcast graphic design aesthetic, ` +
        `no real text overlays — only design shapes and color blocks`
      );

    case "lifestyle":
      return (
        `Authentic lifestyle photograph, ${visual.context}, ` +
        `${visual.lighting}, ` +
        `person casually holding smartphone in a natural ${scenario.replace(/_/g, " ")} setting, ` +
        `phone screen subtly illuminated with an alert glow, ` +
        `warm candid moment, unposed and genuine, ` +
        `premium lifestyle photography with shallow depth of field, ` +
        `no visible text or app UI details`
      );
  }
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
// Visual context for DALL-E prompts per scenario
// ---------------------------------------------------------------------------

const SCENARIO_VISUAL_MAP: Record<Scenario, { lighting: string; context: string }> = {
  dinner:            { lighting: "warm restaurant candlelight",       context: "elegant dinner table, wine glasses, soft bokeh background" },
  gym:               { lighting: "cool gym fluorescent lighting",     context: "blurred weight racks, water bottle, wireless earbuds on bench" },
  grocery_store:     { lighting: "bright grocery store lighting",     context: "shopping cart handle, produce aisle color, casual setting" },
  wedding_reception: { lighting: "warm golden reception lighting",    context: "dance floor background, elegant table setting, formal attire" },
  work_meeting:      { lighting: "soft office overhead lighting",     context: "blurred conference room, laptop edge, coffee cup" },
  bar_trivia:        { lighting: "dim bar neon lighting",             context: "bar counter, neon sign glow, blurred TV screens" },
  kids_soccer_game:  { lighting: "bright afternoon outdoor sunlight", context: "soccer field sideline, bleachers, grass, casual sportswear" },
  treadmill:         { lighting: "gym mirror reflection lighting",    context: "treadmill display edge, running shoes, gym floor" },
};

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
- 8–12 hashtags at end (mix: branded #NORMAapp, broad #MarchMadness, niche #CollegeBasketball)
- Hook in first 125 chars (everything after is hidden behind "more")
- Conversational, vibey, feels like a smart friend's story`,

  facebook: `- 200–400 characters total
- Conversational, emotionally resonant — write like a smart friend sharing something
- NO hashtags (they don't help on Facebook)
- Soft call to action at the end (not a hard sell)
- Storytelling tone — paint the scene briefly`,

  tiktok: `- Hook FIRST — first 3 words MUST stop the scroll
- Maximum 150 characters total
- 3–5 hashtags: #fyp and 2–4 niche ones (#CollegeBasketball #SportsBetting #GameDay)
- TikTok-native: use "POV:" or "the way" framing when it fits naturally
- High energy, present tense`,

  reddit: `- ZERO hashtags — they look like spam on Reddit
- Community-first: add genuine value, don't hard sell
- Write like a real community member sharing something interesting
- Mention NORMA naturally once — not as an ad, as a tool you actually use
- Match subreddit voice: collegial on r/CollegeBasketball, analytical on r/sportsbook`,
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
    { "caption": "Slide 1 — the hook, shown on feed preview. Make this the best line.", "image_prompt": "DALL-E prompt for slide 1 image" },
    { "caption": "Slide 2 — the key stat, game detail, or NORMA's insight.", "image_prompt": "DALL-E prompt for slide 2 (different angle from slide 1)" },
    { "caption": "Slide 3 — CTA: download NORMA, be like the hero. End strong.", "image_prompt": "DALL-E prompt for slide 3 (lifestyle or graphic style)" }
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
  "poll_options": ["Option A (max 25 chars)", "Option B (max 25 chars)"],
  "image_prompt": "DALL-E prompt or null"
}
The poll should ask fans to predict a game outcome or pick a winner. 2 options only. Keep each option under 25 characters.`;
  }

  if (format === "link" && platform === "reddit") {
    return `

FORMAT: REDDIT LINK POST
Return ONLY this JSON structure:
{
  "text": "The post body — community-first, genuine value, mention NORMA naturally. No hashtags.",
  "link_title": "A compelling Reddit title (max 100 chars) — hook without clickbait",
  "image_prompt": null
}`;
  }

  return `
OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "text": "[complete post content ready to publish]",
  "image_prompt": "[DALL-E 3 prompt for a branded image, or null if not needed]"
}`;
}

export function buildSystemPrompt(
  platform: string,
  format: PostFormat = "standard",
  topHashtags: string[] = [],
): string {
  const rules = PLATFORM_RULES[platform] ?? PLATFORM_RULES.x;
  const formatInstructions = getFormatInstructions(platform, format);

  const hashtagHint = topHashtags.length > 0
    ? `\nTOP-PERFORMING HASHTAGS — prioritize these when selecting hashtags (they have proven engagement on ${platform}):\n${topHashtags.slice(0, 12).join("  ")}\n`
    : "";

  return `You are crafting social media content for NORMA — an NCAA basketball prediction app.

NORMA PERSONA:
- NORMA is she/her. Brilliant, calm, omniscient. She already knows what's going to happen.
- Tagline: "This B*tch is Brilliant"
- Tone: Dry wit meets quiet confidence. Think: poker prodigy who never loses but never brags.
- Voice: Sophisticated without being aloof. Never surprised — she already knew.
- Humor rules: Never mean-spirited. Never tech-bro. Never cringe. NORMA is absurdly competent and you know it.

WHAT NORMA DOES:
- Sends real-time NCAA basketball alerts — exactly when to tune in
- Tracks wagers and tells users when their bet is live and on the line
- Cuts through noise: no endless stats, just the one moment that actually matters
- She's not a chatbot. She's a precision instrument in human form.

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
  [key: string]: unknown;
}

export interface CarouselSlide {
  caption: string;
  image_prompt: string | null;
  image_url?: string | null; // filled in after DALL-E generation
}

export interface GeneratedContent {
  text: string;
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
): Promise<GeneratedContent> {
  const systemPrompt = buildSystemPrompt(platform, format, topHashtags);

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

  const userPrompt = `Generate a ${platform} post for NORMA.

TODAY'S NCAA BASKETBALL GAMES:
${gamesText}

POST TYPE: ${postType}
${postType === "game_preview" ? "Write a preview post hyping today's games through NORMA's perspective." : ""}
${postType === "norma_knew"  ? "Write a post about NORMA correctly predicting something — she knew before anyone else did. Use actual scores if provided above." : ""}
${postType === "recap"       ? "Write a post recapping today's completed games from NORMA's 'I told you so' perspective. Reference actual scores." : ""}
${postType === "app_promo"   ? "Write a post promoting NORMA — what she does, why you need her." : ""}

SCENARIO: ${scenarioLabel}
The scene is set at a ${scenarioLabel}. Ground the NORMA moment in this real-life context.

CHARACTER ANGLE: ${angleDescriptions[characterAngle]}

Create content that feels completely native to ${platform}. The scenario sets the scene. The character angle tells you whose story this is. Make it feel real, not like an ad.

For image prompts: describe a cinematic, Apple-aesthetic close-up of a phone screen showing a NORMA notification, set in a ${scenarioLabel} environment. Premium minimalist style. No text overlays. Broadcast colors.`;

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
// generateImagePrompt — fallback DALL-E 3 prompt (standard cinematic)
// ---------------------------------------------------------------------------

export function generateImagePrompt(scenario: Scenario, gameData: GameData[]): string {
  return buildImagePromptForVariant("cinematic", scenario, gameData);
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
