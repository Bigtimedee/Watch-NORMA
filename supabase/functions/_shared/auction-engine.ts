// NORMA Advertising — Auction Engine
// Second-price Vickrey auction with direct deals, category exclusivity,
// frequency capping, and creative selection via Thompson Sampling

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCategoryFloor,
  computeDynamicPremium,
  getEffectiveFloor,
  checkBudgetPacing,
  type PremiumContext,
} from "./pricing-engine.ts";
import { selectCreativeVariant } from "./ai-ad-engine.ts";
import { computeFatigueScore } from "./fatigue-model.ts";
import { inferStateFromTimezone } from "./geo-compliance.ts";

// --- Types ---

export interface AuctionInput {
  game_id: string;
  moment_type: string;
  alert_score: number;
  user_id: string;
  user_segment: string; // "wager_holder" | "team_follower" | "position_holder"
  tournament_round: string | null;
  period: number | null;
  user_timezone?: string | null; // from profiles.timezone — used for geo-compliance
  sport?: string | null; // for per-category floor lookup (P2-05)
}

export interface AuctionResult {
  winning_bid_id: number;
  campaign_id: number;
  creative_id: number;
  clearing_price_cents: number;
  sponsor_text: string;
  sponsor_cta_url: string | null;
  sponsor_logo_url: string | null;
}

interface EligibleBid {
  id: number;
  campaign_id: number;
  creative_id: number;
  bid_cents: number;
  game_id: string | null;
  user_segment: string | null;
  advertiser_category: string | null;
  advertiser_id: number;
  allowed_jurisdictions: string[] | null; // from advertisers.allowed_jurisdictions
  priority_tier: number;
  category_exclusivity: boolean;
  campaign_budget_cents: number;
  campaign_spent_cents: number;
  campaign_daily_budget_cents: number | null;
  campaign_flight_start: string | null;
  campaign_flight_end: string | null;
  creative_performance_score: number;
  creative_sponsor_text: string;
  creative_cta_url: string | null;
  creative_logo_url: string | null;
  demand_type?: string | null;
  brand_safety_approved?: boolean;
}

// --- Constants ---

const MAX_SPONSORED_PER_USER_PER_ADVERTISER_PER_DAY = 2;
const MAX_SPONSORED_PER_USER_PER_DAY = 5;
const CATEGORY_EXCLUSIVITY_WINDOW_MINUTES = 5;

// --- Main Auction ---

