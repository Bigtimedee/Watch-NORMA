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
