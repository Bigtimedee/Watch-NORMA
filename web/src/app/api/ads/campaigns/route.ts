import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import {
  problem, badRequest, serverError, notFound,
  VALID_MOMENT_TYPES, VALID_SPORTS, formatCampaign,
  isValidUrl, isReachableUrl, logApiAction, CampaignRow,
} from "@/lib/ads-api";

// GET /api/ads/campaigns
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:read");
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(params.get("per_page") ?? "20", 10)));

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("campaigns")
    .select("*, campaign_metrics(total_impressions)", { count: "exact" })
    .eq("advertiser_id", auth.ctx.advertiserId)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return serverError(error.message);

  const campaigns = (data ?? []).map((row) => {
    const r = row as CampaignRow & { campaign_metrics?: { total_impressions: number }[] };
    r.total_impressions = r.campaign_metrics?.[0]?.total_impressions ?? 0;
    return formatCampaign(r);
  });

  logApiAction("list_campaigns", auth.ctx.advertiserId, null, Date.now() - t0);

  return NextResponse.json({
    campaigns,
    pagination: { page, per_page: perPage, total: count ?? 0 },
  });
}

// POST /api/ads/campaigns
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  // Required field validation
  if (!body.name || typeof body.name !== "string") return badRequest("name is required");
  if (!Array.isArray(body.moment_types) || body.moment_types.length === 0) return badRequest("moment_types must be a non-empty array");
  if (!Array.isArray(body.sports) || body.sports.length === 0) return badRequest("sports must be a non-empty array");
  if (typeof body.bid_cpm_usd !== "number" || body.bid_cpm_usd <= 0) return badRequest("bid_cpm_usd must be a positive number");
  if (typeof body.daily_budget_usd !== "number" || body.daily_budget_usd < 5) return badRequest("daily_budget_usd must be >= 5.00");
  if (typeof body.total_budget_usd !== "number" || body.total_budget_usd < 10) return badRequest("total_budget_usd must be >= 10.00");
  if (!body.start_date || typeof body.start_date !== "string") return badRequest("start_date is required");

  // Moment type validation
  const invalidMoments = (body.moment_types as string[]).filter((m) => !VALID_MOMENT_TYPES.includes(m as typeof VALID_MOMENT_TYPES[number]));
  if (invalidMoments.length > 0) return badRequest(`Invalid moment types: ${invalidMoments.join(", ")}`);

  // Sports validation
  const invalidSports = (body.sports as string[]).filter((s) => !VALID_SPORTS.includes(s as typeof VALID_SPORTS[number]));
  if (invalidSports.length > 0) return badRequest(`Invalid sports: ${invalidSports.join(", ")}`);

  // Date validation
  const startDate = new Date(body.start_date as string);
  if (isNaN(startDate.getTime())) return badRequest("start_date must be a valid ISO 8601 date");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (startDate < today) return badRequest("start_date must be >= today");
  if (body.end_date) {
    const endDate = new Date(body.end_date as string);
    if (isNaN(endDate.getTime())) return badRequest("end_date must be a valid ISO 8601 date");
    if (endDate <= startDate) return badRequest("end_date must be after start_date");
  }

  // Creative validation
  const creative = body.creative as Record<string, unknown> | undefined;
  if (!creative) return badRequest("creative is required");
  if (!creative.headline || typeof creative.headline !== "string") return badRequest("creative.headline is required");
  if ((creative.headline as string).length > 60) return badRequest("creative.headline must be <= 60 characters");
  if (!creative.body || typeof creative.body !== "string") return badRequest("creative.body is required");
  if ((creative.body as string).length > 120) return badRequest("creative.body must be <= 120 characters");
  if (!creative.icon_url || typeof creative.icon_url !== "string") return badRequest("creative.icon_url is required");
  if (!creative.action_url || typeof creative.action_url !== "string") return badRequest("creative.action_url is required");
  if (!isValidUrl(creative.icon_url as string)) return badRequest("creative.icon_url must be a valid HTTPS URL");
  if (!isValidUrl(creative.action_url as string)) return badRequest("creative.action_url must be a valid URL");
  if (creative.cta_text && typeof creative.cta_text === "string" && creative.cta_text.length > 20) {
    return badRequest("creative.cta_text must be <= 20 characters");
  }

  // icon_url reachability check
  const reachable = await isReachableUrl(creative.icon_url as string);
  if (!reachable) return badRequest("creative.icon_url must be a publicly reachable URL");

  // Floor price check
  const supabase = createSupabaseAdmin();
  const { data: floors } = await supabase
    .from("floor_prices")
    .select("moment_type, floor_cents")
    .in("moment_type", body.moment_types as string[])
    .is("sport", null);

  const floorMap: Record<string, number> = {};
  for (const f of floors ?? []) floorMap[f.moment_type] = f.floor_cents;

  const bidCents = Math.round((body.bid_cpm_usd as number) * 100);
  for (const mt of body.moment_types as string[]) {
    const floor = floorMap[mt] ?? 10;
    if (bidCents < floor) {
      return problem(400, "Bid Below Floor", `bid_cpm_usd ($${(body.bid_cpm_usd as number).toFixed(2)}) is below the floor for ${mt} ($${(floor / 100).toFixed(2)})`);
    }
  }

  // Create campaign
  const targetingRules = {
    moment_types: body.moment_types,
    sports: body.sports,
    bid_cpm_usd: body.bid_cpm_usd,
    creative_body: creative.body,
    postback_url: body.postback_url ?? null,
    auto_bid: body.target_cpa_usd
      ? {
          enabled: true,
          target_cpa_cents: Math.round((body.target_cpa_usd as number) * 100),
          max_bid_cents: bidCents,
          strategy: "target_cpa",
        }
      : undefined,
  };

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .insert({
      advertiser_id: auth.ctx.advertiserId,
      name: body.name,
      budget_cents: Math.round((body.total_budget_usd as number) * 100),
      daily_budget_cents: Math.round((body.daily_budget_usd as number) * 100),
      flight_start: new Date(body.start_date as string).toISOString(),
      flight_end: body.end_date ? new Date(body.end_date as string).toISOString() : null,
      targeting_rules: targetingRules,
      status: "active",
    })
    .select("id")
    .single();

  if (campErr || !campaign) return serverError(campErr?.message ?? "Failed to create campaign");

  // Create creative
  const { data: creativeRow, error: creativeErr } = await supabase
    .from("creatives")
    .insert({
      campaign_id: campaign.id,
      format: "notification_sponsor",
      sponsor_text: creative.headline,
      cta_text: creative.cta_text ?? null,
      cta_url: creative.action_url,
      logo_url: creative.icon_url,
      variant_label: "variant_a",
      status: "pending",
    })
    .select("id")
    .single();

  if (creativeErr || !creativeRow) {
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    return serverError("Failed to create creative");
  }

  // Create one bid per moment type
  const bids = (body.moment_types as string[]).map((mt) => ({
    campaign_id: campaign.id,
    creative_id: creativeRow.id,
    moment_type: mt,
    bid_cents: bidCents,
    floor_aware: true,
    status: "active",
  }));

  await supabase.from("bids").insert(bids);

  // Estimate daily impressions from supply forecasts
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 8);
  const { data: forecasts } = await supabase
    .from("supply_forecasts")
    .select("predicted_moments")
    .in("moment_type", body.moment_types as string[])
    .gte("forecast_date", tomorrow.toISOString().split("T")[0])
    .lte("forecast_date", nextWeek.toISOString().split("T")[0]);

  const avgDailyImpressions = forecasts && forecasts.length > 0
    ? Math.round((forecasts.reduce((s, r) => s + (r.predicted_moments ?? 0), 0) / forecasts.length) * 0.6)
    : 0;

  logApiAction("create_campaign", auth.ctx.advertiserId, String(campaign.id), Date.now() - t0);

  return NextResponse.json({
    id: String(campaign.id),
    status: "active",
    estimated_daily_impressions: avgDailyImpressions,
    estimated_daily_spend_usd: avgDailyImpressions * (body.bid_cpm_usd as number) / 1000,
    created_at: new Date().toISOString(),
  }, { status: 201 });
}
