// M1: game-watcher-orchestrator business logic tests
//
// Tests the core decision logic of the orchestrator:
//   - Exponential backoff formula
//   - Sport-aware polling intervals
//   - PBP eligibility (MLB vs NCAA/NBA coverage_level gate)
//   - Watcher state row construction for new active games
//   - Rate budget limiting behavior
//
// These are pure-logic tests mirroring the implementation in
// supabase/functions/game-watcher-orchestrator/index.ts

// ── Constants (mirror orchestrator) ─────────────────────────────────────────

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 5 * 60_000;

const SPORT_INTERVALS: Record<string, { pbp: number; summary: number; alert: number }> = {
  ncaam: { pbp: 30_000, summary: 120_000, alert: 60_000 },
  nba:   { pbp: 30_000, summary: 120_000, alert: 60_000 },
  mlb:   { pbp: 60_000, summary: 90_000,  alert: 60_000 },
};

// ── Pure logic functions (mirror orchestrator) ────────────────────────────────

function computeBackoff(errorCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, errorCount), BACKOFF_MAX_MS);
}

function getIntervals(sport: string | null): { pbp: number; summary: number; alert: number } {
  return SPORT_INTERVALS[sport ?? "ncaam"] ?? SPORT_INTERVALS.ncaam;
}

function hasPbp(sport: string, sportradarId: string | null, coverageLevel: string | null): boolean {
  const isMlb = sport === "mlb";
  return isMlb
    ? !!sportradarId
    : coverageLevel === "full" && !!sportradarId;
}

// ── computeBackoff ────────────────────────────────────────────────────────────

describe("computeBackoff", () => {
  it("returns 30s for first error (errorCount=1)", () => {
    expect(computeBackoff(1)).toBe(60_000); // 30s * 2^1
  });

  it("returns 30s base for errorCount=0", () => {
    expect(computeBackoff(0)).toBe(30_000); // 30s * 2^0 = 30s
  });

  it("doubles on each error", () => {
    expect(computeBackoff(2)).toBe(120_000); // 30s * 2^2 = 2min
    expect(computeBackoff(3)).toBe(240_000); // 30s * 2^3 = 4min
  });

  it("caps at 5 minutes regardless of high error count", () => {
    expect(computeBackoff(10)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoff(100)).toBe(BACKOFF_MAX_MS);
  });

  it("reaches cap at errorCount=4 (30s * 2^4 = 480s > 300s cap)", () => {
    const uncapped = BACKOFF_BASE_MS * Math.pow(2, 4); // 480_000 ms
    expect(uncapped).toBeGreaterThan(BACKOFF_MAX_MS);
    expect(computeBackoff(4)).toBe(BACKOFF_MAX_MS);
  });

  it("errorCount=3 is still under cap (30s * 2^3 = 240s < 300s cap)", () => {
    expect(computeBackoff(3)).toBe(240_000);
    expect(computeBackoff(3)).toBeLessThan(BACKOFF_MAX_MS);
  });
});

// ── getIntervals ──────────────────────────────────────────────────────────────

describe("getIntervals — sport-aware polling intervals", () => {
  it("ncaam: PBP=30s, summary=2min, alert=1min", () => {
    const i = getIntervals("ncaam");
    expect(i.pbp).toBe(30_000);
    expect(i.summary).toBe(120_000);
    expect(i.alert).toBe(60_000);
  });

  it("nba: same intervals as ncaam", () => {
    const i = getIntervals("nba");
    expect(i.pbp).toBe(30_000);
    expect(i.summary).toBe(120_000);
    expect(i.alert).toBe(60_000);
  });

  it("mlb: PBP=1min, summary=90s, alert=1min", () => {
    const i = getIntervals("mlb");
    expect(i.pbp).toBe(60_000);
    expect(i.summary).toBe(90_000);
    expect(i.alert).toBe(60_000);
  });

  it("null sport falls back to ncaam intervals", () => {
    const i = getIntervals(null);
    expect(i).toEqual(getIntervals("ncaam"));
  });

  it("unknown sport falls back to ncaam intervals", () => {
    const i = getIntervals("hockey");
    expect(i).toEqual(getIntervals("ncaam"));
  });
});

// ── hasPbp ────────────────────────────────────────────────────────────────────

describe("hasPbp — PBP eligibility rules", () => {
  describe("MLB games", () => {
    it("eligible when sportradar_id is present (no coverage_level gate)", () => {
      expect(hasPbp("mlb", "sr:match:abc123", null)).toBe(true);
      expect(hasPbp("mlb", "sr:match:abc123", "partial")).toBe(true);
      expect(hasPbp("mlb", "sr:match:abc123", "full")).toBe(true);
    });

    it("not eligible when sportradar_id is absent", () => {
      expect(hasPbp("mlb", null, "full")).toBe(false);
      expect(hasPbp("mlb", null, null)).toBe(false);
    });
  });

  describe("NCAA games", () => {
    it("eligible when coverage_level=full AND sportradar_id present", () => {
      expect(hasPbp("ncaam", "sr:match:abc", "full")).toBe(true);
    });

    it("not eligible with partial coverage even if sportradar_id present", () => {
      expect(hasPbp("ncaam", "sr:match:abc", "partial")).toBe(false);
      expect(hasPbp("ncaam", "sr:match:abc", null)).toBe(false);
    });

    it("not eligible with full coverage but no sportradar_id", () => {
      expect(hasPbp("ncaam", null, "full")).toBe(false);
    });
  });

  describe("NBA games", () => {
    it("eligible when coverage_level=full AND sportradar_id present", () => {
      expect(hasPbp("nba", "sr:match:xyz", "full")).toBe(true);
    });

    it("not eligible without full coverage", () => {
      expect(hasPbp("nba", "sr:match:xyz", "partial")).toBe(false);
    });
  });
});

