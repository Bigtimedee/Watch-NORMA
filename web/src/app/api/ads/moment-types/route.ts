import { NextResponse } from "next/server";
import { VALID_MOMENT_TYPES } from "@/lib/ads-api";

// Public endpoint — no auth required
const MOMENT_METADATA: Record<string, { display_name: string; description: string; floor_cpm_usd: number; typical_ctr_low: number; typical_ctr_high: number }> = {
  prediction_resolved: { display_name: "Prediction Resolved", description: "User's prediction market position resolves", floor_cpm_usd: 0.60, typical_ctr_low: 11, typical_ctr_high: 17 },
  overtime: { display_name: "Overtime", description: "Game enters overtime", floor_cpm_usd: 0.40, typical_ctr_low: 12, typical_ctr_high: 18 },
  bet_resolved: { display_name: "Bet Resolved", description: "User's wager is settled", floor_cpm_usd: 0.50, typical_ctr_low: 9, typical_ctr_high: 15 },
  close_game: { display_name: "Close Game", description: "1-possession game in final minutes", floor_cpm_usd: 0.35, typical_ctr_low: 7, typical_ctr_high: 13 },
  spread_alert: { display_name: "Spread Alert", description: "Score crosses user's spread line", floor_cpm_usd: 0.30, typical_ctr_low: 6, typical_ctr_high: 10 },
  moneyline_alert: { display_name: "Moneyline Alert", description: "Moneyline bet momentum shift", floor_cpm_usd: 0.30, typical_ctr_low: 5, typical_ctr_high: 9 },
  total_alert: { display_name: "Total Alert", description: "Over/under bet at decision point", floor_cpm_usd: 0.25, typical_ctr_low: 4, typical_ctr_high: 8 },
  prop_alert: { display_name: "Prop Alert", description: "Player prop approaching its line", floor_cpm_usd: 0.25, typical_ctr_low: 4, typical_ctr_high: 8 },
  position_alert: { display_name: "Position Alert", description: "Prediction market position significant change", floor_cpm_usd: 0.20, typical_ctr_low: 3, typical_ctr_high: 7 },
  foul_trouble: { display_name: "Foul Trouble", description: "Key starter picks up 4th foul", floor_cpm_usd: 0.15, typical_ctr_low: 2, typical_ctr_high: 6 },
  follow_alert: { display_name: "Follow Alert", description: "Notable moment for a followed team/player", floor_cpm_usd: 0.10, typical_ctr_low: 2, typical_ctr_high: 4 },
};

const AVAILABLE_SPORTS = ["ncaa_basketball", "nba", "nfl", "mlb"];

export async function GET() {
  const result = VALID_MOMENT_TYPES.map((key) => ({
    key,
    ...MOMENT_METADATA[key],
    available_sports: AVAILABLE_SPORTS,
  }));

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
