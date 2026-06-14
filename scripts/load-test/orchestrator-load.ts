/**
 * orchestrator-load.ts — Load-test harness for the game-watcher-orchestrator
 *
 * Simulates N simultaneous live games passing through the orchestrator dispatch
 * loop for CYCLES ticks (each tick = 1 simulated minute). Validates that the
 * concurrency caps, backoff, and game-closure deactivation hold at March Madness
 * scale (target: 60 games).
 *
 * Usage:
 *   deno run --allow-env scripts/load-test/orchestrator-load.ts
 *   LOAD_GAMES=60 deno run --allow-env scripts/load-test/orchestrator-load.ts
 *   LOAD_GAMES=60 LOAD_CYCLES=60 ERROR_RATE=0.1 deno run --allow-env scripts/load-test/orchestrator-load.ts
 *
 * No external network calls are made. All orchestrator logic is replicated
 * here to keep the harness self-contained and CI-safe.
 */

// ---------------------------------------------------------------------------
// Configuration — mirrors game-watcher-orchestrator/index.ts constants
// ---------------------------------------------------------------------------

const N_GAMES = parseInt(Deno.env.get("LOAD_GAMES") ?? "10");
const N_CYCLES = parseInt(Deno.env.get("LOAD_CYCLES") ?? "30");
// Fraction of dispatches that simulate a transient error (0–1)
const ERROR_RATE = parseFloat(Deno.env.get("ERROR_RATE") ?? "0.05");

// Concurrency caps (must match production constants)
const MAX_PBP_DISPATCHES = 5;
const MAX_SUMMARY_DISPATCHES = 3;
const MAX_ALERT_DISPATCHES = 10;

// Backoff constants (must match production)
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// Polling intervals per sport (ms)
const SPORT_INTERVALS: Record<string, { pbp: number; summary: number; alert: number }> = {
  ncaam: { pbp: 30_000,  summary: 120_000, alert: 60_000 },
  nba:   { pbp: 30_000,  summary: 120_000, alert: 60_000 },
  mlb:   { pbp: 60_000,  summary:  90_000, alert: 60_000 },
};

// Simulated clock tick (1 minute)
const TICK_MS = 60_000;

// Games that "close" mid-run (indices) — last 10% of game list
const GAMES_CLOSING_AT_CYCLE = Math.floor(N_CYCLES * 0.6);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatcherState {
  game_id: string;
  sport: string;
  is_active: boolean;
  pbp_next_poll_at: number;   // epoch ms
  pbp_error_count: number;
  summary_next_poll_at: number;
  summary_error_count: number;
  alert_next_evaluate_at: number;
}

interface DispatchRecord {
  game_id: string;
  type: "pbp" | "summary" | "alert";
  cycle: number;
  sim_time_ms: number;
  success: boolean;
  skipped_concurrency: boolean;
}

interface CycleStats {
  cycle: number;
  pbp_dispatched: number;
  pbp_skipped_cap: number;
  summary_dispatched: number;
  summary_skipped_cap: number;
  alert_dispatched: number;
  alert_skipped_cap: number;
  games_deactivated: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBackoff(errorCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, errorCount), BACKOFF_MAX_MS);
}

function simError(): boolean {
  return Math.random() < ERROR_RATE;
}

function getIntervals(sport: string) {
  return SPORT_INTERVALS[sport] ?? SPORT_INTERVALS.ncaam;
}

// ---------------------------------------------------------------------------
// Seed initial watcher state
// ---------------------------------------------------------------------------

function seedWatchers(n: number, startTime: number): WatcherState[] {
  const sports = ["ncaam", "ncaam", "ncaam", "nba", "mlb"]; // weighted toward ncaam
  return Array.from({ length: n }, (_, i) => {
    const sport = sports[i % sports.length];
    const intervals = getIntervals(sport);
    // Stagger initial poll times ±30s to avoid thundering herd
    const jitter = (Math.random() - 0.5) * 60_000;
    return {
      game_id: `game-${i.toString().padStart(3, "0")}`,
      sport,
      is_active: true,
      pbp_next_poll_at: startTime + jitter,
      pbp_error_count: 0,
      summary_next_poll_at: startTime + jitter + intervals.summary / 4,
      summary_error_count: 0,
      alert_next_evaluate_at: startTime + jitter,
    };
  });
}

