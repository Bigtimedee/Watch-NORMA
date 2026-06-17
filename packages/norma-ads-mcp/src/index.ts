#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getApiKey } from "./lib/auth.js";
import { listMomentTypes } from "./tools/list-moment-types.js";
import { getInventoryForecast } from "./tools/get-inventory-forecast.js";
import { createCampaign } from "./tools/create-campaign.js";
import { getCampaignPerformance } from "./tools/get-campaign-performance.js";
import { updateCampaign } from "./tools/update-campaign.js";
import { submitBrief } from "./tools/submit-brief.js";

const server = new Server(
  { name: "norma-ads-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_moment_types",
      description:
        "Returns NORMA's full moment type taxonomy — the 11 intent signals fired during live sports push notifications (e.g. bet_resolved, close_game, overtime). Includes floor prices, historical CTR ranges, and available sports. Call this first when planning a campaign.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_inventory_forecast",
      description:
        "Returns projected available impressions for a given sport and moment type over a date range, with bid guidance showing estimated win rates at different CPM levels. Use this to size campaigns and set competitive bids.",
      inputSchema: {
        type: "object",
        properties: {
          sport: { type: "string", description: "e.g. ncaa_basketball, nfl, nba, mlb" },
          moment_type: { type: "string", description: "e.g. bet_resolved, close_game, overtime" },
          start_date: { type: "string", description: "ISO 8601 date, e.g. 2025-03-01" },
          end_date: { type: "string", description: "ISO 8601 date, e.g. 2025-03-31" },
          bid_cpm_usd: { type: "number", description: "Optional: returns estimated win rate at this CPM" },
        },
        required: ["sport", "moment_type", "start_date", "end_date"],
      },
    },
    {
      name: "create_campaign",
      description:
        "Creates a new NORMA ad campaign targeting sports-bettor push notifications. Supply campaign budget, flight dates, moment types, and a creative. Returns a campaign_id and estimated daily performance.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          advertiser_name: { type: "string", description: "Advertiser or brand name" },
          moment_types: {
            type: "array",
            items: { type: "string" },
            description: "Moment types to target, e.g. [\"bet_resolved\", \"close_game\"]",
          },
          sports: {
            type: "array",
            items: { type: "string" },
            description: "Sports to target, e.g. [\"ncaa_basketball\", \"nfl\"]",
          },
          bid_cpm_usd: { type: "number", description: "Max CPM bid in USD" },
          daily_budget_usd: { type: "number", description: "Daily spend cap in USD" },
          total_budget_usd: { type: "number", description: "Total campaign budget in USD" },
          target_cpa_usd: { type: "number", description: "Optional: enables auto-bidding toward this CPA target in USD" },
          start_date: { type: "string", description: "ISO 8601 campaign start date" },
          end_date: { type: "string", description: "Optional: ISO 8601 campaign end date" },
          creative: {
            type: "object",
            description: "Ad creative content",
            properties: {
              headline: { type: "string", description: "Max 60 characters" },
              body: { type: "string", description: "Max 120 characters" },
              icon_url: { type: "string", description: "URL to advertiser icon/logo" },
              action_url: { type: "string", description: "Destination URL when user taps" },
              cta_text: { type: "string", description: "Optional call-to-action button label" },
            },
            required: ["headline", "body", "icon_url", "action_url"],
          },
          postback_url: { type: "string", description: "Optional: URL to receive conversion postback events" },
        },
        required: ["name", "advertiser_name", "moment_types", "sports", "bid_cpm_usd", "daily_budget_usd", "total_budget_usd", "start_date", "creative"],
      },
    },
    {
      name: "get_campaign_performance",
      description:
        "Returns impressions, CTR, conversions, CPA, and spend for a campaign over a date range. Optionally break down by day, moment_type, sport, or creative.",
      inputSchema: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID returned by create_campaign" },
          start_date: { type: "string", description: "ISO 8601 start date for the reporting window" },
          end_date: { type: "string", description: "ISO 8601 end date for the reporting window" },
          breakdown: {
            type: "string",
            enum: ["day", "moment_type", "sport", "creative"],
            description: "Optional: dimension to break performance data by",
          },
        },
        required: ["campaign_id", "start_date", "end_date"],
      },
    },
    {
      name: "update_campaign",
      description:
        "Updates a campaign's bid, budget, CPA target, status (active/paused), or end date. All fields are optional — only those provided are changed.",
      inputSchema: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID to update" },
          bid_cpm_usd: { type: "number", description: "New max CPM bid in USD" },
          daily_budget_usd: { type: "number", description: "New daily spend cap in USD" },
          total_budget_usd: { type: "number", description: "New total budget in USD" },
          target_cpa_usd: { type: "number", description: "New CPA target in USD (set to enable auto-bidding)" },
          status: { type: "string", enum: ["active", "paused"], description: "Pause or resume the campaign" },
          end_date: { type: "string", description: "New ISO 8601 end date" },
        },
        required: ["campaign_id"],
      },
    },
    {
      name: "submit_brief",
      description:
        "Submit a natural-language advertising brief and let NORMA plan the campaign for you. Describe your goal in plain English (e.g. 'Run a retargeting push for NBA bettors during close games, $500 budget, starting March 15'). NORMA will extract parameters, recommend bids, estimate performance, and return a plan for review. Call again with confirm: true and a creative to execute.",
      inputSchema: {
        type: "object",
        properties: {
          brief: {
            type: "string",
            description: "Natural-language description of the campaign goal, target audience, budget, timing, and any other relevant details",
          },
          budget_usd: {
            type: "number",
            description: "Override total budget in USD if not specified in the brief",
          },
          start_date: {
            type: "string",
            description: "Override start date (ISO 8601) if not specified in the brief",
          },
          end_date: {
            type: "string",
            description: "Override end date (ISO 8601) if not specified in the brief",
          },
          confirm: {
            type: "boolean",
            description: "Set to true to execute the proposed plan. Must also supply a creative object.",
          },
          creative: {
            type: "object",
            description: "Required when confirm is true. Ad creative content.",
            properties: {
              headline: { type: "string", description: "Max 60 characters" },
              body: { type: "string", description: "Max 120 characters" },
              icon_url: { type: "string", description: "HTTPS URL to advertiser icon/logo" },
              action_url: { type: "string", description: "Destination URL when user taps" },
              cta_text: { type: "string", description: "Optional call-to-action button label" },
            },
            required: ["headline", "body", "icon_url", "action_url"],
          },
        },
        required: ["brief"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_moment_types":
      return listMomentTypes();
    case "get_inventory_forecast":
      return getInventoryForecast(args);
    case "create_campaign":
      return createCampaign(args);
    case "get_campaign_performance":
      return getCampaignPerformance(args);
    case "update_campaign":
      return updateCampaign(args);
    case "submit_brief":
      return submitBrief(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  // Validate API key is configured before accepting connections
  try {
    getApiKey();
  } catch {
    process.stderr.write(
      "Error: NORMA_API_KEY environment variable is not set.\n" +
        "Get your API key at https://getnorma.app/developers\n"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("norma-ads-mcp server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
