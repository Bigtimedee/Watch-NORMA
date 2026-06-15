// reporting-api: Serve aggregate metrics from materialized views
// Privacy-safe: never returns user-level data

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { report_type, campaign_id, date_from, date_to } = await req.json();

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Get advertiser
    const { data: advertiser } = await supabase
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) {
      return jsonResponse({ error: "Advertiser not found" }, 404);
    }

    switch (report_type) {
      case "overview": {
        // All campaigns summary
        const { data } = await supabase
          .from("advertiser_reporting")
          .select("*")
          .eq("advertiser_id", advertiser.id);

        return jsonResponse({ campaigns: data ?? [] });
      }

      case "campaign_detail": {
        if (!campaign_id) {
          return jsonResponse({ error: "campaign_id required" }, 400);
        }

        // Single campaign metrics
        const { data: metrics } = await supabase
          .from("advertiser_reporting")
          .select("*")
          .eq("campaign_id", campaign_id)
          .eq("advertiser_id", advertiser.id)
          .single();

        if (!metrics) {
          return jsonResponse({ error: "Campaign not found" }, 404);
        }

        // Daily breakdown (with minimum cohort enforcement)
        const { data: daily } = await supabase.rpc(
          "get_campaign_daily_stats",
          {
            p_campaign_id: campaign_id,
            p_advertiser_auth_id: user.id,
          }
        );

        // Conversion funnel
        const { data: conversions } = await supabase
          .from("conversions")
          .select("conversion_type, converted_at, attribution_window_ms, impressions!inner(campaign_id)")
          .eq("impressions.campaign_id", campaign_id);

        const funnel = {
          delivered: metrics.total_impressions,
          seen: metrics.seen_impressions,
          tapped: metrics.tapped_impressions,
          converted: metrics.total_conversions,
        };

        // Conversion breakdown by type
        const conversionsByType: Record<string, number> = {};
        for (const c of conversions ?? []) {
          const t = (c as any).conversion_type;
          conversionsByType[t] = (conversionsByType[t] ?? 0) + 1;
        }

        return jsonResponse({
          metrics,
          daily: daily ?? [],
          funnel,
          conversions_by_type: conversionsByType,
        });
      }

      case "creative_performance": {
        if (!campaign_id) {
          return jsonResponse({ error: "campaign_id required" }, 400);
        }

        // Verify ownership
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, advertisers!inner(auth_user_id)")
          .eq("id", campaign_id)
          .eq("advertisers.auth_user_id", user.id)
          .single();

        if (!campaign) {
          return jsonResponse({ error: "Campaign not found" }, 404);
        }

        // Get creative variants with performance
        const { data: creatives } = await supabase
          .from("creatives")
          .select("id, variant_label, sponsor_text, performance_score, status")
          .eq("campaign_id", campaign_id);

        // Get per-creative impression stats
        const result = [];
        for (const creative of creatives ?? []) {
          const { count: delivered } = await supabase
            .from("impressions")
            .select("*, bids!inner(creative_id)", { count: "exact", head: true })
            .eq("bids.creative_id", creative.id);

          const { count: tapped } = await supabase
            .from("impressions")
            .select("*, bids!inner(creative_id)", { count: "exact", head: true })
            .eq("bids.creative_id", creative.id)
            .not("tapped_at", "is", null);

          result.push({
            ...creative,
            impressions: delivered ?? 0,
            taps: tapped ?? 0,
            ctr: (delivered ?? 0) > 0
              ? ((tapped ?? 0) / (delivered ?? 1) * 100).toFixed(2)
              : "0.00",
          });
        }

        return jsonResponse({ creatives: result });
      }

      // P2-03: Closed-loop attribution measurement
      // Attribution window: 30 min (configurable via window_minutes param).
      // Honesty rule: sportsbook_open, stream_open, commerce_open are INFERRED.
      // Only cta_tap and app_return are app-verified. Label clearly in all UIs.
      case "attribution": {
        if (!campaign_id) {
          return jsonResponse({ error: "campaign_id required" }, 400);
        }

        // Verify campaign belongs to this advertiser
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, advertisers!inner(auth_user_id)")
          .eq("id", campaign_id)
          .eq("advertisers.auth_user_id", user.id)
          .single();

        if (!campaign) {
          return jsonResponse({ error: "Campaign not found" }, 404);
        }

        const windowMinutes = 30; // 30-min attribution window (industry standard for direct-response)

        // Aggregate impressions for this campaign
        const { data: impressionStats } = await supabase
          .from("impressions")
          .select("id, clearing_price_cents, tapped_at, delivered_at")
          .eq("campaign_id", campaign_id);

        const totalImpressions = impressionStats?.length ?? 0;
        const tapped = (impressionStats ?? []).filter((i: any) => i.tapped_at != null).length;
        const ctr = totalImpressions > 0 ? (tapped / totalImpressions) * 100 : 0;
        const totalSpent = (impressionStats ?? []).reduce((s: number, i: any) => s + (i.clearing_price_cents ?? 0), 0);

        // Attributed conversions via RPC (calls get_attribution_metrics SQL function)
        const { data: attributionRows } = await supabase.rpc("get_attribution_metrics", {
          p_campaign_id: campaign_id,
          p_window_minutes: windowMinutes,
        });

        const conversionsByType: Array<{
          conversion_type: string;
          count: number;
          is_inferred: boolean;
          avg_window_ms: number;
          label: string;
        }> = [];

        let totalAttributed = 0;
        for (const row of attributionRows ?? []) {
          const r = row as any;
          totalAttributed += Number(r.count);
          conversionsByType.push({
            conversion_type: r.conversion_type,
            count: Number(r.count),
            is_inferred: Boolean(r.is_inferred),
            avg_window_ms: Number(r.avg_window_ms ?? 0),
            label: r.is_inferred
              ? "Inferred (external action — not confirmed)"
              : "App-verified (action in NORMA)",
          });
        }

        const cpa = totalAttributed > 0 ? totalSpent / totalAttributed : null;

        // Click-through vs view-through
        const clickThrough = conversionsByType
          .filter((c) => c.conversion_type === "cta_tap")
          .reduce((s, c) => s + c.count, 0);
        const viewThrough = totalAttributed - clickThrough;

        return jsonResponse({
          campaign_id,
          attribution_window_minutes: windowMinutes,
          methodology_note: "30-min window from impression delivery to conversion action. " +
            "sportsbook_open/stream_open are inferred: NORMA opened the external app but " +
            "cannot confirm the downstream action without a partner server-to-server callback. " +
            "cta_tap and app_return are app-verified: action occurred inside NORMA.",
          summary: {
            total_impressions: totalImpressions,
            total_taps: tapped,
            ctr_pct: parseFloat(ctr.toFixed(2)),
            total_attributed_conversions: totalAttributed,
            attributed_action_rate_pct: totalImpressions > 0
              ? parseFloat(((totalAttributed / totalImpressions) * 100).toFixed(2))
              : 0,
            click_through_conversions: clickThrough,
            view_through_conversions: viewThrough,
            cpa_cents: cpa != null ? Math.round(cpa) : null,
          },
          conversions_by_type: conversionsByType,
        });
      }

      case "supply_forecast": {
        // Available to all advertisers
        const query = supabase
          .from("supply_forecasts")
          .select("*")
          .gte("forecast_date", date_from ?? new Date().toISOString().split("T")[0])
          .order("forecast_date")
          .order("moment_type");

        if (date_to) {
          query.lte("forecast_date", date_to);
        }

        const { data } = await query;
        return jsonResponse({ forecasts: data ?? [] });
      }

      default:
        return jsonResponse({ error: `Unknown report_type: ${report_type}` }, 400);
    }
  } catch (error) {
    console.error("reporting-api error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
