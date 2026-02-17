// NORMA — App Constants

// SportsDataIO API
export const SPORTSDATAIO_BASE_URL =
  "https://api.sportsdata.io/v3/cbb" as const;
export const SPORTSDATAIO_API_KEY =
  process.env.EXPO_PUBLIC_SPORTSDATAIO_API_KEY ?? "";

// ESPN (supplementary, unofficial)
export const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball" as const;

// Polling intervals (ms)
export const POLL_INTERVALS = {
  SCHEDULE: 30 * 60 * 1000, // 30 minutes
  BOXSCORE: 15 * 1000, // 15 seconds (live games)
  SUMMARY: 2 * 60 * 1000, // 2 minutes
  PBP: 30 * 1000, // 30 seconds
} as const;

// Alert rate limiting
export const ALERT_COOLDOWN_MINUTES = 10;

// Alert thresholds
export const ALERT_THRESHOLDS = {
  CLOSE_GAME_MARGIN_LATE: 5, // margin <= 5 in final 8 min
  CLOSE_GAME_MARGIN_CRUNCH: 3, // margin <= 3 in final 4 min
  CLOSE_GAME_MINUTES_LATE: 8,
  CLOSE_GAME_MINUTES_CRUNCH: 4,
  BIG_RUN_POINTS: 10, // 10-0 run
  HALF_DURATION_MINUTES: 20, // college basketball half = 20 min
} as const;

// Game statuses
export const LIVE_STATUSES = ["inprogress", "halftime"] as const;
export const FINAL_STATUSES = ["closed", "cancelled", "forfeit"] as const;

// Tab icons
export const TAB_ICONS = {
  games: "basketball-outline" as const,
  alerts: "notifications-outline" as const,
  connections: "link-outline" as const,
  profile: "person-outline" as const,
};

// Deep link schemes
export const APP_SCHEME = "norma" as const;

// NCAA basketball season
export const CURRENT_SEASON = 2026;
export const MARCH_MADNESS_START = "2026-03-17";
