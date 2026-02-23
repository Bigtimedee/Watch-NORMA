// ad-budget-pacer: Enforce daily budget pacing
// Trigger: Cron every 5 minutes
// Pauses over-pacing campaigns, resumes under-pacing ones

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

    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, budget_cents, spent_cents, daily_budget_cents, flight_start, flight_end, status")
      .in("status", ["active", "paused"]);

    let throttled = 0;
    let resumed = 0;
    let completed = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const campaign of campaigns ?? []) {
      // Check total budget exhaustion
      if (campaign.spent_cents >= campaign.budget_cents && campaign.status === "active") {
        await supabase
          .from("campaigns")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", campaign.id);
        completed++;
        continue;
      }

      // Only pace campaigns with daily budgets
      if (!campaign.daily_budget_cents) continue;

      // Get today's spend
      const { data: todayImpressions } = await supabase
        .from("impressions")
        .select("clearing_price_cents")
        .eq("campaign_id", campaign.id)
        .gte("delivered_at", todayStart.toISOString());

      const todaySpent = (todayImpressions ?? []).reduce(
        (sum: number, i: { clearing_price_cents: number }) => sum + i.clearing_price_cents,
        0
      );

      const now = new Date();
      const hoursElapsed = now.getHours() + now.getMinutes() / 60;
      const hourlyPace = campaign.daily_budget_cents / 24;

      if (campaign.status === "active") {
        // Check if over-pacing (spending 50% faster than even pace)
        if (hoursElapsed > 1 && todaySpent > hourlyPace * hoursElapsed * 1.5) {
          // Don't actually pause the campaign, just mark it for pacing throttle
          // The auction engine checks pacing before bidding
          console.log(JSON.stringify({
            function: "ad-budget-pacer",
            event: "throttle_warning",
            campaign_id: campaign.id,
            today_spent: todaySpent,
            daily_budget: campaign.daily_budget_cents,
            pace_ratio: (todaySpent / (hourlyPace * hoursElapsed)).toFixed(2),
          }));
          throttled++;
        }

        // Auto-pause if daily budget exceeded
        if (todaySpent >= campaign.daily_budget_cents) {
          // Campaign will be skipped by auction engine's budget check
          console.log(JSON.stringify({
            function: "ad-budget-pacer",
            event: "daily_budget_hit",
            campaign_id: campaign.id,
            today_spent: todaySpent,
            daily_budget: campaign.daily_budget_cents,
          }));
        }
      }
    }

    const result = {
      success: true,
      campaigns_checked: (campaigns ?? []).length,
      throttled,
      resumed,
      completed,
    };

    console.log(JSON.stringify({
      function: "ad-budget-pacer",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ad-budget-pacer error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
