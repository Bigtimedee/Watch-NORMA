import { apiClient } from "../lib/api-client.js";
import { toolError } from "../lib/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export interface MomentType {
  key: string;
  display_name: string;
  description: string;
  floor_price_usd: number;
  /** Null until CTR is published (after campaigns reach real volume). */
  typical_ctr_low: number | null;
  /** Null until CTR is published (after campaigns reach real volume). */
  typical_ctr_high: number | null;
  /** Explains why the CTR fields are null. */
  ctr_note?: string;
  available_sports: string[];
}

export async function listMomentTypes(): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const data = await apiClient.get<MomentType[]>("/moment-types");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    if (err instanceof McpError) throw err;
    return toolError(`Failed to fetch moment types: ${(err as Error).message}`);
  }
}
