// NORMA Advertising — Pricing Engine
// Floor prices, dynamic premium multiplier, budget pacing, bid validation

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Floor Prices ---

export interface FloorPrice {
  moment_type: string;
  floor_cents: number;
  premium_multiplier: number;
}

// Default floor prices (fallback if DB query fails)
const DEFAULT_FLOORS: Record<string, number> = {
  prediction_resolved: 60,
  bet_resolved: 50,
  close_game: 35,
  overtime: 40,
  spread_alert: 30,
  moneyline_alert: 30,
  total_alert: 25,
  prop_alert: 25,
  position_alert: 20,
  foul_trouble: 15,
  follow_alert: 10,
};

export async function getFloorPrice(
  supabase: SupabaseClient,
  momentType: string
): Promise<FloorPrice> {
  const { data } = await supabase
    .from("floor_prices")
    .select("moment_type, floor_cents, premium_multiplier")
    .eq("moment_type", momentType)
    .single();

  if (data) return data as FloorPrice;

  return {
    moment_type: momentType,
    floor_cents: DEFAULT_FLOORS[momentType] ?? 10,
    premium_multiplier: 1.0,
  };
}

// --- Dynamic Premium Multiplier ---

export interface PremiumContext {
  simultaneous_live_games: number;
  moment_type: string;
  period: number | null;
  tournament_round: string | null;
  day_of_week: number; // 0=Sunday, 6=Saturday
}

export function computeDynamicPremium(ctx: PremiumContext): number {
  let premium = 1.0;

  // High-traffic window
  if (ctx.simultaneous_live_games > 10) {
    premium *= 1.3;
  }

  // Prediction resolved — highest-value post-outcome moment
  if (ctx.moment_type === "prediction_resolved") {
    premium *= 1.4;
  }

  // OT / close game in late periods
  if (
    (ctx.moment_type === "overtime" || ctx.moment_type === "close_game") &&
    ctx.period != null &&
    ctx.period > 2
  ) {
    premium *= 1.5;
  }

  // March Madness premium
  if (ctx.tournament_round != null) {
    premium *= 1.5;
  }

  // Weekend premium
  if (ctx.day_of_week === 0 || ctx.day_of_week === 6) {
    premium *= 1.2;
  }

  return premium;
}

export function getEffectiveFloor(
  baseCents: number,
  premiumMultiplier: number,
  dynamicPremium: number
): number {
  return Math.ceil(baseCents * premiumMultiplier * dynamicPremium);
}

// --- Budget Pacing ---

export interface PacingResult {
  allowed: boolean;
  reason?: string;
  today_spent: number;
  daily_allowed: number;
}

export async function checkBudgetPacing(
  supabase: SupabaseClient,
  campaignId: number,
  budgetCents: number,
  dailyBudgetCents: number | null,
  flightStart: string | null,
  flightEnd: string | null
): Promise<PacingResult> {
  // Calculate daily allowance
  let dailyAllowed: number;
  if (dailyBudgetCents != null) {
    dailyAllowed = dailyBudgetCents;
  } else if (flightStart && flightEnd) {
    const start = new Date(flightStart);
    const end = new Date(flightEnd);
    const daysInFlight = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    );
    dailyAllowed = Math.ceil(budgetCents / daysInFlight);
  } else {
    // No daily cap, no flight dates — allow all
    return { allowed: true, today_spent: 0, daily_allowed: budgetCents };
  }

  // Get today's spend
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("impressions")
    .select("clearing_price_cents")
    .eq("campaign_id", campaignId)
    .gte("delivered_at", todayStart.toISOString());

  const todaySpent = (data ?? []).reduce(
    (sum: number, r: { clearing_price_cents: number }) =>
      sum + r.clearing_price_cents,
    0
  );

  if (todaySpent >= dailyAllowed) {
    return {
      allowed: false,
      reason: "daily_budget_exceeded",
      today_spent: todaySpent,
      daily_allowed: dailyAllowed,
    };
  }

  // Hourly pace check
  const now = new Date();
  const hoursElapsed = now.getHours() + now.getMinutes() / 60;
  const hoursRemaining = Math.max(1, 24 - hoursElapsed);
  const hourlyPace = dailyAllowed / 24;

  if (hoursElapsed > 0 && todaySpent > hourlyPace * hoursElapsed * 1.5) {
    // Spending 50% faster than even pace — throttle
    return {
      allowed: false,
      reason: "pacing_throttle",
      today_spent: todaySpent,
      daily_allowed: dailyAllowed,
    };
  }

  return {
    allowed: true,
    today_spent: todaySpent,
    daily_allowed: dailyAllowed,
  };
}

// --- Bid Validation ---

export const MAX_BID_CENTS = 500; // $5 max per moment
export const MIN_BID_CENTS = 1;

export interface BidValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateBid(
  bidCents: number,
  floorCents: number,
  campaignBudgetCents: number,
  campaignSpentCents: number
): BidValidationResult {
  const errors: string[] = [];

  if (bidCents < MIN_BID_CENTS) {
    errors.push(`Bid must be at least ${MIN_BID_CENTS} cent(s)`);
  }

  if (bidCents > MAX_BID_CENTS) {
    errors.push(`Bid cannot exceed ${MAX_BID_CENTS} cents ($${(MAX_BID_CENTS / 100).toFixed(2)})`);
  }

  if (bidCents < floorCents) {
    errors.push(
      `Bid (${bidCents}c) is below floor price (${floorCents}c) for this moment type`
    );
  }

  const remainingBudget = campaignBudgetCents - campaignSpentCents;
  if (bidCents > remainingBudget) {
    errors.push("Bid exceeds remaining campaign budget");
  }

  return { valid: errors.length === 0, errors };
}
