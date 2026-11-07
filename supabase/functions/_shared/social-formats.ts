// =============================================================================
// social-formats.ts — Growth-plan social formats shared by cmo-live-moments
// (producer) and cmo-publish (publisher + IG/FB/TikTok cross-post).
//
//   live_moment   game-level moment (OT, two-minute drill, close finish) on a
//                 nationally relevant game, posted within minutes.
//   todays_games  one morning "Today's Games / where to watch" post per day.
//
// Both are ADDITIVE to the existing 3 scheduled posts/day (9a/1p/7p CT).
// =============================================================================

export const CONTENT_TYPE_LIVE_MOMENT = "live_moment";
export const CONTENT_TYPE_TODAYS_GAMES = "todays_games";

/**
 * Formats that may publish on X as text only (no video/screenshot attached).
 *
 * The 2026-10-18 video-only rule holds every other X row without a video.
 * These two formats are time-critical game data with no pre-rendered video, so
 * per the growth-plan brief (2026-11-07: "Live Moments may be X text(+existing
 * screenshot) only for now") they post on X as text. Cross-posts to IG Reels /
 * FB / TikTok still require a video, so these formats do NOT reach those
 * platforms until a video is attached.
 *
 * Kill switch: set the Edge Function secret SOCIAL_X_TEXT_FORMATS=none to
 * restore strict video-only for these formats too (they will then be held as
 * empty_media like any other row).
 */
export const X_TEXT_ONLY_FORMATS_DEFAULT: readonly string[] = [
  CONTENT_TYPE_LIVE_MOMENT,
  CONTENT_TYPE_TODAYS_GAMES,
];

/** Parse SOCIAL_X_TEXT_FORMATS ("none" | "" | comma list). Unset = default. */
export function parseXTextOnlyFormats(raw: string | null | undefined): Set<string> {
  if (raw == null) return new Set(X_TEXT_ONLY_FORMATS_DEFAULT);
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "none" || v === "off" || v === "false") return new Set();
  const allowed = new Set(X_TEXT_ONLY_FORMATS_DEFAULT);
  return new Set(v.split(",").map((s) => s.trim()).filter((s) => allowed.has(s)));
}

/**
 * Live Moment rate caps per platform per rolling hour (growth plan 4.3:
 * "start at 3 per hour on X, 1 per hour elsewhere, tune from the daily data").
 * Keys are content_calendar.platform values.
 */
export const LIVE_MOMENT_HOURLY_CAP: Readonly<Record<string, number>> = {
  twitter: 3,
  instagram: 1,
  facebook: 1,
  tiktok: 1,
};

/** Cross-post short key (crosspost.ts) -> content_calendar.platform value. */
export const CROSS_KEY_TO_PLATFORM: Readonly<Record<string, string>> = {
  ig: "instagram",
  fb: "facebook",
  tiktok: "tiktok",
};

/** Hard daily ceiling for Live Moments on X, separate from MAX_POSTS_PER_DAY. */
export const LIVE_MOMENT_MAX_PER_DAY_X = 24;

/**
 * A Live Moment older than this is stale (non-negotiable rule 6: no stale
 * live content). cmo-publish holds it instead of tweeting it late, and the
 * cross-post sweep will not post it.
 */
export const LIVE_MOMENT_STALE_AFTER_MS = 20 * 60 * 1000;

/** Platforms Live Moments / Today's Games rows are created for today. */
export const TEXT_FORMAT_PLATFORMS: readonly string[] = ["twitter"];
