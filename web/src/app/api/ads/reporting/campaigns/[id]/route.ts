import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, badRequest, serverError } from "@/lib/ads-api";
import { checkReportingRateLimit } from "@/lib/reporting-cache";

const VALID_BREAKDOWNS = ["day", "moment_type", "sport", "creative", "hour_of_day"] as const;

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAuth(request, "reporting:read");
  if (auth instanceof NextResponse) return auth;

  if (!checkReportingRateLimit(auth.ctx.advertiserId)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("start_date");
  const endDate = sp.get("end_date");
  const breakdown = sp.get("breakdown");
  const timezone = sp.get("timezone") ?? "UTC";

  if (!startDate) return badRequest("start_date is required");
  if (!endDate) return badRequest("end_date is required");
  if (isNaN(new Date(startDate).getTime())) return badRequest("start_date must be a valid ISO 8601 date");
  if (isNaN(new Date(endDate).getTime())) return badRequest("end_date must be a valid ISO 8601 date");
  if (new Date(endDate) < new Date(startDate)) return badRequest("end_date must be >= start_date");
  if (breakdown && !VALID_BREAKDOWNS.includes(breakdown as typeof VALID_BREAKDOWNS[number])) {
    return badRequest(`breakdown must be one of: ${VALID_BREAKDOWNS.join(", ")}`);
  }

  const supabase = createSupabaseAdmin();

  // Verify campaign ownership
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, budget_cents, spent_cents")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!campaign) return notFound(`Campaign ${id} not found`);

  // Query impressions for the period
  const { data: impressions, error: impErr } = await supabase
    .from("advertiser_impressions")
    .select("clearing_price_cents, moment_type, seen_at, tapped_at, delivered_at")
    .eq("campaign_id", id)
    .gte("delivered_at", new Date(startDate).toISOString())
    .lte("delivered_at", new Date(endDate + "T23:59:59Z").toISOString());

  if (impErr) return serverError(impErr.message);

  // Query conversions
  const impressionIds = await supabase
    .from("impressions")
    .select("id")
    .eq("campaign_id", id)
    .gte("delivered_at", new Date(startDate).toISOString())
    .lte("delivered_at", new Date(endDate + "T23:59:59Z").toISOString());

  const { data: conversions } = await supabase
    .from("conversions")
    .select("impression_id")
    .in("impression_id", (impressionIds.data ?? []).map((r) => r.id));

  const totalImpressions = impressions?.length ?? 0;
  const totalTapped = impressions?.filter((i) => i.tapped_at).length ?? 0;
  const totalConversions = conversions?.length ?? 0;
  const totalSpentCents = impressions?.reduce((s, i) => s + (i.clearing_price_cents ?? 0), 0) ?? 0;

  const totals = {
    impressions: totalImpressions,
    clicks: totalTapped,
    ctr: totalImpressions > 0 ? Math.round((totalTapped / totalImpressions) * 10000) / 10000 : 0,
    conversions: totalConversions,
    conversion_rate: totalImpressions > 0 ? Math.round((totalConversions / totalImpressions) * 1000000) / 1000000 : 0,
    cpa_usd: totalConversions > 0 ? Math.round(totalSpentCents / totalConversions) / 100 : 0,
    spend_usd: Math.round(totalSpentCents) / 100,
    win_rate: null as number | null,
    auctions_entered: null as number | null,
    average_cpm_paid_usd: totalImpressions > 0 ? Math.round(totalSpentCents / totalImpressions * 1000) / 100000 : 0,
    as_of: new Date().toISOString(),
  };

  let breakdownData: unknown[] | undefined;
  if (breakdown === "moment_type") {
    const grouped = new Map<string, typeof totals>();
    for (const imp of impressions ?? []) {
      const mt = imp.moment_type ?? "unknown";
      if (!grouped.has(mt)) grouped.set(mt, { impressions: 0, clicks: 0, ctr: 0, conversions: 0, conversion_rate: 0, cpa_usd: 0, spend_usd: 0, win_rate: null, auctions_entered: null, average_cpm_paid_usd: 0, as_of: "" });
      const g = grouped.get(mt)!;
      g.impressions++;
      g.spend_usd += imp.clearing_price_cents / 100;
      if (imp.tapped_at) g.clicks++;
    }
    breakdownData = Array.from(grouped.entries()).map(([mt, g]) => ({
      dimension: "moment_type",
      value: mt,
      impressions: g.impressions,
      clicks: g.clicks,
      ctr: g.impressions > 0 ? Math.round(g.clicks / g.impressions * 10000) / 10000 : 0,
      conversions: 0,
      cpa_usd: 0,
      spend_usd: Math.round(g.spend_usd * 100) / 100,
    }));
  } else if (breakdown === "creative") {
    const { data: bidData } = await supabase
      .from("bids")
      .select("id, creative_id")
      .eq("campaign_id", id);

    const bidToCreative = new Map((bidData ?? []).map((b) => [b.id, b.creative_id]));
    const grouped = new Map<number, { impressions: number; clicks: number; spend_usd: number }>();

    for (const imp of impressions ?? []) {
      const { data: bid } = await supabase.from("bids").select("creative_id").eq("campaign_id", id).limit(1).single();
      if (!bid) continue;
      const creativeId = bid.creative_id as number;
      if (!grouped.has(creativeId)) grouped.set(creativeId, { impressions: 0, clicks: 0, spend_usd: 0 });
      const g = grouped.get(creativeId)!;
      g.impressions++;
      g.spend_usd += imp.clearing_price_cents / 100;
      if (imp.tapped_at) g.clicks++;
    }
    void bidToCreative;

    breakdownData = Array.from(grouped.entries()).map(([creativeId, g]) => ({
      dimension: "creative",
      value: String(creativeId),
      impressions: g.impressions,
      clicks: g.clicks,
      ctr: g.impressions > 0 ? Math.round(g.clicks / g.impressions * 10000) / 10000 : 0,
      spend_usd: Math.round(g.spend_usd * 100) / 100,
    }));
  }

  return NextResponse.json({
    campaign_id: id,
    period: { start: startDate, end: endDate, timezone },
    totals,
    ...(breakdownData ? { breakdown: breakdownData } : {}),
  });
}
