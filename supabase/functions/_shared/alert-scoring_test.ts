import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractSignals,
  computeScore,
  meetsThreshold,
  buildWhyNow,
  computeDedupHash,
  checkMustNotify,
  determineAlertType,
} from "./alert-scoring.ts";
import {
  makeGameState,
  makeWager,
  makeSummaryStats,
} from "./test-helpers.ts";

// ─── computeScore ───

Deno.test("scoring: wager + line crossed = 55 (above threshold)", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "4:00", home_score: 68, away_score: 67 }),
    null,
    [],
    [],
    [makeWager({ wager_type: "spread", line: -3, team_id: "team-duke" })],
    false,
  );
  const score = computeScore(signals);
  assertEquals(signals.has_wager, true);
  assertEquals(signals.wager_line_crossed, true);
  assertEquals(score >= 40, true);
  assertEquals(meetsThreshold(score), true);
});

Deno.test("scoring: follows team + close game = 35 (below threshold)", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "8:00", home_score: 68, away_score: 65 }),
    null,
    ["team-duke"],
    [],
    [],
    false,
  );
  const score = computeScore(signals);
  assertEquals(signals.follows_team, true);
  assertEquals(signals.is_close_game, true);
  // follows_team(15) + close_game(20) = 35 < 40
  assertEquals(score, 35);
  assertEquals(meetsThreshold(score), false);
});

Deno.test("scoring: follows team + close game + final 5 min = 45 (above threshold)", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "4:00", home_score: 68, away_score: 65 }),
    null,
    ["team-duke"],
    [],
    [],
    false,
  );
  const score = computeScore(signals);
  assertEquals(signals.follows_team, true);
  assertEquals(signals.is_close_game, true);
  assertEquals(signals.is_final_minutes, true);
  // follows_team(15) + close_game(20) + final_five(10) = 45
  assertEquals(score, 45);
  assertEquals(meetsThreshold(score), true);
});

Deno.test("scoring: blowout + follows team = 15 (below threshold)", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "4:00", home_score: 80, away_score: 60 }),
    null,
    ["team-duke"],
    [],
    [],
    false,
  );
  const score = computeScore(signals);
  assertEquals(signals.follows_team, true);
  assertEquals(signals.is_close_game, false);
  // follows_team(15) + final_five(10) = 25
  assertEquals(meetsThreshold(score), false);
});

Deno.test("scoring: proximity HIGH adds 35 to score", () => {
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats(); // Clingan has 18 pts
  const wager = makeWager({
    wager_type: "prop",
    description: "Donovan Clingan Over 20 Points",
    team_id: null,
    line: 20,
  });
  const signals = extractSignals(game, summary, [], [], [wager], false);
  assertEquals(signals.proximity_level, "HIGH");
  const score = computeScore(signals);
  // has_wager(30) + proximity_high(35) + close_game(20) + final_five(10) = 95
  assertEquals(score >= 40, true);
});

// ─── checkMustNotify ───

Deno.test("mustNotify: game final with wagers", () => {
  const game = makeGameState({ status: "closed" });
  const wagers = [makeWager()];
  const result = checkMustNotify(game, null, wagers);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "bet_resolved");
});

Deno.test("mustNotify: no wagers, game final = no must-notify", () => {
  const game = makeGameState({ status: "closed" });
  assertEquals(checkMustNotify(game, null, []), null);
});

Deno.test("mustNotify: overtime detection", () => {
  const game = makeGameState({ period: 3, clock: "4:30", status: "inprogress" });
  const result = checkMustNotify(game, null, []);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "overtime");
});

Deno.test("mustNotify: close game under 2 min", () => {
  const game = makeGameState({ period: 2, clock: "1:30", home_score: 68, away_score: 66, status: "inprogress" });
  const result = checkMustNotify(game, null, []);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "close_game");
});

Deno.test("mustNotify: star foul trouble (4 fouls, starter, 10+ pts)", () => {
  const summary = makeSummaryStats({
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
          personal_fouls: 4,
          points: 18,
          rebounds: 8,
          assists: 2,
        },
      ],
    },
  });
  const game = makeGameState({ status: "inprogress" });
  const result = checkMustNotify(game, summary, []);
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "foul_trouble");
  assertEquals(result!.headline.includes("Clingan"), true);
});

// ─── buildWhyNow ───