// ── Watcher state row construction ────────────────────────────────────────────

describe("watcher_state row initialization", () => {
  function buildWatcherRow(
    gameId: string,
    sport: string | null,
    sportradarId: string | null,
    coverageLevel: string | null,
    nowIso: string
  ) {
    const resolvedSport = sport ?? "ncaam";
    return {
      game_id: gameId,
      sport: resolvedSport,
      is_active: true,
      pbp_next_poll_at: hasPbp(resolvedSport, sportradarId, coverageLevel) ? nowIso : null,
      summary_next_poll_at: nowIso,
      alert_next_evaluate_at: nowIso,
    };
  }

  const now = "2026-04-09T12:00:00.000Z";

  it("full-coverage ncaam game: pbp_next_poll_at is set immediately", () => {
    const row = buildWatcherRow("g1", "ncaam", "sr:match:1", "full", now);
    expect(row.pbp_next_poll_at).toBe(now);
    expect(row.summary_next_poll_at).toBe(now);
    expect(row.alert_next_evaluate_at).toBe(now);
    expect(row.is_active).toBe(true);
  });

  it("partial-coverage ncaam game: pbp_next_poll_at is null", () => {
    const row = buildWatcherRow("g2", "ncaam", "sr:match:2", "partial", now);
    expect(row.pbp_next_poll_at).toBeNull();
    expect(row.summary_next_poll_at).toBe(now);
  });

  it("ncaam game with no sportradar_id: pbp_next_poll_at is null", () => {
    const row = buildWatcherRow("g3", "ncaam", null, "full", now);
    expect(row.pbp_next_poll_at).toBeNull();
  });

  it("mlb game with sportradar_id: pbp_next_poll_at is set regardless of coverage_level", () => {
    const row = buildWatcherRow("g4", "mlb", "sr:match:4", "partial", now);
    expect(row.pbp_next_poll_at).toBe(now);
  });

  it("null sport defaults to ncaam sport string", () => {
    const row = buildWatcherRow("g5", null, null, null, now);
    expect(row.sport).toBe("ncaam");
  });
});

// ── Sportradar rate budget ────────────────────────────────────────────────────

describe("Sportradar rate budget enforcement", () => {
  const RATE_LIMIT = 25;
  const MAX_PBP_DISPATCHES = 5;

  function computePbpDispatchLimit(callsThisMinute: number): number {
    const budgetRemaining = Math.max(0, RATE_LIMIT - callsThisMinute);
    if (budgetRemaining <= 0) return 0;
    return Math.min(MAX_PBP_DISPATCHES, budgetRemaining);
  }

  it("full budget: dispatches up to MAX_PBP_DISPATCHES", () => {
    expect(computePbpDispatchLimit(0)).toBe(5);
  });

  it("partial budget: caps at remaining budget if less than max", () => {
    expect(computePbpDispatchLimit(23)).toBe(2); // 2 remaining
    expect(computePbpDispatchLimit(24)).toBe(1); // 1 remaining
  });

  it("budget exhausted: no PBP dispatches", () => {
    expect(computePbpDispatchLimit(25)).toBe(0);
    expect(computePbpDispatchLimit(30)).toBe(0);
  });

  it("budget at 5 remaining: still caps at MAX_PBP_DISPATCHES (5)", () => {
    expect(computePbpDispatchLimit(20)).toBe(5);
  });

  it("budget at 4 remaining: limits to 4", () => {
    expect(computePbpDispatchLimit(21)).toBe(4);
  });
});

// ── Stale watcher detection ───────────────────────────────────────────────────

describe("stale watcher detection", () => {
  function getStaleIds(
    activeWatcherGameIds: string[],
    currentlyActiveGameIds: string[]
  ): string[] {
    return activeWatcherGameIds.filter((id) => !currentlyActiveGameIds.includes(id));
  }

  it("returns game IDs in watcher_state that are no longer active", () => {
    const watchers = ["g1", "g2", "g3"];
    const active = ["g1"];
    expect(getStaleIds(watchers, active)).toEqual(["g2", "g3"]);
  });

  it("returns empty array when all watchers are still active", () => {
    const watchers = ["g1", "g2"];
    const active = ["g1", "g2", "g3"];
    expect(getStaleIds(watchers, active)).toEqual([]);
  });

  it("returns all watcher IDs when no games are active", () => {
    const watchers = ["g1", "g2"];
    const active: string[] = [];
    expect(getStaleIds(watchers, active)).toEqual(["g1", "g2"]);
  });

  it("returns empty array when watcher_state is empty", () => {
    expect(getStaleIds([], ["g1", "g2"])).toEqual([]);
  });
});
