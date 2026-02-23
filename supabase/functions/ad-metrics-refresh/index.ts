// ad-metrics-refresh: Refresh materialized views for advertising metrics
// Trigger: Cron every 15 minutes

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

    // Refresh materialized views concurrently
    const results = await Promise.allSettled([
      supabase.rpc("refresh_campaign_metrics"),
      supabase.rpc("refresh_daily_impression_stats"),
    ]);

    // Fallback: use raw SQL if RPCs don't exist yet
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(r.reason?.message ?? "Unknown error");
      }
    }

    // If RPCs failed, try direct SQL refresh
    if (errors.length > 0) {
      try {
        await supabase.rpc("exec_sql", {
          sql: "REFRESH MATERIALIZED VIEW CONCURRENTLY public.campaign_metrics",
        });
      } catch {
        // Try non-concurrent refresh
        try {
          await supabase.rpc("exec_sql", {
            sql: "REFRESH MATERIALIZED VIEW public.campaign_metrics",
          });
        } catch (e) {
          errors.push(`campaign_metrics refresh: ${(e as Error).message}`);
        }
      }

      try {
        await supabase.rpc("exec_sql", {
          sql: "REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_impression_stats",
        });
      } catch {
        try {
          await supabase.rpc("exec_sql", {
            sql: "REFRESH MATERIALIZED VIEW public.daily_impression_stats",
          });
        } catch (e) {
          errors.push(`daily_impression_stats refresh: ${(e as Error).message}`);
        }
      }
    }

    const result = {
      success: true,
      views_refreshed: ["campaign_metrics", "daily_impression_stats"],
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(JSON.stringify({
      function: "ad-metrics-refresh",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ad-metrics-refresh error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
