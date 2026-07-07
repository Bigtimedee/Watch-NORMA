import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseClockMinutes,
  evaluateSpread,
  evaluateTotal,
  evaluateMoneyline,
  evaluateMLBSpread,
  evaluateMLBTotal,
  evaluateMLBMoneyline,
  parseMLBClock,
  evaluateProp,
  evaluatePosition,
  evaluateResolved,
  evaluateFootballSpread,
  evaluateFootballTotal,
  evaluateFootballMoneyline,
  evaluateFootballCloseGame,
} from "./logic.ts";
import {
  makeGameState,
  makeWager,
  makePosition,
  makeSummaryStats,
} from "../_shared/test-helpers.ts";

// ─── parseClockMinutes ───

Deno.test("parseClockMinutes: parses '12:30' as 12.5", () => {
  assertEquals(parseClockMinutes("12:30"), 12.5);
});

Deno.test("parseClockMinutes: null input returns null", () => {
  assertEquals(parseClockMinutes(null), null);
});

Deno.test("parseClockMinutes: empty string returns null", () => {
  assertEquals(parseClockMinutes(""), null);
});

Deno.test("parseClockMinutes: parses '0:00' as 0", () => {
  assertEquals(parseClockMinutes("0:00"), 0);
});

Deno.test("parseClockMinutes: parses '5:15' correctly", () => {
  assertEquals(parseClockMinutes("5:15"), 5.25);
});

// ─── evaluateSpread ───

Deno.test("evaluateSpread: no alert in 1st half", () => {
  const game = makeGameState({ period: 1, clock: "10:00" });
  const wager = makeWager({ wager_type: "spread", line: -3.5, team_id: "team-duke" });
  assertEquals(evaluateSpread(game, wager, null), null);
});

Deno.test("evaluateSpread: no alert when margin far from line", () => {
  // Duke leading by 15, spread -3.5 → diff = 15 - (-3.5) = 18.5 → way more than 4
  const game = makeGameState({ home_score: 80, away_score: 65, period: 2, clock: "4:00" });
  const wager = makeWager({ wager_type: "spread", line: -3.5, team_id: "team-duke" });
  assertEquals(evaluateSpread(game, wager, null), null);
});

Deno.test("evaluateSpread: fires when margin within 4 of line in final 10 min of 2H", () => {
  // Duke leads by 3, spread is -3.5 → currentMargin=3, diff=3-(-3.5)=6.5...
  // Actually: Duke home, margin = 68-65=3, line=-3.5, diff = 3-(-3.5) = 6.5 > 4. Need tighter game.
  // Duke leads 68-65 (margin 3), spread -2.5, diff = 3-(-2.5) = 5.5 > 4. Still too far.
  // Duke leads 68-66 (margin 2), spread -3.5, diff = 2-(-3.5)=5.5. Still > 4.
  // Let's use: Duke leads 68-67 (margin 1), spread -3.5, diff = 1-(-3.5)=4.5 > 4.
  // Tight: Duke leads 68-67 (margin 1), spread -3, diff = 1-(-3) = 4 exactly.
  // Math.abs(4) > 4 is false, so it should fire.
  const game = makeGameState({ home_score: 68, away_score: 67, period: 2, clock: "4:00" });
  const wager = makeWager({ wager_type: "spread", line: -3, team_id: "team-duke" });
  const result = evaluateSpread(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "spread_alert");
});

Deno.test("evaluateSpread: correct for away team bets", () => {
  // UNC is away, margin from UNC perspective = -(68-65)= -3, line = +5.5, diff = -3 - 5.5 = -8.5, abs > 4 → null
  // Make it closer: score 68-66, UNC +3, away margin = -(68-66)=-2, diff = -2-3 = -5, abs = 5 > 4 → null
  // Even closer: 68-67, UNC +2.5, away margin = -1, diff = -1-2.5=-3.5, abs=3.5 < 4 → fires
  const game = makeGameState({ home_score: 68, away_score: 67, period: 2, clock: "3:00" });
  const wager = makeWager({ wager_type: "spread", line: 2.5, team_id: "team-unc" });
  const result = evaluateSpread(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "spread_alert");
});

Deno.test("evaluateSpread: no alert for non-spread wager", () => {
  const game = makeGameState({ period: 2, clock: "4:00" });
  const wager = makeWager({ wager_type: "moneyline", line: null });
  assertEquals(evaluateSpread(game, wager, null), null);
});

