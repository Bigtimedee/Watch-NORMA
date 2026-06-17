import { apiClient } from "../lib/api-client.js";
import { toolError, invalidParams } from "../lib/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export interface CreateCampaignInput {
  name: string;
  advertiser_name: string;
  moment_types: string[];
  sports: string[];
  bid_cpm_usd: number;
  daily_budget_usd: number;
  total_budget_usd: number;
  target_cpa_usd?: number;
  start_date: string;
  end_date?: string;
  creative: {
    headline: string;
    body: string;
    icon_url: string;
    action_url: string;
    cta_text?: string;
  };
  postback_url?: string;
}

export interface CreateCampaignOutput {
  campaign_id: string;
  status: "active" | "pending_review";
  estimated_daily_impressions: number;
  estimated_daily_spend_usd: number;
  created_at: string;
}

function validateInput(input: unknown): CreateCampaignInput {
  const i = input as Record<string, unknown>;
  if (!i.name || typeof i.name !== "string") throw invalidParams("name is required");
  if (!i.advertiser_name || typeof i.advertiser_name !== "string") throw invalidParams("advertiser_name is required");
  if (!Array.isArray(i.moment_types) || i.moment_types.length === 0) throw invalidParams("moment_types must be a non-empty array");
  if (!Array.isArray(i.sports) || i.sports.length === 0) throw invalidParams("sports must be a non-empty array");
  if (typeof i.bid_cpm_usd !== "number" || i.bid_cpm_usd <= 0) throw invalidParams("bid_cpm_usd must be a positive number");
  if (typeof i.daily_budget_usd !== "number" || i.daily_budget_usd <= 0) throw invalidParams("daily_budget_usd must be a positive number");
  if (typeof i.total_budget_usd !== "number" || i.total_budget_usd <= 0) throw invalidParams("total_budget_usd must be a positive number");
  if (!i.start_date || typeof i.start_date !== "string") throw invalidParams("start_date is required");
  if (isNaN(new Date(i.start_date as string).getTime())) throw invalidParams("start_date must be a valid ISO 8601 date");

  const creative = i.creative as Record<string, unknown> | undefined;
  if (!creative) throw invalidParams("creative is required");
  if (!creative.headline || typeof creative.headline !== "string") throw invalidParams("creative.headline is required");
  if ((creative.headline as string).length > 60) throw invalidParams("creative.headline must be 60 characters or fewer");
  if (!creative.body || typeof creative.body !== "string") throw invalidParams("creative.body is required");
  if ((creative.body as string).length > 120) throw invalidParams("creative.body must be 120 characters or fewer");
  if (!creative.icon_url || typeof creative.icon_url !== "string") throw invalidParams("creative.icon_url is required");
  if (!creative.action_url || typeof creative.action_url !== "string") throw invalidParams("creative.action_url is required");

  return i as unknown as CreateCampaignInput;
}

export async function createCampaign(input: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const params = validateInput(input);
    const data = await apiClient.post<CreateCampaignOutput>("/campaigns", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    if (err instanceof McpError) throw err;
    return toolError(`Failed to create campaign: ${(err as Error).message}`);
  }
}
