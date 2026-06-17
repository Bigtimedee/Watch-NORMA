import { parseBrief, buildPlan, getClarifyingQuestions } from "../lib/brief-parser";

// Force keyword fallback by ensuring no ANTHROPIC_API_KEY during these tests
const originalKey = process.env.ANTHROPIC_API_KEY;
beforeAll(() => { delete process.env.ANTHROPIC_API_KEY; });
afterAll(() => { if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey; });

// ─── parseBrief (keyword fallback) ───────────────────────────────────────────

describe("parseBrief — keyword fallback", () => {
  it("detects NBA and bet_resolved", async () => {
    const result = await parseBrief("Run NBA ads when bets resolve, $500 budget");
    expect(result.sports).toContain("nba");
    expect(result.moment_types).toContain("bet_resolved");
    expect(result.total_budget_usd).toBe(500);
  });

  it("detects ncaa_basketball from 'march madness'", async () => {
    const result = await parseBrief("March Madness campaign targeting close games");
    expect(result.sports).toContain("ncaa_basketball");
    expect(result.moment_types).toContain("close_game");
  });

  it("detects overtime moment type", async () => {
    const result = await parseBrief("Alert fans when NBA games go to OT");
    expect(result.moment_types).toContain("overtime");
  });

  it("detects spread_alert", async () => {
    const result = await parseBrief("Target NFL spread bettors");
    expect(result.moment_types).toContain("spread_alert");
  });

  it("detects foul_trouble", async () => {
    const result = await parseBrief("Alert when players are in foul trouble");
    expect(result.moment_types).toContain("foul_trouble");
  });

  it("extracts ISO date range", async () => {
    const result = await parseBrief("Run from 2026-03-01 to 2026-04-07, $1000 budget, NBA");
    expect(result.start_date).toBe("2026-03-01");
    expect(result.end_date).toBe("2026-04-07");
  });

  it("extracts CPA target", async () => {
    const result = await parseBrief("NBA campaign, $500 budget, $2.50 CPA target");
    expect(result.target_cpa_usd).toBe(2.5);
  });

  it("adds note for unsupported sports", async () => {
    const result = await parseBrief("Soccer and hockey campaign, $500 budget");
    expect(result.notes.some((n) => n.includes("Unsupported sport"))).toBe(true);
  });

  it("returns empty moment_types for vague brief", async () => {
    const result = await parseBrief("Run some ads for sports fans");
    expect(result.moment_types).toHaveLength(0);
  });
});

// ─── buildPlan ────────────────────────────────────────────────────────────────

describe("buildPlan", () => {
  const parsed = {
    moment_types: ["bet_resolved" as const],
    sports: ["nba" as const],
    total_budget_usd: 500,
    daily_budget_usd: null,
    target_cpa_usd: null,
    start_date: "2026-03-15",
    end_date: null,
    campaign_name_hint: null,
    notes: [],
  };

  it("returns null when no budget", () => {
    expect(buildPlan({ ...parsed, total_budget_usd: null })).toBeNull();
  });

  it("returns null when no moment_types", () => {
    expect(buildPlan({ ...parsed, moment_types: [] })).toBeNull();
  });

  it("returns null when no sports", () => {
    expect(buildPlan({ ...parsed, sports: [] })).toBeNull();
  });

  it("returns a complete plan for valid input", () => {
    const plan = buildPlan(parsed);
    expect(plan).not.toBeNull();
    expect(plan!.total_budget_usd).toBe(500);
    expect(plan!.moment_types).toContain("bet_resolved");
    expect(plan!.sports).toContain("nba");
    expect(plan!.start_date).toBe("2026-03-15");
  });

  it("sets recommended_bid_cpm_usd above floor price (bet_resolved floor = $0.50)", () => {
    const plan = buildPlan(parsed);
    expect(plan!.recommended_bid_cpm_usd).toBeGreaterThanOrEqual(0.5);
    // 1.35x multiplier: 0.50 * 1.35 = 0.675 → rounds to 0.68
    expect(plan!.recommended_bid_cpm_usd).toBeCloseTo(0.68, 1);
  });

  it("derives daily_budget from total if not provided (total / 7)", () => {
    const plan = buildPlan(parsed);
    expect(plan!.daily_budget_usd).toBeCloseTo(500 / 7, 0);
  });

  it("uses explicit daily_budget_usd when provided", () => {
    const plan = buildPlan({ ...parsed, daily_budget_usd: 100 });
    expect(plan!.daily_budget_usd).toBe(100);
  });

  it("applies budget override over parsed budget", () => {
    const plan = buildPlan(parsed, 1000);
    expect(plan!.total_budget_usd).toBe(1000);
  });

  it("applies start_date override", () => {
    const plan = buildPlan(parsed, undefined, "2026-05-01");
    expect(plan!.start_date).toBe("2026-05-01");
  });

  it("defaults start_date to tomorrow when not provided", () => {
    const plan = buildPlan({ ...parsed, start_date: null });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    expect(plan!.start_date).toBe(tomorrow);
    expect(plan!.interpretation_notes.some((n) => n.includes("defaulting to tomorrow"))).toBe(true);
  });

  it("uses campaign_name_hint when provided", () => {
    const plan = buildPlan({ ...parsed, campaign_name_hint: "My Custom Campaign" });
    expect(plan!.name).toBe("My Custom Campaign");
  });

  it("computes estimated impressions from budget / bid * 1000", () => {
    const plan = buildPlan(parsed)!;
    const expected = Math.round((500 / plan.recommended_bid_cpm_usd) * 1000);
    expect(plan.estimated_impressions).toBe(expected);
  });

  it("propagates target_cpa_usd", () => {
    const plan = buildPlan({ ...parsed, target_cpa_usd: 3.0 });
    expect(plan!.target_cpa_usd).toBe(3.0);
  });

  it("uses highest floor price across multiple moment types for bid", () => {
    // prediction_resolved floor = 0.60, overtime floor = 0.40 → max = 0.60 * 1.35 = 0.81
    const plan = buildPlan({ ...parsed, moment_types: ["prediction_resolved", "overtime"] });
    expect(plan!.recommended_bid_cpm_usd).toBeCloseTo(0.81, 1);
  });
});

// ─── getClarifyingQuestions ───────────────────────────────────────────────────

describe("getClarifyingQuestions", () => {
  const full = {
    moment_types: ["bet_resolved" as const],
    sports: ["nba" as const],
    total_budget_usd: 500,
    daily_budget_usd: null,
    target_cpa_usd: null,
    start_date: null,
    end_date: null,
    campaign_name_hint: null,
    notes: [],
  };

  it("returns no questions for fully specified brief", () => {
    expect(getClarifyingQuestions(full)).toHaveLength(0);
  });

  it("asks about sports when none detected", () => {
    const qs = getClarifyingQuestions({ ...full, sports: [] });
    expect(qs.some((q) => q.includes("sports"))).toBe(true);
  });

  it("asks about moment types when none detected", () => {
    const qs = getClarifyingQuestions({ ...full, moment_types: [] });
    expect(qs.some((q) => q.includes("moment types"))).toBe(true);
  });

  it("asks about budget when not provided", () => {
    const qs = getClarifyingQuestions({ ...full, total_budget_usd: null });
    expect(qs.some((q) => q.includes("budget"))).toBe(true);
  });

  it("returns three questions for completely empty brief", () => {
    const empty = { ...full, sports: [], moment_types: [], total_budget_usd: null };
    expect(getClarifyingQuestions(empty)).toHaveLength(3);
  });
});
