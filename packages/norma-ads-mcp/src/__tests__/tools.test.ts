import { listMomentTypes } from "../tools/list-moment-types";
import { getInventoryForecast } from "../tools/get-inventory-forecast";
import { createCampaign } from "../tools/create-campaign";
import { getCampaignPerformance } from "../tools/get-campaign-performance";
import { updateCampaign } from "../tools/update-campaign";
import { submitBrief } from "../tools/submit-brief";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types";

// Mock the api-client module
jest.mock("../lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

// Mock the auth module
jest.mock("../lib/auth", () => ({
  getApiKey: jest.fn().mockReturnValue("test-key"),
  validateApiKey: jest.fn(),
}));

import { apiClient } from "../lib/api-client";

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── list_moment_types ────────────────────────────────────────────────────────

describe("list_moment_types", () => {
  const mockMomentTypes = [
    {
      key: "bet_resolved",
      display_name: "Bet Resolved",
      description: "Fires when a user's active wager is settled",
      floor_price_usd: 0.5,
      typical_ctr_low: 8.0,
      typical_ctr_high: 14.0,
      available_sports: ["ncaa_basketball", "nfl"],
    },
  ];

  it("returns moment types on success", async () => {
    mockGet.mockResolvedValueOnce(mockMomentTypes);
    const result = await listMomentTypes();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe("bet_resolved");
  });

  it("returns toolError on API failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("Network failure"));
    const result = await listMomentTypes();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Network failure");
  });

  it("rethrows McpError from api client", async () => {
    mockGet.mockRejectedValueOnce(new McpError(ErrorCode.InternalError, "DB error"));
    await expect(listMomentTypes()).rejects.toBeInstanceOf(McpError);
  });
});

// ─── get_inventory_forecast ───────────────────────────────────────────────────

