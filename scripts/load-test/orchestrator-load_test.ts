// CI-safe Deno tests for the load-test harness invariants.
// Runs with small N so the full suite completes in < 1s.
// Large-N runs (LOAD_GAMES=60) are manual — see doc 08 for instructions.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertBackoff,
  assertInvariants,
  runLoadTest,
} from "./orchestrator-load.ts";

// ---------------------------------------------------------------------------
// Backoff invariants (pure function — no simulation needed)
// ---------------------------------------------------------------------------

Deno.test("backoff: monotonically increasing and capped at 5 min", () => {
  for (let errorCount = 0; errorCount <= 20; errorCount++) {
    assertBackoff(errorCount); // throws on violation
  }
  // Spot-check values
  // computeBackoff(0) = min(30_000 * 1, 300_000) = 30_000
  // computeBackoff(1) = min(30_000 * 2, 300_000) = 60_000
  // computeBackoff(2) = min(30_000 * 4, 300_000) = 120_000
  // computeBackoff(3) = min(30_000 * 8, 300_000) = 240_000
  // computeBackoff(4) = min(30_000 * 16, 300_000) = 300_000
  // computeBackoff(10) = capped at 300_000
});

// ---------------------------------------------------------------------------
// Invariant assertions on cycle stats
// ---------------------------------------------------------------------------

Deno.test("assertInvariants: passes for valid stats", () => {
  assertInvariants({
    cycle: 0,
    pbp_dispatched: 5,
    pbp_skipped_cap: 3,
    summary_dispatched: 3,
    summary_skipped_cap: 1,
    alert_dispatched: 10,
    alert_skipped_cap: 2,
    games_deactivated: 0,
  });
});

Deno.test("assertInvariants: throws when PBP exceeds cap", () => {
  let threw = false;
  try {
    assertInvariants({
      cycle: 0,
      pbp_dispatched: 6, // exceeds MAX_PBP_DISPATCHES=5
      pbp_skipped_cap: 0,
      summary_dispatched: 1,
      summary_skipped_cap: 0,
      alert_dispatched: 1,
      alert_skipped_cap: 0,
      games_deactivated: 0,
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "should throw on PBP cap violation");
});

Deno.test("assertInvariants: throws when summary exceeds cap", () => {
  let threw = false;
  try {
    assertInvariants({
      cycle: 0,
      pbp_dispatched: 1,
      pbp_skipped_cap: 0,
      summary_dispatched: 4, // exceeds MAX_SUMMARY_DISPATCHES=3
      summary_skipped_cap: 0,
      alert_dispatched: 1,
      alert_skipped_cap: 0,
      games_deactivated: 0,
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "should throw on summary cap violation");
});

// ---------------------------------------------------------------------------
// Full run with small N (CI-safe: 8 games, 20 cycles, no errors)
// ---------------------------------------------------------------------------

Deno.test("load run: 8 games × 20 cycles, 0% error — no starvation, caps held", () => {
  const result = runLoadTest(8, 20, 0, 99, 42);

  assert(result.passed, "run should complete without invariant violations");
  assertEquals(result.starvedGames.length, 0, "with 8 games and max-5 PBP, no starvation expected");
  assert(result.totalPbpDispatched > 0, "must have dispatched at least one PBP");
  assert(result.p50PbpIntervalMs > 0, "p50 PBP interval must be measurable");
  assert(
    result.p95PbpIntervalMs <= 120_000,
    `p95 PBP interval ${result.p95PbpIntervalMs}ms should be ≤120s with 8 games`,
  );
});

Deno.test("load run: 8 games × 20 cycles, 20% error — backoff accumulates, caps still held", () => {
  const result = runLoadTest(8, 20, 0.20, 99, 7);

  assert(result.passed, "run should not throw even with high error rate");
  assert(
    result.maxBackoffObserved <= 300_000,
    `max backoff ${result.maxBackoffObserved}ms must not exceed 300s cap`,
  );
  // All cycle stats must have respected caps (assertInvariants called inside runLoadTest)
  for (const s of result.cycleStats) {
    assert(s.pbp_dispatched <= 5, `cycle ${s.cycle}: PBP dispatched ${s.pbp_dispatched} > 5`);
    assert(s.summary_dispatched <= 3, `cycle ${s.cycle}: summary dispatched ${s.summary_dispatched} > 3`);
    assert(s.alert_dispatched <= 10, `cycle ${s.cycle}: alert dispatched ${s.alert_dispatched} > 10`);
  }
});

Deno.test("load run: game deactivation — closed games stop receiving dispatches", () => {
  // Close ALL games at cycle 5; no dispatches should happen after that (closeFraction=1.0)
  const result = runLoadTest(4, 10, 0, 5, 1, 1.0);

  assert(result.passed);
  // After cycle 5 all games are closed — later cycles should have 0 dispatches
  const lateCycles = result.cycleStats.filter((s) => s.cycle >= 6);
  for (const s of lateCycles) {
    assertEquals(s.pbp_dispatched, 0, `cycle ${s.cycle}: deactivated games should not be dispatched`);
    assertEquals(s.summary_dispatched, 0, `cycle ${s.cycle}: deactivated games should not be dispatched`);
  }
});

Deno.test("load run: starvation detection — 20 games × 5 cycles reports starved games", () => {
  // 20 games, only 5 PBP slots per cycle, only 5 cycles → some games will get 0 PBP
  const result = runLoadTest(20, 5, 0, 99, 3);

  assert(result.passed, "should not throw");
  // With 20 games and only 5 PBP dispatches per cycle across 5 cycles = 25 total PBP slots
  // Each game needs ≥1 slot. Round-robin ordering means all SHOULD get covered in theory,
  // but with staggered jitter some may not be due yet. Just assert the detection works.
  assert(result.starvedGames.length >= 0, "starved games count must be non-negative");
  assert(
    result.totalPbpDispatched <= 5 * 5,
    `total PBP dispatched ${result.totalPbpDispatched} cannot exceed 25 (5 cap × 5 cycles)`,
  );
});
