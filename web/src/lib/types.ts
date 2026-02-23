// Advertiser portal types

export interface Advertiser {
  id: number;
  name: string;
  category: string | null;
  billing_model: string;
  auth_user_id: string;
  logo_url: string | null;
  website_url: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: number;
  advertiser_id: number;
  name: string;
  budget_cents: number;
  spent_cents: number;
  daily_budget_cents: number | null;
  flight_start: string | null;
  flight_end: string | null;
  targeting_rules: TargetingRules;
  status: CampaignStatus;
  category_exclusivity: boolean;
  priority_tier: number;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export interface TargetingRules {
  league?: string;
  moment_types?: string[];
  user_segments?: string[];
  game_ids?: string[];
  team_ids?: string[];
  exclude_game_ids?: string[];
  min_moment_score?: number;
  time_windows?: Array<{ day_of_week: number[]; hours: number[] }>;
  geo_states?: string[];
  connected_sportsbooks?: string[];
  auto_bid?: {
    enabled: boolean;
    target_cpa_cents: number;
    max_bid_cents: number;
    strategy: "target_cpa" | "maximize_conversions" | "maximize_impressions";
  };
  affiliate_config?: {
    affiliate_id: string;
    referral_code: string;
    attribution_window_minutes: number;
    postback_url?: string;
  };
}

export interface Creative {
  id: number;
  campaign_id: number;
  format: string | null;
  sponsor_text: string;
  cta_text: string | null;
  cta_url: string | null;
  logo_url: string | null;
  variant_label: string | null;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  performance_score: number;
  created_at: string;
  updated_at: string;
}

export interface Bid {
  id: number;
  campaign_id: number;
  creative_id: number;
  moment_type: string;
  bid_cents: number;
  floor_aware: boolean;
  game_id: string | null;
  user_segment: string | null;
  status: "active" | "paused" | "exhausted";
  daily_impressions_cap: number | null;
  impressions_delivered: number;
  created_at: string;
}

export interface FloorPrice {
  moment_type: string;
  floor_cents: number;
  premium_multiplier: number;
}

export interface SupplyForecast {
  id: number;
  forecast_date: string;
  moment_type: string;
  league: string;
  predicted_moments: number;
  predicted_eligible_users: number;
  confidence: number;
  games_scheduled: number;
}

export interface CampaignMetrics {
  campaign_id: number;
  advertiser_id: number;
  campaign_name: string;
  campaign_status: string;
  total_impressions: number;
  seen_impressions: number;
  tapped_impressions: number;
  total_conversions: number;
  unique_users_reached: number;
  games_covered: number;
  avg_clearing_price: number;
  total_spent_cents: number;
  budget_cents: number;
  daily_budget_cents: number | null;
  flight_start: string | null;
  flight_end: string | null;
  seen_rate_pct: number;
  ctr_pct: number;
  effective_cpm_cents: number;
}

export const MOMENT_TYPES = [
  { key: "bet_resolved", label: "Bet Resolved", description: "User's wager just settled" },
  { key: "close_game", label: "Close Game", description: "Tight score in final minutes" },
  { key: "overtime", label: "Overtime", description: "Game goes to overtime" },
  { key: "spread_alert", label: "Spread Alert", description: "Spread line being crossed" },
  { key: "moneyline_alert", label: "Moneyline Alert", description: "Moneyline outcome in doubt" },
  { key: "total_alert", label: "Total Alert", description: "Over/under pace relevant" },
  { key: "prop_alert", label: "Prop Alert", description: "Player prop in play" },
  { key: "position_alert", label: "Position Alert", description: "Prediction market position" },
  { key: "foul_trouble", label: "Foul Trouble", description: "Key player foul trouble" },
  { key: "follow_alert", label: "Follow Alert", description: "Team follow moment" },
] as const;

export const USER_SEGMENTS = [
  { key: "has_wager", label: "Wager Holders" },
  { key: "has_position", label: "Position Holders" },
  { key: "follows_team", label: "Team Followers" },
] as const;

export const ADVERTISER_CATEGORIES = [
  "sportsbook",
  "streaming",
  "qsr",
  "beer",
  "auto",
  "financial",
  "apparel",
] as const;
