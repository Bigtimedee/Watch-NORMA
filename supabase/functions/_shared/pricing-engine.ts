// NORMA Advertising — Pricing Engine
// Floor prices, dynamic premium multiplier, budget pacing, bid validation

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Floor Prices ---

export interface FloorPrice {
  moment_type: string;
  floor_cents: number;
  premium_multiplier: number;
  min_floor_cents: number;
  max_floor_cents: number;
  sport?: string | null;
}

const DEFAULT_MIN_FLOOR = 5;
const DEFAULT_MAX_FLOOR = 200;

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

/**
 * Blend learned floor with base floor (60/40) and clamp to guardrails.
 * Deterministic: same inputs always produce same output.
 */
export function applyFloorGuardrails(
  baseCents: number,
  learnedCents: number | null,
  minCents: number,
  maxCents: number
): number {
  const blended = learnedCents != null
    ? Math.round(learnedCents * 0.6 + baseCents * 0.4)
    : baseCents;
  return Math.max(minCents, Math.min(maxCents, blended));
}

/**
 * Per-category floor lookup: tries sport-specific row first, falls back to global (sport IS NULL).
 * Returns floor already clamped to guardrails with learned blending applied.
 */
export async function getCategoryFloor(
  supabase: SupabaseClient,
  momentType: string,
  sport: string | null
): Promise<FloorPrice> {
  try {
    const { data: rows } = await supabase
      .from("floor_prices")
      .select("moment_type, floor_cents, premium_multiplier, min_floor_cents, max_floor_cents, learned_floor_cents, sport")
      .eq("moment_type", momentType)
      .order("sport", { ascending: true, nullsFirst: false }); // sport-specific before NULL

    if (rows && rows.length > 0) {
      // Prefer sport-specific row; fall back to global (sport IS NULL)
      const specific = sport ? rows.find((r: any) => r.sport === sport) : null;
      const global = rows.find((r: any) => r.sport == null);
      const row: any = specific ?? global;

      if (row) {
        const min = row.min_floor_cents ?? DEFAULT_MIN_FLOOR;
        const max = row.max_floor_cents ?? DEFAULT_MAX_FLOOR;
        return {
          moment_type: row.moment_type,
          floor_cents: applyFloorGuardrails(row.floor_cents, row.learned_floor_cents, min, max),
          premium_multiplier: row.premium_multiplier ?? 1.0,
          min_floor_cents: min,
          max_floor_cents: max,
          sport: row.sport ?? null,
        };
      }
    }
  } catch {
    // Fall through to hardcoded default
  }

  const defaultBase = DEFAULT_FLOORS[momentType] ?? 10;
  return {
    moment_type: momentType,
    floor_cents: Math.max(DEFAULT_MIN_FLOOR, Math.min(DEFAULT_MAX_FLOOR, defaultBase)),
    premium_multiplier: 1.0,
    min_floor_cents: DEFAULT_MIN_FLOOR,
    max_floor_cents: DEFAULT_MAX_FLOOR,
    sport: null,
  };
}

/** Backward-compatible wrapper (no sport discrimination). */
export async function getFloorPrice(
  supabase: SupabaseClient,
  momentType: string
): Promise<FloorPrice> {
  return getCategoryFloor(supabase, momentType, null);
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