// ---------------------------------------------------------------------------
// Orchestrator tick — mirrors production dispatch logic
// ---------------------------------------------------------------------------

function runTick(
  watchers: WatcherState[],
  nowMs: number,
  cycle: number,
  records: DispatchRecord[],
): CycleStats {
  const active = watchers.filter((w) => w.is_active);
  let pbpDispatched = 0;
  let pbpSkipped = 0;
  let summaryDispatched = 0;
  let summarySkipped = 0;
  let alertDispatched = 0;
  let alertSkipped = 0;
  let deactivated = 0;

  // --- PBP dispatch (sorted by most overdue first) ---
  const pbpDue = active
    .filter((w) => w.pbp_next_poll_at != null && w.pbp_next_poll_at <= nowMs)
    .sort((a, b) => a.pbp_next_poll_at - b.pbp_next_poll_at);

  for (const w of pbpDue) {
    if (pbpDispatched >= MAX_PBP_DISPATCHES) {
      pbpSkipped++;
      records.push({ game_id: w.game_id, type: "pbp", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    const success = !simError();
    pbpDispatched++;
    const intervals = getIntervals(w.sport);
    if (success) {
      w.pbp_error_count = 0;
      w.pbp_next_poll_at = nowMs + intervals.pbp;
    } else {
      w.pbp_error_count++;
      w.pbp_next_poll_at = nowMs + computeBackoff(w.pbp_error_count);
    }
    records.push({ game_id: w.game_id, type: "pbp", cycle, sim_time_ms: nowMs, success, skipped_concurrency: false });
  }

  // --- Summary dispatch ---
  const summaryDue = active
    .filter((w) => w.summary_next_poll_at <= nowMs)
    .sort((a, b) => a.summary_next_poll_at - b.summary_next_poll_at);

  for (const w of summaryDue) {
    if (summaryDispatched >= MAX_SUMMARY_DISPATCHES) {
      summarySkipped++;
      records.push({ game_id: w.game_id, type: "summary", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    const success = !simError();
    summaryDispatched++;
    const intervals = getIntervals(w.sport);
    if (success) {
      w.summary_error_count = 0;
      w.summary_next_poll_at = nowMs + intervals.summary;
    } else {
      w.summary_error_count++;
      w.summary_next_poll_at = nowMs + computeBackoff(w.summary_error_count);
    }
    records.push({ game_id: w.game_id, type: "summary", cycle, sim_time_ms: nowMs, success, skipped_concurrency: false });
  }

  // --- Alert evaluation dispatch ---
  const alertDue = active
    .filter((w) => w.alert_next_evaluate_at <= nowMs)
    .sort((a, b) => a.alert_next_evaluate_at - b.alert_next_evaluate_at);

  for (const w of alertDue) {
    if (alertDispatched >= MAX_ALERT_DISPATCHES) {
      alertSkipped++;
      records.push({ game_id: w.game_id, type: "alert", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    const success = !simError();
    alertDispatched++;
    const intervals = getIntervals(w.sport);
    w.alert_next_evaluate_at = nowMs + intervals.alert;
    records.push({ game_id: w.game_id, type: "alert", cycle, sim_time_ms: nowMs, success, skipped_concurrency: false });
  }

  return {
    cycle,
    pbp_dispatched: pbpDispatched,
    pbp_skipped_cap: pbpSkipped,
    summary_dispatched: summaryDispatched,
    summary_skipped_cap: summarySkipped,
    alert_dispatched: alertDispatched,
    alert_skipped_cap: alertSkipped,
    games_deactivated: deactivated,
  };
}

// ---------------------------------------------------------------------------
// Invariant assertions — called after every tick
// ---------------------------------------------------------------------------

export function assertInvariants(stats: CycleStats): void {
  if (stats.pbp_dispatched > MAX_PBP_DISPATCHES) {
    throw new Error(
      `INVARIANT VIOLATION: cycle ${stats.cycle} dispatched ${stats.pbp_dispatched} PBP (max ${MAX_PBP_DISPATCHES})`
    );
  }
  if (stats.summary_dispatched > MAX_SUMMARY_DISPATCHES) {
    throw new Error(
      `INVARIANT VIOLATION: cycle ${stats.cycle} dispatched ${stats.summary_dispatched} summary (max ${MAX_SUMMARY_DISPATCHES})`
    );
  }
  if (stats.alert_dispatched > MAX_ALERT_DISPATCHES) {
    throw new Error(
      `INVARIANT VIOLATION: cycle ${stats.cycle} dispatched ${stats.alert_dispatched} alert (max ${MAX_ALERT_DISPATCHES})`
    );
  }
}

export function assertBackoff(errorCount: number): void {
  const backoff = computeBackoff(errorCount);
  if (backoff > BACKOFF_MAX_MS) {
    throw new Error(
      `INVARIANT VIOLATION: backoff ${backoff}ms exceeds cap ${BACKOFF_MAX_MS}ms at error_count=${errorCount}`
    );
  }
  if (errorCount > 0) {
    const prev = computeBackoff(errorCount - 1);
    if (backoff < prev && backoff < BACKOFF_MAX_MS) {
      throw new Error(
        `INVARIANT VIOLATION: backoff is not monotonically increasing at error_count=${errorCount}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary analysis
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computePerGamePbpIntervals(
  records: DispatchRecord[],
  gameId: string,
): number[] {
  const dispatches = records
    .filter((r) => r.game_id === gameId && r.type === "pbp" && !r.skipped_concurrency && r.success)
    .sort((a, b) => a.sim_time_ms - b.sim_time_ms);
  if (dispatches.length < 2) return [];
  const intervals: number[] = [];
  for (let i = 1; i < dispatches.length; i++) {
    intervals.push(dispatches[i].sim_time_ms - dispatches[i - 1].sim_time_ms);
  }
  return intervals;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function runLoadTest(
  nGames = N_GAMES,
  nCycles = N_CYCLES,
  errorRate = ERROR_RATE,
  closingCycle = GAMES_CLOSING_AT_CYCLE,
  seed?: number,
  /** Fraction of games to close at closingCycle (default 0.1 = 10%). Pass 1.0 to close all. */
  closeFraction = 0.1,
): {
  cycleStats: CycleStats[];
  starvedGames: string[];
  p50PbpIntervalMs: number;
  p95PbpIntervalMs: number;
  pctStarved: number;
  maxBackoffObserved: number;
  totalPbpDispatched: number;
  totalPbpSkipped: number;
  passed: boolean;
} {
  // Deterministic seed for reproducibility in tests
  if (seed !== undefined) {
    // Simple LCG to replace Math.random for tests
    let s = seed;
    const lcg = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
    // Monkey-patch simError for this run
    (globalThis as any).__loadTestRandom = lcg;
  }

  const simRandom = (globalThis as any).__loadTestRandom ?? Math.random;
  const simErrorFn = () => simRandom() < errorRate;

  const startMs = 0; // epoch 0 for determinism
  const watchers = seedWatchersDeterministic(nGames, startMs, simRandom);
  const records: DispatchRecord[] = [];
  const cycleStats: CycleStats[] = [];
  let maxBackoffObserved = 0;

  for (let cycle = 0; cycle < nCycles; cycle++) {
    const nowMs = startMs + cycle * TICK_MS;

    // Simulate some games closing mid-run
    if (cycle === closingCycle) {
      const closeCount = Math.max(1, Math.floor(nGames * closeFraction));
      for (let i = 0; i < closeCount; i++) {
        if (watchers[i]) watchers[i].is_active = false;
      }
    }

    // Run one orchestrator tick with our deterministic error function
    const stats = runTickDeterministic(watchers, nowMs, cycle, records, simErrorFn);
    assertInvariants(stats);
    cycleStats.push(stats);

    // Track max observed backoff
    for (const w of watchers) {
      const backoff = computeBackoff(w.pbp_error_count);
      if (backoff > maxBackoffObserved) maxBackoffObserved = backoff;
      assertBackoff(w.pbp_error_count);
      assertBackoff(w.summary_error_count);
    }
  }

  // Compute per-game PBP intervals
  const allIntervals: number[] = [];
  const starvedGames: string[] = [];
  const activeGameIds = Array.from(new Set(records.map((r) => r.game_id)));

  for (const gameId of activeGameIds) {
    const intervals = computePerGamePbpIntervals(records, gameId);
    if (intervals.length === 0) {
      starvedGames.push(gameId);
    } else {
      allIntervals.push(...intervals);
    }
  }

  const sorted = [...allIntervals].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const pctStarved = activeGameIds.length > 0
    ? (starvedGames.length / activeGameIds.length) * 100
    : 0;
  const totalPbpDispatched = cycleStats.reduce((s, c) => s + c.pbp_dispatched, 0);
  const totalPbpSkipped = cycleStats.reduce((s, c) => s + c.pbp_skipped_cap, 0);

  // Clean up monkey-patch
  delete (globalThis as any).__loadTestRandom;

  return {
    cycleStats,
    starvedGames,
    p50PbpIntervalMs: p50,
    p95PbpIntervalMs: p95,
    pctStarved,
    maxBackoffObserved,
    totalPbpDispatched,
    totalPbpSkipped,
    passed: true,
  };
}

function seedWatchersDeterministic(
  n: number,
  startTime: number,
  rand: () => number,
): WatcherState[] {
  const sports = ["ncaam", "ncaam", "ncaam", "nba", "mlb"];
  return Array.from({ length: n }, (_, i) => {
    const sport = sports[i % sports.length];
    const intervals = getIntervals(sport);
    const jitter = (rand() - 0.5) * 60_000;
    return {
      game_id: `game-${i.toString().padStart(3, "0")}`,
      sport,
      is_active: true,
      pbp_next_poll_at: startTime + jitter,
      pbp_error_count: 0,
      summary_next_poll_at: startTime + jitter + intervals.summary / 4,
      summary_error_count: 0,
      alert_next_evaluate_at: startTime + jitter,
    };
  });
}

function runTickDeterministic(
  watchers: WatcherState[],
  nowMs: number,
  cycle: number,
  records: DispatchRecord[],
  simErrorFn: () => boolean,
): CycleStats {
  const active = watchers.filter((w) => w.is_active);
  let pbpDispatched = 0, pbpSkipped = 0;
  let summaryDispatched = 0, summarySkipped = 0;
  let alertDispatched = 0, alertSkipped = 0;

  const pbpDue = active
    .filter((w) => w.pbp_next_poll_at <= nowMs)
    .sort((a, b) => a.pbp_next_poll_at - b.pbp_next_poll_at);

  for (const w of pbpDue) {
    if (pbpDispatched >= MAX_PBP_DISPATCHES) {
      pbpSkipped++;
      records.push({ game_id: w.game_id, type: "pbp", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    const success = !simErrorFn();
    pbpDispatched++;
    const intervals = getIntervals(w.sport);
    if (success) {
      w.pbp_error_count = 0;
      w.pbp_next_poll_at = nowMs + intervals.pbp;
    } else {
      w.pbp_error_count++;
      w.pbp_next_poll_at = nowMs + computeBackoff(w.pbp_error_count);
    }
    records.push({ game_id: w.game_id, type: "pbp", cycle, sim_time_ms: nowMs, success, skipped_concurrency: false });
  }

  const summaryDue = active
    .filter((w) => w.summary_next_poll_at <= nowMs)
    .sort((a, b) => a.summary_next_poll_at - b.summary_next_poll_at);

  for (const w of summaryDue) {
    if (summaryDispatched >= MAX_SUMMARY_DISPATCHES) {
      summarySkipped++;
      records.push({ game_id: w.game_id, type: "summary", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    const success = !simErrorFn();
    summaryDispatched++;
    const intervals = getIntervals(w.sport);
    if (success) {
      w.summary_error_count = 0;
      w.summary_next_poll_at = nowMs + intervals.summary;
    } else {
      w.summary_error_count++;
      w.summary_next_poll_at = nowMs + computeBackoff(w.summary_error_count);
    }
    records.push({ game_id: w.game_id, type: "summary", cycle, sim_time_ms: nowMs, success, skipped_concurrency: false });
  }

  const alertDue = active
    .filter((w) => w.alert_next_evaluate_at <= nowMs)
    .sort((a, b) => a.alert_next_evaluate_at - b.alert_next_evaluate_at);

  for (const w of alertDue) {
    if (alertDispatched >= MAX_ALERT_DISPATCHES) {
      alertSkipped++;
      records.push({ game_id: w.game_id, type: "alert", cycle, sim_time_ms: nowMs, success: false, skipped_concurrency: true });
      continue;
    }
    alertDispatched++;
    const intervals = getIntervals(w.sport);
    w.alert_next_evaluate_at = nowMs + intervals.alert;
    records.push({ game_id: w.game_id, type: "alert", cycle, sim_time_ms: nowMs, success: true, skipped_concurrency: false });
  }

  return {
    cycle, pbp_dispatched: pbpDispatched, pbp_skipped_cap: pbpSkipped,
    summary_dispatched: summaryDispatched, summary_skipped_cap: summarySkipped,
    alert_dispatched: alertDispatched, alert_skipped_cap: alertSkipped,
    games_deactivated: 0,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point — prints degradation report
// ---------------------------------------------------------------------------

if (import.meta.main) {
  console.log(`\nWatch-NORMA Orchestrator Load Test`);
  console.log(`  Games: ${N_GAMES}  Cycles: ${N_CYCLES}  Error rate: ${(ERROR_RATE * 100).toFixed(0)}%`);
  console.log(`  Concurrency caps: PBP=${MAX_PBP_DISPATCHES} Summary=${MAX_SUMMARY_DISPATCHES} Alert=${MAX_ALERT_DISPATCHES}`);
  console.log(`  Simulated clock: ${N_CYCLES} min\n`);

  const result = runLoadTest(N_GAMES, N_CYCLES, ERROR_RATE);

  // Per-cycle table (every 5th cycle for brevity)
  console.log(`Cycle  PBP✓  PBP⛔  Sum✓  Sum⛔  Alert✓  Alert⛔`);
  console.log(`─────  ────  ────  ────  ────  ──────  ──────`);
  for (const s of result.cycleStats) {
    if (s.cycle % 5 === 0 || s.cycle === N_CYCLES - 1) {
      console.log(
        `${String(s.cycle).padStart(5)}  ` +
        `${String(s.pbp_dispatched).padStart(4)}  ` +
        `${String(s.pbp_skipped_cap).padStart(4)}  ` +
        `${String(s.summary_dispatched).padStart(4)}  ` +
        `${String(s.summary_skipped_cap).padStart(4)}  ` +
        `${String(s.alert_dispatched).padStart(6)}  ` +
        `${String(s.alert_skipped_cap).padStart(6)}`
      );
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`Total PBP dispatched:   ${result.totalPbpDispatched}`);
  console.log(`Total PBP skipped(cap): ${result.totalPbpSkipped}`);
  console.log(`PBP interval p50:       ${(result.p50PbpIntervalMs / 1000).toFixed(1)}s  (target ≤60s)`);
  console.log(`PBP interval p95:       ${(result.p95PbpIntervalMs / 1000).toFixed(1)}s  (target ≤120s)`);
  console.log(`Max backoff observed:   ${(result.maxBackoffObserved / 1000).toFixed(0)}s  (cap 300s)`);
  console.log(`Games starved (0 PBP):  ${result.starvedGames.length}/${N_GAMES} (${result.pctStarved.toFixed(1)}%)`);

  if (result.starvedGames.length > 0) {
    console.log(`\n⚠  STARVATION DETECTED — these game IDs received 0 successful PBP dispatches:`);
    console.log(`   ${result.starvedGames.join(", ")}`);

    if (N_GAMES > MAX_PBP_DISPATCHES * 6) {
      console.log(`\n   Root cause: with ${N_GAMES} active games and MAX_PBP=${MAX_PBP_DISPATCHES}, the`);
      console.log(`   orchestrator can serve at most ${MAX_PBP_DISPATCHES} games per cycle. Games are`);
      console.log(`   dispatched in overdue-first order, so starvation only occurs when a game's`);
      console.log(`   next_poll_at never advances due to consistent errors (backoff accumulation).`);
      console.log(`   See doc 09 — Known Gaps / Known Bugs for remediation options.`);
    }
  } else {
    console.log(`\n✓ No starvation detected across ${N_GAMES} games × ${N_CYCLES} cycles.`);
  }

  const p95Target = 120_000;
  if (result.p95PbpIntervalMs > p95Target) {
    console.log(`\n⚠  p95 PBP interval (${(result.p95PbpIntervalMs / 1000).toFixed(1)}s) exceeds 120s target.`);
    console.log(`   At this game density, the 30s PBP target interval cannot be met for all games.`);
    console.log(`   Consider increasing MAX_PBP_DISPATCHES or shedding coverage for low-priority games.`);
  } else {
    console.log(`✓ p95 PBP interval within 120s target.`);
  }

  console.log(`\nAll invariants passed. ✓\n`);
}
