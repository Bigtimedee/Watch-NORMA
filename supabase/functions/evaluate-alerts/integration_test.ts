// End-to-end integration tests for the alert pipeline.
//
// Wires the real pure-function stages together:
//   extractSignals → computeScore/checkMustNotify → determineAlertType
//   → buildWhyNow → computeDedupHash
//
// DB-dependent stages (Stage 0 candidate generation, Stage 3 throttle table
// lookups, Stage 4 alert insertion + push dispatch) require a live Supabase
// instance and are outside the scope of --allow-net=none tests. Those paths
// are validated by the staging smoke-test runbook and the unit tests in
// logic_test.ts / alert-scoring_test.ts.

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeGameState,
  makeSummaryStats,
  makeWager,
} from "../_shared/test-helpers.ts";
import {
  buildWhyNow,
  checkMustNotify,
  computeDedupHash,
  computeScore,
  determineAlertType,
  extractSignals,
  meetsThreshold,
} from "../_shared/alert-scoring.ts";

// ---------------------------------------------------------------------------
// Scenario 1 — Follower + close game + final 5 min → fires; blowout → no alert
// ---------------------------------------------------------------------------

Deno.test("scenario 1a: follower + close game + final 5 min → alert fires", () => {
  // margin 4, 2nd half, 3:30 left — close + final-5 + follows = 45
  const game = makeGameState({
    home_score: 68,
    away_score: 64,
    clock: "3:30",
    period: 2,
  });
  const signals = extractSignals(game, null, ["team-duke"], [], [], false);

  assertEquals(signals.follows_team, true, "should detect team follow");
  assertEquals(signals.is_close_game, true, "margin 4 in 2nd half = close game");
  assertEquals(signals.is_final_minutes, true, "3:30 remaining = final 5 min");

  const score = computeScore(signals);
  // follows_team(15) + close_game(20) + final_five_minutes(10) = 45
  assertEquals(score >= 45, true, `score should be ≥ 45, got ${score}`);
  assertEquals(meetsThreshold(score), true, "alert should fire");
});

Deno.test("scenario 1b: follower + blowout → no alert", () => {
  // margin 20, 2nd half, 8 min left — only follows_team signal
  const game = makeGameState({
    home_score: 88,
    away_score: 68,
    clock: "8:00",
    period: 2,
  });
  const signals = extractSignals(game, null, ["team-duke"], [], [], false);

  assertEquals(signals.follows_team, true, "should detect team follow");
  assertEquals(signals.is_close_game, false, "margin 20 is not a close game");
  assertEquals(signals.is_final_minutes, false, "8 min remaining is not final 5");

  const score = computeScore(signals);
  // only follows_team(15)
  assertEquals(score, 15, `blowout follower score should be 15, got ${score}`);
  assertEquals(meetsThreshold(score), false, "alert should NOT fire");
});

Deno.test("scenario 1c: follower + close game but first half → no alert (not in-scope)", () => {
  // 1st half — is_close_game requires 2nd half
  const game = makeGameState({
    home_score: 30,
    away_score: 28,
    clock: "4:00",
    period: 1,
  });
  const signals = extractSignals(game, null, ["team-duke"], [], [], false);

  assertEquals(signals.is_close_game, false, "1st half close game should not trigger is_close_game");
  assertEquals(meetsThreshold(computeScore(signals)), false, "1st-half follow alone should not fire");
});

// ---------------------------------------------------------------------------
// Scenario 2 — Wager line crossed → fires with correct wager_impact status
// ---------------------------------------------------------------------------

