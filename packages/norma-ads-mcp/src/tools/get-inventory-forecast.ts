import { apiClient } from "../lib/api-client.js";
import { toolError, invalidParams } from "../lib/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export interface InventoryForecastInput {
  sport: string;
  moment_type: string;
  start_date: string;
  end_date: string;
  bid_cpm_usd?: number;
}

export interface InventoryForecastOutput {
  sport: string;
  moment_type: string;
  date_range: { start: string; end: string };
  projected_impressions: number;
  projected_games: number;
  bid_guidance: Array<{ bid_cpm_usd: number; estimated_win_rate: number }>;
}

function validateInput(input: unknown): InventoryForecastInput {
  const i = input as Record<string, unknown>;
  if (!i.sport || typeof i.sport !== "string") throw invalidParams("sport is required");
  if (!i.moment_type || typeof i.moment_type !== "string") throw invalidParams("moment_type is required");
  if (!i.start_date || typeof i.start_date !== "string") throw invalidParams("start_date is required");
  if (!i.end_date || typeof i.end_date !== "string") throw invalidParams("end_date is required");
  if (i.bid_cpm_usd !== undefined && typeof i.bid_cpm_usd !== "number") {
    throw invalidParams("bid_cpm_usd must be a number");
  }
  const start = new Date(i.start_date as string);
  const end = new Date(i.end_date as string);
  if (isNaN(start.getTime())) throw invalidParams("start_date must be a valid ISO 8601 date");
  if (isNaN(end.getTime())) throw invalidParams("end_date must be a valid ISO 8601 date");
  if (end <= start) throw invalidParams("end_date must be after start_date");
  return i as unknown as InventoryForecastInput;
}

export async function getInventoryForecast(input: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const params = validateInput(input);
    const qs = new URLSearchParams({
      sport: params.sport,
      moment_type: params.moment_type,
      start_date: params.start_date,
      end_date: params.end_date,
      ...(params.bid_cpm_usd !== undefined ? { bid_cpm_usd: String(params.bid_cpm_usd) } : {}),
    });
    const data = await apiClient.get<InventoryForecastOutput>(`/inventory/forecast?${qs}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    if (err instanceof McpError) throw err;
    return toolError(`Failed to fetch inventory forecast: ${(err as Error).message}`);
  }
}
