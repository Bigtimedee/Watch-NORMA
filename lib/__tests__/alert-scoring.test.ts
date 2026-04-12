// M2: alert-scoring business logic tests
//
// Tests the core decision logic of the alert scoring pipeline:
//   - computeScore: weighted signal accumulation
//   - meetsThreshold: 40-point gate
//   - checkMustNotify: 4 priority rules (game closed, OT, close game, foul trouble)
//   - buildWhyNow: headline priority, wager_impact status, confidence, bullet cap
//   - determineAlertType: 11-path priority routing
//   - computeDedupHash: djb2-style determinism and uniqueness
//
// These are pure-logic tests mirroring the implementation in
// supabase/functions/_shared/alert-scoring.ts

// ── Types (mirrored) ──────────────────────────────────────────────────────────

type ProximityLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "RESOLVED";

interface SignalVector {
  has_wager: boolean;
  wager_line_crossed: boolean;
  proximity_level: ProximityLevel;
  proximity_result: any | null;
  is_close_game: boolean;
  follows_team: boolean;
  is_final_minutes: boolean;
  is_final_two: boolean;
  is_overtime: boolean;
  lead_changes_recent: number;
  foul_trouble: string[];
  bench_points_delta: number;
  efg_delta: number;
  follows_player_on_court: boolean;
  has_position: boolean;
  mustNotify: { alertType: string; headline: string; bullets: string[] } | null;
  userWagers: any[];
}

interface GameForWhyNow {
  id: string;
  status: string;
  sport: string;
  period: number | null;
  clock: string | null;
  home_score: number | null;
  away_score: number | null;
}

// ── Constants (mirrored) ──────────────────────────────────────────────────────

const WEIGHTS = {
  has_wager: 30,
  wager_line_crossed: 25,
  proximity_high: 35,
  proximity_resolved: 40,
  close_game: 20,
  follows_team: 15,
  final_five_minutes: 10,
  lead_change_recent: 10,
  foul_trouble: 8,
  bench_swing: 5,
  efg_divergence: 5,
  follows_player: 5,
};

const SCORE_THRESHOLD = 40;

// ── Pure logic functions (mirrored) ───────────────────────────────────────────

function computeScore(signals: SignalVector): number {
  let score = 0;
  if (signals.has_wager) score += WEIGHTS.has_wager;
  if (signals.wager_line_crossed) score += WEIGHTS.wager_line_crossed;
  if (signals.proximity_level === "HIGH") score += WEIGHTS.proximity_high;
  if (signals.proximity_level === "RESOLVED") score += WEIGHTS.proximity_resolved;
  if (signals.is_close_game) score += WEIGHTS.close_game;
  if (signals.follows_team) score += WEIGHTS.follows_team;
  if (signals.is_final_minutes) score += WEIGHTS.final_five_minutes;
  if (signals.lead_changes_recent > 0) score += WEIGHTS.lead_change_recent;
  if (signals.foul_trouble.length > 0) score += WEIGHTS.foul_trouble;
  if (signals.bench_points_delta >= 10) score += WEIGHTS.bench_swing;
  if (signals.efg_delta >= 10) score += WEIGHTS.efg_divergence;
  if (signals.follows_player_on_court) score += WEIGHTS.follows_player;
  return score;
}

function meetsThreshold(score: number): boolean {
  return score >= SCORE_THRESHOLD;
}

function parseClockMins(clock: string | null): number {
  if (!clock) return 99;
  const parts = clock.split(":");
  return parseInt(parts[0], 10) + (parseInt(parts[1], 10) || 0) / 60;
}

