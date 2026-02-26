// floor-price-optimizer: Adjust floor prices based on observed auction data
// Trigger: Cron daily at 3 AM (after supply forecasts at 2 AM)
// Closes the feedback loop: auction clearing prices → floor adjustments → better pricing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Guardrails
const ABSOLUTE_MIN_CENTS = 5;
const ABSOLUTE_MAX_CENTS = 200;
const MAX_INCREASE_PCT = 0.20;
const MAX_DECREASE_PCT = 0.10;
const MIN_IMPRESSIONS = 50;
const CONFIDENCE_THRESHOLD = 0.3;

// Engagement confidence: min impressions needed for full confidence
const ENGAGEMENT_CONFIDENCE_SAMPLE = 500;

interface MomentAggregate {
  moment_type: string;
  impression_count: number;
  seen_count: number;
  tapped_count: number;
  avg_clearing_price: number;
  median_clearing_price: number;
  p25_clearing_price: number;
  p75_clearing_price: number;
  avg_clearing_7d: number;
  avg_clearing_prev_7d: number;
  impressions_7d: number;
  impressions_prev_7d: number;
}

interface FloorAdjustment {
  moment_type: string;
  previous_floor: number;
  new_floor: number;
  reason: string;
  metrics: Record<string, number>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Refresh the materialized view to get latest data
    await supabase.rpc("exec_sql", {
      sql: "REFRESH MATERIALIZED VIEW CONCURRENTLY public.moment_type_aggregates",
    }).catch(() =>
      supabase.rpc("exec_sql", {
        sql: "REFRESH MATERIALIZED VIEW public.moment_type_aggregates",
      })
    );

    // 2. Read aggregates
    const { data: aggregates, error: aggError } = await supabase
      .from("moment_type_aggregates")
      .select("*");

