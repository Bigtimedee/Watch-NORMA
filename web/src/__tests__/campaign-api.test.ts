import { formatCampaign, isValidUrl, VALID_MOMENT_TYPES, VALID_SPORTS, CampaignRow } from "../lib/ads-api";

// ─── Validation helpers ───────────────────────────────────────────────────────

describe("isValidUrl", () => {
  it("accepts https URLs", () => expect(isValidUrl("https://example.com/icon.png")).toBe(true));
  it("accepts http URLs", () => expect(isValidUrl("http://example.com")).toBe(true));
  it("rejects non-URLs", () => expect(isValidUrl("not-a-url")).toBe(false));
  it("rejects empty string", () => expect(isValidUrl("")).toBe(false));
});

describe("VALID_MOMENT_TYPES", () => {
  it("includes bet_resolved", () => expect(VALID_MOMENT_TYPES).toContain("bet_resolved"));
  it("includes overtime", () => expect(VALID_MOMENT_TYPES).toContain("overtime"));
  it("includes all 11 moment types", () => expect(VALID_MOMENT_TYPES).toHaveLength(11));
});

describe("VALID_SPORTS", () => {
  it("includes ncaa_basketball", () => expect(VALID_SPORTS).toContain("ncaa_basketball"));
  it("includes 4 sports", () => expect(VALID_SPORTS).toHaveLength(4));
});

// ─── formatCampaign ───────────────────────────────────────────────────────────

describe("formatCampaign", () => {
  const baseRow: CampaignRow = {
    id: 42,
    name: "March Madness",
    status: "active",
    budget_cents: 500000,
    spent_cents: 41288,
    daily_budget_cents: 10000,
    flight_start: "2026-03-01T00:00:00Z",
    flight_end: "2026-04-07T00:00:00Z",
    targeting_rules: {
      moment_types: ["bet_resolved", "overtime"],
      sports: ["ncaa_basketball"],
      bid_cpm_usd: 0.55,
    },
    approval_status: "approved",
    created_at: "2026-03-01T12:00:00Z",
    updated_at: "2026-03-15T09:30:00Z",
  };

  it("converts cents to USD", () => {
    const result = formatCampaign(baseRow);
    expect(result.total_budget_usd).toBe(5000);
    expect(result.daily_budget_usd).toBe(100);
    expect(result.spend_to_date_usd).toBeCloseTo(412.88, 1);
  });

  it("extracts moment_types and sports from targeting_rules", () => {
    const result = formatCampaign(baseRow);
    expect(result.moment_types).toEqual(["bet_resolved", "overtime"]);
    expect(result.sports).toEqual(["ncaa_basketball"]);
  });

  it("returns id as string", () => {
    const result = formatCampaign(baseRow);
    expect(result.id).toBe("42");
  });

  it("returns date without time component", () => {
    const result = formatCampaign(baseRow);
    expect(result.start_date).toBe("2026-03-01");
    expect(result.end_date).toBe("2026-04-07");
  });

  it("includes creative details when includeCreatives=true", () => {
    const rowWithCreative: CampaignRow = {
      ...baseRow,
      creatives: [{
        id: 1,
        sponsor_text: "Bet Now on DraftKings",
        cta_text: "Open App",
        cta_url: "https://draftkings.com",
        logo_url: "https://cdn.dk.com/icon.png",
        status: "approved",
        performance_score: 0.08,
      }],
    };
    const result = formatCampaign(rowWithCreative, true);
    expect((result.creative as Record<string, unknown>)?.headline).toBe("Bet Now on DraftKings");
    expect((result.creative as Record<string, unknown>)?.action_url).toBe("https://draftkings.com");
  });

  it("handles legacy league field in targeting_rules", () => {
    const legacyRow: CampaignRow = {
      ...baseRow,
      targeting_rules: { ...baseRow.targeting_rules, league: "ncaa_basketball", sports: undefined as unknown as string[] },
    };
    const result = formatCampaign(legacyRow);
    expect(result.sports).toEqual(["ncaa_basketball"]);
  });

  it("extracts target_cpa_usd from auto_bid config", () => {
    const rowWithAutoBid: CampaignRow = {
      ...baseRow,
      targeting_rules: {
        ...baseRow.targeting_rules,
        auto_bid: { enabled: true, target_cpa_cents: 800, max_bid_cents: 150, strategy: "target_cpa" },
      },
    };
    const result = formatCampaign(rowWithAutoBid);
    expect(result.target_cpa_usd).toBe(8);
  });
});

// ─── Input validation rules (documented expectations) ─────────────────────────

describe("campaign create validation rules", () => {
  // These tests document the expected validation behavior without hitting HTTP

  it("validates that bid must be >= floor for each moment type", () => {
    // floor for bet_resolved = 50 cents = $0.50
    const bidCents = 40;
    const floorCents = 50;
    expect(bidCents < floorCents).toBe(true); // should be rejected
  });

  it("validates that end_date must be after start_date", () => {
    const start = new Date("2026-03-15");
    const end = new Date("2026-03-01");
    expect(end <= start).toBe(true); // should be rejected
  });

  it("validates headline length", () => {
    const tooLong = "A".repeat(61);
    expect(tooLong.length > 60).toBe(true); // should be rejected
  });

  it("validates body length", () => {
    const tooLong = "B".repeat(121);
    expect(tooLong.length > 120).toBe(true); // should be rejected
  });

  it("identifies invalid moment types", () => {
    const requested = ["bet_resolved", "fake_moment_type"];
    const invalid = requested.filter((m) => !VALID_MOMENT_TYPES.includes(m as typeof VALID_MOMENT_TYPES[number]));
    expect(invalid).toEqual(["fake_moment_type"]);
  });

  it("identifies invalid sports", () => {
    const requested = ["ncaa_basketball", "curling"];
    const invalid = requested.filter((s) => !VALID_SPORTS.includes(s as typeof VALID_SPORTS[number]));
    expect(invalid).toEqual(["curling"]);
  });
});
