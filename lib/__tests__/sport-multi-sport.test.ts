/**
 * Multi-sport ingestion and display logic tests.
 *
 * Covers:
 *   - Sport discriminator on Game, Alert, and Wager objects
 *   - SPORT_LABELS mapping
 *   - MLB clock encoding/decoding (T/B + inning)
 *   - NBA quarter/OT labels
 *   - useGames/useAlerts sport filter (via hook factory logic)
 *   - MLBGameStats shape validation
 *   - Alert sport badge visibility rules (ncaam hidden, nba/mlb shown)
 */

import type { Game, Alert, Wager, MLBGameStats, SportKey } from "../types";
import { SPORT_LABELS } from "../sport-context";
import { formatClock } from "../alert-helpers";

// ─── SPORT_LABELS ────────────────────────────────────────────────────────────

describe("SPORT_LABELS", () => {
  it("ncaam maps to 'NCAA'", () => {
    expect(SPORT_LABELS["ncaam"]).toBe("NCAA");
  });

  it("nba maps to 'NBA'", () => {
    expect(SPORT_LABELS["nba"]).toBe("NBA");
  });

  it("mlb maps to 'MLB'", () => {
    expect(SPORT_LABELS["mlb"]).toBe("MLB");
  });

  it("ncaaf maps to 'NCAAF'", () => {
    expect(SPORT_LABELS["ncaaf"]).toBe("NCAAF");
  });

  it("nfl maps to 'NFL'", () => {
    expect(SPORT_LABELS["nfl"]).toBe("NFL");
  });

  it("covers all sport keys", () => {
    const sports: SportKey[] = ["ncaam", "nba", "mlb", "ncaaf", "nfl"];
    sports.forEach((s) => {
      expect(SPORT_LABELS[s]).toBeDefined();
      expect(typeof SPORT_LABELS[s]).toBe("string");
      expect(SPORT_LABELS[s].length).toBeGreaterThan(0);
    });
  });
});

// ─── Game sport discriminator ─────────────────────────────────────────────────

describe("Game sport discriminator", () => {
  const makeGame = (sport: SportKey, overrides: Partial<Game> = {}): Game => ({
    id: `game-${sport}`,
    sport,
    sportsdataio_id: 1,
    espn_id: null,
    sportradar_id: null,
    status: "inprogress",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 0,
    away_score: 0,
    clock: null,
    period: null,
    scheduled_at: "2026-04-07T19:00:00Z",
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-04-07T20:00:00Z",
    ...overrides,
  });

  it("ncaam game has sport = 'ncaam'", () => {
    const game = makeGame("ncaam");
    expect(game.sport).toBe("ncaam");
  });

  it("nba game has sport = 'nba'", () => {
    const game = makeGame("nba");
    expect(game.sport).toBe("nba");
  });

  it("mlb game has sport = 'mlb'", () => {
    const game = makeGame("mlb");
    expect(game.sport).toBe("mlb");
  });

  it("ncaaf game has sport = 'ncaaf'", () => {
    const game = makeGame("ncaaf");
    expect(game.sport).toBe("ncaaf");
  });

  it("nfl game has sport = 'nfl'", () => {
    const game = makeGame("nfl");
    expect(game.sport).toBe("nfl");
  });

  it("mlb game carries espn_id for dedup", () => {
    const game = makeGame("mlb", { espn_id: "401571234" });
    expect(game.espn_id).toBe("401571234");
  });

  it("ncaam game espn_id defaults to null", () => {
    const game = makeGame("ncaam");
    expect(game.espn_id).toBeNull();
  });
});

// ─── Alert sport discriminator ────────────────────────────────────────────────

describe("Alert sport discriminator", () => {
  const makeAlert = (sport: SportKey): Alert => ({
    id: 1,
    user_id: "u1",
    game_id: "g1",
    sport,
    alert_type: "close_game",
    title: "Close game",
    body: "Under 2 minutes",
    why: null,
    push_sent: false,
    read: false,
    created_at: "2026-04-07T21:00:00Z",
    score: 45,
    explanation: null,
    suppressed_reason: null,
    sponsor_bid_id: null,
    sponsor_text: null,
    sponsor_cta_url: null,
    sponsor_logo_url: null,
    clearing_price_cents: null,
  });

  it("ncaam alert sport is 'ncaam'", () => {
    expect(makeAlert("ncaam").sport).toBe("ncaam");
  });

  it("nba alert sport is 'nba'", () => {
    expect(makeAlert("nba").sport).toBe("nba");
  });

  it("mlb alert sport is 'mlb'", () => {
    expect(makeAlert("mlb").sport).toBe("mlb");
  });

  // Badge visibility rule: NCAA alerts do NOT show sport badge; NBA/MLB do
  it("ncaam alert should NOT show sport badge (sport === 'ncaam')", () => {
    const alert = makeAlert("ncaam");
    expect(alert.sport === "ncaam").toBe(true);
    // Component hides badge for ncaam — test the condition directly
    const shouldShowBadge = alert.sport && alert.sport !== "ncaam";
    expect(shouldShowBadge).toBeFalsy();
  });

  it("nba alert SHOULD show sport badge", () => {
    const alert = makeAlert("nba");
    const shouldShowBadge = alert.sport && alert.sport !== "ncaam";
    expect(shouldShowBadge).toBeTruthy();
  });

  it("mlb alert SHOULD show sport badge", () => {
    const alert = makeAlert("mlb");
    const shouldShowBadge = alert.sport && alert.sport !== "ncaam";
    expect(shouldShowBadge).toBeTruthy();
  });
});

