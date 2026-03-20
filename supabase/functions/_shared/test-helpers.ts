// Test data factories — sensible defaults with partial overrides

import type {
  GameState,
  UserWager,
  UserPosition,
  SummaryStats,
} from "../evaluate-alerts/logic.ts";
import type { ResolveGame, ResolveWager } from "../resolve-wagers/logic.ts";

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: "game-1",
    status: "inprogress",
    home_score: 68,
    away_score: 65,
    clock: "4:30",
    period: 2,
    home_team_id: "team-duke",
    away_team_id: "team-unc",
    sportradar_id: "sr-game-1",
    coverage_level: "full",
    broadcast: "ESPN",
    home_team: { name: "Duke Blue Devils", abbreviation: "DUKE" },
    away_team: { name: "North Carolina Tar Heels", abbreviation: "UNC" },
    ...overrides,
  };
}

export function makeWager(overrides: Partial<UserWager> = {}): UserWager {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    wager_type: "spread",
    team_id: "team-duke",
    line: -3.5,
    odds: "-110",
    description: "Duke -3.5",
    sportsbook: "DraftKings",
    ...overrides,
  };
}

export function makePosition(overrides: Partial<UserPosition> = {}): UserPosition {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    platform: "kalshi",
    market_title: "Duke to win vs UNC",
    position_side: "yes",
    quantity: 10,
    avg_price: 0.62,
    outcome: null,
    payout_amount: null,
    ...overrides,
  };
}

export function makeSummaryStats(overrides: Partial<SummaryStats> = {}): SummaryStats {
  return {
    source: "sportradar",
    home: {
      points: 68,
      biggest_lead: 12,
      bench_points: 18,
      effective_fg_pct: 0.52,
      points_off_turnovers: 14,
      turnovers: 8,
      players: [
        {
          full_name: "Donovan Clingan",
          starter: true,
          on_court: true,
          fouled_out: false,
          personal_fouls: 2,
          points: 18,
          rebounds: 8,
          assists: 2,
        },
        {
          full_name: "Jared McCain",
          starter: true,
          on_court: false,
          fouled_out: false,
          personal_fouls: 1,
          points: 14,
          rebounds: 3,
          assists: 5,
        },
      ],
      ...overrides.home,
    },
    away: {
      points: 65,
      biggest_lead: 5,
      bench_points: 12,
      effective_fg_pct: 0.48,
      points_off_turnovers: 10,
      turnovers: 11,
      players: [
        {
          full_name: "RJ Davis",
          starter: true,
          on_court: true,
          fouled_out: false,
          personal_fouls: 3,
          points: 22,
          rebounds: 4,
          assists: 6,
        },
      ],
      ...overrides.away,
    },
  };
}

export function makeResolveGame(overrides: Partial<ResolveGame> = {}): ResolveGame {
  return {
    id: "game-1",
    home_score: 75,
    away_score: 72,
    home_team_id: "team-home",
    away_team_id: "team-away",
    ...overrides,
  };
}

export function makeResolveWager(overrides: Partial<ResolveWager> = {}): ResolveWager {
  return {
    id: 1,
    game_id: "game-1",
    wager_type: "spread",
    team_id: "team-home",
    line: -3.5,
    description: "Home -3.5",
    ...overrides,
  };
}
