import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, serverError } from "@/lib/ads-api";
import { checkReportingRateLimit } from "@/lib/reporting-cache";

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
  const supabase = createSupabaseAdmin();

  // Verify the creative belongs to the advertiser
  const { data: creative } = await supabase
    .from("creatives")
    .select("id, campaign_id, sponsor_text, cta_text, cta_url, logo_url, performance_score, campaigns!inner(advertiser_id, targeting_rules)")
    .eq("id", id)
    .eq("campaigns.advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!creative) return notFound(`Creative ${id} not found`);

  // Aggregate impressions for this creative via bids
  const { data: bids } = await supabase
    .from("bids")
    .select("id")
    .eq("creative_id", id)
    .eq("campaign_id", creative.campaign_id);

  const bidIds = (bids ?? []).map((b) => b.id);
  let impressionTotal = 0;
  let tappedTotal = 0;
  let spentCents = 0;
  let conversionTotal = 0;

  if (bidIds.length > 0) {
    const { data: impressions } = await supabase
      .from("impressions")
      .select("id, clearing_price_cents, tapped_at")
      .in("bid_id", bidIds);

    impressionTotal = impressions?.length ?? 0;
    tappedTotal = impressions?.filter((i) => i.tapped_at).length ?? 0;
    spentCents = impressions?.reduce((s, i) => s + (i.clearing_price_cents ?? 0), 0) ?? 0;

    if (impressions && impressions.length > 0) {
      const impIds = impressions.map((i) => i.id);
      const { count } = await supabase
        .from("conversions")
        .select("id", { count: "exact", head: true })
        .in("impression_id", impIds);
      conversionTotal = count ?? 0;
    }
  }

  // Total creatives in campaign for traffic allocation
  const { count: totalCreatives } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", creative.campaign_id)
    .eq("status", "approved");

  const ctr = impressionTotal > 0 ? Math.round(tappedTotal / impressionTotal * 10000) / 10000 : 0;
  const campaignRules = ((creative.campaigns as unknown) as Record<string, unknown>).targeting_rules as Record<string, unknown>;

  return NextResponse.json({
    creative_id: id,
    campaign_id: String(creative.campaign_id),
    headline: creative.sponsor_text,
    body: campaignRules?.creative_body ?? null,
    icon_url: creative.logo_url,
    action_url: creative.cta_url,
    traffic_allocation: totalCreatives && totalCreatives > 0 ? Math.round(1 / totalCreatives * 100) / 100 : 1,
    impressions: impressionTotal,
    clicks: tappedTotal,
    ctr,
    conversions: conversionTotal,
    cpa_usd: conversionTotal > 0 ? Math.round(spentCents / conversionTotal) / 100 : 0,
    spend_usd: Math.round(spentCents) / 100,
    performance_score: creative.performance_score,
    as_of: new Date().toISOString(),
  });
}
