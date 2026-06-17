import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import {
  notFound, badRequest, serverError, formatCampaign, isValidUrl, logApiAction, CampaignRow,
} from "@/lib/ads-api";

const IMMUTABLE_FIELDS = ["moment_types", "sports", "start_date", "creative"];

type Params = Promise<{ id: string }>;

// GET /api/ads/campaigns/:id
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("campaigns")
    .select("*, creatives(*), campaign_metrics(total_impressions)")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (error || !data) return notFound(`Campaign ${id} not found`);

  const row = data as CampaignRow & { campaign_metrics?: { total_impressions: number }[] };
  row.total_impressions = row.campaign_metrics?.[0]?.total_impressions ?? 0;

  logApiAction("get_campaign", auth.ctx.advertiserId, id, Date.now() - t0);
  return NextResponse.json(formatCampaign(row, true));
}

// PATCH /api/ads/campaigns/:id
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  // Reject immutable field changes
  for (const field of IMMUTABLE_FIELDS) {
    if (field in body) return badRequest(`${field} is immutable — create a new campaign to change it`);
  }

  const supabase = createSupabaseAdmin();

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabase
    .from("campaigns")
    .select("id, status, targeting_rules, budget_cents")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (fetchErr || !existing) return notFound(`Campaign ${id} not found`);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const updatedFields: string[] = [];
  const ruleUpdates: Record<string, unknown> = {};

  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) return badRequest("name must be a non-empty string");
    updates.name = body.name;
    updatedFields.push("name");
  }

  if ("bid_cpm_usd" in body) {
    if (typeof body.bid_cpm_usd !== "number" || body.bid_cpm_usd <= 0) return badRequest("bid_cpm_usd must be a positive number");
    const { data: floors } = await supabase
      .from("floor_prices")
      .select("moment_type, floor_cents")
      .in("moment_type", (existing.targeting_rules as Record<string, unknown>).moment_types as string[])
      .is("sport", null);
    const bidCents = Math.round(body.bid_cpm_usd * 100);
    for (const f of floors ?? []) {
      if (bidCents < f.floor_cents) {
        return badRequest(`bid_cpm_usd is below floor for ${f.moment_type} ($${(f.floor_cents / 100).toFixed(2)})`);
      }
    }
    ruleUpdates.bid_cpm_usd = body.bid_cpm_usd;
    updatedFields.push("bid_cpm_usd");
    // Propagate to bids
    await supabase.from("bids").update({ bid_cents: bidCents }).eq("campaign_id", id);
  }

  if ("daily_budget_usd" in body) {
    if (typeof body.daily_budget_usd !== "number" || body.daily_budget_usd < 5) return badRequest("daily_budget_usd must be >= 5.00");
    updates.daily_budget_cents = Math.round(body.daily_budget_usd * 100);
    updatedFields.push("daily_budget_usd");
  }

  if ("total_budget_usd" in body) {
    if (typeof body.total_budget_usd !== "number" || body.total_budget_usd < 10) return badRequest("total_budget_usd must be >= 10.00");
    updates.budget_cents = Math.round(body.total_budget_usd * 100);
    updatedFields.push("total_budget_usd");
  }

  if ("target_cpa_usd" in body) {
    if (typeof body.target_cpa_usd !== "number" || body.target_cpa_usd <= 0) return badRequest("target_cpa_usd must be a positive number");
    const existing_rules = existing.targeting_rules as Record<string, unknown>;
    ruleUpdates.auto_bid = {
      enabled: true,
      target_cpa_cents: Math.round(body.target_cpa_usd * 100),
      max_bid_cents: existing_rules.bid_cpm_usd
        ? Math.round((existing_rules.bid_cpm_usd as number) * 100)
        : undefined,
      strategy: "target_cpa",
    };
    updatedFields.push("target_cpa_usd");
  }

  if ("end_date" in body) {
    if (typeof body.end_date !== "string" || isNaN(new Date(body.end_date).getTime())) {
      return badRequest("end_date must be a valid ISO 8601 date");
    }
    updates.flight_end = new Date(body.end_date).toISOString();
    updatedFields.push("end_date");
  }

  if ("status" in body) {
    if (body.status !== "active" && body.status !== "paused") return badRequest('status must be "active" or "paused"');
    if (body.status === "active" && !["active", "paused"].includes(existing.status)) {
      return badRequest(`Cannot resume campaign in status: ${existing.status}`);
    }
    updates.status = body.status;
    updatedFields.push("status");
  }

  if ("postback_url" in body) {
    if (body.postback_url && !isValidUrl(body.postback_url as string)) return badRequest("postback_url must be a valid URL");
    ruleUpdates.postback_url = body.postback_url;
    updatedFields.push("postback_url");
  }

  if (Object.keys(ruleUpdates).length > 0) {
    updates.targeting_rules = { ...(existing.targeting_rules as object), ...ruleUpdates };
  }

  if (updatedFields.length === 0) return badRequest("No updatable fields provided");

  const { error: updateErr } = await supabase.from("campaigns").update(updates).eq("id", id);
  if (updateErr) return serverError(updateErr.message);

  logApiAction("update_campaign", auth.ctx.advertiserId, id, Date.now() - t0);
  return NextResponse.json({ id, updated_fields: updatedFields, updated_at: updates.updated_at });
}