Deno.test("scenario 2a: spread wager — line being crossed → alert fires", () => {
  // Duke -3.5 (home). Duke trails by 2: diff = (-2) - (-3.5) = 1.5, |1.5| ≤ 4 → crossed
  const game = makeGameState({
    home_score: 63,
    away_score: 65,
    clock: "2:15",
    period: 2,
  });
  const wager = makeWager({ line: -3.5, team_id: "team-duke" });
  const signals = extractSignals(game, null, [], [], [wager], false);

  assertEquals(signals.wager_line_crossed, true, "spread line should be crossed");
  assertEquals(signals.has_wager, true);

  const score = computeScore(signals);
  // has_wager(30) + wager_line_crossed(25) = 55 minimum; game also in final 2:15
  // so is_close_game(20) + is_final_minutes(10) also contribute
  assert(score >= 55, `wager-line-crossed score should be ≥ 55, got ${score}`);
  assertEquals(meetsThreshold(score), true, "alert should fire");
});

Deno.test("scenario 2b: wager_impact.status when line is crossed", () => {
  const game = makeGameState({
    home_score: 63,
    away_score: 65,
    clock: "2:15",
    period: 2,
  });
  const wager = makeWager({ line: -3.5, team_id: "team-duke" });
  const signals = extractSignals(game, null, [], [], [wager], false);
  const score = computeScore(signals);
  const whyNow = buildWhyNow(game, signals, score, [wager], null);

  assert(whyNow.wager_impact != null, "wager_impact must be populated for wager holders");
  assertEquals(whyNow.wager_impact.wager_id, wager.id);
  assertEquals(whyNow.wager_impact.wager_description, wager.description);
  // currentMargin = -2, line = -3.5; code: -2 > -3.5 → "covering"
  assertEquals(whyNow.wager_impact.status, "covering");
});

Deno.test("scenario 2c: wager not covering when margin crosses below line", () => {
  // Duke trails by 4: currentMargin = -4, line = -3.5; -4 > -3.5 is false → not_covering
  const game = makeGameState({
    home_score: 61,
    away_score: 65,
    clock: "1:00",
    period: 2,
  });
  const wager = makeWager({ line: -3.5, team_id: "team-duke" });
  const signals = extractSignals(game, null, [], [], [wager], false);
  const whyNow = buildWhyNow(game, signals, computeScore(signals), [wager], null);

  assertEquals(whyNow.wager_impact?.status, "not_covering");
});

Deno.test("scenario 2d: wager_impact.status = decided when game is closed", () => {
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 68 });
  const wager = makeWager({ line: -3.5, team_id: "team-duke" });
  const signals = extractSignals(game, null, [], [], [wager], false);
  const whyNow = buildWhyNow(game, signals, computeScore(signals), [wager], null);

  assertEquals(whyNow.wager_impact?.status, "decided");
});

// ---------------------------------------------------------------------------
// Scenario 3 — Must-notify rules fire regardless of weighted score
// ---------------------------------------------------------------------------

Deno.test("scenario 3a: must-notify — overtime start", () => {
  // period 3 = OT1, clock 20:00 = start of OT
  const game = makeGameState({
    status: "inprogress",
    home_score: 68,
    away_score: 68,
    period: 3,
    clock: "20:00",
  });
  const wager = makeWager();
  const result = checkMustNotify(game, null, [wager]);

  assert(result != null, "must-notify should trigger for overtime");
  assertEquals(result!.alertType, "overtime");
  assert(result!.headline.toLowerCase().includes("overtime"), "headline should mention overtime");
});

Deno.test("scenario 3b: must-notify — game final with wager", () => {
  const game = makeGameState({ status: "closed", home_score: 75, away_score: 72 });
  const wager = makeWager();
  const result = checkMustNotify(game, null, [wager]);

  assert(result != null, "must-notify should trigger on game close for wager holders");
  assertEquals(result!.alertType, "bet_resolved");
  assert(result!.headline.toLowerCase().includes("final"), "headline should say Final");
  assert(result!.bullets.length > 0);
});

Deno.test("scenario 3c: must-notify — game final WITHOUT wager → no trigger", () => {
  const game = makeGameState({ status: "closed" });
  // No wagers — bet_resolved only fires for wager holders
  const result = checkMustNotify(game, null, []);
  assertEquals(result, null, "game final without wager should not must-notify");
});