Deno.test("evaluateSpread: fires in OT", () => {
  const game = makeGameState({ period: 3, clock: "2:00", home_score: 70, away_score: 69 });
  const wager = makeWager({ wager_type: "spread", line: -2, team_id: "team-duke" });
  const result = evaluateSpread(game, wager, null);
  assertNotEquals(result, null);
});

// ─── evaluateTotal ───

Deno.test("evaluateTotal: no alert before 15 min elapsed", () => {
  // Period 1, clock 10:00 → elapsed = 20 - 10 = 10 < 15
  const game = makeGameState({ period: 1, clock: "10:00", home_score: 30, away_score: 28 });
  const wager = makeWager({ wager_type: "over_under", line: 140, description: "Over 140" });
  assertEquals(evaluateTotal(game, wager), null);
});

Deno.test("evaluateTotal: no alert in 1st half even with 15+ min elapsed", () => {
  // Period 1, clock 3:00 → elapsed = 17 min, but period < 2
  const game = makeGameState({ period: 1, clock: "3:00", home_score: 45, away_score: 40 });
  const wager = makeWager({ wager_type: "over_under", line: 140, description: "Over 140" });
  assertEquals(evaluateTotal(game, wager), null);
});

Deno.test("evaluateTotal: fires when pace diverges 8+ from O/U line", () => {
  // Period 2, clock 8:00 → elapsed = 40-8 = 32 min, total=130, pace=(130/32)*40 = 162.5
  // Line 140, paceVsLine = 22.5 > 8, should fire
  const game = makeGameState({ period: 2, clock: "8:00", home_score: 68, away_score: 62 });
  const wager = makeWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  const result = evaluateTotal(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "total_alert");
});

Deno.test("evaluateTotal: no alert when pace close to line", () => {
  // Period 2, clock 8:00 → elapsed=32, total=112, pace=(112/32)*40=140 exactly
  // Line 140, paceVsLine = 0 < 8 → no alert
  const game = makeGameState({ period: 2, clock: "8:00", home_score: 58, away_score: 54 });
  const wager = makeWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(evaluateTotal(game, wager), null);
});

Deno.test("evaluateTotal: under bet tracks correctly", () => {
  // Same high-scoring game, but user bet Under → should be 'in danger'
  const game = makeGameState({ period: 2, clock: "8:00", home_score: 68, away_score: 62 });
  const wager = makeWager({
    wager_type: "over_under",
    line: 140,
    description: "Under 140",
    team_id: null,
  });
  const result = evaluateTotal(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.why.includes("in danger"), true);
});

// ─── evaluateMoneyline ───

Deno.test("evaluateMoneyline: no alert outside final 8 min of 2H", () => {
  const game = makeGameState({ period: 2, clock: "12:00", home_score: 50, away_score: 48 });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  assertEquals(evaluateMoneyline(game, wager, null), null);
});