function checkMustNotify(
  game: GameForWhyNow,
  userWagers: any[],
  summary: { players?: Array<{ full_name: string; starter: boolean; points: number; personal_fouls: number; fouled_out: boolean }> } | null
): { alertType: string; headline: string; bullets: string[] } | null {
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const scoreStr = `${awayScore}–${homeScore}`;
  const margin = Math.abs(homeScore - awayScore);
  const clockMins = parseClockMins(game.clock);

  // Rule 1: Game closed with active wagers
  if (game.status === "closed" && userWagers.length > 0) {
    return {
      alertType: "bet_resolved",
      headline: "Game Final",
      bullets: [`Final: ${scoreStr}`],
    };
  }

  // Rule 2: Overtime
  if (
    game.status === "inprogress" &&
    game.period !== null &&
    game.period > 2 &&
    clockMins > 4
  ) {
    return {
      alertType: "overtime",
      headline: "Overtime!",
      bullets: [`${scoreStr} — OT${game.period - 2}`],
    };
  }

  // Rule 3: 1-possession game under 2:00
  if (
    game.status === "inprogress" &&
    game.period !== null &&
    game.period >= 2 &&
    clockMins < 2 &&
    margin <= 3
  ) {
    return {
      alertType: "close_game",
      headline: "1-Possession Game Under 2:00",
      bullets: [`${scoreStr} — ${game.clock}`],
    };
  }

  // Rule 4: Star player 4th foul
  if (summary?.players) {
    for (const p of summary.players) {
      if (
        p.starter &&
        p.points >= 10 &&
        p.personal_fouls === 4 &&
        !p.fouled_out
      ) {
        return {
          alertType: "foul_trouble",
          headline: `${p.full_name} in Foul Trouble`,
          bullets: [`4 fouls — ${p.points} pts`],
        };
      }
    }
  }

  return null;
}

function buildWhyNow(
  signals: SignalVector,
  score: number,
  game: GameForWhyNow,
  userWagers: any[]
): {
  headline: string;
  bullets: string[];
  confidence: number;
  wager_impact?: {
    status: "covering" | "not_covering" | "decided" | "at_risk";
    wager_description: string;
  };
} {
  const { mustNotify, proximity_level, proximity_result, wager_line_crossed, is_close_game, is_final_minutes, follows_team } = signals;
  const confidence = Math.min(1, score / 100);

  let headline: string;
  if (mustNotify) {
    headline = mustNotify.headline;
  } else if (proximity_level === "RESOLVED" && proximity_result) {
    headline = "Bet Resolved";
  } else if (proximity_level === "HIGH" && proximity_result) {
    headline = "Your Bet Is Close";
  } else if (wager_line_crossed) {
    headline = "Your Bet Is Live";
  } else if (is_close_game && is_final_minutes) {
    headline = "Close Game, Final Minutes";
  } else if (is_close_game) {
    headline = "Close Game Alert";
  } else if (follows_team) {
    headline = "Your Team Is Playing";
  } else {
    headline = "Tune In Now";
  }

  const rawBullets: string[] = mustNotify?.bullets ?? [];
  const bullets = rawBullets.slice(0, 4);

  // Compute wager_impact for first wager if present
  let wager_impact: { status: "covering" | "not_covering" | "decided" | "at_risk"; wager_description: string } | undefined;
  if (userWagers.length > 0) {
    const w = userWagers[0];
    const homeScore = game.home_score ?? 0;
    const awayScore = game.away_score ?? 0;
    const currentMargin = homeScore - awayScore; // home perspective

    let status: "covering" | "not_covering" | "decided" | "at_risk";
    if (game.status === "closed") {
      status = "decided";
    } else if (w.bet_type === "spread" && w.line != null && w.team_id != null) {
      status = currentMargin > w.line ? "covering" : "not_covering";
    } else if (w.bet_type === "moneyline" && w.team_id != null) {
      const betLeading = homeScore > awayScore;
      status = betLeading ? "covering" : "not_covering";
    } else {
      status = "at_risk";
    }

    wager_impact = { status, wager_description: w.description ?? "" };
  }

  return { headline, bullets, confidence, ...(wager_impact ? { wager_impact } : {}) };
}

function determineAlertType(signals: SignalVector, userWagers: any[]): string {
  const { mustNotify, wager_line_crossed, is_close_game, is_final_two, is_overtime, foul_trouble, has_position } = signals;
  const hasSpread = userWagers.some((w) => w.bet_type === "spread");
  const hasMoneyline = userWagers.some((w) => w.bet_type === "moneyline");
  const hasOverUnder = userWagers.some((w) => w.bet_type === "over_under");
  const hasProp = userWagers.some((w) => w.bet_type === "prop");

  if (mustNotify) return mustNotify.alertType;
  if (hasSpread && wager_line_crossed) return "spread_alert";
  if (hasMoneyline && is_close_game) return "moneyline_alert";
  if (hasOverUnder) return "total_alert";
  if (hasProp) return "prop_alert";
  if (has_position) return "position_alert";
  if (is_close_game && is_final_two) return "close_game";
  if (is_overtime) return "overtime";
  if (foul_trouble.length > 0) return "foul_trouble";
  if (is_close_game) return "close_game";
  return "follow_alert";
}

