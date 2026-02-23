// NORMA Advertising — AI Ad Engine
// Creative optimization (Thompson Sampling), smart bidding, moment value prediction

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ================================================================
// A. Creative Optimization — Thompson Sampling (Multi-Armed Bandit)
// ================================================================

const EXPLORATION_THRESHOLD = 100; // impressions per variant before locking

/**
 * Select the best creative variant for a campaign using Thompson Sampling.
 * After EXPLORATION_THRESHOLD impressions per variant, locks to the winner.
 */
export async function selectCreativeVariant(
  supabase: SupabaseClient,
  campaignId: number,
  defaultCreativeId: number
): Promise<number> {
  // Get all approved creatives for this campaign
  const { data: creatives } = await supabase
    .from("creatives")
    .select("id, variant_label, performance_score, status")
    .eq("campaign_id", campaignId)
    .eq("status", "approved");

  if (!creatives || creatives.length <= 1) {
    return defaultCreativeId;
  }

  // Get impression + tap stats per creative
  const creativeIds = creatives.map((c) => c.id);
  const { data: stats } = await supabase
    .from("impressions")
    .select("bid_id, tapped_at, bids!inner(creative_id)")
    .in("bids.creative_id", creativeIds);

  // Aggregate per creative
  const creativeStats = new Map<number, { delivered: number; tapped: number }>();
  for (const c of creatives) {
    creativeStats.set(c.id, { delivered: 0, tapped: 0 });
  }

  if (stats) {
    for (const row of stats as any[]) {
      const cid = row.bids?.creative_id;
      if (cid && creativeStats.has(cid)) {
        const s = creativeStats.get(cid)!;
        s.delivered++;
        if (row.tapped_at) s.tapped++;
      }
    }
  }

  // Check if all variants have enough data to lock
  const allExplored = creatives.every(
    (c) => (creativeStats.get(c.id)?.delivered ?? 0) >= EXPLORATION_THRESHOLD
  );

  if (allExplored) {
    // Lock to highest CTR variant
    let bestId = defaultCreativeId;
    let bestCTR = -1;
    for (const c of creatives) {
      const s = creativeStats.get(c.id)!;
      const ctr = s.delivered > 0 ? s.tapped / s.delivered : 0;
      if (ctr > bestCTR) {
        bestCTR = ctr;
        bestId = c.id;
      }
    }
    return bestId;
  }

  // Thompson Sampling: sample from Beta distribution for each variant
  let bestSample = -1;
  let bestId = defaultCreativeId;

  for (const c of creatives) {
    const s = creativeStats.get(c.id)!;
    const alpha = s.tapped + 1;
    const beta = s.delivered - s.tapped + 1;
    const sample = betaSample(alpha, beta);
    if (sample > bestSample) {
      bestSample = sample;
      bestId = c.id;
    }
  }

  return bestId;
}

/**
 * Sample from a Beta distribution using the Jöhnk algorithm.
 * Simplified implementation suitable for Thompson Sampling.
 */
function betaSample(alpha: number, beta: number): number {
  // Use the inverse CDF method for small alpha/beta
  // For larger values, use the ratio of gamma samples approximation
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;

  // Simple approximation using uniform random + Beta quantile
  const u = Math.random();
  const v = Math.random();

  const x = Math.pow(u, 1 / alpha);
  const y = Math.pow(v, 1 / beta);

  return x / (x + y);
}

// ================================================================
// B. Smart Bidding (Auto-Bid)
// ================================================================

export interface AutoBidConfig {
  enabled: boolean;
  target_cpa_cents: number;
  max_bid_cents: number;
  strategy: "target_cpa" | "maximize_conversions" | "maximize_impressions";
}

/**
 * Adjust auto-bid amounts based on observed CPA.
 * Called every 30 minutes via cron.
 */