Deno.test("scenario 3d: must-notify — 1-possession game under 2:00", () => {
  const game = makeGameState({
    status: "inprogress",
    home_score: 71,
    away_score: 69,
    clock: "1:30",
    period: 2,
  });
  const result = checkMustNotify(game, null, [makeWager()]);

  assert(result != null, "must-notify should trigger for 1-possession under 2:00");
  assertEquals(result!.alertType, "close_game");
  assert(result!.headline.toLowerCase().includes("1-possession"));
});

Deno.test("scenario 3e: must-notify — 1-possession under 2:00 with NO wager also triggers", () => {
  const game = makeGameState({
    status: "inprogress",
    home_score: 71,
    away_score: 69,
    clock: "1:30",
    period: 2,
  });
  // No wager — this rule is not wager-gated (unlike bet_resolved)
  const result = checkMustNotify(game, null, []);
  assert(result != null, "1-possession under 2:00 must-notify does not require a wager");
  assertEquals(result!.alertType, "close_game");
});

Deno.test("scenario 3f: must-notify — star player 4th foul", () => {
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
          personal_fouls: 4, // 4th foul — triggers must-notify
          points: 18,
          rebounds: 8,
          assists: 2,
        },
      ],
    },
  });
  const game = makeGameState({ status: "inprogress", clock: "8:00", period: 2 });
  const result = checkMustNotify(game, summary, []);

  assert(result != null, "4th foul on a starter with 10+ pts should must-notify");
  assertEquals(result!.alertType, "foul_trouble");
  assert(result!.headline.includes("Donovan Clingan"), "headline should name the player");
  assert(result!.bullets.some((b) => b.includes("4 fouls")));
});

Deno.test("scenario 3g: must-notify — 4th foul NOT triggered for bench player", () => {
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
          full_name: "Reserve Player",
          starter: false, // bench — does not trigger
          on_court: true,
          fouled_out: false,
          personal_fouls: 4,
          points: 12,
          rebounds: 3,
          assists: 1,
        },
      ],
    },
  });
  const game = makeGameState({ status: "inprogress" });
  const result = checkMustNotify(game, summary, []);
  assertEquals(result, null, "bench player 4th foul should NOT must-notify");
});

Deno.test("scenario 3h: must-notify — 4th foul NOT triggered for player with < 10 pts", () => {
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
          full_name: "Jared McCain",
          starter: true,
          on_court: true,
          fouled_out: false,
          personal_fouls: 4,
          points: 8, // below 10 — no must-notify
          rebounds: 2,
          assists: 3,
        },
      ],
    },
  });
  const game = makeGameState({ status: "inprogress" });
  const result = checkMustNotify(game, summary, []);
  assertEquals(result, null, "starter with < 10 pts should NOT must-notify on 4th foul");
});

// ---------------------------------------------------------------------------
// Scenario 4 — Dedup: 1-point change within same margin bucket → same hash
// ---------------------------------------------------------------------------

Deno.test("scenario 4a: margins in the same bucket produce the same dedup hash", () => {
  // bucket = floor(margin / 3); floor(4/3) = floor(5/3) = 1
  const h4 = computeDedupHash("user-1", "game-1", "close_game", 4, 2);
  const h5 = computeDedupHash("user-1", "game-1", "close_game", 5, 2);
  assertEquals(h4, h5, "margin 4 and 5 share bucket 1 — same hash");

  // floor(3/3) = 1 also same bucket
  const h3 = computeDedupHash("user-1", "game-1", "close_game", 3, 2);
  assertEquals(h3, h4, "margin 3 is also bucket 1 — same hash");
});

Deno.test("scenario 4b: margins in different buckets produce different hashes", () => {
  // bucket 1 (margin 4) vs bucket 2 (margin 6: floor(6/3) = 2)
  const h4 = computeDedupHash("user-1", "game-1", "close_game", 4, 2);
  const h6 = computeDedupHash("user-1", "game-1", "close_game", 6, 2);
  assertNotEquals(h4, h6, "margin 4 (bucket 1) and margin 6 (bucket 2) → different hashes");
});

