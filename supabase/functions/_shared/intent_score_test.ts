// Tests for computeIntentScore() (P2-01).
//
// Intent score must be:
//   - Bounded [0, 1]
//   - Deterministic (same inputs → same output)
//   - 3 decimal precision
//   - Responsive to game-state premiums (overtime, final minutes, close game)

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeIntentScore } from "./alert-scoring.ts";
import type { SignalVector } from "./alert-scoring.ts";

function makeSignals(overrides: Partial<SignalVector> = {}): SignalVector {
  return {
    margin: 5,
    clock_minutes: 6.0,
    period: 2,
    is_close_game: false,
    is_final_minutes: false,
    is_final_two: false,
    is_overtime: false,
    is_closed: false,
    home_biggest_lead: 10,
    away_biggest_lead: 8,
    bench_points_delta: 4,
    efg_delta: 3,
    foul_trouble: [],
    lead_changes_recent: 0,
    follows_team: false,
    follows_player_on_court: false,
    has_wager: false,
    wager_line_crossed: false,
    has_position: false,
    proximity_level: null,
    proximity_result: null,
    ...overrides,
  };
}

Deno.test("computeIntentScore: score 0 → 0.0", () => {
  assertEquals(computeIntentScore(0, makeSignals()), 0.0);
});

Deno.test("computeIntentScore: always bounded [0, 1] across score range", () => {
  for (const score of [0, 10, 40, 75, 100, 150, 200]) {
    const result = computeIntentScore(score, makeSignals());
    assert(result >= 0 && result <= 1, `score=${score} → ${result} out of [0,1]`);
  }
});

Deno.test("computeIntentScore: bounded [0, 1] with all premiums active", () => {
  const allPremiums = makeSignals({
    is_overtime: true,
    is_final_two: true,
    is_close_game: true,
    is_final_minutes: true,
  });
  for (const score of [0, 50, 100, 200]) {
    const result = computeIntentScore(score, allPremiums);
    assert(result >= 0 && result <= 1, `premium score=${score} → ${result} out of [0,1]`);
  }
});

Deno.test("computeIntentScore: overtime premium increases score", () => {
  const base = computeIntentScore(50, makeSignals());
  const withOT = computeIntentScore(50, makeSignals({ is_overtime: true }));
  assert(withOT > base, `OT should increase score: base=${base} vs OT=${withOT}`);
});

Deno.test("computeIntentScore: close game premium increases score", () => {
  const base = computeIntentScore(50, makeSignals());
  const withClose = computeIntentScore(50, makeSignals({ is_close_game: true }));
  assert(withClose > base, `Close game should increase score: base=${base} vs close=${withClose}`);
});

Deno.test("computeIntentScore: deterministic — same inputs always same output", () => {
  const signals = makeSignals({ is_close_game: true, is_final_two: true });
  const a = computeIntentScore(55, signals);
  const b = computeIntentScore(55, signals);
  const c = computeIntentScore(55, signals);
  assertEquals(a, b, "First two calls differ");
  assertEquals(b, c, "Second and third calls differ");
});

Deno.test("computeIntentScore: 3 decimal precision", () => {
  const scores = [45, 50, 73];
  for (const score of scores) {
    const result = computeIntentScore(score, makeSignals());
    assertEquals(
      result,
      Math.round(result * 1000) / 1000,
      `score=${score} → ${result} not 3dp`
    );
  }
});

Deno.test("computeIntentScore: higher alert score → higher intent score", () => {
  const signals = makeSignals();
  const low = computeIntentScore(20, signals);
  const mid = computeIntentScore(50, signals);
  const high = computeIntentScore(80, signals);
  assert(low <= mid && mid <= high, `Expected ordering: ${low} <= ${mid} <= ${high}`);
});