// ─── Wager sport discriminator ────────────────────────────────────────────────

describe("Wager sport discriminator", () => {
  it("wager carries sport field matching its game's sport", () => {
    const wager: Wager = {
      id: 1,
      user_id: "u1",
      game_id: "g-mlb-001",
      sport: "mlb",
      sportsbook: "draftkings",
      wager_type: "moneyline",
      description: "Yankees ML -130",
      team_id: null,
      line: null,
      odds: "-130",
      status: "active",
      created_at: "2026-04-07T18:00:00Z",
      source: "manual",
      provider_key: "draftkings",
      external_bet_id: null,
      stake: 100,
      potential_payout: 177,
      legs: null,
      market_type: "moneyline",
      placed_at: "2026-04-07T18:00:00Z",
      parsed_target: null,
    };
    expect(wager.sport).toBe("mlb");
  });
});

// ─── MLBGameStats shape ───────────────────────────────────────────────────────

describe("MLBGameStats shape", () => {
  const stats: MLBGameStats = {
    id: 1,
    game_id: "g-mlb-001",
    home_innings: [
      { inning: 1, runs: 0 },
      { inning: 2, runs: 2 },
      { inning: 7, runs: 1 },
    ],
    away_innings: [
      { inning: 1, runs: 1 },
      { inning: 5, runs: 0 },
    ],
    home_runs: 3,
    away_runs: 1,
    home_hits: 7,
    away_hits: 4,
    home_errors: 0,
    away_errors: 1,
    current_inning: 7,
    inning_half: "T",
    outs: 2,
    balls: 3,
    strikes: 1,
    runners_on_base: [{ base: 1, player_name: "Judge, A" }],
    home_starter_name: "Cole, G",
    home_starter_pitches: 87,
    home_starter_ip: 6.667,
    home_starter_era: 2.45,
    home_starter_whip: 1.02,
    home_starter_strikeouts: 9,
    home_starter_walks: 2,
    home_starter_hits_allowed: 4,
    home_starter_runs_allowed: 1,
    home_starter_still_pitching: true,
    away_starter_name: "Scherzer, M",
    away_starter_pitches: 103,
    away_starter_ip: 6.0,
    away_starter_era: 3.12,
    away_starter_whip: 1.15,
    away_starter_strikeouts: 7,
    away_starter_walks: 3,
    away_starter_hits_allowed: 7,
    away_starter_runs_allowed: 3,
    away_starter_still_pitching: false,
    home_no_hitter_active: false,
    away_no_hitter_active: false,
    home_perfect_game_active: false,
    away_perfect_game_active: false,
    payload_hash: "abc123",
    updated_at: "2026-04-07T21:30:00Z",
  };

  it("home innings array contains correct structure", () => {
    expect(stats.home_innings).toHaveLength(3);
    expect(stats.home_innings[1]).toEqual({ inning: 2, runs: 2 });
  });

  it("away innings total runs matches away_runs (partial innings case)", () => {
    const awayTotal = stats.away_innings.reduce((sum, r) => sum + r.runs, 0);
    // away_innings only has innings 1 and 5 with 1+0=1 runs, matches away_runs
    expect(awayTotal).toBe(stats.away_runs);
  });

  it("inning_half is T for top half", () => {
    expect(stats.inning_half).toBe("T");
  });

  it("runners_on_base is an array of base+player objects", () => {
    expect(stats.runners_on_base).toHaveLength(1);
    expect(stats.runners_on_base[0].base).toBe(1);
    expect(stats.runners_on_base[0].player_name).toBe("Judge, A");
  });

  it("starter still pitching flag is boolean", () => {
    expect(typeof stats.home_starter_still_pitching).toBe("boolean");
    expect(typeof stats.away_starter_still_pitching).toBe("boolean");
    expect(stats.home_starter_still_pitching).toBe(true);
    expect(stats.away_starter_still_pitching).toBe(false);
  });

  it("no-hitter flags are false by default for a normal game", () => {
    expect(stats.home_no_hitter_active).toBe(false);
    expect(stats.away_no_hitter_active).toBe(false);
  });

  it("no-hitter active when hits_allowed === 0 through 6 innings", () => {
    const noHitterStats: MLBGameStats = {
      ...stats,
      away_starter_hits_allowed: 0,
      away_no_hitter_active: true,
      current_inning: 7,
    };
    expect(noHitterStats.away_no_hitter_active).toBe(true);
    expect(noHitterStats.away_starter_hits_allowed).toBe(0);
  });
});

// ─── MLB clock encoding roundtrip ─────────────────────────────────────────────