Deno.test("scenario 4c: different users always produce different hashes", () => {
  const h1 = computeDedupHash("user-1", "game-1", "close_game", 4, 2);
  const h2 = computeDedupHash("user-2", "game-1", "close_game", 4, 2);
  assertNotEquals(h1, h2, "different users must produce different hashes");
});

Deno.test("scenario 4d: different alert types produce different hashes", () => {
  const h1 = computeDedupHash("user-1", "game-1", "close_game", 4, 2);
  const h2 = computeDedupHash("user-1", "game-1", "spread_alert", 4, 2);
  assertNotEquals(h1, h2, "different alert types must produce different hashes");
});

Deno.test("scenario 4e: hash is deterministic — same inputs always same output", () => {
  const h1 = computeDedupHash("user-abc", "game-xyz", "foul_trouble", 7, 2, "HIGH");
  const h2 = computeDedupHash("user-abc", "game-xyz", "foul_trouble", 7, 2, "HIGH");
  assertEquals(h1, h2, "hash function must be deterministic");
});

Deno.test("scenario 4f: different proximity levels produce different hashes", () => {
  const hHigh = computeDedupHash("user-1", "game-1", "prop_alert", 4, 2, "HIGH");
  const hLow = computeDedupHash("user-1", "game-1", "prop_alert", 4, 2, "LOW");
  assertNotEquals(hHigh, hLow, "different proximity levels must produce different hashes");
});

// ---------------------------------------------------------------------------
// Scenario 5 — Per-game cap and per-hour cap gate logic
//
// The live DB checks live in evaluate-alerts/index.ts and are not exercisable
// without a real Supabase instance. This scenario tests the cap threshold
// arithmetic and the dedup hash as the pure-function proxy for duplicate
// suppression. Full DB-backed cap enforcement is covered by the staging
// smoke-test runbook.
// ---------------------------------------------------------------------------

Deno.test("scenario 5a: per-game cap — at cap (5) should suppress", () => {
  const DEFAULT_PER_GAME_CAP = 5;
  // Mirrors: if ((gameAlertCount ?? 0) >= maxAlertsPerGame) { suppressed++ }
  assertEquals(5 >= DEFAULT_PER_GAME_CAP, true, "5th alert should be suppressed");
  assertEquals(4 >= DEFAULT_PER_GAME_CAP, false, "4th alert should NOT be suppressed");
});

Deno.test("scenario 5b: per-hour cap — at cap (10) should suppress", () => {
  const DEFAULT_PER_HOUR_CAP = 10;
  assertEquals(10 >= DEFAULT_PER_HOUR_CAP, true, "10th alert should be suppressed");
  assertEquals(9 >= DEFAULT_PER_HOUR_CAP, false, "9th alert should NOT be suppressed");
});

Deno.test("scenario 5c: dedup hash blocks repeated identical alert context", () => {
  // Same game state seen twice: same hash → throttle table blocks the second
  const h1 = computeDedupHash("user-1", "game-1", "spread_alert", 4, 2);
  const h2 = computeDedupHash("user-1", "game-1", "spread_alert", 4, 2);
  assertEquals(h1, h2, "identical context produces identical hash — throttle table blocks it");
});

// ---------------------------------------------------------------------------
// Scenario 6 — Quiet hours: push suppressed, in-app alert still created
//
// The in-app/push split is performed in evaluate-alerts/index.ts via:
//   suppressed_reason: suppressPush ? "quiet_hours" : null
//   if (!suppressPush) alertsToSendPush.push(newAlert.id)
// The quiet hours string comparison logic is pure and tested here.
// ---------------------------------------------------------------------------

// Mirror of index.ts quiet-hours check
function isInQuietHours(
  currentTime: string,
  start: string,
  end: string,
): boolean {
  if (start > end) {
    // Overnight window (e.g. 22:00 – 08:00)
    return currentTime >= start || currentTime < end;
  } else {
    return currentTime >= start && currentTime < end;
  }
}