Deno.test("evaluateMoneyline: no alert in 1st half", () => {
  const game = makeGameState({ period: 1, clock: "5:00" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  assertEquals(evaluateMoneyline(game, wager, null), null);
});

Deno.test("evaluateMoneyline: fires when close game in final minutes", () => {
  const game = makeGameState({ period: 2, clock: "3:00", home_score: 68, away_score: 65 });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  const result = evaluateMoneyline(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "moneyline_alert");
});

Deno.test("evaluateMoneyline: no alert when blowout (margin > 8)", () => {
  const game = makeGameState({ period: 2, clock: "3:00", home_score: 80, away_score: 65 });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  assertEquals(evaluateMoneyline(game, wager, null), null);
});

Deno.test("evaluateMoneyline: fires in OT", () => {
  const game = makeGameState({ period: 3, clock: "2:00", home_score: 72, away_score: 70 });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  const result = evaluateMoneyline(game, wager, null);
  assertNotEquals(result, null);
});

// ─── evaluateProp (proximity-based) ───

Deno.test("evaluateProp: no alert without summary", () => {
  const game = makeGameState();
  const wager = makeWager({ wager_type: "prop", description: "Donovan Clingan over 15.5 pts" });
  assertEquals(evaluateProp(game, wager, null), null);
});

Deno.test("evaluateProp: fires when player stat is at HIGH proximity (≥85% of target)", () => {
  const game = makeGameState({ period: 2, clock: "5:00" });
  const summary = makeSummaryStats(); // Clingan has 18 pts
  const wager = makeWager({
    wager_type: "prop",
    description: "Donovan Clingan Over 20 Points",
    team_id: null,
    line: 20,
  });
  // 18/20 = 0.90 → HIGH
  const result = evaluateProp(game, wager, summary);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "prop_alert");
  assertEquals(result!.body.includes("Donovan Clingan"), true);
});

Deno.test("evaluateProp: no alert when player stat below HIGH threshold", () => {
  const game = makeGameState({ period: 2, clock: "5:00" });
  const summary = makeSummaryStats(); // Clingan has 18 pts
  const wager = makeWager({
    wager_type: "prop",
    description: "Donovan Clingan Over 30 Points",
    team_id: null,
    line: 30,
  });
  // 18/30 = 0.60 → MEDIUM → no alert
  assertEquals(evaluateProp(game, wager, summary), null);
});

Deno.test("evaluateProp: fires RESOLVED when player exceeds target", () => {
  const game = makeGameState({ period: 2, clock: "5:00" });
  const summary = makeSummaryStats(); // Davis has 22 pts
  const wager = makeWager({
    wager_type: "prop",
    description: "RJ Davis Over 20 Points",
    team_id: null,
    line: 20,
  });
  // 22/20 = 1.10 → RESOLVED
  const result = evaluateProp(game, wager, summary);
  assertNotEquals(result, null);
  assertEquals(result!.title.includes("Hit"), true);
});

Deno.test("evaluateProp: no alert when player name not in summary", () => {
  const game = makeGameState({ period: 2, clock: "5:00" });
  const summary = makeSummaryStats();
  const wager = makeWager({
    wager_type: "prop",
    description: "Zach Edey Over 20.5 Points",
    team_id: null,
  });
  assertEquals(evaluateProp(game, wager, summary), null);
});

Deno.test("evaluateProp: returns null for unparseable prop description", () => {
  const game = makeGameState({ period: 2, clock: "5:00" });
  const summary = makeSummaryStats();
  const wager = makeWager({
    wager_type: "prop",
    description: "First team to score 10 points",
    team_id: null,
  });
  assertEquals(evaluateProp(game, wager, summary), null);
});

// ─── evaluatePosition ───

Deno.test("evaluatePosition: no alert in 1st half (generic fallback)", () => {
  const game = makeGameState({ period: 1, clock: "10:00" });
  const position = makePosition(); // "Duke to win vs UNC" — unparseable as player_stat/game_total
  assertEquals(evaluatePosition(game, position, null), null);
});

Deno.test("evaluatePosition: fires in close 2nd-half game (generic fallback)", () => {
  const game = makeGameState({ period: 2, clock: "5:00", home_score: 68, away_score: 65 });
  const position = makePosition(); // "Duke to win vs UNC" — falls through to generic
  const result = evaluatePosition(game, position, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "position_alert");
});

Deno.test("evaluatePosition: no alert when margin > 8 (generic fallback)", () => {
  const game = makeGameState({ period: 2, clock: "5:00", home_score: 80, away_score: 65 });
  const position = makePosition();
  assertEquals(evaluatePosition(game, position, null), null);
});

Deno.test("evaluatePosition: no alert when game not inprogress", () => {
  const game = makeGameState({ status: "scheduled" });
  const position = makePosition();
  assertEquals(evaluatePosition(game, position, null), null);
});

Deno.test("evaluatePosition: proximity-based alert for player stat market", () => {
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats(); // RJ Davis has 22 pts
  const position = makePosition({
    market_title: "RJ Davis Over 20 Points",
    platform: "kalshi",
    position_side: "yes",
  });
  const result = evaluatePosition(game, position, summary);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "position_alert");
  assertEquals(result!.body.includes("RJ Davis"), true);
});

// ─── evaluateResolved ───

Deno.test("evaluateResolved: only fires when game closed", () => {
  const game = makeGameState({ status: "inprogress" });
  const wager = makeWager();
  assertEquals(evaluateResolved(game, wager), null);
});

Deno.test("evaluateResolved: correctly reports spread cover", () => {
  // Duke home, score 75-70, spread -3.5 → margin=5, currentMargin=5, covered = 5 > -3.5 = true
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 70 });
  const wager = makeWager({ wager_type: "spread", line: -3.5, team_id: "team-duke" });
  const result = evaluateResolved(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "bet_resolved");
  assertEquals(result!.body.includes("Spread covered"), true);
});

