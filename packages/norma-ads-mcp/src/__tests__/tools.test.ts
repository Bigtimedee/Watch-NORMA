import { listMomentTypes } from "../tools/list-moment-types";
import { getInventoryForecast } from "../tools/get-inventory-forecast";
import { createCampaign } from "../tools/create-campaign";
import { getCampaignPerformance } from "../tools/get-campaign-performance";
import { updateCampaign } from "../tools/update-campaign";
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