Deno.test("whyNow: has headline and bullets", () => {
  const game = makeGameState({ period: 2, clock: "4:00", home_score: 68, away_score: 65 });
  const signals = extractSignals(game, null, ["team-duke"], [], [makeWager()], false);
  const score = computeScore(signals);
  const whyNow = buildWhyNow(game, signals, score, [makeWager()], null);

  assertNotEquals(whyNow.headline, "");
  assertEquals(whyNow.bullets.length > 0, true);
  assertEquals(whyNow.confidence > 0, true);
  assertNotEquals(whyNow.wager_impact, undefined);
});

Deno.test("whyNow: proximity HIGH sets headline to 'Your Bet Is Close'", () => {
  const game = makeGameState({ period: 2, clock: "5:00", status: "inprogress" });
  const summary = makeSummaryStats();
  const wager = makeWager({
    wager_type: "prop",
    description: "Donovan Clingan Over 20 Points",
    team_id: null,
    line: 20,
  });
  const signals = extractSignals(game, summary, [], [], [wager], false);
  const score = computeScore(signals);
  const whyNow = buildWhyNow(game, signals, score, [wager], null);

  assertEquals(whyNow.headline, "Your Bet Is Close");
});

// ─── computeDedupHash ───

Deno.test("dedup: same inputs produce same hash", () => {
  const h1 = computeDedupHash("u1", "g1", "spread_alert", 3, 2);
  const h2 = computeDedupHash("u1", "g1", "spread_alert", 3, 2);
  assertEquals(h1, h2);
});

Deno.test("dedup: different margin buckets produce different hashes", () => {
  const h1 = computeDedupHash("u1", "g1", "spread_alert", 1, 2); // bucket 0
  const h2 = computeDedupHash("u1", "g1", "spread_alert", 5, 2); // bucket 1
  assertNotEquals(h1, h2);
});

Deno.test("dedup: different proximity levels produce different hashes", () => {
  const h1 = computeDedupHash("u1", "g1", "prop_alert", 3, 2, "HIGH");
  const h2 = computeDedupHash("u1", "g1", "prop_alert", 3, 2, "RESOLVED");
  assertNotEquals(h1, h2);
});

Deno.test("dedup: no proximity vs explicit 'none' produce same hash", () => {
  const h1 = computeDedupHash("u1", "g1", "spread_alert", 3, 2);
  const h2 = computeDedupHash("u1", "g1", "spread_alert", 3, 2, undefined);
  assertEquals(h1, h2);
});

// ─── determineAlertType ───

Deno.test("alertType: spread wager with line crossed → spread_alert", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "4:00", home_score: 68, away_score: 67 }),
    null,
    [],
    [],
    [makeWager({ wager_type: "spread", line: -3, team_id: "team-duke" })],
    false,
  );
  assertEquals(determineAlertType(signals, null, [makeWager({ wager_type: "spread", line: -3 })]), "spread_alert");
});

Deno.test("alertType: position without wager → position_alert", () => {
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "4:00" }),
    null,
    [],
    [],
    [],
    true,
  );
  assertEquals(determineAlertType(signals, null, []), "position_alert");
});

Deno.test("alertType: must-notify overrides everything", () => {
  const mustNotify = { alertType: "overtime", headline: "OT", bullets: [] };
  const signals = extractSignals(
    makeGameState({ period: 3 }),
    null,
    [],
    [],
    [makeWager()],
    false,
  );
  assertEquals(determineAlertType(signals, mustNotify, [makeWager()]), "overtime");
});

// ─── Football signal extraction ───