Deno.test("evaluateResolved: correctly reports spread miss", () => {
  // Duke home, score 72-70, spread -3.5 → margin=2, covered = 2 > -3.5 = true
  // Wait: 2 > -3.5 is true, so it's covered. Need margin < line.
  // Duke home, score 71-70, spread -3.5 → margin=1, covered = 1 > -3.5 = true (still covered)
  // For a miss, need currentMargin <= line: e.g., score 72-70, line -3.5, margin=2, 2 > -3.5 is true...
  // Hmm, for home team: diff = currentMargin - line = margin - line
  // covered when currentMargin > line. If line is -3.5 and margin is 2, covered=2>-3.5=true
  // For NOT covered: need margin ≤ -3.5, meaning home loses by 4+
  // Score: 70-75, margin=-5, -5 > -3.5 → false → not covered
  const game = makeGameState({ status: "closed", home_score: 70, away_score: 75 });
  const wager = makeWager({ wager_type: "spread", line: -3.5, team_id: "team-duke" });
  const result = evaluateResolved(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.body.includes("Spread not covered"), true);
});

Deno.test("evaluateResolved: correctly reports ML win", () => {
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 70 });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke", line: null });
  const result = evaluateResolved(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.body.includes("Your team won"), true);
});

Deno.test("evaluateResolved: correctly reports O/U hit", () => {
  // Total 145, line 140, over → hit
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 70 });
  const wager = makeWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  const result = evaluateResolved(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.body.includes("Over hit"), true);
});

Deno.test("evaluateResolved: correctly reports O/U miss", () => {
  // Total 145, line 150, over → missed
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 70 });
  const wager = makeWager({
    wager_type: "over_under",
    line: 150,
    description: "Over 150",
    team_id: null,
  });
  const result = evaluateResolved(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.body.includes("Over missed"), true);
});

// ─── parseMLBClock ───

Deno.test("parseMLBClock: parses 'T7' as top of 7th", () => {
  const result = parseMLBClock("T7");
  assertEquals(result, { inning: 7, isTop: true });
});

Deno.test("parseMLBClock: parses 'B9' as bottom of 9th", () => {
  const result = parseMLBClock("B9");
  assertEquals(result, { inning: 9, isTop: false });
});

Deno.test("parseMLBClock: returns null for basketball clock format", () => {
  assertEquals(parseMLBClock("4:30"), null);
});

Deno.test("parseMLBClock: returns null for null input", () => {
  assertEquals(parseMLBClock(null), null);
});

// ─── evaluateMLBSpread ───

Deno.test("evaluateMLBSpread: no alert before inning 7", () => {
  const game = makeGameState({ clock: "T6", period: 6, home_score: 4, away_score: 3, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: -1.5, team_id: "team-duke" });
  assertEquals(evaluateMLBSpread(game, wager, null), null);
});

Deno.test("evaluateMLBSpread: no alert when margin too far from run line", () => {
  // Home leads 6-1 (margin 5), run line -1.5 → diff = 5 - (-1.5) = 6.5 > 1 → null
  const game = makeGameState({ clock: "T8", period: 8, home_score: 6, away_score: 1, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: -1.5, team_id: "team-duke" });
  assertEquals(evaluateMLBSpread(game, wager, null), null);
});

Deno.test("evaluateMLBSpread: fires in inning 7+ when within 1 run of line", () => {
  // Home leads 4-3 (margin 1), run line -1.5 → diff = 1 - (-1.5) = 2.5 > 1 → null
  // Home leads 3-2 (margin 1), run line -1.5 → same issue.
  // Need: currentMargin - runLine within [-1,1].
  // Home leads 3-2 (+1), run line +1.5 → diff = 1 - 1.5 = -0.5, abs=0.5 ≤ 1 → fires
  const game = makeGameState({ clock: "T7", period: 7, home_score: 3, away_score: 2, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: 1.5, team_id: "team-duke" });
  const result = evaluateMLBSpread(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "spread_alert");
});