    if (aggError) throw aggError;
    if (!aggregates || aggregates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No aggregate data yet", adjustments: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Read current floor prices
    const { data: floors, error: floorError } = await supabase
      .from("floor_prices")
      .select("moment_type, floor_cents");

    if (floorError) throw floorError;

    const floorMap = new Map(
      (floors ?? []).map((f: { moment_type: string; floor_cents: number }) => [f.moment_type, f.floor_cents])
    );

    // 4. Count alerts per moment type for fill rate calculation
    const { data: alertCounts } = await supabase.rpc("exec_sql", {
      sql: `SELECT moment_type, COUNT(*)::int as alert_count
            FROM public.alerts
            WHERE created_at >= now() - INTERVAL '30 days'
              AND moment_type IS NOT NULL
            GROUP BY moment_type`,
    });

    const alertCountMap = new Map<string, number>();
    if (alertCounts && Array.isArray(alertCounts)) {
      for (const row of alertCounts) {
        alertCountMap.set(row.moment_type, row.alert_count);
      }
    }

    // 5. Compute adjustments
    const adjustments: FloorAdjustment[] = [];

    for (const agg of aggregates as MomentAggregate[]) {
      const currentFloor = floorMap.get(agg.moment_type);
      if (currentFloor === undefined) continue;
      if (agg.impression_count < MIN_IMPRESSIONS) continue;

      const alertCount = alertCountMap.get(agg.moment_type) ?? agg.impression_count;
      const fillRate = alertCount > 0 ? agg.impression_count / alertCount : 1;
      const clearingRatio = currentFloor > 0 ? agg.avg_clearing_price / currentFloor : 1;
      const trend = agg.avg_clearing_prev_7d > 0
        ? agg.avg_clearing_7d / agg.avg_clearing_prev_7d
        : 1;

      // Compute confidence based on sample size
      const confidence = Math.min(agg.impression_count / ENGAGEMENT_CONFIDENCE_SAMPLE, 1);
      if (confidence < CONFIDENCE_THRESHOLD) continue;

      let adjustmentPct = 0;
      let reason = "market_balanced";

      // Decision matrix
      if (clearingRatio > 2.0 && fillRate > 0.8) {
        adjustmentPct = 0.15;
        reason = "demand_exceeds_supply";
      } else if (clearingRatio > 1.5 && trend > 1.1) {
        adjustmentPct = 0.10;
        reason = "rising_demand";
      } else if (fillRate < 0.3 && clearingRatio < 1.2) {
        adjustmentPct = -0.10;
        reason = "unfilled_moments";
      } else if (fillRate < 0.5 && trend < 0.9) {
        adjustmentPct = -0.05;
        reason = "declining_demand";
      }

      if (adjustmentPct === 0) continue;

      // Apply guardrails
      adjustmentPct = Math.max(-MAX_DECREASE_PCT, Math.min(MAX_INCREASE_PCT, adjustmentPct));

      let newFloor = Math.round(currentFloor * (1 + adjustmentPct));
      newFloor = Math.max(ABSOLUTE_MIN_CENTS, Math.min(ABSOLUTE_MAX_CENTS, newFloor));

      if (newFloor === currentFloor) continue;

      const metrics = {
        fill_rate: Math.round(fillRate * 1000) / 1000,
        clearing_ratio: Math.round(clearingRatio * 1000) / 1000,
        trend: Math.round(trend * 1000) / 1000,
        impressions: agg.impression_count,
        avg_clearing_price: Number(agg.avg_clearing_price),
        confidence: Math.round(confidence * 1000) / 1000,
      };

      // Atomic floor update + history via Postgres function
      const { error: updateError } = await supabase.rpc("update_floor_price", {
        p_moment_type: agg.moment_type,
        p_new_floor_cents: newFloor,
        p_reason: reason,
        p_metrics_snapshot: metrics,
      });

      if (updateError) {
        console.error(`Failed to update floor for ${agg.moment_type}:`, updateError);
        continue;
      }

      adjustments.push({
        moment_type: agg.moment_type,
        previous_floor: currentFloor,
        new_floor: newFloor,
        reason,
        metrics,
      });
    }

    // 6. Update learned engagement rates
    const engagementUpserts = (aggregates as MomentAggregate[])
      .filter((agg) => agg.impression_count >= MIN_IMPRESSIONS)
      .map((agg) => ({
        moment_type: agg.moment_type,
        observed_ctr: agg.impression_count > 0
          ? agg.tapped_count / agg.impression_count
          : 0,
        observed_seen_rate: agg.impression_count > 0
          ? agg.seen_count / agg.impression_count
          : 0,
        sample_size: agg.impression_count,
        confidence: Math.min(agg.impression_count / ENGAGEMENT_CONFIDENCE_SAMPLE, 1),
        updated_at: new Date().toISOString(),
      }));

    if (engagementUpserts.length > 0) {
      const { error: engError } = await supabase
        .from("learned_engagement_rates")
        .upsert(engagementUpserts, { onConflict: "moment_type" });

      if (engError) console.error("Failed to update learned engagement rates:", engError);
    }

    // 7. Update learned moment rates
    const { data: momentRates, error: ratesError } = await supabase
      .rpc("compute_moment_rates");

    if (ratesError) {
      console.error("Failed to compute moment rates:", ratesError);
    } else if (momentRates && Array.isArray(momentRates) && momentRates.length > 0) {
      const momentRateUpserts = momentRates
        .filter((r: { sample_games: number }) => r.sample_games >= 10)
        .map((r: { moment_type: string; observed_rate: number; sample_games: number }) => ({
          moment_type: r.moment_type,
          observed_rate: r.observed_rate,
          sample_games: r.sample_games,
          confidence: Math.min(r.sample_games / 100, 1),
          updated_at: new Date().toISOString(),
        }));

      if (momentRateUpserts.length > 0) {
        const { error: mrError } = await supabase
          .from("learned_moment_rates")
          .upsert(momentRateUpserts, { onConflict: "moment_type" });

        if (mrError) console.error("Failed to update learned moment rates:", mrError);
      }
    }

    const result = {
      success: true,
      adjustments_made: adjustments.length,
      adjustments,
      engagement_rates_updated: engagementUpserts.length,
      moment_rates_updated: momentRates?.length ?? 0,
    };

    console.log(JSON.stringify({
      function: "floor-price-optimizer",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("floor-price-optimizer error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
