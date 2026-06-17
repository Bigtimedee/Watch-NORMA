import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, badRequest, serverError } from "@/lib/ads-api";
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
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("start_date");
  const endDate = sp.get("end_date");
  const granularity = sp.get("granularity") ?? "day";

  if (!startDate) return badRequest("start_date is required");
  if (!endDate) return badRequest("end_date is required");
  if (new Date(endDate) < new Date(startDate)) return badRequest("end_date must be >= start_date");
  if (granularity !== "day" && granularity !== "hour") return badRequest('granularity must be "day" or "hour"');

  const supabase = createSupabaseAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!campaign) return notFound(`Campaign ${id} not found`);

  if (granularity === "day") {
    // Use pre-aggregated daily_impression_stats
    const { data: dailyStats, error } = await supabase
      .from("daily_impression_stats")
      .select("impression_date, impressions, seen, tapped, spent_cents")
      .eq("campaign_id", id)
      .gte("impression_date", startDate)
      .lte("impression_date", endDate)
      .order("impression_date");

    if (error) return serverError(error.message);

    // Group by date (stats has one row per campaign × date × moment_type)
    const byDate = new Map<string, { impressions: number; tapped: number; spent_cents: number }>();
    for (const row of dailyStats ?? []) {
      const d = row.impression_date as string;
      if (!byDate.has(d)) byDate.set(d, { impressions: 0, tapped: 0, spent_cents: 0 });
      const entry = byDate.get(d)!;
      entry.impressions += row.impressions as number;
      entry.tapped += row.tapped as number;
      entry.spent_cents += row.spent_cents as number;
    }

    const series = Array.from(byDate.entries()).map(([date, g]) => ({
      date,
      impressions: g.impressions,
      clicks: g.tapped,
      ctr: g.impressions > 0 ? Math.round(g.tapped / g.impressions * 10000) / 10000 : 0,
      conversions: 0,
      cpa_usd: 0,
      spend_usd: Math.round(g.spent_cents) / 100,
      win_rate: null,
      as_of: new Date().toISOString(),
    }));

    return NextResponse.json({ campaign_id: id, granularity: "day", series });
  }

  // Hour granularity — query raw impressions
  const { data: impressions, error: impErr } = await supabase
    .from("advertiser_impressions")
    .select("clearing_price_cents, tapped_at, delivered_at")
    .eq("campaign_id", id)
    .gte("delivered_at", new Date(startDate).toISOString())
    .lte("delivered_at", new Date(endDate + "T23:59:59Z").toISOString());

  if (impErr) return serverError(impErr.message);

  const byHour = new Map<string, { impressions: number; tapped: number; spent_cents: number }>();
  for (const imp of impressions ?? []) {
    const d = new Date(imp.delivered_at);
    const key = `${d.toISOString().slice(0, 13)}:00:00Z`;
    if (!byHour.has(key)) byHour.set(key, { impressions: 0, tapped: 0, spent_cents: 0 });
    const g = byHour.get(key)!;
    g.impressions++;
    g.spent_cents += imp.clearing_price_cents ?? 0;
    if (imp.tapped_at) g.tapped++;
  }

  const series = Array.from(byHour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, g]) => ({
      hour,
      impressions: g.impressions,
      clicks: g.tapped,
      ctr: g.impressions > 0 ? Math.round(g.tapped / g.impressions * 10000) / 10000 : 0,
      spend_usd: Math.round(g.spent_cents) / 100,
    }));

  return NextResponse.json({ campaign_id: id, granularity: "hour", series });
}