describe("get_inventory_forecast", () => {
  const validInput = {
    sport: "ncaa_basketball",
    moment_type: "bet_resolved",
    start_date: "2025-03-01",
    end_date: "2025-03-31",
  };

  const mockForecast = {
    sport: "ncaa_basketball",
    moment_type: "bet_resolved",
    date_range: { start: "2025-03-01", end: "2025-03-31" },
    projected_impressions: 45000,
    projected_games: 300,
    bid_guidance: [
      { bid_cpm_usd: 0.5, estimated_win_rate: 0.3 },
      { bid_cpm_usd: 1.0, estimated_win_rate: 0.65 },
      { bid_cpm_usd: 1.5, estimated_win_rate: 0.85 },
    ],
  };

  it("returns forecast on success", async () => {
    mockGet.mockResolvedValueOnce(mockForecast);
    const result = await getInventoryForecast(validInput);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.projected_impressions).toBe(45000);
  });

  it("accepts optional bid_cpm_usd", async () => {
    mockGet.mockResolvedValueOnce(mockForecast);
    const result = await getInventoryForecast({ ...validInput, bid_cpm_usd: 1.0 });
    expect(result.isError).toBeUndefined();
  });

  it("throws McpError for missing sport", async () => {
    const { sport: _, ...input } = validInput;
    await expect(getInventoryForecast(input)).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for missing moment_type", async () => {
    const { moment_type: _, ...input } = validInput;
    await expect(getInventoryForecast(input)).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for invalid start_date", async () => {
    await expect(getInventoryForecast({ ...validInput, start_date: "not-a-date" })).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError when end_date is before start_date", async () => {
    await expect(
      getInventoryForecast({ ...validInput, start_date: "2025-03-31", end_date: "2025-03-01" })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("returns toolError on API failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("timeout"));
    const result = await getInventoryForecast(validInput);
    expect(result.isError).toBe(true);
  });
});

// ─── create_campaign ──────────────────────────────────────────────────────────

describe("create_campaign", () => {
  const validInput = {
    name: "March Madness Q1",
    advertiser_name: "DraftKings",
    moment_types: ["bet_resolved"],
    sports: ["ncaa_basketball"],
    bid_cpm_usd: 1.5,
    daily_budget_usd: 500,
    total_budget_usd: 5000,
    start_date: "2025-03-15",
    creative: {
      headline: "Your Bet is Live",
      body: "Watch the action now and cash in.",
      icon_url: "https://cdn.example.com/dk-icon.png",
      action_url: "https://draftkings.com/lobby",
      cta_text: "Bet Now",
    },
  };

  const mockResponse = {
    campaign_id: "cmp_abc123",
    status: "pending_review",
    estimated_daily_impressions: 3200,
    estimated_daily_spend_usd: 480,
    created_at: "2025-03-01T12:00:00Z",
  };

  it("creates a campaign on success", async () => {
    mockPost.mockResolvedValueOnce(mockResponse);
    const result = await createCampaign(validInput);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.campaign_id).toBe("cmp_abc123");
  });

  it("throws McpError for missing name", async () => {
    const { name: _, ...input } = validInput;
    await expect(createCampaign(input)).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for empty moment_types", async () => {
    await expect(createCampaign({ ...validInput, moment_types: [] })).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for headline > 60 chars", async () => {
    await expect(
      createCampaign({
        ...validInput,
        creative: { ...validInput.creative, headline: "A".repeat(61) },
      })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for body > 120 chars", async () => {
    await expect(
      createCampaign({
        ...validInput,
        creative: { ...validInput.creative, body: "B".repeat(121) },
      })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for negative bid_cpm_usd", async () => {
    await expect(createCampaign({ ...validInput, bid_cpm_usd: -1 })).rejects.toBeInstanceOf(McpError);
  });

  it("returns toolError on API failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("insufficient balance"));
    const result = await createCampaign(validInput);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("insufficient balance");
  });
});

// ─── get_campaign_performance ─────────────────────────────────────────────────

describe("get_campaign_performance", () => {
  const validInput = {
    campaign_id: "cmp_abc123",
    start_date: "2025-03-01",
    end_date: "2025-03-31",
  };

  const mockPerformance = {
    campaign_id: "cmp_abc123",
    period: { start: "2025-03-01", end: "2025-03-31" },
    totals: {
      impressions: 14200,
      clicks: 1136,
      ctr: 0.08,
      conversions: 284,
      cpa_usd: 1.76,
      spend_usd: 499.84,
      win_rate: 0.62,
    },
  };

  it("returns performance data on success", async () => {
    mockGet.mockResolvedValueOnce(mockPerformance);
    const result = await getCampaignPerformance(validInput);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totals.impressions).toBe(14200);
  });

  it("accepts optional breakdown parameter", async () => {
    mockGet.mockResolvedValueOnce(mockPerformance);
    const result = await getCampaignPerformance({ ...validInput, breakdown: "day" });
    expect(result.isError).toBeUndefined();
  });

  it("throws McpError for missing campaign_id", async () => {
    const { campaign_id: _, ...input } = validInput;
    await expect(getCampaignPerformance(input)).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for invalid breakdown value", async () => {
    await expect(
      getCampaignPerformance({ ...validInput, breakdown: "invalid" })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("returns toolError on API failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("not found"));
    const result = await getCampaignPerformance(validInput);
    expect(result.isError).toBe(true);
  });
});

// ─── update_campaign ──────────────────────────────────────────────────────────

describe("update_campaign", () => {
  const mockResponse = {
    campaign_id: "cmp_abc123",
    updated_fields: ["bid_cpm_usd", "status"],
    updated_at: "2025-03-15T10:00:00Z",
  };

  it("updates campaign on success", async () => {
    mockPatch.mockResolvedValueOnce(mockResponse);
    const result = await updateCampaign({ campaign_id: "cmp_abc123", bid_cpm_usd: 2.0, status: "paused" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updated_fields).toContain("bid_cpm_usd");
  });

  it("throws McpError for missing campaign_id", async () => {
    await expect(updateCampaign({ bid_cpm_usd: 2.0 })).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError when no fields to update are provided", async () => {
    await expect(updateCampaign({ campaign_id: "cmp_abc123" })).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for invalid status value", async () => {
    await expect(
      updateCampaign({ campaign_id: "cmp_abc123", status: "completed" })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for negative daily_budget_usd", async () => {
    await expect(
      updateCampaign({ campaign_id: "cmp_abc123", daily_budget_usd: -100 })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("returns toolError on API failure", async () => {
    mockPatch.mockRejectedValueOnce(new Error("campaign not found"));
    const result = await updateCampaign({ campaign_id: "cmp_abc123", status: "paused" });
    expect(result.isError).toBe(true);
  });
});

// ─── submit_brief ─────────────────────────────────────────────────────────────

describe("submit_brief", () => {
  const mockProposedResponse = {
    status: "proposed",
    plan: {
      name: "Campaign — nba bet resolved",
      moment_types: ["bet_resolved"],
      sports: ["nba"],
      recommended_bid_cpm_usd: 0.68,
      daily_budget_usd: 71.43,
      total_budget_usd: 500,
      target_cpa_usd: null,
      start_date: "2026-03-15",
      end_date: null,
      estimated_impressions: 735294,
      estimated_conversions_low: 367,
      estimated_conversions_high: 735,
      interpretation_notes: ["No start date specified — defaulting to tomorrow"],
      creative_required: true,
      creative_prompt: "Please provide a creative with headline...",
    },
    confirm_instruction: "Call POST /api/ads/briefs again with confirm: true and add a 'creative' field to execute this plan.",
  };

  const mockCreatedResponse = {
    status: "created",
    campaign_id: "42",
    plan: mockProposedResponse.plan,
  };

  const mockInsufficientResponse = {
    status: "insufficient",
    message: "Brief is too vague to construct a campaign plan.",
    clarifying_questions: [
      "Which sports should the campaign target? (ncaa_basketball, nba, nfl, mlb)",
      "What is your total campaign budget in USD?",
    ],
  };

  it("returns toolError when brief is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await submitBrief({}) as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("brief is required");
  });

  it("returns toolError when brief is not a string", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await submitBrief({ brief: 123 }) as any;
    expect(result.isError).toBe(true);
  });

  it("formats proposed response correctly", async () => {
    mockPost.mockResolvedValueOnce(mockProposedResponse);
    const result = await submitBrief({ brief: "Run NBA bet_resolved campaign with $500 budget" });
    expect((result as any).isError).toBeUndefined();
    expect(result.content[0].text).toContain("Campaign Plan Proposed");
    expect(result.content[0].text).toContain("Campaign — nba bet resolved");
    expect(result.content[0].text).toContain("$0.68 CPM");
    expect(result.content[0].text).toContain("$500");
    expect(result.content[0].text).toContain("Next step:");
  });

  it("formats created response correctly", async () => {
    mockPost.mockResolvedValueOnce(mockCreatedResponse);
    const result = await submitBrief({
      brief: "Run NBA bet_resolved campaign",
      confirm: true,
      creative: {
        headline: "Your Bet Is Live",
        body: "Check the score now.",
        icon_url: "https://cdn.example.com/icon.png",
        action_url: "https://example.com",
      },
    });
    expect((result as any).isError).toBeUndefined();
    expect(result.content[0].text).toContain("Campaign created successfully");
    expect(result.content[0].text).toContain("42");
  });

  it("formats insufficient response correctly", async () => {
    mockPost.mockResolvedValueOnce(mockInsufficientResponse);
    const result = await submitBrief({ brief: "Run some ads" });
    expect((result as any).isError).toBeUndefined();
    expect(result.content[0].text).toContain("Brief needs more detail");
    expect(result.content[0].text).toContain("Which sports");
    expect(result.content[0].text).toContain("Clarifying questions:");
  });

  it("passes budget_usd and date overrides to the API", async () => {
    mockPost.mockResolvedValueOnce(mockProposedResponse);
    await submitBrief({
      brief: "Run NBA ads",
      budget_usd: 1000,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/api/ads/briefs",
      expect.objectContaining({
        brief: "Run NBA ads",
        budget_usd: 1000,
        start_date: "2026-04-01",
        end_date: "2026-04-30",
      })
    );
  });

  it("returns toolError on API failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("upstream timeout"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await submitBrief({ brief: "Run NBA ads with $200 budget" }) as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upstream timeout");
  });
});
