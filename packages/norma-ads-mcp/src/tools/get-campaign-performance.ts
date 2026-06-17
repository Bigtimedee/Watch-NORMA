import { apiClient } from "../lib/api-client.js";
import { toolError, invalidParams } from "../lib/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export interface GetCampaignPerformanceInput {
  campaign_id: string;
  start_date: string;
  end_date: string;
  breakdown?: "day" | "moment_type" | "sport" | "creative";
}

export interface PerformanceTotals {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa_usd: number;
  spend_usd: number;
  win_rate: number;
}

export interface GetCampaignPerformanceOutput {
  campaign_id: string;
  period: { start: string; end: string };
  totals: PerformanceTotals;
  breakdown?: Array<{ dimension: string; value: string } & PerformanceTotals>;
}

const VALID_BREAKDOWNS = ["day", "moment_type", "sport", "creative"] as const;

function validateInput(input: unknown): GetCampaignPerformanceInput {
  const i = input as Record<string, unknown>;
  if (!i.campaign_id || typeof i.campaign_id !== "string") throw invalidParams("campaign_id is required");
  if (!i.start_date || typeof i.start_date !== "string") throw invalidParams("start_date is required");
  if (!i.end_date || typeof i.end_date !== "string") throw invalidParams("end_date is required");
  if (isNaN(new Date(i.start_date as string).getTime())) throw invalidParams("start_date must be a valid ISO 8601 date");
  if (isNaN(new Date(i.end_date as string).getTime())) throw invalidParams("end_date must be a valid ISO 8601 date");
  if (i.breakdown !== undefined && !VALID_BREAKDOWNS.includes(i.breakdown as typeof VALID_BREAKDOWNS[number])) {
    throw invalidParams(`breakdown must be one of: ${VALID_BREAKDOWNS.join(", ")}`);
  }
  return i as unknown as GetCampaignPerformanceInput;
}

export async function getCampaignPerformance(input: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const params = validateInput(input);
    const qs = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
      ...(params.breakdown ? { breakdown: params.breakdown } : {}),
    });
    const data = await apiClient.get<GetCampaignPerformanceOutput>(
      `/campaigns/${params.campaign_id}/performance?${qs}`
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    if (err instanceof McpError) throw err;
    return toolError(`Failed to fetch campaign performance: ${(err as Error).message}`);
  }
}