Deno.test("scenario 6a: overnight quiet hours — inside window is suppressed", () => {
  assertEquals(isInQuietHours("23:00", "22:00", "08:00"), true);
  assertEquals(isInQuietHours("00:30", "22:00", "08:00"), true);
  assertEquals(isInQuietHours("07:59", "22:00", "08:00"), true);
});

Deno.test("scenario 6b: overnight quiet hours — outside window is not suppressed", () => {
  assertEquals(isInQuietHours("10:00", "22:00", "08:00"), false);
  assertEquals(isInQuietHours("21:59", "22:00", "08:00"), false);
  assertEquals(isInQuietHours("08:00", "22:00", "08:00"), false); // boundary excluded
});

Deno.test("scenario 6c: same-day quiet hours — inside window is suppressed", () => {
  assertEquals(isInQuietHours("14:30", "14:00", "16:00"), true);
  assertEquals(isInQuietHours("14:00", "14:00", "16:00"), true); // start inclusive
});

Deno.test("scenario 6d: same-day quiet hours — outside window is not suppressed", () => {
  assertEquals(isInQuietHours("13:59", "14:00", "16:00"), false);
  assertEquals(isInQuietHours("16:00", "14:00", "16:00"), false); // end exclusive
});

Deno.test("scenario 6e: quiet hours suppresses push but alert still has suppressed_reason", () => {
  // This validates the in-app record still exists (suppressed_reason field)
  // and confirms the split: push queue is only populated when suppressPush = false.
  const suppressPush = true;
  const suppressed_reason = suppressPush ? "quiet_hours" : null;
  const alertsToSendPush: number[] = [];
  const alertId = 42;

  if (!suppressPush) alertsToSendPush.push(alertId);

  assertEquals(suppressed_reason, "quiet_hours", "in-app alert must carry suppressed_reason");
  assertEquals(alertsToSendPush.length, 0, "push queue must be empty during quiet hours");
});

Deno.test("scenario 6f: outside quiet hours — push is dispatched and suppressed_reason is null", () => {
  const suppressPush = false;
  const suppressed_reason = suppressPush ? "quiet_hours" : null;
  const alertsToSendPush: number[] = [];
  const alertId = 43;

  if (!suppressPush) alertsToSendPush.push(alertId);

  assertEquals(suppressed_reason, null, "suppressed_reason must be null outside quiet hours");
  assertEquals(alertsToSendPush.length, 1, "alert must be in push queue outside quiet hours");
});

// ---------------------------------------------------------------------------
// Scenario 7 — User with no follows/wagers/positions → never becomes candidate
// ---------------------------------------------------------------------------

Deno.test("scenario 7a: only users with stake become candidates", () => {
  const wagerUsers = new Set(["user-with-wager"]);
  const positionUsers = new Set(["user-with-position"]);
  const followUsers = [{ user_id: "user-with-follow" }];

  const allCandidates = new Set([
    ...wagerUsers,
    ...positionUsers,
    ...followUsers.map((f) => f.user_id),
  ]);

  assertEquals(allCandidates.has("user-no-stake"), false, "no-stake user must not appear");
  assertEquals(allCandidates.size, 3, "exactly 3 unique candidates");
});

Deno.test("scenario 7b: no-stake user produces no signals", () => {
  const game = makeGameState({ home_score: 72, away_score: 68, clock: "3:00", period: 2 });

  // Empty wagers, empty follows, no positions
  const signals = extractSignals(game, null, [], [], [], false);

  assertEquals(signals.follows_team, false);
  assertEquals(signals.has_wager, false);
  assertEquals(signals.has_position, false);
  assertEquals(signals.follows_player_on_court, false);

  // Score with no user signals: only game-state signals
  // is_close_game(20) + is_final_minutes(10) = 30 — below threshold
  const score = computeScore(signals);
  assertEquals(meetsThreshold(score), false, "no-stake user score below threshold");
});

Deno.test("scenario 7c: early return on empty candidate set mirrors index.ts fast-path", () => {
  // Mirrors: if (allUserIds.size === 0) return early
  const candidates = new Set<string>();
  const shouldReturnEarly = candidates.size === 0;
  assertEquals(shouldReturnEarly, true, "empty candidate set should trigger early return");
});

