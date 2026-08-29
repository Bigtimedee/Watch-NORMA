import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeProximity } from "./outcome-proximity.ts";
import type { WagerTarget } from "./wager-target-parser.ts";
import { makeGameState, makeSummaryStats } from "./test-helpers.ts";

// ─── Player Stat: Points ───

Deno.test("proximity: player at 85%+ of target returns HIGH", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Clingan has 18 pts
  const result = computeProximity(target, game, summary);

  assertEquals(result?.level, "HIGH");
  assertEquals(result?.current_value, 18);
  assertEquals(result?.target_value, 20);
  assertEquals(result?.pct_complete, 0.9);
});

Deno.test("proximity: player at 65-85% of target returns MEDIUM", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "points",
    line: 25,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "8:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Clingan has 18 pts → 18/25 = 0.72
  const result = computeProximity(target, game, summary);

  assertEquals(result?.level, "MEDIUM");
});

Deno.test("proximity: player below 40% returns NONE", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Jared McCain",
    stat_type: "points",
    line: 40,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "8:00", status: "inprogress" });
  const summary = makeSummaryStats(); // McCain has 14 pts → 14/40 = 0.35
  const result = computeProximity(target, game, summary);

  assertEquals(result?.level, "NONE");
});

Deno.test("proximity: player at/above target returns RESOLVED", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "RJ Davis",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Davis has 22 pts → 22/20 = 1.1
  const result = computeProximity(target, game, summary);

  assertEquals(result?.level, "RESOLVED");
});

Deno.test("proximity: game closed returns RESOLVED", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ status: "closed" });
  const summary = makeSummaryStats();
  const result = computeProximity(target, game, summary);

  assertEquals(result?.level, "RESOLVED");
});

// ─── Player Stat: Rebounds ───

Deno.test("proximity: rebounds stat works", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "rebounds",
    line: 10,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Clingan has 8 reb → 8/10 = 0.80
  const result = computeProximity(target, game, summary);

  // 0.80 is >= 0.65 but < 0.85
  assertEquals(result?.level, "MEDIUM");
  assertEquals(result?.current_value, 8);
});

// ─── Player Not Found ───

Deno.test("proximity: returns null when player not in summary", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Unknown Player",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ status: "inprogress" });
  const summary = makeSummaryStats();
  const result = computeProximity(target, game, summary);

  assertEquals(result, null);
});

// ─── Missing Summary ───

Deno.test("proximity: returns null for player_stat without summary", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ status: "inprogress" });
  const result = computeProximity(target, game, null);

  assertEquals(result, null);
});

// ─── Game Total ───

Deno.test("proximity: game total near target returns HIGH", () => {
  const target: WagerTarget = {
    target_type: "game_total",
    line: 140,
    is_over: true,
  };
  // home 68 + away 65 = 133, 133/140 = 0.95 → HIGH
  const game = makeGameState({ period: 2, clock: "3:00", status: "inprogress" });
  const result = computeProximity(target, game, null);

  assertEquals(result?.level, "HIGH");
  assertEquals(result?.current_value, 133);
});

Deno.test("proximity: game total reached returns RESOLVED", () => {
  const target: WagerTarget = {
    target_type: "game_total",
    line: 130,
    is_over: true,
  };
  // home 68 + away 65 = 133 ≥ 130
  const game = makeGameState({ period: 2, clock: "3:00", status: "inprogress" });
  const result = computeProximity(target, game, null);

  assertEquals(result?.level, "RESOLVED");
});

Deno.test("proximity: game total low returns NONE", () => {
  const target: WagerTarget = {
    target_type: "game_total",
    line: 200,
    is_over: true,
  };
  // 133/200 = 0.665 → MEDIUM actually... let's use higher target
  const game = makeGameState({ period: 1, clock: "15:00", home_score: 20, away_score: 18, status: "inprogress" });
  // 38/200 = 0.19 → NONE
  const result = computeProximity(target, game, null);

  assertEquals(result?.level, "NONE");
});

// ─── Spread/Moneyline targets return null (handled by existing logic) ───

Deno.test("proximity: spread target returns null", () => {
  const target: WagerTarget = {
    target_type: "spread",
    line: -3.5,
    is_over: false,
  };
  const game = makeGameState({ status: "inprogress" });
  const result = computeProximity(target, game, null);

  assertEquals(result, null);
});

// ─── Trend Detection ───

