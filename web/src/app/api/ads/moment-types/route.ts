import { NextResponse } from "next/server";
import { VALID_MOMENT_TYPES } from "@/lib/ads-api";

// Public endpoint — no auth required
const MOMENT_METADATA: Record<string, { display_name: string; description: string; floor_cpm_usd: number }> = {
  prediction_resolved: { display_name: "Prediction Resolved", description: "User's prediction market position resolves", floor_cpm_usd: 0.60 },
  overtime: { display_name: "Overtime", description: "Game enters overtime", floor_cpm_usd: 0.40 },
  bet_resolved: { display_name: "Bet Resolved", description: "User's wager is settled", floor_cpm_usd: 0.50 },
  close_game: { display_name: "Close Game", description: "1-possession game in final minutes", floor_cpm_usd: 0.35 },
  spread_alert: { display_name: "Spread Alert", description: "Score crosses user's spread line", floor_cpm_usd: 0.30 },
  moneyline_alert: { display_name: "Moneyline Alert", description: "Moneyline bet momentum shift", floor_cpm_usd: 0.30 },
  total_alert: { display_name: "Total Alert", description: "Over/under bet at decision point", floor_cpm_usd: 0.25 },
  prop_alert: { display_name: "Prop Alert", description: "Player prop approaching its line", floor_cpm_usd: 0.25 },
  position_alert: { display_name: "Position Alert", description: "Prediction market position significant change", floor_cpm_usd: 0.20 },
  foul_trouble: { display_name: "Foul Trouble", description: "Key starter picks up 4th foul", floor_cpm_usd: 0.15 },
  follow_alert: { display_name: "Follow Alert", description: "Notable moment for a followed team/player", floor_cpm_usd: 0.10 },
};

const CTR_NOTE = "Delivery and CTR metrics are published after campaigns reach real volume.";

const AVAILABLE_SPORTS = ["ncaa_basketball", "nba", "nfl", "mlb"];

export async function GET() {
  const result = VALID_MOMENT_TYPES.map((key) => ({
    key,
    ...MOMENT_METADATA[key],
    // CTR is not published until campaigns reach real volume. The fields stay
    // in the response (null) so existing API/MCP clients keep parsing it.
    typical_ctr_low: null,
    typical_ctr_high: null,
    ctr_note: CTR_NOTE,
    available_sports: AVAILABLE_SPORTS,
  }));

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