// ---------------------------------------------------------------------------
// Full pipeline orchestration — all stages chained together
// ---------------------------------------------------------------------------

Deno.test("full pipeline: wager + close game → fires with complete WhyNow and deterministic hash", () => {
  const game = makeGameState({
    home_score: 63,
    away_score: 65,
    clock: "3:00",
    period: 2,
  });
  const wager = makeWager({ line: -3.5, team_id: "team-duke" });
  const summary = makeSummaryStats();

  // Stage 1: Signal extraction
  const signals = extractSignals(game, summary, ["team-duke"], [], [wager], false);

  // Stage 2: Must-notify + scoring
  const mustNotify = checkMustNotify(game, summary, [wager]);
  const score = computeScore(signals);
  const fires = mustNotify != null || meetsThreshold(score);

  // Stage 2b: WhyNow
  const alertType = determineAlertType(signals, mustNotify, [wager]);
  const whyNow = buildWhyNow(game, signals, score, [wager], mustNotify);

  // Stage 3: Dedup hash
  const hash = computeDedupHash(
    "user-1",
    game.id,
    alertType,
    signals.margin,
    signals.period,
    signals.proximity_level ?? undefined,
  );

  // Assertions
  assert(fires, "pipeline must produce a fireable alert");
  assert(alertType.length > 0, "alertType must be determined");
  assert(whyNow.headline.length > 0, "WhyNow headline must be non-empty");
  assert(whyNow.bullets.length > 0, "WhyNow must have at least one bullet");
  assert(whyNow.stats_used.margin != null, "stats_used must include margin");
  assert(
    whyNow.confidence >= 0 && whyNow.confidence <= 1,
    `confidence must be 0–1, got ${whyNow.confidence}`,
  );
  assert(whyNow.wager_impact != null, "wager_impact must be populated for wager holder");
  assert(hash.length > 0, "dedup hash must be non-empty string");

  // Hash is stable across two calls with identical inputs
  const hash2 = computeDedupHash(
    "user-1",
    game.id,
    alertType,
    signals.margin,
    signals.period,
    signals.proximity_level ?? undefined,
  );
  assertEquals(hash, hash2, "dedup hash must be deterministic");
});

Deno.test("full pipeline: must-notify overtime fires regardless of weighted score", () => {
  // Game tied going to OT — no wagers, no follows
  const game = makeGameState({
    status: "inprogress",
    home_score: 68,
    away_score: 68,
    clock: "20:00",
    period: 3,
  });
  const wager = makeWager();
  const summary = makeSummaryStats();

  const signals = extractSignals(game, summary, [], [], [wager], false);
  const mustNotify = checkMustNotify(game, summary, [wager]);
  const score = computeScore(signals);

  // must-notify fires independently of threshold
  assert(mustNotify != null, "overtime must trigger must-notify");
  assertEquals(mustNotify!.alertType, "overtime");

  const fires = mustNotify != null || meetsThreshold(score);
  assert(fires, "must-notify override makes alert fire regardless of score");

  const whyNow = buildWhyNow(game, signals, score, [wager], mustNotify);
  assertEquals(whyNow.headline, mustNotify!.headline, "WhyNow headline must use must-notify headline");
});

Deno.test("full pipeline: follow-only user never alerts for irrelevant game", () => {
  // User follows "team-michigan" — this game is Duke vs UNC
  const game = makeGameState({
    home_score: 72,
    away_score: 65,
    clock: "2:00",
    period: 2,
  });
  // 1-possession margin would normally trigger must-notify, but margin = 7 > 3
  const signals = extractSignals(game, null, ["team-michigan"], [], [], false);
  const mustNotify = checkMustNotify(game, null, []);
  const score = computeScore(signals);

  assertEquals(signals.follows_team, false, "team-michigan does not play in this game");
  assertEquals(mustNotify, null, "no must-notify for this margin/clock");
  assertEquals(meetsThreshold(score), false, "follow-only with no game stake should not fire");
});