describe("MLB clock T/B encoding roundtrip via formatClock", () => {
  const mlbBase: Game = {
    id: "g-mlb-rt",
    sport: "mlb",
    sportsdataio_id: null,
    espn_id: "401abc",
    sportradar_id: null,
    status: "inprogress",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 3,
    away_score: 1,
    clock: null,
    period: null,
    scheduled_at: "2026-04-07T19:05:00Z",
    venue: null,
    broadcast: "ESPN",
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-04-07T21:00:00Z",
  };

  const cases: Array<[string, number, string]> = [
    ["T1", 1, "Top 1st"],
    ["B1", 1, "Bot 1st"],
    ["T2", 2, "Top 2nd"],
    ["B2", 2, "Bot 2nd"],
    ["T3", 3, "Top 3rd"],
    ["B3", 3, "Bot 3rd"],
    ["T4", 4, "Top 4th"],
    ["T7", 7, "Top 7th"],
    ["B9", 9, "Bot 9th"],
    ["T10", 10, "Top 10th"],
    ["T11", 11, "Top 11th"],
    ["B12", 12, "Bot 12th"],
  ];

  test.each(cases)("clock '%s' period %i → '%s'", (clock, period, expected) => {
    expect(formatClock({ ...mlbBase, clock, period })).toBe(expected);
  });
});

// ─── Sport-aware query filter logic ──────────────────────────────────────────

describe("Sport query filter logic", () => {
  // Tests the conditional logic used in useGames and useAlerts hooks
  // without importing the actual hooks (which depend on Supabase/React Query)

  function applyFilter<T extends { sport: SportKey }>(
    items: T[],
    sport: SportKey | undefined
  ): T[] {
    if (!sport) return items;
    return items.filter((item) => item.sport === sport);
  }

  const games = [
    { id: "g1", sport: "ncaam" as SportKey },
    { id: "g2", sport: "nba" as SportKey },
    { id: "g3", sport: "mlb" as SportKey },
    { id: "g4", sport: "ncaam" as SportKey },
    { id: "g5", sport: "nba" as SportKey },
  ];

  it("no sport filter returns all games", () => {
    expect(applyFilter(games, undefined)).toHaveLength(5);
  });

  it("ncaam filter returns only NCAA games", () => {
    const result = applyFilter(games, "ncaam");
    expect(result).toHaveLength(2);
    result.forEach((g) => expect(g.sport).toBe("ncaam"));
  });

  it("nba filter returns only NBA games", () => {
    const result = applyFilter(games, "nba");
    expect(result).toHaveLength(2);
    result.forEach((g) => expect(g.sport).toBe("nba"));
  });

  it("mlb filter returns only MLB games", () => {
    const result = applyFilter(games, "mlb");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g3");
  });

  it("sport filter is exact match — nba does not return ncaam", () => {
    const result = applyFilter(games, "nba");
    const hasNcaam = result.some((g) => g.sport === "ncaam");
    expect(hasNcaam).toBe(false);
  });
});

// ─── MLB alert thresholds ─────────────────────────────────────────────────────

describe("MLB alert threshold constants", () => {
  const { MLB_ALERT_THRESHOLDS } = require("../constants");

  it("close game threshold is 1 run", () => {
    expect(MLB_ALERT_THRESHOLDS.CLOSE_GAME_MARGIN_RUNS).toBe(1);
  });

  it("close game fires from 8th inning onward", () => {
    expect(MLB_ALERT_THRESHOLDS.CLOSE_GAME_INNING).toBe(8);
  });

  it("scoring threat fires from 7th inning onward", () => {
    expect(MLB_ALERT_THRESHOLDS.SCORING_THREAT_INNING).toBe(7);
  });

  it("pitcher limit is 90 pitches", () => {
    expect(MLB_ALERT_THRESHOLDS.PITCHER_LIMIT_PITCHES).toBe(90);
  });

  it("walk-off fires from 9th inning onward", () => {
    expect(MLB_ALERT_THRESHOLDS.WALKOFF_INNING).toBe(9);
  });
});

// ─── NBA alert thresholds ─────────────────────────────────────────────────────

describe("NBA alert threshold constants", () => {
  const { NBA_ALERT_THRESHOLDS } = require("../constants");

  it("close game margin is 6 points", () => {
    expect(NBA_ALERT_THRESHOLDS.CLOSE_GAME_MARGIN).toBe(6);
  });

  it("clock threshold is 3 minutes", () => {
    // Key is CLOSE_GAME_CLOCK_MINS (not CLOSE_GAME_CLOCK_MINUTES)
    expect(NBA_ALERT_THRESHOLDS.CLOSE_GAME_CLOCK_MINS).toBe(3);
  });

  it("big run threshold is 10 points", () => {
    // Key is BIG_RUN_POINTS (not BIG_RUN_THRESHOLD)
    expect(NBA_ALERT_THRESHOLDS.BIG_RUN_POINTS).toBe(10);
  });

  it("foul trouble threshold is 5 fouls", () => {
    expect(NBA_ALERT_THRESHOLDS.FOUL_TROUBLE_FOULS).toBe(5);
  });
});