export async function runAuction(
  supabase: SupabaseClient,
  input: AuctionInput
): Promise<AuctionResult | null> {
  // 1. Check user fatigue
  const fatigueScore = await computeFatigueScore(supabase, input.user_id);
  if (fatigueScore < 0.25) {
    return null; // User too fatigued, skip sponsor
  }

  // 2. Check ad personalization preference
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("notification_settings")
    .eq("user_id", input.user_id)
    .maybeSingle();

  const adPersonalization =
    (prefs?.notification_settings as Record<string, unknown>)
      ?.ad_personalization_enabled ?? true;
  if (!adPersonalization) {
    return null; // User opted out of ad personalization
  }

  // 3. Check frequency caps
  const withinCaps = await checkFrequencyCaps(supabase, input.user_id);
  if (!withinCaps) {
    return null;
  }

  // 4. Get floor price (sport-specific if available, global fallback)
  const floorPrice = await getCategoryFloor(supabase, input.moment_type, input.sport ?? null);

  // Count simultaneous live games for premium calculation
  const { count: liveGameCount } = await supabase
    .from("games")
    .select("*", { count: "exact", head: true })
    .in("status", ["inprogress", "halftime"]);

  const premiumCtx: PremiumContext = {
    simultaneous_live_games: liveGameCount ?? 0,
    moment_type: input.moment_type,
    period: input.period,
    tournament_round: input.tournament_round,
    day_of_week: new Date().getDay(),
  };
  const dynamicPremium = computeDynamicPremium(premiumCtx);
  const effectiveFloor = getEffectiveFloor(
    floorPrice.floor_cents,
    floorPrice.premium_multiplier,
    dynamicPremium
  );

  // 5. Query eligible bids
  const eligibleBids = await queryEligibleBids(
    supabase,
    input.moment_type,
    input.game_id,
    input.user_segment
  );

  if (eligibleBids.length === 0) {
    return null;
  }

  // 5b. Geo-filter: remove sportsbook bids from advertisers whose
  // allowed_jurisdictions don't include the user's state.
  // Conservative default: if user location is unknown, skip any restricted advertiser.
  const userTimezone = input.user_timezone ?? await fetchUserTimezone(supabase, input.user_id);
  const geoFilteredBids = eligibleBids.filter((bid) => {
    if (!bid.allowed_jurisdictions || bid.allowed_jurisdictions.length === 0) {
      return true; // unrestricted advertiser (non-sportsbook)
    }
    if (!userTimezone) {
      return false; // user location unknown — skip restricted advertisers (safe default)
    }
    const state = inferStateFromTimezone(userTimezone);
    if (!state) {
      return false; // ambiguous timezone — skip restricted advertisers
    }
    return bid.allowed_jurisdictions.includes(state);
  });

  if (geoFilteredBids.length === 0) {
    return null;
  }

  // 5c. Brand-safety filter: streaming/commerce campaigns require brand_safety_status='approved'.
  //     Sportsbook campaigns pass (covered by existing geo-compliance + campaign approval).
  //     This is an eligibility gate only — clearing logic is unchanged.
  const brandSafeFilteredBids = geoFilteredBids.filter((bid) => {
    // sportsbook demand passes (existing geo-compliance covers it)
    if (!bid.demand_type || bid.demand_type === "sportsbook") return true;
    // streaming/commerce must have brand_safety_status = 'approved'
    return bid.brand_safety_approved === true;
  });

  if (brandSafeFilteredBids.length === 0) {
    return null;
  }

  // 6. Check for direct deals (priority_tier > 0)
  const directDeals = brandSafeFilteredBids
    .filter((b) => b.priority_tier > 0)
    .sort((a, b) => b.priority_tier - a.priority_tier);

  if (directDeals.length > 0) {
    const deal = directDeals[0];
    // Direct deals use contracted rate from targeting_rules
    const contractedRate = deal.bid_cents; // For direct deals, bid_cents IS the contracted rate
    return {
      winning_bid_id: deal.id,
      campaign_id: deal.campaign_id,
      creative_id: deal.creative_id,
      clearing_price_cents: contractedRate,
      sponsor_text: deal.creative_sponsor_text,
      sponsor_cta_url: deal.creative_cta_url,
      sponsor_logo_url: deal.creative_logo_url,
    };
  }

  // 7. Filter by floor price
  const aboveFloor = brandSafeFilteredBids.filter((b) => b.bid_cents >= effectiveFloor);
  if (aboveFloor.length === 0) {
    return null;
  }

  // 8. Check category exclusivity
  const afterExclusivity = await applyCategoryExclusivity(
    supabase,
    aboveFloor,
    input.game_id
  );
  if (afterExclusivity.length === 0) {
    return null;
  }

  // 9. Check budget pacing for each bid
  const pacingFiltered: EligibleBid[] = [];
  for (const bid of afterExclusivity) {
    const pacing = await checkBudgetPacing(
      supabase,
      bid.campaign_id,
      bid.campaign_budget_cents,
      bid.campaign_daily_budget_cents,
      bid.campaign_flight_start,
      bid.campaign_flight_end
    );
    if (pacing.allowed) {
      pacingFiltered.push(bid);
    }
  }

  if (pacingFiltered.length === 0) {
    return null;
  }

  // 10. Rank by effective bid value
  const ranked = pacingFiltered
    .map((bid) => ({
      bid,
      effectiveValue: computeEffectiveBidValue(bid, input),
    }))
    .sort((a, b) => b.effectiveValue - a.effectiveValue);

  // 11. Winner = highest effective bid
  const winner = ranked[0];

  // 12. Clearing price = max(second highest + 1, floor)
  let clearingPrice: number;
  if (ranked.length >= 2) {
    clearingPrice = Math.max(
      Math.ceil(ranked[1].effectiveValue) + 1,
      effectiveFloor
    );
  } else {
    clearingPrice = effectiveFloor;
  }

  // Never charge more than the bid
  clearingPrice = Math.min(clearingPrice, winner.bid.bid_cents);

  // 13. Select best creative variant (Thompson Sampling)
  const creativeId = await selectCreativeVariant(
    supabase,
    winner.bid.campaign_id,
    winner.bid.creative_id
  );

  // Fetch selected creative details
  const { data: creative } = await supabase
    .from("creatives")
    .select("sponsor_text, cta_url, logo_url")
    .eq("id", creativeId)
    .single();

  return {
    winning_bid_id: winner.bid.id,
    campaign_id: winner.bid.campaign_id,
    creative_id: creativeId,
    clearing_price_cents: clearingPrice,
    sponsor_text: creative?.sponsor_text ?? winner.bid.creative_sponsor_text,
    sponsor_cta_url: creative?.cta_url ?? winner.bid.creative_cta_url,
    sponsor_logo_url: creative?.logo_url ?? winner.bid.creative_logo_url,
  };
}

