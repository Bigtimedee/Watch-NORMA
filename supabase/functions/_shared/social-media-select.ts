// social-media-select.ts
// Shared allowlist / denylist for consumer auto-post media (organic social).
//
// Marketing confirmed (2026-09-05): @watchNORMA auto-posts were attaching
// dead settings chrome — Tier C sportsbook toggles — because
//   1. selectScreenshotUrl(app_promo) preferred "connections" → sportsbooks-manual.png
//   2. themeToTag("sportsbooks" | "wager_tracking") → media tag "sportsbooks"
//   3. sportsbooks-*.png also carried user_benefit, so the fallback tag hit them
//
// Advertiser-portal creative upload is a different path and is not gated here.
// Do not invent sportsbook partner-API screenshots. Do not use AI image gen.

/** Settings / connections / Tier-C chrome — never the default consumer auto-post image. */
export const CONSUMER_AUTO_POST_BANNED_FILENAMES: ReadonlySet<string> = new Set([
  "sportsbooks-manual.png",
  "sportsbooks-email.png",
  "tv-providers.png",
  "prediction-markets.png",
  "streaming-services.png",
]);

/** Catalog keys that resolve to settings / connections / Tier-C UI. */
export const CONSUMER_AUTO_POST_BANNED_KEYS: ReadonlySet<string> = new Set([
  "connections",
  "sportsbooks",
  "prediction_markets",
  "profile",
  "tv_providers",
  "streaming",
]);

/** Themes that must not rotate into the consumer auto-post pool. */
export const CONSUMER_AUTO_POST_EXCLUDED_THEMES: ReadonlySet<string> = new Set([
  "sportsbooks",
  "wager_tracking",
]);

/** Preferred media_assets.theme_tags, highest first. */
export const CONSUMER_AUTO_POST_PREFERRED_TAGS = [
  "alerts",
  "why_now",
  "red_zone",
  "never_miss",
  "live_games",
] as const;

/** Football-aware posts lead with red-zone / Why Now / alert assets. */
export const FOOTBALL_PREFERRED_TAGS = [
  "red_zone",
  "why_now",
  "alerts",
  "never_miss",
  "live_games",
] as const;

export const CONSUMER_AUTO_POST_FALLBACK_FILENAME = "game-detail-watch.png";

export const CONSUMER_SCREENSHOT_CATALOG = {
  games_list: "games-list.png",
  alerts: "game-detail-watch.png",
  game_detail: "game-detail-watch.png",
  // Kept for catalog completeness / explicit admin use. Banned from auto-select.
  connections: "sportsbooks-manual.png",
  sportsbooks: "sportsbooks-manual.png",
  prediction_markets: "prediction-markets.png",
  profile: "prediction-markets.png",
  tv_providers: "tv-providers.png",
  streaming: "streaming-services.png",
} as const;

export type ConsumerScreenshotKey = keyof typeof CONSUMER_SCREENSHOT_CATALOG;

/**
 * Consumer post-type preference order. Settings keys are omitted on purpose.
 * Football M1 post types (game_preview / norma_knew / recap) stay alert-first.
 */
export const CONSUMER_POST_TYPE_SCREENSHOTS: Record<string, ConsumerScreenshotKey[]> = {
  game_preview: ["alerts", "game_detail", "games_list"],
  norma_knew: ["alerts", "game_detail", "games_list"],
  recap: ["alerts", "game_detail", "games_list"],
  app_promo: ["alerts", "game_detail", "games_list"],
};

export function isFootballSport(sport: string | null | undefined): boolean {
  return sport === "ncaaf" || sport === "nfl";
}

export function isExcludedConsumerAutoPostTheme(theme: string): boolean {
  return CONSUMER_AUTO_POST_EXCLUDED_THEMES.has(theme);
}

export function filenameFromMediaUrl(url: string): string {
  const trimmed = url.split("?")[0] ?? url;
  const parts = trimmed.split("/");
  return parts[parts.length - 1] ?? trimmed;
}

export function isBannedConsumerFilename(filenameOrUrl: string): boolean {
  const name = filenameOrUrl.includes("/")
    ? filenameFromMediaUrl(filenameOrUrl)
    : filenameOrUrl;
  return CONSUMER_AUTO_POST_BANNED_FILENAMES.has(name);
}