Deno.test("signals football: is_close_game uses one-score margin (≤8) in Q3+", () => {
  // Q3 with 7-point margin — should be close_game for football
  const signals = extractSignals(
    makeGameState({ period: 3, clock: "8:00", home_score: 14, away_score: 21, status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(signals.is_close_game, true);
});

Deno.test("signals football: is_close_game false for margin > 8 in Q3+", () => {
  const signals = extractSignals(
    makeGameState({ period: 3, clock: "8:00", home_score: 28, away_score: 10, status: "inprogress" }),
    null, [], [], [], false, 0, [], "ncaaf",
  );
  assertEquals(signals.is_close_game, false);
});

Deno.test("signals football: is_close_game false in Q1/Q2 even if margin ≤8", () => {
  // Football "second half" is Q3/Q4; Q2 should NOT be flagged as close game
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "5:00", home_score: 14, away_score: 10, status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(signals.is_close_game, false);
});

Deno.test("signals football: is_overtime fires at period >= 5 only", () => {
  const notOT = extractSignals(
    makeGameState({ period: 4, clock: "2:00", status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(notOT.is_overtime, false);

  const ot = extractSignals(
    makeGameState({ period: 5, clock: "8:00", status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(ot.is_overtime, true);
});

Deno.test("signals football: is_final_minutes only in Q4 (not Q3)", () => {
  const q3 = extractSignals(
    makeGameState({ period: 3, clock: "3:00", status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(q3.is_final_minutes, false);

  const q4 = extractSignals(
    makeGameState({ period: 4, clock: "3:00", status: "inprogress" }),
    null, [], [], [], false, 0, [], "nfl",
  );
  assertEquals(q4.is_final_minutes, true);
});

// ─── checkMustNotify football ───

Deno.test("mustNotify football: OT fires at period 5 (not period 3)", () => {
  // Period 3 is Q3 in football — should NOT fire OT
  const notOT = checkMustNotify(
    makeGameState({ period: 3, clock: "14:45", status: "inprogress" }),
    null, [], "nfl",
  );
  assertEquals(notOT, null);

  // Period 5 is OT in football — should fire
  const otResult = checkMustNotify(
    makeGameState({ period: 5, clock: "9:30", status: "inprogress" }),
    null, [], "nfl",
  );
  assertNotEquals(otResult, null);
  assertEquals(otResult!.alertType, "football_overtime");
});

Deno.test("mustNotify football: two-minute warning in Q4 one-score game", () => {
  const result = checkMustNotify(
    makeGameState({ period: 4, clock: "1:58", home_score: 21, away_score: 24, status: "inprogress" }),
    null, [], "nfl",
  );
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_two_minute");
});

Deno.test("mustNotify football: two-minute Q4 does NOT fire for blowout (margin > 8)", () => {
  const result = checkMustNotify(
    makeGameState({ period: 4, clock: "1:58", home_score: 35, away_score: 7, status: "inprogress" }),
    null, [], "nfl",
  );
  assertEquals(result, null);
});

Deno.test("mustNotify football: NFL fires Q2 two-minute warning; NCAAF does not", () => {
  const nflQ2 = checkMustNotify(
    makeGameState({ period: 2, clock: "1:55", home_score: 14, away_score: 17, status: "inprogress" }),
    null, [], "nfl",
  );
  assertNotEquals(nflQ2, null);
  assertEquals(nflQ2!.alertType, "football_two_minute");

  const ncaafQ2 = checkMustNotify(
    makeGameState({ period: 2, clock: "1:55", home_score: 14, away_score: 17, status: "inprogress" }),
    null, [], "ncaaf",
  );
  assertEquals(ncaafQ2, null);
});

Deno.test("mustNotify football: lead change in final 5 min fires close_game alert", () => {
  const result = checkMustNotify(
    makeGameState({ period: 4, clock: "3:30", home_score: 28, away_score: 31, status: "inprogress" }),
    null, [], "nfl", 1,  // leadChangesRecent = 1
  );
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "football_close_game");
});

Deno.test("mustNotify football: game final always fires for wager holders", () => {
  const result = checkMustNotify(
    makeGameState({ status: "closed" }),
    null, [makeWager()], "nfl",
  );
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "bet_resolved");
});

Deno.test("mustNotify basketball: period 3 still correctly triggers overtime (backward compat)", () => {
  const result = checkMustNotify(
    makeGameState({ period: 3, clock: "4:30", status: "inprogress" }),
    null, [],
    // no sport arg (defaults to basketball)
  );
  assertNotEquals(result, null);
  assertEquals(result!.alertType, "overtime");
});

Deno.test("scoring: fantasy player in game + close game = 40 (alert fires)", () => {
  const summary = makeSummaryStats();
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "8:00", home_score: 68, away_score: 65 }),
    summary,
    [],
    ["donovan clingan"],
    [],
    false,
  );
  assertEquals(signals.follows_player_in_game, true);
  const score = computeScore(signals);
  // follows_player_in_game(20) + close_game(20) + on_court(5) = 45
  assertEquals(score >= 40, true);
  assertEquals(meetsThreshold(score), true);
});

Deno.test("scoring: fantasy player not in this game does not fire on close game alone", () => {
  const summary = makeSummaryStats();
  const signals = extractSignals(
    makeGameState({ period: 2, clock: "8:00", home_score: 68, away_score: 65 }),
    summary,
    [],
    ["justin jefferson"],
    [],
    false,
  );
  assertEquals(signals.follows_player_in_game, false);
  assertEquals(signals.follows_player_on_court, false);
  const score = computeScore(signals);
  assertEquals(score, 20); // close_game only
  assertEquals(meetsThreshold(score), false);
});