// --- Geo-Compliance Helpers ---

/**
 * Fetch a user's stored timezone from profiles table.
 * Returns null if not found or on error.
 */
async function fetchUserTimezone(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return data?.timezone ?? null;
}

// --- Eligible Bids Query ---

async function queryEligibleBids(
  supabase: SupabaseClient,
  momentType: string,
  gameId: string,
  userSegment: string
): Promise<EligibleBid[]> {
  // Query bids matching moment type with active campaigns and approved creatives
  const { data, error } = await supabase
    .from("bids")
    .select(
      `
      id,
      campaign_id,
      creative_id,
      bid_cents,
      game_id,
      user_segment,
      campaigns!inner (
        id,
        advertiser_id,
        budget_cents,
        spent_cents,
        daily_budget_cents,
        flight_start,
        flight_end,
        status,
        approval_status,
        category_exclusivity,
        priority_tier,
        demand_type,
        brand_safety_status,
        advertisers!inner (
          id,
          category,
          balance_cents,
          allowed_jurisdictions
        )
      ),
      creatives!inner (
        id,
        sponsor_text,
        cta_url,
        logo_url,
        performance_score,
        status
      )
    `
    )
    .eq("moment_type", momentType)
    .eq("status", "active")
    .eq("campaigns.status", "active")
    .eq("campaigns.approval_status", "approved")
    .eq("creatives.status", "approved");

  if (error || !data) return [];

  const now = new Date();

  return (data as any[])
    .filter((row) => {
      const campaign = row.campaigns;
      const creative = row.creatives;

      // Flight date check
      if (campaign.flight_start && new Date(campaign.flight_start) > now)
        return false;
      if (campaign.flight_end && new Date(campaign.flight_end) < now)
        return false;

      // Budget check
      if (campaign.spent_cents >= campaign.budget_cents) return false;

      // Wallet balance check — skip advertisers with zero balance
      if ((campaign.advertisers.balance_cents ?? 0) <= 0) return false;

      // Game match: bid targets specific game or all games
      if (row.game_id && row.game_id !== gameId) return false;

      // Segment match: bid targets specific segment or all
      if (row.user_segment && row.user_segment !== userSegment) return false;

      return true;
    })
    .map((row) => ({
      id: row.id,
      campaign_id: row.campaign_id,
      creative_id: row.creative_id,
      bid_cents: row.bid_cents,
      game_id: row.game_id,
      user_segment: row.user_segment,
      advertiser_category: row.campaigns.advertisers.category,
      advertiser_id: row.campaigns.advertiser_id,
      allowed_jurisdictions: row.campaigns.advertisers.allowed_jurisdictions ?? null,
      priority_tier: row.campaigns.priority_tier,
      category_exclusivity: row.campaigns.category_exclusivity,
      campaign_budget_cents: row.campaigns.budget_cents,
      campaign_spent_cents: row.campaigns.spent_cents,
      campaign_daily_budget_cents: row.campaigns.daily_budget_cents,
      campaign_flight_start: row.campaigns.flight_start,
      campaign_flight_end: row.campaigns.flight_end,
      creative_performance_score: row.creatives.performance_score ?? 0,
      creative_sponsor_text: row.creatives.sponsor_text,
      creative_cta_url: row.creatives.cta_url,
      creative_logo_url: row.creatives.logo_url,
      demand_type: row.campaigns.demand_type ?? null,
      brand_safety_approved: row.campaigns.brand_safety_status === "approved",
    }));
}

