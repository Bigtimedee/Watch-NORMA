// NORMA — TypeScript Types

export type GameStatus =
  | "scheduled"
  | "inprogress"
  | "halftime"
  | "closed"
  | "cancelled"
  | "postponed"
  | "forfeit";

/** Sport discriminator — matches the sport_key Postgres enum */
export type SportKey = "ncaam" | "nba" | "mlb" | "ncaaf" | "nfl";

export type FollowType = "game" | "team";

export type ProviderType = "streaming" | "tv" | "sportsbook";

export type AlertType =
  | "spread_alert"
  | "total_alert"
  | "moneyline_alert"
  | "prop_alert"
  | "position_alert"
  | "bet_resolved"
  | "prediction_resolved"
  | "close_game"
  | "overtime"
  | "foul_trouble"
  | "follow_alert";

export type WagerType = "spread" | "moneyline" | "over_under" | "prop";
export type WagerStatus = "active" | "won" | "lost" | "push";

export interface Profile {
  id: string;
  display_name: string | null;
  push_token: string | null;
  timezone: string;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  market: string | null;
  abbreviation: string | null;
  conference: string | null;
  logo_url: string | null;
  sportsdataio_id: number | null;
  sportradar_id: string | null;
  sport: SportKey;
  created_at: string;
}

export interface Game {
  id: string;
  sport: SportKey;
  sportsdataio_id: number | null;
  espn_id: string | null;
  sportradar_id: string | null;
  status: GameStatus;
  title: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  clock: string | null;
  period: number | null;
  scheduled_at: string;
  venue: string | null;
  broadcast: string | null;
  coverage: string | null;
  coverage_level: string | null;
  tournament_round: string | null;
  snapshot_hash: string | null;
  last_pbp_source: string | null;
  last_summary_source: string | null;
  updated_at: string;
  // Joined relations
  home_team?: Team;
  away_team?: Team;
}

/** MLB per-game stats from mlb_game_stats table */
export interface MLBGameStats {
  id: number;
  game_id: string;
  home_innings: Array<{ inning: number; runs: number }>;
  away_innings: Array<{ inning: number; runs: number }>;
  home_runs: number;
  away_runs: number;
  home_hits: number;
  away_hits: number;
  home_errors: number;
  away_errors: number;
  current_inning: number | null;
  inning_half: "T" | "B" | null;
  outs: number;
  balls: number;
  strikes: number;
  runners_on_base: Array<{ base: number; player_name: string }>;
  home_starter_name: string | null;
  home_starter_pitches: number;
  home_starter_ip: number | null;
  home_starter_era: number | null;
  home_starter_whip: number | null;
  home_starter_strikeouts: number;
  home_starter_walks: number;
  home_starter_hits_allowed: number;
  home_starter_runs_allowed: number;
  home_starter_still_pitching: boolean;
  away_starter_name: string | null;
  away_starter_pitches: number;
  away_starter_ip: number | null;
  away_starter_era: number | null;
  away_starter_whip: number | null;
  away_starter_strikeouts: number;
  away_starter_walks: number;
  away_starter_hits_allowed: number;
  away_starter_runs_allowed: number;
  away_starter_still_pitching: boolean;
  home_no_hitter_active: boolean;
  away_no_hitter_active: boolean;
  home_perfect_game_active: boolean;
  away_perfect_game_active: boolean;
  payload_hash: string | null;
  updated_at: string;
}

export interface GameSnapshot {
  id: number;
  game_id: string;
  snapshot_type: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  created_at: string;
}

export interface Follow {
  id: number;
  user_id: string;
  game_id: string | null;
  team_id: string | null;
  follow_type: FollowType;
  created_at: string;
}