export async function adjustAutoBids(
  supabase: SupabaseClient
): Promise<{ adjusted: number; errors: string[] }> {
  let adjusted = 0;
  const errors: string[] = [];

  // Find campaigns with auto-bid enabled
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, targeting_rules, spent_cents, budget_cents")
    .eq("status", "active");

  if (!campaigns) return { adjusted: 0, errors: [] };

  for (const campaign of campaigns) {
    const rules = campaign.targeting_rules as Record<string, unknown>;
    const autoBid = rules?.auto_bid as AutoBidConfig | undefined;

    if (!autoBid?.enabled) continue;

    try {
      // Get conversion count
      const { count: conversionCount } = await supabase
        .from("conversions")
        .select("*, impressions!inner(campaign_id)", { count: "exact", head: true })
        .eq("impressions.campaign_id", campaign.id);

      const conversions = conversionCount ?? 0;
      if (conversions === 0) continue; // Not enough data

      const observedCPA = campaign.spent_cents / conversions;

      // Get current bids
      const { data: bids } = await supabase
        .from("bids")
        .select("id, bid_cents, moment_type")
        .eq("campaign_id", campaign.id)
        .eq("status", "active");

      if (!bids) continue;

      // Get floor prices
      const { data: floors } = await supabase
        .from("floor_prices")
        .select("moment_type, floor_cents");

      const floorMap = new Map(
        (floors ?? []).map((f: any) => [f.moment_type, f.floor_cents])
      );

      for (const bid of bids) {
        let newBid = bid.bid_cents;
        const floor = floorMap.get(bid.moment_type) ?? 10;

        if (autoBid.strategy === "target_cpa") {
          if (observedCPA > autoBid.target_cpa_cents) {
            // Reduce bid by 10%
            newBid = Math.max(floor, Math.floor(bid.bid_cents * 0.9));
          } else if (observedCPA < autoBid.target_cpa_cents * 0.8) {
            // Increase bid by 10%
            newBid = Math.min(
              autoBid.max_bid_cents,
              Math.ceil(bid.bid_cents * 1.1)
            );
          }
        } else if (autoBid.strategy === "maximize_impressions") {
          // Bid at floor to get maximum volume
          newBid = floor;
        }

        if (newBid !== bid.bid_cents) {
          await supabase
            .from("bids")
            .update({ bid_cents: newBid })
            .eq("id", bid.id);
          adjusted++;
        }
      }
    } catch (e) {
      errors.push(`Campaign ${campaign.id}: ${(e as Error).message}`);
    }
  }

  return { adjusted, errors };
}

// ================================================================
// C. Moment Value Prediction
// ================================================================

interface MomentValueInput {
  moment_type: string;
  alert_score: number;
  hour_of_day: number;
  game_importance: number; // 0=regular, 1=conference, 2=tournament
}

const MOMENT_TYPE_BASE_RATES: Record<string, number> = {
  overtime: 0.15,
  bet_resolved: 0.12,
  close_game: 0.10,
  spread_alert: 0.08,
  moneyline_alert: 0.07,
  total_alert: 0.06,
  prop_alert: 0.06,
  position_alert: 0.05,
  foul_trouble: 0.04,
  follow_alert: 0.03,
};

/**
 * Predict ad engagement for a moment (v1: weighted formula).
 * Returns predicted CTR (0-1).
 */
export function predictMomentEngagement(input: MomentValueInput): number {
  const baseRate = MOMENT_TYPE_BASE_RATES[input.moment_type] ?? 0.05;

  // Alert score factor (higher PME score = more engaged)
  const scoreFactor = Math.min(input.alert_score / 100, 1.5);

  // Time of day factor (evening games have higher engagement)
  let timeFactor = 1.0;
  if (input.hour_of_day >= 19 && input.hour_of_day <= 23) timeFactor = 1.3;
  else if (input.hour_of_day >= 14 && input.hour_of_day <= 18) timeFactor = 1.1;
  else if (input.hour_of_day < 10) timeFactor = 0.7;

  // Game importance factor
  const importanceFactor = 1.0 + input.game_importance * 0.25;

  return Math.min(baseRate * scoreFactor * timeFactor * importanceFactor, 1.0);
}

/**
 * Recommend a bid amount based on moment value prediction.
 */
export function recommendBid(
  momentType: string,
  floorCents: number,
  predictedEngagement: number
): number {
  // Higher predicted engagement = higher recommended bid
  // Base recommendation is 1.5x floor for average engagement
  const multiplier = 1.0 + predictedEngagement * 5;
  return Math.max(
    floorCents,
    Math.min(500, Math.ceil(floorCents * multiplier))
  );
}

// ================================================================
// D. Creative Performance Update
// ================================================================

/**
 * Update creative performance scores based on observed CTR.
 * Called periodically or after A/B test convergence.
 */
export async function updateCreativePerformance(
  supabase: SupabaseClient,
  campaignId: number
): Promise<void> {
  const { data: creatives } = await supabase
    .from("creatives")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "approved");

  if (!creatives) return;

  for (const creative of creatives) {
    const { data: impressionData } = await supabase
      .from("impressions")
      .select("tapped_at, bids!inner(creative_id)")
      .eq("bids.creative_id", creative.id);

    if (!impressionData || impressionData.length === 0) continue;

    const total = impressionData.length;
    const tapped = impressionData.filter((i: any) => i.tapped_at != null).length;
    const ctr = tapped / total;

    await supabase
      .from("creatives")
      .update({ performance_score: ctr, updated_at: new Date().toISOString() })
      .eq("id", creative.id);
  }
}
