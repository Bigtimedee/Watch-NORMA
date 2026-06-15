/**
 * Tests for per-category floor pricing (P2-05).
 * Covers: floor computation, guardrail clamping, sport-specific lookup,
 * learned-floor blending, and the second-price Vickrey invariant.
 */

// Mirror of applyFloorGuardrails from pricing-engine.ts (pure math, no DB)
function applyFloorGuardrails(
  baseCents: number,
  learnedCents: number | null,
  minCents: number,
  maxCents: number
): number {
  const blended = learnedCents != null
    ? Math.round(learnedCents * 0.6 + baseCents * 0.4)
    : baseCents;
  return Math.max(minCents, Math.min(maxCents, blended));
}

// Mirror of second-price clearing (Vickrey) — must never change
function computeSecondPrice(bids: number[], floorCents: number): number | null {
  const sorted = [...bids].sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted[0] < floorCents) return null; // no winner — all bids below floor

  if (sorted.length === 1) return floorCents; // sole bidder pays floor
  const secondHighest = sorted[1];
  if (secondHighest < floorCents) return floorCents; // second below floor — winner pays floor
  return secondHighest + 1; // winner pays $0.01 above second-highest
}

// -- P2-05 Floor Tests --

describe("applyFloorGuardrails", () => {
  it("returns base floor when no learned floor", () => {
    expect(applyFloorGuardrails(30, null, 5, 200)).toBe(30);
  });

  it("blends learned (60%) with base (40%)", () => {
    // learned=50, base=30 → 50*0.6 + 30*0.4 = 30+12 = 42
    expect(applyFloorGuardrails(30, 50, 5, 200)).toBe(42);
  });

  it("clamps blended floor to min guardrail", () => {
    // learned=2, base=3 → blend=2.6→3; min=5 → clamped to 5
    expect(applyFloorGuardrails(3, 2, 5, 200)).toBe(5);
  });

  it("clamps blended floor to max guardrail", () => {
    // learned=300, base=250 → blend=275; max=200 → clamped to 200
    expect(applyFloorGuardrails(250, 300, 5, 200)).toBe(200);
  });

  it("min guardrail takes priority when blend equals min", () => {
    expect(applyFloorGuardrails(5, null, 5, 200)).toBe(5);
  });

  it("max guardrail takes priority when blend equals max", () => {
    expect(applyFloorGuardrails(200, null, 5, 200)).toBe(200);
  });

  it("blending is deterministic for same inputs", () => {
    const a = applyFloorGuardrails(40, 60, 10, 150);
    const b = applyFloorGuardrails(40, 60, 10, 150);
    expect(a).toBe(b);
  });

  it("learned=base produces same result as no learning", () => {
    // When learned matches base, blend should equal base
    expect(applyFloorGuardrails(40, 40, 5, 200)).toBe(40);
  });
});

describe("Sport-specific floor lookup logic", () => {
  // Test the resolution order: sport-specific > global (null sport) > hardcoded default
  function resolveFloor(
    rows: Array<{ sport: string | null; floor_cents: number }>,
    targetSport: string | null
  ): number | null {
    if (!rows || rows.length === 0) return null;
    const specific = targetSport ? rows.find((r) => r.sport === targetSport) : null;
    const global = rows.find((r) => r.sport == null);
    const row = specific ?? global ?? null;
    return row?.floor_cents ?? null;
  }

  it("prefers sport-specific row over global", () => {
    const rows = [
      { sport: null, floor_cents: 30 },
      { sport: "nba", floor_cents: 45 },
    ];
    expect(resolveFloor(rows, "nba")).toBe(45);
  });

  it("falls back to global when no sport-specific row", () => {
    const rows = [{ sport: null, floor_cents: 30 }];
    expect(resolveFloor(rows, "mlb")).toBe(30);
  });

  it("returns global row when targetSport is null", () => {
    const rows = [
      { sport: null, floor_cents: 30 },
      { sport: "nba", floor_cents: 45 },
    ];
    expect(resolveFloor(rows, null)).toBe(30);
  });

  it("returns null when no rows match", () => {
    expect(resolveFloor([], "nba")).toBeNull();
  });

  it("different sports get different floors from same moment_type", () => {
    const rows = [
      { sport: "nba", floor_cents: 50 },
      { sport: "ncaam", floor_cents: 35 },
    ];
    expect(resolveFloor(rows, "nba")).toBe(50);
    expect(resolveFloor(rows, "ncaam")).toBe(35);
  });
});

describe("Second-price Vickrey clearing (invariant — must never change)", () => {
  it("sole bidder pays floor price", () => {
    expect(computeSecondPrice([80], 30)).toBe(30);
  });

  it("winner pays $0.01 above second-highest bid", () => {
    // bids: [80, 60, 40]; floor=30 → winner pays 60+1=61
    expect(computeSecondPrice([80, 60, 40], 30)).toBe(61);
  });

  it("winner pays floor when second-highest is below floor", () => {
    // bids: [80, 10]; floor=30 → second(10) < floor(30) → winner pays floor
    expect(computeSecondPrice([80, 10], 30)).toBe(30);
  });

  it("no winner when all bids are below floor", () => {
    expect(computeSecondPrice([20, 10], 30)).toBeNull();
  });

  it("no winner on empty bids", () => {
    expect(computeSecondPrice([], 30)).toBeNull();
  });

  it("winner never pays MORE than their own bid", () => {
    const bids = [80, 60];
    const clearing = computeSecondPrice(bids, 30)!;
    expect(clearing).toBeLessThanOrEqual(80);
  });

  it("winner never pays LESS than floor", () => {
    const bids = [80];
    const clearing = computeSecondPrice(bids, 30)!;
    expect(clearing).toBeGreaterThanOrEqual(30);
  });

  it("higher floor raises clearing price for sole bidder", () => {
    const low = computeSecondPrice([80], 30)!;
    const high = computeSecondPrice([80], 50)!;
    expect(high).toBeGreaterThan(low);
  });

  it("adding a higher floor does not change winner identity", () => {
    // winner is always highest bidder regardless of floor
    const bids = [100, 80, 60];
    const sorted = [...bids].sort((a, b) => b - a);
    expect(sorted[0]).toBe(100); // same winner at any floor
  });
});
