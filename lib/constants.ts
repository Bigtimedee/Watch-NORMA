// NORMA — App Constants

// SportsDataIO was removed as a NORMA data source (owner decision, 2026-08-20).
// The constants that lived here were imported by nothing in the app; game data
// comes from ESPN (primary), with Sportradar for PBP/summary. Do not reintroduce
// an EXPO_PUBLIC_SPORTSDATAIO_API_KEY — no client feature reads it.

// Sportradar API — sport-specific base URLs
export const SPORTRADAR_BASE_URL =
  "https://api.sportradar.com/ncaamb/production/v8/en" as const; // NCAA legacy alias
export const SPORTRADAR_BASE_URLS = {
  ncaam: "https://api.sportradar.com/ncaamb/production/v8/en",
  nba:   "https://api.sportradar.com/nba/production/v8/en",
  mlb:   "https://api.sportradar.com/mlb/production/v8/en",
  ncaaf: "https://api.sportradar.com/ncaafb/production/v8/en",
  nfl:   "https://api.sportradar.com/nfl/official/production/v7/en",
} as const;

// ESPN (supplementary, unofficial) — sport-specific base URLs
export const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball" as const; // NCAA legacy alias
export const ESPN_BASE_URLS = {
  ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball",
  nba:   "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  ncaaf: "https://site.api.espn.com/apis/site/v2/sports/football/college-football",
  nfl:   "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
} as const;

// Polling intervals (ms) — cost-aware
export const POLL_INTERVALS = {
  SCHEDULE: 30 * 60 * 1000, // 30 minutes
  BOXSCORE: 60 * 1000, // 1 min (SportsDataIO, cheap)
  PBP: 30 * 1000, // 30s (Sportradar, only full coverage)
  SUMMARY: 2 * 60 * 1000, // 2 min (Sportradar, conservative)
  ODDS: 5 * 60 * 1000, // 5 min
} as const;

// Alert rate limiting
export const ALERT_COOLDOWN_MINUTES = 10;

// Wager alert thresholds (used by evaluate-alerts engine)
export const ALERT_THRESHOLDS = {
  SPREAD_MARGIN_PROXIMITY: 4, // alert when margin within 4 pts of spread line
  TOTAL_PACE_DIVERGENCE: 8, // alert when pace diverges 8+ from O/U line
  MONEYLINE_CLOSE_MARGIN: 8, // alert when ML game within 8 pts
  MIN_MINUTES_FOR_PACE: 15, // need 15 min of game data for pace calc
  POSITION_CLOSE_MARGIN: 8, // alert when position game within 8 pts
  HALF_DURATION_MINUTES: 20, // college basketball half = 20 min
} as const;

// NBA-specific alert thresholds (overrides above for NBA games)
export const NBA_ALERT_THRESHOLDS = {
  CLOSE_GAME_MARGIN: 6,        // alert when NBA game within 6 pts (vs 8 for NCAA)
  CLOSE_GAME_CLOCK_MINS: 3,    // alert when under 3 min remaining in 4th (vs 5 for NCAA)
  BIG_RUN_POINTS: 10,          // alert on 10-0 run (vs 8 for NCAA)
  FOUL_TROUBLE_FOULS: 5,       // NBA foul limit is 6; alert at 5 (vs 4 for NCAA)
} as const;

// MLB-specific alert thresholds
export const MLB_ALERT_THRESHOLDS = {
  CLOSE_GAME_MARGIN_RUNS: 1,   // alert when 1-run game after 7th inning
  CLOSE_GAME_INNING: 8,        // start alerting from 8th inning on
  SCORING_THREAT_INNING: 7,    // scoring threat alerts from 7th inning
  PITCHER_LIMIT_PITCHES: 90,   // alert when starter approaches 90 pitches
  WALKOFF_INNING: 9,           // walk-off alert starts in 9th
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

// The Odds API
export const THE_ODDS_API_BASE_URL =
  "https://api.the-odds-api.com/v4" as const;
export const ODDS_BOOKMAKERS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "espnbet",
] as const;

// Sportsbook display names (also covers DFS pick'em platforms — same map,
// category distinction lives in provider_registry.category = 'dfs_pickem')
export const SPORTSBOOK_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  draftkings_dfs: "DraftKings DFS",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  espnbet: "ESPN BET",
  caesars: "Caesars",
  prizepicks: "PrizePicks",
  underdog: "Underdog",
  sleeper: "Sleeper",
  yahoo_fantasy: "Yahoo Fantasy",
  espn_fantasy: "ESPN Fantasy",
};

// Kalshi API
export const KALSHI_API_BASE = "https://trading-api.kalshi.com" as const;

// Polymarket CLOB API
export const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com" as const;

// App Store. The ID matches ascAppId in eas.json (6759508383) and the URL used
// across web/. The previous value omitted the /id segment and 404'd — it was
// rendered into every shared moment card and share message. Fixed 2026-08-20.
export const NORMA_APP_STORE_URL =
  "https://apps.apple.com/us/app/watch-norma/id6759508383" as const;