export interface Connection {
  id: number;
  user_id: string;
  provider_type: ProviderType;
  provider_key: string;
  provider_name: string;
  connected: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StreamingProvider {
  key: string;
  name: string;
  provider_type: ProviderType;
  logo_url: string | null;
  ios_scheme: string | null;
  ios_app_store_url: string | null;
  android_package: string | null;
  android_deep_link: string | null;
  web_url: string | null;
  active: boolean;
  // v2 fields (nullable for backward compat with older rows/caches)
  universal_link?: string | null;
  fallback_store_url?: string | null;
  auth_mode?: string | null;
  category?: string | null;
  affiliate_tag?: string | null;
}

export type ProviderCategory = "streaming" | "tv" | "sportsbook" | "prediction_market";

export interface UserPreferences {
  user_id: string;
  favorite_teams: Array<{ team_id: string; added_at: string }>;
  favorite_players: Array<{ player_name: string; team_id: string; added_at: string }>;
  notification_settings: {
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    max_alerts_per_game: number;
    max_alerts_per_hour: number;
    channels: { push: boolean; in_app: boolean };
    ad_personalization_enabled?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface WhyNow {
  headline: string;
  bullets: string[];
  stats_used: Record<string, number>;
  confidence: number;
  wager_impact?: {
    wager_id: number;
    wager_description: string;
    status: "covering" | "not_covering" | "at_risk" | "decided";
  };
}

export interface Alert {
  id: number;
  user_id: string;
  game_id: string | null;
  sport: SportKey;
  alert_type: AlertType;
  title: string;
  body: string;
  why: string | null;
  push_sent: boolean;
  read: boolean;
  created_at: string;
  // v2 fields
  score: number | null;
  explanation: WhyNow | null;
  suppressed_reason: string | null;
  // Sponsor fields (advertising)
  sponsor_bid_id: number | null;
  sponsor_text: string | null;
  sponsor_cta_url: string | null;
  sponsor_logo_url: string | null;
  clearing_price_cents: number | null;
  // Joined
  game?: Game;
}

export interface Wager {
  id: number;
  user_id: string;
  game_id: string | null;
  sport: SportKey;
  sportsbook: string | null;
  wager_type: WagerType | null;
  description: string;
  team_id: string | null;
  line: number | null;
  odds: string | null;
  status: WagerStatus;
  created_at: string;
  // v2 fields
  source: string | null;
  provider_key: string | null;
  external_bet_id: string | null;
  stake: number | null;
  potential_payout: number | null;
  legs: Array<{ game_id: string; team_id?: string; market_type: string; line?: number; odds?: string; description: string }> | null;
  market_type: string | null;
  placed_at: string | null;
  parsed_target: Record<string, unknown> | null;
  // Joined
  game?: Game;
}

export interface GameOdds {
  id: number;
  game_id: string;
  sportsbook: string;
  market_type: string;
  home_line: number | null;
  away_line: number | null;
  home_price: number | null;
  away_price: number | null;
  over_under: number | null;
  over_price: number | null;
  under_price: number | null;
  last_update: string;
}

export interface PredictionPosition {
  id: number;
  user_id: string;
  platform: string;
  market_id: string;
  market_title: string;
  game_id: string | null;
  position_side: string;
  quantity: number;
  avg_price: number;
  current_price: number | null;
  pnl: number | null;
  settled: boolean;
  fetched_at: string;
  parsed_target: Record<string, unknown> | null;
}

// SportsDataIO API response types
export interface SportsDataIOGame {
  GameID: number;
  Season: number;
  SeasonType: number;
  Status: string;
  Day: string;
  DateTime: string;
  AwayTeam: string;
  HomeTeam: string;
  AwayTeamID: number;
  HomeTeamID: number;
  AwayTeamScore: number | null;
  HomeTeamScore: number | null;
  Period: string | null;
  TimeRemainingMinutes: number | null;
  TimeRemainingSeconds: number | null;
  Channel: string | null;
  Stadium: {
    Name: string;
    City: string;
    State: string;
  } | null;
  IsClosed: boolean;
  NeutralVenue: boolean | null;
  Tournament?: string | null;
  TournamentDisplayOrder?: number | null;
  Round?: string | null;
}

export interface SportsDataIOTeam {
  TeamID: number;
  Key: string;
  School: string;
  Name: string;
  ApRank: number | null;
  Conference: string;
  ConferenceName: string;
  TeamLogoUrl: string | null;
  ShortDisplayName: string;
}

// ESPN supplementary types
export interface ESPNCompetitor {
  team: {
    displayName: string;
    abbreviation: string;
    logo: string;
  };
  score: string;
  homeAway: "home" | "away";
}

export interface ESPNEvent {
  id: string;
  name: string;
  status: {
    type: { name: string; description: string };
    displayClock: string;
    period: number;
  };
  competitions: Array<{
    competitors: ESPNCompetitor[];
    broadcasts: Array<{
      names: string[];
    }>;
  }>;
}

// --- Sportradar v8 Response Types ---

export interface SportradarSummary {
  id: string;
  status: string;
  coverage: string; // 'full', 'extended_boxscore'
  home: SportradarTeamStats;
  away: SportradarTeamStats;
}

export interface SportradarTeamStats {
  points: number;
  field_goals_made: number;
  field_goals_att: number;
  three_points_made: number;
  three_points_att: number;
  free_throws_made: number;
  free_throws_att: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  bench_points: number;
  points_off_turnovers: number;
  biggest_lead: number;
  fast_break_points: number;
  second_chance_points: number;
  effective_fg_pct: number;
  true_shooting_pct: number;
  players: SportradarPlayer[];
}

export interface SportradarPlayer {
  full_name: string;
  jersey_number: string;
  starter: boolean;
  played: boolean;
  on_court: boolean;
  fouled_out: boolean;
  ejected: boolean;
  personal_fouls: number;
  points: number;
  minutes: string;
  field_goals_made: number;
  field_goals_att: number;
  three_points_made: number;
  three_points_att: number;
  free_throws_made: number;
  free_throws_att: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
}

export interface SportradarPbpEvent {
  id: string;
  type: string; // 'turnover', 'twopointmade', 'threepointmade', 'foul', etc.
  clock: string;
  description: string;
  team?: { id: string; name: string };
  player?: { full_name: string };
  scoring_play?: boolean;
  points?: number;
}
