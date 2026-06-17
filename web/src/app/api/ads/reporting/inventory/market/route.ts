import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { badRequest, serverError } from "@/lib/ads-api";
import { getCached, setCached } from "@/lib/reporting-cache";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "reporting:read");
  if (auth instanceof NextResponse) return auth;

  const sp = request.nextUrl.searchParams;
  const momentType = sp.get("moment_type");
  const sport = sp.get("sport");
  const lookbackDays = Math.min(30, Math.max(1, parseInt(sp.get("lookback_days") ?? "7", 10)));

  const cacheKey = `market:${momentType ?? "all"}:${sport ?? "all"}:${lookbackDays}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
  }

  const supabase = createSupabaseAdmin();

  // Query floor prices
  let floorQuery = supabase
    .from("floor_prices")
    .select("moment_type, floor_cents, sport");

  if (momentType) floorQuery = floorQuery.eq("moment_type", momentType);

  const { data: floors, error: floorErr } = await floorQuery;
  if (floorErr) return serverError(floorErr.message);

  // Query impression percentile data for the lookback window
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  let impQuery = supabase
    .from("impressions")
    .select("moment_type, clearing_price_cents, delivered_at")
    .gte("delivered_at", since.toISOString());

  if (momentType) impQuery = impQuery.eq("moment_type", momentType);

  const { data: impressions, error: impErr } = await impQuery.limit(100000);
  if (impErr) return serverError(impErr.message);

  // Compute percentiles per moment type
  const grouped = new Map<string, number[]>();
  for (const imp of impressions ?? []) {
    const mt = imp.moment_type as string;
    if (!grouped.has(mt)) grouped.set(mt, []);
    grouped.get(mt)!.push(imp.clearing_price_cents as number);
  }

  const floorByMoment = new Map<string, number>();
  for (const f of floors ?? []) {
    if (!f.sport) floorByMoment.set(f.moment_type as string, f.floor_cents as number);
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  const market_data = Array.from(grouped.entries()).map(([mt, prices]) => {
    const sorted = prices.slice().sort((a, b) => a - b);
    return {
      moment_type: mt,
      sport: sport ?? null,
      floor_cpm_usd: (floorByMoment.get(mt) ?? 10) / 100,
      p25_winning_cpm_usd: percentile(sorted, 25) / 100,
      p50_winning_cpm_usd: percentile(sorted, 50) / 100,
      p75_winning_cpm_usd: percentile(sorted, 75) / 100,
      p90_winning_cpm_usd: percentile(sorted, 90) / 100,
      avg_fill_rate: null as number | null,
      total_auctions_7d: sorted.length,
      avg_auction_depth: null as number | null,
    };
  });

  const response = {
    as_of: new Date().toISOString(),
    lookback_days: lookbackDays,
    market_data,
  };

  setCached(cacheKey, response);
  return NextResponse.json(response);
}