Deno.test("proximity: trend is favorable when scoring ahead of pace", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "RJ Davis",
    stat_type: "points",
    line: 25,
    is_over: true,
  };
  // Davis has 22 pts, game 35 min elapsed (period 2, clock 5:00 → 40-5=35)
  // Rate: 22/35 = 0.63 pts/min. Needs 3 more in 5 min → 0.6 pts/min
  // 0.63 > 0.6 * 1.2 = 0.72? No. So neutral.
  // Let's adjust: period 2, clock 10:00 → 30 min elapsed, 22/30 = 0.73, needs 3 in 10 min = 0.3
  // 0.73 > 0.3 * 1.2 = 0.36 → yes → favorable
  const game = makeGameState({ period: 2, clock: "10:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Davis has 22 pts
  const result = computeProximity(target, game, summary);

  assertEquals(result?.trend, "favorable");
});

// ─── Description text ───

Deno.test("proximity: description includes player name and stat context", () => {
  const target: WagerTarget = {
    target_type: "player_stat",
    player_name: "Donovan Clingan",
    stat_type: "points",
    line: 20,
    is_over: true,
  };
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats();
  const result = computeProximity(target, game, summary);

  assertEquals(result!.description.includes("Donovan Clingan"), true);
  assertEquals(result!.description.includes("18"), true); // current points
});

// ─── Football clock geometry — BL-7 regression suite ───
// Previously getMinutesElapsed used 20-minute halves for every sport, so
// football (15-min quarters ×4) prop-proximity trend was always wrong. The
// tests below assert time_pressure lands where a football-savvy human would
// expect it to for the same sport-tagged game state.

Deno.test("football proximity: NFL Q1 clock 10:00 → time_pressure ~ 5/60", () => {
  const target: WagerTarget = { target_type: "game_total", line: 45, is_over: true };
  const game = makeGameState({
    sport: "nfl",
    period: 1,
    clock: "10:00",
    status: "inprogress",
    home_score: 7,
    away_score: 3,
  });
  const result = computeProximity(target, game, null);
  // 5 minutes elapsed out of 60 regulation = 0.0833
  assertEquals(Math.round((result?.time_pressure ?? 0) * 100), 8);
});

Deno.test("football proximity: NFL end of Q4 (clock 0:00) → time_pressure = 1", () => {
  const target: WagerTarget = { target_type: "game_total", line: 45, is_over: true };
  const game = makeGameState({
    sport: "nfl",
    period: 4,
    clock: "0:00",
    status: "inprogress",
    home_score: 24,
    away_score: 21,
  });
  const result = computeProximity(target, game, null);
  assertEquals(result?.time_pressure, 1);
});

Deno.test("football proximity: NFL 2-min drill Q4 → time_pressure ≥ 0.96", () => {
  const target: WagerTarget = { target_type: "game_total", line: 45, is_over: true };
  const game = makeGameState({
    sport: "nfl",
    period: 4,
    clock: "2:00",
    status: "inprogress",
    home_score: 21,
    away_score: 17,
  });
  const result = computeProximity(target, game, null);
  // 58 elapsed / 60 total
  assertEquals(Math.round((result?.time_pressure ?? 0) * 100) >= 96, true);
});

Deno.test("football proximity: NCAAF OT (period 5, clock 15:00) elapsed = 60", () => {
  const target: WagerTarget = { target_type: "game_total", line: 60, is_over: true };
  const game = makeGameState({
    sport: "ncaaf",
    period: 5,
    clock: "15:00",
    status: "inprogress",
    home_score: 28,
    away_score: 28,
  });
  const result = computeProximity(target, game, null);
  // Regulation 60 mins + (period 5) OT starting: elapsed at clock=15:00 = 60
  // time_pressure = 60 / (60 + 15) = 0.8
  assertEquals(Math.round((result?.time_pressure ?? 0) * 100), 80);
});

Deno.test("basketball proximity regression (NCAAM 5:00 in Q2 → tp ≈ 35/40)", () => {
  const target: WagerTarget = { target_type: "game_total", line: 130, is_over: true };
  const game = makeGameState({
    sport: "ncaam",
    period: 2,
    clock: "5:00",
    status: "inprogress",
    home_score: 68,
    away_score: 65,
  });
  const result = computeProximity(target, game, null);
  // 40 - 5 = 35 min elapsed of 40 total
  assertEquals(Math.round((result?.time_pressure ?? 0) * 100), 88);
});

Deno.test("basketball proximity regression (NBA 6:00 in Q3 → tp ≈ 30/48)", () => {
  const target: WagerTarget = { target_type: "game_total", line: 220, is_over: true };
  const game = makeGameState({
    sport: "nba",
    period: 3,
    clock: "6:00",
    status: "inprogress",
    home_score: 92,
    away_score: 88,
  });
  const result = computeProximity(target, game, null);
  // 3 * 12 - 6 = 30 min elapsed of 48 total = 0.625
  assertEquals(Math.round((result?.time_pressure ?? 0) * 100), 63);
});