// --- Effective Bid Value ---

function computeEffectiveBidValue(
  bid: EligibleBid,
  input: AuctionInput
): number {
  let value = bid.bid_cents;

  // Game-specific bids get 1.2x multiplier (more targeted = more relevant)
  if (bid.game_id != null) {
    value *= 1.2;
  }

  // Higher creative performance score gets up to 1.1x
  if (bid.creative_performance_score > 0) {
    value *= 1.0 + Math.min(bid.creative_performance_score, 0.1);
  }

  // Better segment match gets up to 1.15x
  if (bid.user_segment === input.user_segment) {
    value *= 1.15;
  }

  return value;
}

// --- Category Exclusivity ---

async function applyCategoryExclusivity(
  supabase: SupabaseClient,
  bids: EligibleBid[],
  gameId: string
): Promise<EligibleBid[]> {
  // Check if any existing impression in the last 5 minutes has category exclusivity
  const cutoff = new Date(
    Date.now() - CATEGORY_EXCLUSIVITY_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { data: recentImpressions } = await supabase
    .from("impressions")
    .select(
      `
      campaign_id,
      campaigns!inner (
        category_exclusivity,
        advertisers!inner (category)
      )
    `
    )
    .eq("game_id", gameId)
    .gte("delivered_at", cutoff);

  if (!recentImpressions || recentImpressions.length === 0) {
    return bids;
  }

  // Collect categories that are exclusively locked
  const lockedCategories = new Set<string>();
  for (const imp of recentImpressions as any[]) {
    if (imp.campaigns?.category_exclusivity && imp.campaigns?.advertisers?.category) {
      lockedCategories.add(imp.campaigns.advertisers.category);
    }
  }

  if (lockedCategories.size === 0) return bids;

  // Filter out competing bids from locked categories (allow the incumbent)
  return bids.filter((bid) => {
    if (!bid.advertiser_category) return true;
    if (!lockedCategories.has(bid.advertiser_category)) return true;
    // Allow if this advertiser is the one holding exclusivity
    // (check if they have a recent impression)
    const hasRecentImpression = (recentImpressions as any[]).some(
      (imp) => imp.campaign_id === bid.campaign_id
    );
    return hasRecentImpression;
  });
}

// --- Frequency Capping ---

async function checkFrequencyCaps(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Check total sponsored alerts today
  const { count: totalToday } = await supabase
    .from("impressions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("delivered_at", todayStart.toISOString());

  if ((totalToday ?? 0) >= MAX_SPONSORED_PER_USER_PER_DAY) {
    return false;
  }

  return true;
}

// Check per-advertiser frequency cap
export async function checkAdvertiserFrequencyCap(
  supabase: SupabaseClient,
  userId: string,
  advertiserId: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("impressions")
    .select("*, campaigns!inner(advertiser_id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("campaigns.advertiser_id", advertiserId)
    .gte("delivered_at", todayStart.toISOString());

  return (count ?? 0) < MAX_SPONSORED_PER_USER_PER_ADVERTISER_PER_DAY;
}

// --- Record Auction Result ---

export async function recordAuctionResult(
  supabase: SupabaseClient,
  result: AuctionResult,
  input: AuctionInput,
  alertId: number
): Promise<void> {
  // Insert impression
  await supabase.from("impressions").insert({
    bid_id: result.winning_bid_id,
    campaign_id: result.campaign_id,
    alert_id: alertId,
    user_id: input.user_id,
    user_segment: input.user_segment,
    game_id: input.game_id,
    moment_type: input.moment_type,
    moment_score: input.alert_score,
    clearing_price_cents: result.clearing_price_cents,
  });

  // Atomic: update campaign spend + increment bid impressions
  await supabase.rpc("record_auction_result", {
    p_bid_id: result.winning_bid_id,
    p_clearing_price: result.clearing_price_cents,
  });
}