Deno.test("evaluateMLBSpread: no alert for non-spread wager", () => {
  const game = makeGameState({ clock: "T8", period: 8, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline" });
  assertEquals(evaluateMLBSpread(game, wager, null), null);
});

// ─── evaluateMLBTotal ───

Deno.test("evaluateMLBTotal: no alert before inning 6", () => {
  const game = makeGameState({ clock: "T5", period: 5, home_score: 4, away_score: 3, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 8.5, description: "Over 8.5", team_id: null });
  assertEquals(evaluateMLBTotal(game, wager), null);
});

Deno.test("evaluateMLBTotal: no alert when pace too close to line", () => {
  // 5 runs through 5 innings played, pace = (5/5)*9 = 9.0, line 8.5, diff = 0.5 < 2 → null
  const game = makeGameState({ clock: "B6", period: 6, home_score: 3, away_score: 2, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 8.5, description: "Over 8.5", team_id: null });
  assertEquals(evaluateMLBTotal(game, wager), null);
});

Deno.test("evaluateMLBTotal: fires when pace diverges by ≥2 from line in inning 6+", () => {
  // Bot 8 = 7 innings played, 12 runs → pace = (12/7)*9 ≈ 15.4, line 8.5, diff = 6.9 ≥ 2 → fires
  const game = makeGameState({ clock: "B8", period: 8, home_score: 7, away_score: 5, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 8.5, description: "Over 8.5", team_id: null });
  const result = evaluateMLBTotal(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "total_alert");
  assertEquals(result!.title, "OVER 8.5");
});

// ─── evaluateMLBMoneyline ───

Deno.test("evaluateMLBMoneyline: no alert before inning 7", () => {
  const game = makeGameState({ clock: "T6", period: 6, home_score: 3, away_score: 2, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  assertEquals(evaluateMLBMoneyline(game, wager, null), null);
});

Deno.test("evaluateMLBMoneyline: no alert when margin > 2", () => {
  const game = makeGameState({ clock: "T8", period: 8, home_score: 6, away_score: 1, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  assertEquals(evaluateMLBMoneyline(game, wager, null), null);
});

Deno.test("evaluateMLBMoneyline: fires in inning 7+ when within 2 runs", () => {
  const game = makeGameState({ clock: "B9", period: 9, home_score: 4, away_score: 3, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  const result = evaluateMLBMoneyline(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "moneyline_alert");
});

Deno.test("evaluateMLBMoneyline: fires for tied game in inning 7+", () => {
  const game = makeGameState({ clock: "T9", period: 9, home_score: 3, away_score: 3, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  const result = evaluateMLBMoneyline(game, wager, null);
  assertNotEquals(result, null);
});

// ─── NFL / NCAAF evaluators ───

// evaluateFootballSpread

Deno.test("evaluateFootballSpread: fires in Q4 when within spread threshold", () => {
  // Home team (duke) trails by 2; spread line = -1 (home favored by 1)
  // currentMargin = home - away (from home perspective) = 14 - 16 = -2
  // diff = currentMargin - spreadLine = -2 - (-1) = -1 → |1| ≤ 4 → fires
  const game = makeGameState({ clock: "4:00", period: 4, home_score: 14, away_score: 16, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: -1, team_id: "team-duke" });
  const result = evaluateFootballSpread(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_close_game");
});

Deno.test("evaluateFootballSpread: no alert in Q2 (too early)", () => {
  const game = makeGameState({ clock: "8:00", period: 2, home_score: 10, away_score: 12, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: 3, team_id: "team-duke" });
  assertEquals(evaluateFootballSpread(game, wager, null), null);
});

Deno.test("evaluateFootballSpread: no alert when margin gap exceeds 4", () => {
  // Home leads 28, spread on home is -3 → currentMargin=28 → 28-(-3)=31, way above 4
  const game = makeGameState({ clock: "6:00", period: 4, home_score: 28, away_score: 7, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: -3, team_id: "team-duke" });
  assertEquals(evaluateFootballSpread(game, wager, null), null);
});

Deno.test("evaluateFootballSpread: fires in OT (period 5)", () => {
  const game = makeGameState({ clock: "8:00", period: 5, home_score: 21, away_score: 21, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: 2, team_id: "team-duke" }); // home +2, tied → diff = 0-2 = -2, within ±4
  const result = evaluateFootballSpread(game, wager, null);
  assertNotEquals(result, null);
});

Deno.test("evaluateFootballSpread: no alert in Q4 with more than 10 min left", () => {
  const game = makeGameState({ clock: "13:00", period: 4, home_score: 17, away_score: 14, status: "inprogress" });
  const wager = makeWager({ wager_type: "spread", line: 3, team_id: "team-duke" });
  assertEquals(evaluateFootballSpread(game, wager, null), null);
});

// evaluateFootballTotal

Deno.test("evaluateFootballTotal: fires in Q4 when pace diverges by > 10 points", () => {
  // Q4 with 5:00 left → minutesElapsed = 3*15 + (15-5) = 55 min
  // total = 48, pace = (48/55)*60 ≈ 52.4, line = 41.5 → paceVsLine ≈ +10.9 > 10
  const game = makeGameState({ clock: "5:00", period: 4, home_score: 28, away_score: 20, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 41.5, description: "OVER 41.5" });
  const result = evaluateFootballTotal(game, wager);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_close_game");
});

Deno.test("evaluateFootballTotal: no alert in Q1 (too early)", () => {
  const game = makeGameState({ clock: "10:00", period: 1, home_score: 7, away_score: 3, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 45, description: "OVER 45" });
  assertEquals(evaluateFootballTotal(game, wager), null);
});

Deno.test("evaluateFootballTotal: no alert when pace is within 10 points of line", () => {
  // Q3 with 8:00 left → minutesElapsed = 2*15 + 7 = 37 min
  // total = 21, pace = (21/37)*60 ≈ 34, line = 41.5 → paceVsLine = -7.5 → |<10| → no alert
  const game = makeGameState({ clock: "8:00", period: 3, home_score: 14, away_score: 7, status: "inprogress" });
  const wager = makeWager({ wager_type: "over_under", line: 41.5, description: "OVER 41.5" });
  assertEquals(evaluateFootballTotal(game, wager), null);
});

// evaluateFootballMoneyline

Deno.test("evaluateFootballMoneyline: fires in Q4 one-score game", () => {
  // trailing by 4 (one-score) in Q4 with 6 min left
  const game = makeGameState({ clock: "6:00", period: 4, home_score: 17, away_score: 21, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" }); // bet on home
  const result = evaluateFootballMoneyline(game, wager, null);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_close_game");
});

Deno.test("evaluateFootballMoneyline: no alert for blowout (margin > 8)", () => {
  const game = makeGameState({ clock: "5:00", period: 4, home_score: 35, away_score: 7, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  assertEquals(evaluateFootballMoneyline(game, wager, null), null);
});

Deno.test("evaluateFootballMoneyline: no alert in Q1", () => {
  const game = makeGameState({ clock: "6:00", period: 1, home_score: 7, away_score: 10, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  assertEquals(evaluateFootballMoneyline(game, wager, null), null);
});

Deno.test("evaluateFootballMoneyline: no alert in Q4 with more than 8 min left", () => {
  const game = makeGameState({ clock: "10:00", period: 4, home_score: 14, away_score: 17, status: "inprogress" });
  const wager = makeWager({ wager_type: "moneyline", team_id: "team-duke" });
  assertEquals(evaluateFootballMoneyline(game, wager, null), null);
});

// evaluateFootballCloseGame (follow-user, no wager)

Deno.test("evaluateFootballCloseGame: fires in Q4 one-score game with < 5 min", () => {
  const game = makeGameState({ clock: "2:30", period: 4, home_score: 21, away_score: 24, status: "inprogress" });
  const result = evaluateFootballCloseGame(game);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_close_game");
});

Deno.test("evaluateFootballCloseGame: no alert in Q3 (even if close)", () => {
  const game = makeGameState({ clock: "3:00", period: 3, home_score: 14, away_score: 17, status: "inprogress" });
  assertEquals(evaluateFootballCloseGame(game), null);
});

Deno.test("evaluateFootballCloseGame: no alert when margin > 8 (blowout)", () => {
  const game = makeGameState({ clock: "2:00", period: 4, home_score: 35, away_score: 10, status: "inprogress" });
  assertEquals(evaluateFootballCloseGame(game), null);
});

Deno.test("evaluateFootballCloseGame: fires in OT with close score", () => {
  const game = makeGameState({ clock: "7:30", period: 5, home_score: 28, away_score: 28, status: "inprogress" });
  const result = evaluateFootballCloseGame(game);
  assertNotEquals(result, null);
});

Deno.test("evaluateFootballCloseGame: no alert for closed game", () => {
  const game = makeGameState({ clock: "0:00", period: 4, home_score: 28, away_score: 24, status: "closed" });
  assertEquals(evaluateFootballCloseGame(game), null);
});