function computeDedupHash(
  userId: string,
  gameId: string,
  alertType: string,
  margin: number,
  period: number | null,
  proximityLevel?: string
): string {
  const marginBucket = Math.floor(margin / 3);
  const proxPart = proximityLevel ?? "none";
  const raw = `${userId}:${gameId}:${alertType}:${marginBucket}:${period ?? 0}:${proxPart}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function baseSignals(overrides: Partial<SignalVector> = {}): SignalVector {
  return {
    has_wager: false,
    wager_line_crossed: false,
    proximity_level: "NONE",
    proximity_result: null,
    is_close_game: false,
    follows_team: false,
    is_final_minutes: false,
    is_final_two: false,
    is_overtime: false,
    lead_changes_recent: 0,
    foul_trouble: [],
    bench_points_delta: 0,
    efg_delta: 0,
    follows_player_on_court: false,
    has_position: false,
    mustNotify: null,
    userWagers: [],
    ...overrides,
  };
}

function baseGame(overrides: Partial<GameForWhyNow> = {}): GameForWhyNow {
  return {
    id: "g1",
    status: "inprogress",
    sport: "ncaam",
    period: 2,
    clock: "8:00",
    home_score: 60,
    away_score: 55,
    ...overrides,
  };
}

// ── computeScore ──────────────────────────────────────────────────────────────

describe("computeScore", () => {
  it("has_wager alone = 30", () => {
    expect(computeScore(baseSignals({ has_wager: true }))).toBe(30);
  });

  it("has_wager + wager_line_crossed = 55", () => {
    expect(computeScore(baseSignals({ has_wager: true, wager_line_crossed: true }))).toBe(55);
  });

  it("follows_team + close_game = 35 (below threshold)", () => {
    expect(computeScore(baseSignals({ follows_team: true, is_close_game: true }))).toBe(35);
  });

  it("follows_team + close_game + final_minutes = 45 (above threshold)", () => {
    expect(computeScore(baseSignals({ follows_team: true, is_close_game: true, is_final_minutes: true }))).toBe(45);
  });

  it("proximity HIGH adds 35", () => {
    expect(computeScore(baseSignals({ proximity_level: "HIGH" }))).toBe(35);
  });

  it("proximity RESOLVED adds 40", () => {
    expect(computeScore(baseSignals({ proximity_level: "RESOLVED" }))).toBe(40);
  });

  it("bench_points_delta >= 10 adds 5", () => {
    expect(computeScore(baseSignals({ bench_points_delta: 10 }))).toBe(5);
    expect(computeScore(baseSignals({ bench_points_delta: 15 }))).toBe(5);
  });

  it("bench_points_delta < 10 adds 0", () => {
    expect(computeScore(baseSignals({ bench_points_delta: 9 }))).toBe(0);
    expect(computeScore(baseSignals({ bench_points_delta: 0 }))).toBe(0);
  });

  it("efg_delta >= 10 adds 5", () => {
    expect(computeScore(baseSignals({ efg_delta: 10 }))).toBe(5);
  });

  it("efg_delta < 10 adds 0", () => {
    expect(computeScore(baseSignals({ efg_delta: 9 }))).toBe(0);
  });

  it("foul_trouble presence adds 8", () => {
    expect(computeScore(baseSignals({ foul_trouble: ["Player A"] }))).toBe(8);
  });

  it("empty foul_trouble adds 0", () => {
    expect(computeScore(baseSignals({ foul_trouble: [] }))).toBe(0);
  });

  it("follows_player_on_court adds 5", () => {
    expect(computeScore(baseSignals({ follows_player_on_court: true }))).toBe(5);
  });

  it("lead_changes_recent > 0 adds 10", () => {
    expect(computeScore(baseSignals({ lead_changes_recent: 1 }))).toBe(10);
    expect(computeScore(baseSignals({ lead_changes_recent: 5 }))).toBe(10);
  });

  it("lead_changes_recent = 0 adds 0", () => {
    expect(computeScore(baseSignals({ lead_changes_recent: 0 }))).toBe(0);
  });

  it("all signals active = full sum", () => {
    const all = baseSignals({
      has_wager: true,
      wager_line_crossed: true,
      proximity_level: "HIGH",
      is_close_game: true,
      follows_team: true,
      is_final_minutes: true,
      lead_changes_recent: 2,
      foul_trouble: ["P1"],
      bench_points_delta: 10,
      efg_delta: 10,
      follows_player_on_court: true,
    });
    const expected =
      WEIGHTS.has_wager +
      WEIGHTS.wager_line_crossed +
      WEIGHTS.proximity_high +
      WEIGHTS.close_game +
      WEIGHTS.follows_team +
      WEIGHTS.final_five_minutes +
      WEIGHTS.lead_change_recent +
      WEIGHTS.foul_trouble +
      WEIGHTS.bench_swing +
      WEIGHTS.efg_divergence +
      WEIGHTS.follows_player;
    expect(computeScore(all)).toBe(expected);
  });
});

// ── meetsThreshold ────────────────────────────────────────────────────────────

describe("meetsThreshold", () => {
  it("exactly 40 passes", () => {
    expect(meetsThreshold(40)).toBe(true);
  });

  it("39 does not pass", () => {
    expect(meetsThreshold(39)).toBe(false);
  });

  it("41 passes", () => {
    expect(meetsThreshold(41)).toBe(true);
  });

  it("0 does not pass", () => {
    expect(meetsThreshold(0)).toBe(false);
  });

  it("100 passes", () => {
    expect(meetsThreshold(100)).toBe(true);
  });
});

// ── checkMustNotify ───────────────────────────────────────────────────────────

describe("checkMustNotify", () => {
  describe("Rule 1: game closed with wagers → bet_resolved", () => {
    it("fires when status=closed and wagers present", () => {
      const result = checkMustNotify(
        baseGame({ status: "closed", home_score: 72, away_score: 68 }),
        [{ bet_type: "spread" }],
        null
      );
      expect(result?.alertType).toBe("bet_resolved");
      expect(result?.headline).toBe("Game Final");
      expect(result?.bullets[0]).toContain("Final");
    });

    it("does not fire when no wagers", () => {
      const result = checkMustNotify(
        baseGame({ status: "closed" }),
        [],
        null
      );
      expect(result).toBeNull();
    });

    it("does not fire when inprogress with wagers", () => {
      const result = checkMustNotify(
        baseGame({ status: "inprogress" }),
        [{ bet_type: "spread" }],
        null
      );
      // Will not return bet_resolved (might return other rules or null)
      expect(result?.alertType).not.toBe("bet_resolved");
    });
  });

  describe("Rule 2: overtime (period > 2, clockMins > 4)", () => {
    it("fires at period=3 with 5:00 clock", () => {
      const result = checkMustNotify(
        baseGame({ period: 3, clock: "5:00" }),
        [],
        null
      );
      expect(result?.alertType).toBe("overtime");
      expect(result?.headline).toBe("Overtime!");
    });

    it("does not fire at period=2 (regular second half)", () => {
      const result = checkMustNotify(
        baseGame({ period: 2, clock: "5:00" }),
        [],
        null
      );
      expect(result?.alertType).not.toBe("overtime");
    });

    it("does not fire when clockMins <= 4 in OT", () => {
      const result = checkMustNotify(
        baseGame({ period: 3, clock: "3:30" }),
        [],
        null
      );
      // Might match Rule 3 (close game) or null, but not overtime
      expect(result?.alertType).not.toBe("overtime");
    });
  });

  describe("Rule 3: 1-possession game under 2:00", () => {
    it("fires at period=2, clock=1:30, margin=2", () => {
      const result = checkMustNotify(
        baseGame({ period: 2, clock: "1:30", home_score: 60, away_score: 58 }),
        [],
        null
      );
      expect(result?.alertType).toBe("close_game");
      expect(result?.headline).toBe("1-Possession Game Under 2:00");
    });

    it("fires when margin exactly = 3", () => {
      const result = checkMustNotify(
        baseGame({ period: 2, clock: "0:45", home_score: 63, away_score: 60 }),
        [],
        null
      );
      expect(result?.alertType).toBe("close_game");
    });

    it("does not fire when margin > 3", () => {
      const result = checkMustNotify(
        baseGame({ period: 2, clock: "1:00", home_score: 64, away_score: 60 }),
        [],
        null
      );
      expect(result).toBeNull();
    });

    it("does not fire when clock >= 2:00", () => {
      const result = checkMustNotify(
        baseGame({ period: 2, clock: "2:00", home_score: 60, away_score: 58 }),
        [],
        null
      );
      expect(result).toBeNull();
    });

    it("does not fire in period 1", () => {
      const result = checkMustNotify(
        baseGame({ period: 1, clock: "1:00", home_score: 60, away_score: 58 }),
        [],
        null
      );
      expect(result).toBeNull();
    });
  });

  describe("Rule 4: star player 4th foul", () => {
    const starPlayer = {
      full_name: "Marcus Johnson",
      starter: true,
      points: 18,
      personal_fouls: 4,
      fouled_out: false,
    };

    it("fires for starter with 10+ pts and 4 fouls", () => {
      const result = checkMustNotify(
        baseGame(),
        [],
        { players: [starPlayer] }
      );
      expect(result?.alertType).toBe("foul_trouble");
      expect(result?.headline).toContain("Marcus Johnson");
    });

    it("does not fire when not a starter", () => {
      const result = checkMustNotify(
        baseGame(),
        [],
        { players: [{ ...starPlayer, starter: false }] }
      );
      expect(result).toBeNull();
    });

    it("does not fire when < 10 pts", () => {
      const result = checkMustNotify(
        baseGame(),
        [],
        { players: [{ ...starPlayer, points: 9 }] }
      );
      expect(result).toBeNull();
    });

    it("does not fire when already fouled out", () => {
      const result = checkMustNotify(
        baseGame(),
        [],
        { players: [{ ...starPlayer, fouled_out: true }] }
      );
      expect(result).toBeNull();
    });

    it("does not fire when personal_fouls !== 4", () => {
      const result = checkMustNotify(
        baseGame(),
        [],
        { players: [{ ...starPlayer, personal_fouls: 3 }] }
      );
      expect(result).toBeNull();
    });
  });

  it("returns null when no rules match", () => {
    const result = checkMustNotify(baseGame({ status: "inprogress", period: 1, clock: "15:00" }), [], null);
    expect(result).toBeNull();
  });
});

// ── buildWhyNow ───────────────────────────────────────────────────────────────

describe("buildWhyNow — headline priority", () => {
  it("mustNotify headline takes priority", () => {
    const signals = baseSignals({
      mustNotify: { alertType: "bet_resolved", headline: "Game Final", bullets: ["Final: 72–68"] },
      proximity_level: "RESOLVED",
      proximity_result: {},
    });
    const result = buildWhyNow(signals, 70, baseGame(), []);
    expect(result.headline).toBe("Game Final");
  });

  it("RESOLVED proximity → 'Bet Resolved' (no mustNotify)", () => {
    const signals = baseSignals({ proximity_level: "RESOLVED", proximity_result: { description: "won" } });
    const result = buildWhyNow(signals, 50, baseGame(), []);
    expect(result.headline).toBe("Bet Resolved");
  });

  it("HIGH proximity → 'Your Bet Is Close' (no mustNotify)", () => {
    const signals = baseSignals({ proximity_level: "HIGH", proximity_result: { description: "close" } });
    const result = buildWhyNow(signals, 45, baseGame(), []);
    expect(result.headline).toBe("Your Bet Is Close");
  });

  it("wager_line_crossed → 'Your Bet Is Live'", () => {
    const signals = baseSignals({ wager_line_crossed: true });
    const result = buildWhyNow(signals, 55, baseGame(), []);
    expect(result.headline).toBe("Your Bet Is Live");
  });

  it("is_close_game + is_final_minutes → 'Close Game, Final Minutes'", () => {
    const signals = baseSignals({ is_close_game: true, is_final_minutes: true });
    const result = buildWhyNow(signals, 45, baseGame(), []);
    expect(result.headline).toBe("Close Game, Final Minutes");
  });

  it("is_close_game alone → 'Close Game Alert'", () => {
    const signals = baseSignals({ is_close_game: true });
    const result = buildWhyNow(signals, 35, baseGame(), []);
    expect(result.headline).toBe("Close Game Alert");
  });

  it("follows_team → 'Your Team Is Playing'", () => {
    const signals = baseSignals({ follows_team: true });
    const result = buildWhyNow(signals, 15, baseGame(), []);
    expect(result.headline).toBe("Your Team Is Playing");
  });

  it("no signals → 'Tune In Now'", () => {
    const result = buildWhyNow(baseSignals(), 0, baseGame(), []);
    expect(result.headline).toBe("Tune In Now");
  });
});

describe("buildWhyNow — confidence formula", () => {
  it("score=100 → confidence=1.0", () => {
    const result = buildWhyNow(baseSignals(), 100, baseGame(), []);
    expect(result.confidence).toBe(1.0);
  });

  it("score=50 → confidence=0.5", () => {
    const result = buildWhyNow(baseSignals(), 50, baseGame(), []);
    expect(result.confidence).toBe(0.5);
  });

  it("score=0 → confidence=0", () => {
    const result = buildWhyNow(baseSignals(), 0, baseGame(), []);
    expect(result.confidence).toBe(0);
  });

  it("score=150 → confidence capped at 1.0", () => {
    const result = buildWhyNow(baseSignals(), 150, baseGame(), []);
    expect(result.confidence).toBe(1.0);
  });
});

describe("buildWhyNow — bullets capped at 4", () => {
  it("mustNotify bullets > 4 are capped at 4", () => {
    const signals = baseSignals({
      mustNotify: {
        alertType: "bet_resolved",
        headline: "Game Final",
        bullets: ["b1", "b2", "b3", "b4", "b5", "b6"],
      },
    });
    const result = buildWhyNow(signals, 50, baseGame(), []);
    expect(result.bullets.length).toBe(4);
    expect(result.bullets[3]).toBe("b4");
  });
});

describe("buildWhyNow — wager_impact status", () => {
  it("closed game → 'decided'", () => {
    const wager = { bet_type: "spread", line: 5, team_id: "t1", description: "Duke -5" };
    const result = buildWhyNow(baseSignals(), 50, baseGame({ status: "closed" }), [wager]);
    expect(result.wager_impact?.status).toBe("decided");
  });

  it("spread: home leads by more than line → 'covering'", () => {
    const wager = { bet_type: "spread", line: 5, team_id: "t1", description: "Duke -5" };
    // home_score=70, away_score=60 → currentMargin=10 > 5
    const result = buildWhyNow(baseSignals(), 50, baseGame({ home_score: 70, away_score: 60 }), [wager]);
    expect(result.wager_impact?.status).toBe("covering");
  });

  it("spread: home margin < line → 'not_covering'", () => {
    const wager = { bet_type: "spread", line: 5, team_id: "t1", description: "Duke -5" };
    // home_score=62, away_score=60 → currentMargin=2 < 5
    const result = buildWhyNow(baseSignals(), 50, baseGame({ home_score: 62, away_score: 60 }), [wager]);
    expect(result.wager_impact?.status).toBe("not_covering");
  });

  it("moneyline: home leading → 'covering'", () => {
    const wager = { bet_type: "moneyline", team_id: "t1", description: "Duke ML" };
    const result = buildWhyNow(baseSignals(), 50, baseGame({ home_score: 70, away_score: 65 }), [wager]);
    expect(result.wager_impact?.status).toBe("covering");
  });

  it("moneyline: home trailing → 'not_covering'", () => {
    const wager = { bet_type: "moneyline", team_id: "t1", description: "Duke ML" };
    const result = buildWhyNow(baseSignals(), 50, baseGame({ home_score: 60, away_score: 65 }), [wager]);
    expect(result.wager_impact?.status).toBe("not_covering");
  });

  it("over_under bet → 'at_risk' (no special coverage logic)", () => {
    const wager = { bet_type: "over_under", description: "Over 145.5" };
    const result = buildWhyNow(baseSignals(), 50, baseGame(), [wager]);
    expect(result.wager_impact?.status).toBe("at_risk");
  });

  it("no wagers → no wager_impact", () => {
    const result = buildWhyNow(baseSignals(), 50, baseGame(), []);
    expect(result.wager_impact).toBeUndefined();
  });
});

// ── determineAlertType ────────────────────────────────────────────────────────

describe("determineAlertType — priority routing", () => {
  it("mustNotify always wins (path 1)", () => {
    const signals = baseSignals({
      mustNotify: { alertType: "bet_resolved", headline: "Final", bullets: [] },
      wager_line_crossed: true,
    });
    expect(determineAlertType(signals, [{ bet_type: "spread" }])).toBe("bet_resolved");
  });

  it("spread + wager_line_crossed → spread_alert (path 2)", () => {
    const signals = baseSignals({ wager_line_crossed: true });
    expect(determineAlertType(signals, [{ bet_type: "spread" }])).toBe("spread_alert");
  });

  it("moneyline + close_game → moneyline_alert (path 3)", () => {
    const signals = baseSignals({ is_close_game: true });
    expect(determineAlertType(signals, [{ bet_type: "moneyline" }])).toBe("moneyline_alert");
  });

  it("over_under → total_alert (path 4)", () => {
    expect(determineAlertType(baseSignals(), [{ bet_type: "over_under" }])).toBe("total_alert");
  });

  it("prop → prop_alert (path 5)", () => {
    expect(determineAlertType(baseSignals(), [{ bet_type: "prop" }])).toBe("prop_alert");
  });

  it("has_position → position_alert (path 6)", () => {
    const signals = baseSignals({ has_position: true });
    expect(determineAlertType(signals, [])).toBe("position_alert");
  });

  it("close_game + final_two → close_game (path 7)", () => {
    const signals = baseSignals({ is_close_game: true, is_final_two: true });
    expect(determineAlertType(signals, [])).toBe("close_game");
  });

  it("is_overtime → overtime (path 8)", () => {
    const signals = baseSignals({ is_overtime: true });
    expect(determineAlertType(signals, [])).toBe("overtime");
  });

  it("foul_trouble present → foul_trouble (path 9)", () => {
    const signals = baseSignals({ foul_trouble: ["Player A"] });
    expect(determineAlertType(signals, [])).toBe("foul_trouble");
  });

  it("is_close_game → close_game (path 10)", () => {
    const signals = baseSignals({ is_close_game: true });
    expect(determineAlertType(signals, [])).toBe("close_game");
  });

  it("no matching signals → follow_alert (path 11)", () => {
    expect(determineAlertType(baseSignals(), [])).toBe("follow_alert");
  });
});

// ── computeDedupHash ──────────────────────────────────────────────────────────

describe("computeDedupHash", () => {
  it("same inputs produce same hash (deterministic)", () => {
    const h1 = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "HIGH");
    const h2 = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "HIGH");
    expect(h1).toBe(h2);
  });

  it("different alert types produce different hashes", () => {
    const h1 = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "NONE");
    const h2 = computeDedupHash("u1", "g1", "moneyline_alert", 4, 2, "NONE");
    expect(h1).not.toBe(h2);
  });

  it("different game IDs produce different hashes", () => {
    const h1 = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "NONE");
    const h2 = computeDedupHash("u1", "g2", "spread_alert", 4, 2, "NONE");
    expect(h1).not.toBe(h2);
  });

  it("different user IDs produce different hashes", () => {
    const h1 = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "NONE");
    const h2 = computeDedupHash("u2", "g1", "spread_alert", 4, 2, "NONE");
    expect(h1).not.toBe(h2);
  });

  it("margins 0, 1, 2 are in same bucket (bucket=0)", () => {
    const h0 = computeDedupHash("u1", "g1", "close_game", 0, 2);
    const h1 = computeDedupHash("u1", "g1", "close_game", 1, 2);
    const h2 = computeDedupHash("u1", "g1", "close_game", 2, 2);
    expect(h0).toBe(h1);
    expect(h1).toBe(h2);
  });

  it("margins 3, 4, 5 are in same bucket (bucket=1)", () => {
    const h3 = computeDedupHash("u1", "g1", "close_game", 3, 2);
    const h4 = computeDedupHash("u1", "g1", "close_game", 4, 2);
    const h5 = computeDedupHash("u1", "g1", "close_game", 5, 2);
    expect(h3).toBe(h4);
    expect(h4).toBe(h5);
  });

  it("bucket 0 (margin 0-2) differs from bucket 1 (margin 3-5)", () => {
    const h0 = computeDedupHash("u1", "g1", "close_game", 2, 2);
    const h1 = computeDedupHash("u1", "g1", "close_game", 3, 2);
    expect(h0).not.toBe(h1);
  });

  it("null period treated as 0", () => {
    const hNull = computeDedupHash("u1", "g1", "spread_alert", 4, null, "NONE");
    const h0 = computeDedupHash("u1", "g1", "spread_alert", 4, 0, "NONE");
    expect(hNull).toBe(h0);
  });

  it("omitted proximityLevel treated as 'none'", () => {
    const hOmit = computeDedupHash("u1", "g1", "spread_alert", 4, 2);
    const hNone = computeDedupHash("u1", "g1", "spread_alert", 4, 2, "none");
    expect(hOmit).toBe(hNone);
  });

  it("returns a non-empty string", () => {
    const h = computeDedupHash("u1", "g1", "follow_alert", 0, 1);
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
  });
});
