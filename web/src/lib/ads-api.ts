// Shared utilities for the /api/ads/* route handlers

import { NextResponse } from "next/server";

// ─── RFC 7807 Problem Details errors ─────────────────────────────────────────

export function problem(status: number, title: string, detail?: string, extra?: object) {
  return NextResponse.json(
    { type: `https://api.getnorma.app/errors/${title.toLowerCase().replace(/\s+/g, "-")}`, title, status, detail, ...extra },
    { status }
  );
}

export const notFound = (detail = "Resource not found") => problem(404, "Not Found", detail);
export const badRequest = (detail: string) => problem(400, "Bad Request", detail);
export const forbidden = (detail = "Forbidden") => problem(403, "Forbidden", detail);
export const serverError = (detail = "Internal server error") => problem(500, "Internal Server Error", detail);

// ─── Valid values ─────────────────────────────────────────────────────────────

export const VALID_MOMENT_TYPES = [
  "bet_resolved", "close_game", "overtime", "spread_alert", "moneyline_alert",
  "total_alert", "prop_alert", "position_alert", "foul_trouble", "follow_alert",
  "prediction_resolved",
] as const;

export const VALID_SPORTS = ["ncaa_basketball", "nba", "nfl", "mlb"] as const;

// ─── Campaign shape normalization ─────────────────────────────────────────────

export interface CampaignRow {
  id: number;
  name: string;
  status: string;
  budget_cents: number;
  spent_cents: number;
  daily_budget_cents: number | null;
  flight_start: string | null;
  flight_end: string | null;
  targeting_rules: Record<string, unknown>;
  approval_status: string;
  created_at: string;
  updated_at: string;
  creatives?: Array<{
    id: number;
    sponsor_text: string;
    cta_text: string | null;
    cta_url: string | null;
    logo_url: string | null;
    status: string;
    performance_score: number;
  }>;
  total_impressions?: number;
}

export function formatCampaign(row: CampaignRow, includeCreatives = false) {
  const rules = row.targeting_rules ?? {};
  const result: Record<string, unknown> = {
    id: String(row.id),
    name: row.name,
    status: row.status,
    moment_types: rules.moment_types ?? [],
    sports: rules.sports ?? (rules.league ? [rules.league] : []),
    bid_cpm_usd: rules.bid_cpm_usd ?? null,
    daily_budget_usd: row.daily_budget_cents ? row.daily_budget_cents / 100 : null,
    total_budget_usd: row.budget_cents / 100,
    target_cpa_usd: (rules.auto_bid as Record<string, unknown> | undefined)?.target_cpa_cents
      ? ((rules.auto_bid as Record<string, unknown>).target_cpa_cents as number) / 100
      : null,
    start_date: row.flight_start ? row.flight_start.split("T")[0] : null,
    end_date: row.flight_end ? row.flight_end.split("T")[0] : null,
    spend_to_date_usd: row.spent_cents / 100,
    impressions_to_date: row.total_impressions ?? 0,
    postback_url: rules.postback_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (includeCreatives && row.creatives) {
    result.creative = row.creatives[0]
      ? {
          id: String(row.creatives[0].id),
          headline: row.creatives[0].sponsor_text,
          body: rules.creative_body ?? null,
          icon_url: row.creatives[0].logo_url,
          action_url: row.creatives[0].cta_url,
          cta_text: row.creatives[0].cta_text,
          status: row.creatives[0].status,
          performance_score: row.creatives[0].performance_score,
        }
      : null;
  }

  return result;
}

// ─── URL validation ───────────────────────────────────────────────────────────

export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function isReachableUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(id);
    return res.ok || res.status === 405;
  } catch {
    return false;
  }
}

// ─── Audit logging ────────────────────────────────────────────────────────────

export function logApiAction(action: string, advertiserId: number, campaignId: string | null, durationMs: number) {
  console.log(JSON.stringify({
    event: "ads_api",
    action,
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  }));
}
