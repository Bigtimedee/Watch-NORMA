// NORMA — TypeScript Types

export type GameStatus =
  | "scheduled"
  | "inprogress"
  | "halftime"
  | "closed"
  | "cancelled"
  | "postponed"
  | "forfeit";

export type FollowType = "game" | "team";

export type ProviderType = "streaming" | "tv" | "sportsbook";

export type AlertType =
  | "game_start"
  | "close_game"
  | "overtime"
  | "big_run"
  | "halftime"
  | "game_end"
  | "momentum_shift"
  | "foul_trouble";

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
  created_at: string;
}

export interface Game {
  id: string;
  sportsdataio_id: number | null;
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
  tournament_round: string | null;
  snapshot_hash: string | null;
  updated_at: string;
  // Joined relations
  home_team?: Team;
  away_team?: Team;
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
}

export interface Alert {
  id: number;
  user_id: string;
  game_id: string | null;
  alert_type: AlertType;
  title: string;
  body: string;
  why: string | null;
  push_sent: boolean;
  read: boolean;
  created_at: string;
  // Joined
  game?: Game;
}

export interface Wager {
  id: number;
  user_id: string;
  game_id: string | null;
  sportsbook: string | null;
  wager_type: WagerType | null;
  description: string;
  team_id: string | null;
  line: number | null;
  odds: string | null;
  status: WagerStatus;
  created_at: string;
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
