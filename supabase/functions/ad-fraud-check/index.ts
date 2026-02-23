// ad-fraud-check: Hourly fraud detection sweep
// Detects: rapid clicks, impression stuffing, anomalous CTR, budget drain attacks

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

    const fraudEvents: Array<{
      event_type: string;
      campaign_id: number;
      details: Record<string, unknown>;
    }> = [];

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Get all active campaigns
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, budget_cents, spent_cents, daily_budget_cents, advertiser_id")
      .eq("status", "active");

    for (const campaign of campaigns ?? []) {
      // --- 1. Impression Stuffing: > 100 impressions in 1 minute ---
      const { count: recentImpCount } = await supabase
        .from("impressions")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .gte("delivered_at", oneMinuteAgo);

      if ((recentImpCount ?? 0) > 100) {
        fraudEvents.push({
          event_type: "impression_stuffing",
          campaign_id: campaign.id,
          details: {
            impressions_in_minute: recentImpCount,
            threshold: 100,
          },
        });

        // Auto-pause
        await supabase
          .from("campaigns")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", campaign.id);
      }

      // --- 2. Anomalous CTR: > 50% in last hour ---
      const { data: hourImpressions } = await supabase
        .from("impressions")
        .select("tapped_at")
        .eq("campaign_id", campaign.id)
        .gte("delivered_at", oneHourAgo);

      if (hourImpressions && hourImpressions.length >= 20) {
        const tapped = hourImpressions.filter((i) => i.tapped_at != null).length;
        const ctr = tapped / hourImpressions.length;

        if (ctr > 0.5) {
          fraudEvents.push({
            event_type: "anomalous_ctr",
            campaign_id: campaign.id,
            details: {
              ctr: (ctr * 100).toFixed(1) + "%",
              impressions: hourImpressions.length,
              taps: tapped,
              threshold: "50%",
            },
          });
        }
      }

      // --- 3. Budget Drain Attack: > 80% of daily budget in < 1 hour ---
      if (campaign.daily_budget_cents) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayImpressions } = await supabase
          .from("impressions")
          .select("clearing_price_cents, delivered_at")
          .eq("campaign_id", campaign.id)
          .gte("delivered_at", todayStart.toISOString());

        if (todayImpressions && todayImpressions.length > 0) {
          const todaySpent = todayImpressions.reduce(
            (sum, i) => sum + i.clearing_price_cents,
            0
          );

          // Check if 80% spent in first hour of activity
          const firstImpression = todayImpressions.reduce(
            (min, i) =>
              new Date(i.delivered_at) < new Date(min)
                ? i.delivered_at
                : min,
            todayImpressions[0].delivered_at
          );

          const timeSinceFirst =
            Date.now() - new Date(firstImpression).getTime();
          const oneHour = 60 * 60 * 1000;

          if (
            todaySpent > campaign.daily_budget_cents * 0.8 &&
            timeSinceFirst < oneHour
          ) {
            fraudEvents.push({
              event_type: "budget_drain",
              campaign_id: campaign.id,
              details: {
                daily_budget: campaign.daily_budget_cents,
                spent_today: todaySpent,
                time_elapsed_minutes: Math.round(timeSinceFirst / 60000),
                threshold: "80% in < 1 hour",
              },
            });

            // Auto-pause
            await supabase
              .from("campaigns")
              .update({ status: "paused", updated_at: new Date().toISOString() })
              .eq("id", campaign.id);
          }
        }
      }
    }

    // --- 4. Rapid Click Detection: user taps CTA > 3 times in 1 minute ---
    const { data: rapidClicks } = await supabase
      .from("impressions")
      .select("user_id, campaign_id, tapped_at")
      .not("tapped_at", "is", null)
      .gte("tapped_at", oneMinuteAgo);

    if (rapidClicks && rapidClicks.length > 0) {
      const userClickCounts = new Map<string, number>();
      for (const click of rapidClicks) {
        const key = `${click.user_id}:${click.campaign_id}`;
        userClickCounts.set(key, (userClickCounts.get(key) ?? 0) + 1);
      }

      for (const [key, count] of userClickCounts) {
        if (count > 3) {
          const [userId, campaignId] = key.split(":");
          fraudEvents.push({
            event_type: "rapid_click",
            campaign_id: parseInt(campaignId),
            details: {
              user_id: userId,
              clicks_in_minute: count,
              threshold: 3,
            },
          });
        }
      }
    }

    // Insert fraud events
    if (fraudEvents.length > 0) {
      await supabase.from("ad_fraud_events").insert(fraudEvents);
    }

    const result = {
      success: true,
      campaigns_checked: (campaigns ?? []).length,
      fraud_events_found: fraudEvents.length,
      events_by_type: fraudEvents.reduce(
        (acc, e) => {
          acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    console.log(JSON.stringify({
      function: "ad-fraud-check",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ad-fraud-check error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
