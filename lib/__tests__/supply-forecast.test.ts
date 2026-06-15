/**
 * Tests for supply forecast projection math (P2-04).
 * Covers Wald 80% CI, empty-history graceful degradation, and band invariants.
 */

const MIN_SAMPLE_GAMES = 10;
const WALD_Z_80 = 1.282; // z-score for 80% confidence interval

interface HistoricalRate {
  mean: number;
  low: number;
  high: number;
  sample_games: number;
}

// Mirror of getIntentMomentRates internal computation (pure math, no DB)
function computeWaldCI(firingCount: number, totalGames: number): HistoricalRate {
  const mean = firingCount / totalGames;
  const se = Math.sqrt(mean * (1 - mean) / totalGames);
  return {
    mean,
    low: Math.max(0, mean - WALD_Z_80 * se),
    high: Math.min(1, mean + WALD_Z_80 * se),
    sample_games: totalGames,
  };
}

function computeMomentRatesFromHistory(
  gameMoments: Map<string, Set<string>>
): Record<string, HistoricalRate> | null {
  if (gameMoments.size < MIN_SAMPLE_GAMES) return null;

  const typeFireCount = new Map<string, number>();
  for (const typesSet of gameMoments.values()) {
    for (const t of typesSet) {
      typeFireCount.set(t, (typeFireCount.get(t) ?? 0) + 1);
    }
  }

  const rates: Record<string, HistoricalRate> = {};
  for (const [type, count] of typeFireCount) {
    rates[type] = computeWaldCI(count, gameMoments.size);
  }
  return rates;
}

// Wide-band fallback when insufficient history
function widefallback(predicted: number): { low: number; high: number } {
  return { low: Math.round(predicted * 0.5), high: Math.round(predicted * 1.5) };
}

// -- Tests --

describe("Wald 80% CI computation", () => {
  it("mean = firing_count / total_games", () => {
    const r = computeWaldCI(8, 10);
    expect(r.mean).toBeCloseTo(0.8, 5);
  });

  it("low < mean < high when 0 < p < 1", () => {
    const r = computeWaldCI(5, 10);
    expect(r.low).toBeLessThan(r.mean);
    expect(r.high).toBeGreaterThan(r.mean);
  });

  it("low is clamped to 0 (cannot be negative)", () => {
    // Very small rate with few games — SE may push low below 0
    const r = computeWaldCI(1, 10);
    expect(r.low).toBeGreaterThanOrEqual(0);
  });

  it("high is clamped to 1 (cannot exceed 100%)", () => {
    // Near-certain event — high can't exceed 1
    const r = computeWaldCI(10, 10);
    expect(r.high).toBeLessThanOrEqual(1);
  });

  it("sample_games is preserved", () => {
    const r = computeWaldCI(7, 15);
    expect(r.sample_games).toBe(15);
  });

  it("band narrows with more samples (same rate)", () => {
    const small = computeWaldCI(5, 10);  // rate 0.5, n=10
    const large = computeWaldCI(50, 100); // rate 0.5, n=100
    const smallBand = small.high - small.low;
    const largeBand = large.high - large.low;
    expect(largeBand).toBeLessThan(smallBand);
  });

  it("certain event (p=1) has zero-width band", () => {
    const r = computeWaldCI(10, 10);
    // SE = sqrt(1 * 0 / 10) = 0
    expect(r.high - r.low).toBeCloseTo(0, 5);
  });

  it("impossible event (p=0) has zero-width band", () => {
    const r = computeWaldCI(0, 10);
    expect(r.high - r.low).toBeCloseTo(0, 5);
  });
});

describe("Moment rate extraction from game history", () => {
  it("returns null when fewer than MIN_SAMPLE_GAMES games", () => {
    const gameMoments = new Map<string, Set<string>>();
    for (let i = 0; i < 9; i++) {
      gameMoments.set(`game_${i}`, new Set(["close_game"]));
    }
    expect(computeMomentRatesFromHistory(gameMoments)).toBeNull();
  });

  it("returns rates when MIN_SAMPLE_GAMES games present", () => {
    const gameMoments = new Map<string, Set<string>>();
    for (let i = 0; i < 10; i++) {
      gameMoments.set(`game_${i}`, new Set(["close_game"]));
    }
    const rates = computeMomentRatesFromHistory(gameMoments);
    expect(rates).not.toBeNull();
    expect(rates!["close_game"]).toBeDefined();
  });

  it("computes correct mean when all games fired a type", () => {
    const gameMoments = new Map<string, Set<string>>();
    for (let i = 0; i < 10; i++) {
      gameMoments.set(`game_${i}`, new Set(["overtime"]));
    }
    const rates = computeMomentRatesFromHistory(gameMoments)!;
    expect(rates["overtime"].mean).toBeCloseTo(1.0, 5);
  });

  it("computes correct mean when half the games fired a type", () => {
    const gameMoments = new Map<string, Set<string>>();
    for (let i = 0; i < 20; i++) {
      const types = i < 10 ? new Set(["spread_alert"]) : new Set<string>();
      gameMoments.set(`game_${i}`, types);
    }
    const rates = computeMomentRatesFromHistory(gameMoments)!;
    expect(rates["spread_alert"].mean).toBeCloseTo(0.5, 5);
  });

  it("does not include moment types that never fired", () => {
    const gameMoments = new Map<string, Set<string>>();
    for (let i = 0; i < 10; i++) {
      gameMoments.set(`game_${i}`, new Set(["close_game"]));
    }
    const rates = computeMomentRatesFromHistory(gameMoments)!;
    expect(rates["overtime"]).toBeUndefined();
  });
});

describe("Wide-band fallback (insufficient history)", () => {
  it("low = 50% of predicted", () => {
    expect(widefallback(20).low).toBe(10);
  });

  it("high = 150% of predicted", () => {
    expect(widefallback(20).high).toBe(30);
  });

  it("band width = predicted (100% range)", () => {
    const { low, high } = widefallback(20);
    expect(high - low).toBe(20);
  });

  it("zero predicted gives zero band", () => {
    expect(widefallback(0)).toEqual({ low: 0, high: 0 });
  });
});

describe("Band invariants", () => {
  it("low <= predicted <= high for all Wald CIs (sample of rates)", () => {
    const cases = [
      { count: 3, total: 10 },
      { count: 5, total: 20 },
      { count: 8, total: 15 },
      { count: 1, total: 50 },
      { count: 49, total: 50 },
    ];
    for (const { count, total } of cases) {
      const r = computeWaldCI(count, total);
      const predicted = Math.round(total * r.mean);
      const low = Math.round(total * r.low);
      const high = Math.round(total * r.high);
      expect(low).toBeLessThanOrEqual(predicted);
      expect(high).toBeGreaterThanOrEqual(predicted);
    }
  });
});
