// health-check: System health dashboard endpoint
// Returns watcher_state summary, stale polls, alert pipeline stats, rate budget

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // --- Watcher State Summary ---
    const { data: activeWatchers } = await supabase
      .from("watcher_state")
      .select("game_id, pbp_next_poll_at, summary_next_poll_at, alert_next_evaluate_at, pbp_error_count, summary_error_count")
      .eq("is_active", true);

    const watchers = activeWatchers ?? [];
    const staleWatchers = watchers.filter((w) => {
      const pbpStale = w.pbp_next_poll_at && w.pbp_next_poll_at < fiveMinAgo;
      const summaryStale = w.summary_next_poll_at && w.summary_next_poll_at < fiveMinAgo;
      return pbpStale || summaryStale;
    });

    const watcherSummary = {
      active_count: watchers.length,
      stale_count: staleWatchers.length,
      stale_game_ids: staleWatchers.map((w) => w.game_id),
      with_errors: watchers.filter((w) => w.pbp_error_count > 0 || w.summary_error_count > 0).length,
    };

    // --- Active Games ---
    const { count: activeGameCount } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .in("status", ["inprogress", "halftime"]);

    // --- Alert Pipeline Stats (last hour) ---
    const { count: alertsGenerated } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo);

    const { count: alertsDelivered } = await supabase
      .from("delivery_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", oneHourAgo);

    const { count: alertsThrottled } = await supabase
      .from("delivery_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "throttled")
      .gte("created_at", oneHourAgo);

    const { count: alertsFailed } = await supabase
      .from("delivery_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", oneHourAgo);

    const alertPipeline = {
      last_hour: {
        generated: alertsGenerated ?? 0,
        delivered: alertsDelivered ?? 0,
        throttled: alertsThrottled ?? 0,
        failed: alertsFailed ?? 0,
      },
    };

    // --- Sportradar Rate Budget ---
    const windowStart = new Date(
      Math.floor(now.getTime() / 60_000) * 60_000
    ).toISOString();

    const { data: rateRow } = await supabase
      .from("api_rate_log")
      .select("calls_made")
      .eq("provider", "sportradar")
      .eq("window_start", windowStart)
      .maybeSingle();

    const rateBudget = {
      sportradar_calls_this_minute: rateRow?.calls_made ?? 0,
      sportradar_budget_remaining: Math.max(0, 25 - (rateRow?.calls_made ?? 0)),
    };

    const durationMs = Date.now() - startMs;

    const result = {
      status: "healthy",
      timestamp: nowIso,
      duration_ms: durationMs,
      active_games: activeGameCount ?? 0,
      watchers: watcherSummary,
      alert_pipeline: alertPipeline,
      rate_budget: rateBudget,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error("health-check error:", error);
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        error: (error as Error).message,
        duration_ms: durationMs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
