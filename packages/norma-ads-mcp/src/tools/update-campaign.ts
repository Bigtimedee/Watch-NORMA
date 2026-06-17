import { apiClient } from "../lib/api-client.js";
import { toolError, invalidParams } from "../lib/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export interface UpdateCampaignInput {
  campaign_id: string;
  bid_cpm_usd?: number;
  daily_budget_usd?: number;
  total_budget_usd?: number;
  target_cpa_usd?: number;
  status?: "active" | "paused";
  end_date?: string;
}

export interface UpdateCampaignOutput {
  campaign_id: string;
  updated_fields: string[];
  updated_at: string;
}

function validateInput(input: unknown): UpdateCampaignInput {
  const i = input as Record<string, unknown>;
  if (!i.campaign_id || typeof i.campaign_id !== "string") throw invalidParams("campaign_id is required");

  const updatable = ["bid_cpm_usd", "daily_budget_usd", "total_budget_usd", "target_cpa_usd", "status", "end_date"];
  const provided = updatable.filter((k) => i[k] !== undefined);
  if (provided.length === 0) throw invalidParams("At least one field to update must be provided");

  if (i.bid_cpm_usd !== undefined && (typeof i.bid_cpm_usd !== "number" || i.bid_cpm_usd <= 0)) {
    throw invalidParams("bid_cpm_usd must be a positive number");
  }
  if (i.daily_budget_usd !== undefined && (typeof i.daily_budget_usd !== "number" || i.daily_budget_usd <= 0)) {
    throw invalidParams("daily_budget_usd must be a positive number");
  }
  if (i.total_budget_usd !== undefined && (typeof i.total_budget_usd !== "number" || i.total_budget_usd <= 0)) {
    throw invalidParams("total_budget_usd must be a positive number");
  }
  if (i.target_cpa_usd !== undefined && (typeof i.target_cpa_usd !== "number" || i.target_cpa_usd <= 0)) {
    throw invalidParams("target_cpa_usd must be a positive number");
  }
  if (i.status !== undefined && i.status !== "active" && i.status !== "paused") {
    throw invalidParams('status must be "active" or "paused"');
  }
  if (i.end_date !== undefined) {
    if (typeof i.end_date !== "string" || isNaN(new Date(i.end_date).getTime())) {
      throw invalidParams("end_date must be a valid ISO 8601 date");
    }
  }
  return i as unknown as UpdateCampaignInput;
}

export async function updateCampaign(input: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const params = validateInput(input);
    const { campaign_id, ...updates } = params;
    const data = await apiClient.patch<UpdateCampaignOutput>(`/campaigns/${campaign_id}`, updates);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    if (err instanceof McpError) throw err;
    return toolError(`Failed to update campaign: ${(err as Error).message}`);
  }
}