export function isBannedConsumerScreenshotKey(key: string): boolean {
  return CONSUMER_AUTO_POST_BANNED_KEYS.has(key);
}

/**
 * Map a generation theme to a media_assets theme_tag.
 * sportsbooks / wager_tracking never map to the "sportsbooks" tag for
 * consumer auto-posts — they remap to alerts (or red_zone when football).
 */
export function themeToMediaTag(
  theme: string,
  options?: { sport?: string | null },
): string {
  const football = isFootballSport(options?.sport) || theme.startsWith("football_");

  if (isExcludedConsumerAutoPostTheme(theme)) {
    return football ? "red_zone" : "alerts";
  }
  if (theme === "football_red_zone_moment") return "red_zone";
  if (theme.startsWith("football_")) return football ? "red_zone" : "alerts";
  if (
    theme === "alert_called_it" ||
    theme === "user_benefit_bet_resolved" ||
    theme === "moment_types_showcase"
  ) {
    return "why_now";
  }
  if (theme === "user_benefit_never_miss" || theme === "norma_in_numbers") {
    return "never_miss";
  }
  // Do not use the "streaming" / "prediction_markets" / "sportsbooks" tags —
  // those match settings chrome in media_assets.
  if (theme === "streaming" || theme === "prediction_markets") {
    return football ? "red_zone" : "never_miss";
  }
  return football ? "red_zone" : "alerts";
}

export function preferredTagsForTheme(
  theme: string,
  options?: { sport?: string | null },
): string[] {
  const primary = themeToMediaTag(theme, options);
  const rest = isFootballSport(options?.sport) || theme.startsWith("football_")
    ? FOOTBALL_PREFERRED_TAGS
    : CONSUMER_AUTO_POST_PREFERRED_TAGS;
  return [primary, ...rest.filter((tag) => tag !== primary)];
}

/**
 * Pick a screenshot filename for a consumer auto-post.
 * Banned keys and banned filenames can never win.
 */
export function pickConsumerScreenshotFilename(
  postType: string,
  slideIndex = 0,
  options?: { sport?: string | null },
): string {
  const raw = CONSUMER_POST_TYPE_SCREENSHOTS[postType] ??
    CONSUMER_POST_TYPE_SCREENSHOTS.app_promo;
  let keys = raw.filter((key) => !isBannedConsumerScreenshotKey(key));

  if (isFootballSport(options?.sport)) {
    const footballFirst: ConsumerScreenshotKey[] = ["alerts", "game_detail", "games_list"];
    const preferred = footballFirst.filter((key) => keys.includes(key));
    const rest = keys.filter((key) => !preferred.includes(key));
    keys = [...preferred, ...rest];
  }

  if (keys.length === 0) return CONSUMER_AUTO_POST_FALLBACK_FILENAME;

  const key = keys[slideIndex % keys.length];
  const filename = CONSUMER_SCREENSHOT_CATALOG[key] ?? CONSUMER_AUTO_POST_FALLBACK_FILENAME;
  if (isBannedConsumerFilename(filename)) return CONSUMER_AUTO_POST_FALLBACK_FILENAME;
  return filename;
}

export interface MediaAssetRow {
  public_url?: string | null;
  filename?: string | null;
  theme_tags?: string[] | null;
}

/**
 * Rank active media_assets rows for a consumer auto-post.
 * Hard-excludes banned filenames even if they match the requested tag.
 */
export function selectConsumerMediaUrl(
  rows: MediaAssetRow[],
  theme: string,
  options?: { sport?: string | null },
): string | null {
  const tags = preferredTagsForTheme(theme, options);
  const eligible = rows.filter((row) => {
    if (!row.public_url) return false;
    const name = row.filename || filenameFromMediaUrl(row.public_url);
    return !isBannedConsumerFilename(name);
  });

  for (const tag of tags) {
    const match = eligible.find((row) => (row.theme_tags ?? []).includes(tag));
    if (match?.public_url) return match.public_url;
  }

  return eligible[0]?.public_url ?? null;
}
