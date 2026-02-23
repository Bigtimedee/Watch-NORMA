// game-watcher-orchestrator: Durable polling coordinator for live games
// Trigger: pg_cron every 1 minute
//
// Reads watcher_state table to determine which games need PBP, summary,
// or alert evaluation polls. Dispatches to the appropriate Edge Functions
// with retry/backoff and concurrency limits.
//
// This replaces the inline dispatch logic that was previously in poll-boxscore.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Concurrency limits per orchestrator cycle
const MAX_PBP_DISPATCHES = 5;
const MAX_SUMMARY_DISPATCHES = 3;
const MAX_ALERT_DISPATCHES = 10;

// Backoff: next_poll = now + base * 2^error_count, capped at MAX
const BACKOFF_BASE_MS = 30_000; // 30 seconds
const BACKOFF_MAX_MS = 5 * 60_000; // 5 minutes

// Polling intervals
const PBP_INTERVAL_MS = 30_000; // 30 seconds
const SUMMARY_INTERVAL_MS = 2 * 60_000; // 2 minutes
const ALERT_INTERVAL_MS = 60_000; // 1 minute

interface WatcherRow {
  game_id: string;
  is_active: boolean;
  pbp_next_poll_at: string | null;
  pbp_error_count: number;
  summary_next_poll_at: string | null;
  summary_error_count: number;
  alert_next_evaluate_at: string | null;
}

interface GameInfo {
  id: string;
  status: string;
  sportradar_id: string | null;
  coverage_level: string | null;
}

function computeBackoff(errorCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, errorCount), BACKOFF_MAX_MS);
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

    const now = new Date();
    const nowIso = now.toISOString();

    // --- Step 1: Ensure watcher_state rows exist for active games ---
    const { data: activeGames, error: gamesErr } = await supabase
      .from("games")
      .select("id, status, sportradar_id, coverage_level")
      .in("status", ["inprogress", "halftime"]);

    if (gamesErr) throw gamesErr;

    const activeGameIds = (activeGames ?? []).map((g: GameInfo) => g.id);
    const activeGamesMap = new Map(
      (activeGames ?? []).map((g: GameInfo) => [g.id, g])
    );

    // Create watcher_state rows for games that don't have one yet
    if (activeGameIds.length > 0) {
      const { data: existingWatchers } = await supabase
        .from("watcher_state")
        .select("game_id")
        .in("game_id", activeGameIds);

      const existingIds = new Set((existingWatchers ?? []).map((w: any) => w.game_id));
      const newGameIds = activeGameIds.filter((id: string) => !existingIds.has(id));

      if (newGameIds.length > 0) {
        const rows = newGameIds.map((game_id: string) => {
          const game = activeGamesMap.get(game_id)!;
          const hasPbp = game.coverage_level === "full" && game.sportradar_id;
          return {
            game_id,
            is_active: true,
            pbp_next_poll_at: hasPbp ? nowIso : null,
            summary_next_poll_at: nowIso,
            alert_next_evaluate_at: nowIso,
          };
        });

        await supabase.from("watcher_state").upsert(rows, {
          onConflict: "game_id",
          ignoreDuplicates: true,
        });

        console.log(JSON.stringify({
          function: "game-watcher-orchestrator",
          event: "new_watchers_created",
          count: newGameIds.length,
          game_ids: newGameIds,
          timestamp: nowIso,
        }));
      }
    }

    // --- Step 2: Deactivate watchers for games no longer active ---
    // IMPORTANT: Before deactivating, run a FINAL evaluate-alerts for games
    // that just closed so "bet_resolved" alerts fire.
    const { data: staleWatchers } = await supabase
      .from("watcher_state")
      .select("game_id")
      .eq("is_active", true);

    const staleIds = (staleWatchers ?? [])
      .map((w: any) => w.game_id)
      .filter((id: string) => !activeGameIds.includes(id));

    if (staleIds.length > 0) {
      // Check which stale games are "closed" — they need one final alert evaluation
      const { data: closedGames } = await supabase
        .from("games")
        .select("id")
        .in("id", staleIds)
        .eq("status", "closed");

      const closedGameIds = (closedGames ?? []).map((g: any) => g.id);

      // Run final evaluate-alerts for each closed game (bet_resolved alerts)
      let finalAlertsDispatched = 0;
      for (const gameId of closedGameIds) {
        try {
          await supabase.functions.invoke("evaluate-alerts", {
            body: { gameId },
          });
          finalAlertsDispatched++;
          console.log(JSON.stringify({
            function: "game-watcher-orchestrator",
            event: "final_alert_evaluation",
            gameId,
            timestamp: nowIso,
          }));
        } catch (e) {
          console.warn(`Final alert evaluation failed for ${gameId}:`, e);
        }
      }

      // Now deactivate all stale watchers
      await supabase
        .from("watcher_state")
        .update({ is_active: false, updated_at: nowIso })
        .in("game_id", staleIds);

      console.log(JSON.stringify({
        function: "game-watcher-orchestrator",
        event: "watchers_deactivated",
        count: staleIds.length,
        game_ids: staleIds,
        closedGamesEvaluated: finalAlertsDispatched,
        timestamp: nowIso,
      }));
    }

    // --- Step 3: Check Sportradar rate budget ---
    const windowStart = new Date(
      Math.floor(now.getTime() / 60_000) * 60_000
    ).toISOString();

    const { data: rateRow } = await supabase
      .from("api_rate_log")
      .select("calls_made")
      .eq("provider", "sportradar")
      .eq("window_start", windowStart)
      .maybeSingle();

    const sportradarCallsThisMinute = rateRow?.calls_made ?? 0;
    // Sportradar typical limit: ~30 calls/minute for production keys
    const sportradarBudgetRemaining = Math.max(0, 25 - sportradarCallsThisMinute);

    // --- Step 4: Dispatch PBP polls ---
    let pbpDispatched = 0;
    if (sportradarBudgetRemaining > 0) {
      const { data: pbpDue } = await supabase
        .from("watcher_state")
        .select("game_id, pbp_error_count")
        .eq("is_active", true)
        .not("pbp_next_poll_at", "is", null)
        .lte("pbp_next_poll_at", nowIso)
        .order("pbp_next_poll_at", { ascending: true })
        .limit(Math.min(MAX_PBP_DISPATCHES, sportradarBudgetRemaining));

      for (const row of pbpDue ?? []) {
        try {
          const res = await supabase.functions.invoke("poll-pbp", {
            body: { gameId: row.game_id },
          });

          // Success: reset error count, schedule next poll
          const nextPoll = new Date(now.getTime() + PBP_INTERVAL_MS).toISOString();
          await supabase
            .from("watcher_state")
            .update({
              pbp_last_polled_at: nowIso,
              pbp_next_poll_at: nextPoll,
              pbp_error_count: 0,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);

          pbpDispatched++;
        } catch (e) {
          console.warn(`PBP dispatch failed for ${row.game_id}:`, e);

          // Backoff on error
          const newErrorCount = (row.pbp_error_count ?? 0) + 1;
          const backoff = computeBackoff(newErrorCount);
          const nextPoll = new Date(now.getTime() + backoff).toISOString();

          await supabase
            .from("watcher_state")
            .update({
              pbp_error_count: newErrorCount,
              pbp_next_poll_at: nextPoll,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);
        }
      }
    }

    // --- Step 5: Dispatch Summary polls ---
    let summaryDispatched = 0;
    {
      const summaryBudget = Math.max(
        0,
        sportradarBudgetRemaining - pbpDispatched
      );
      const summaryLimit = Math.min(MAX_SUMMARY_DISPATCHES, summaryBudget > 0 ? MAX_SUMMARY_DISPATCHES : 0);

      // Summary can use SportsDataIO fallback, so we still dispatch even without Sportradar budget
      // but we limit to MAX_SUMMARY_DISPATCHES either way
      const { data: summaryDue } = await supabase
        .from("watcher_state")
        .select("game_id, summary_error_count")
        .eq("is_active", true)
        .not("summary_next_poll_at", "is", null)
        .lte("summary_next_poll_at", nowIso)
        .order("summary_next_poll_at", { ascending: true })
        .limit(MAX_SUMMARY_DISPATCHES);

      for (const row of summaryDue ?? []) {
        try {
          await supabase.functions.invoke("poll-summary", {
            body: { gameId: row.game_id },
          });

          const nextPoll = new Date(now.getTime() + SUMMARY_INTERVAL_MS).toISOString();
          await supabase
            .from("watcher_state")
            .update({
              summary_last_polled_at: nowIso,
              summary_next_poll_at: nextPoll,
              summary_error_count: 0,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);

          summaryDispatched++;
        } catch (e) {
          console.warn(`Summary dispatch failed for ${row.game_id}:`, e);

          const newErrorCount = (row.summary_error_count ?? 0) + 1;
          const backoff = computeBackoff(newErrorCount);
          const nextPoll = new Date(now.getTime() + backoff).toISOString();

          await supabase
            .from("watcher_state")
            .update({
              summary_error_count: newErrorCount,
              summary_next_poll_at: nextPoll,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);
        }
      }
    }

    // --- Step 6: Dispatch Alert evaluations ---
    let alertsDispatched = 0;
    {
      const { data: alertDue } = await supabase
        .from("watcher_state")
        .select("game_id")
        .eq("is_active", true)
        .not("alert_next_evaluate_at", "is", null)
        .lte("alert_next_evaluate_at", nowIso)
        .order("alert_next_evaluate_at", { ascending: true })
        .limit(MAX_ALERT_DISPATCHES);

      for (const row of alertDue ?? []) {
        try {
          await supabase.functions.invoke("evaluate-alerts", {
            body: { gameId: row.game_id },
          });

          const nextEval = new Date(now.getTime() + ALERT_INTERVAL_MS).toISOString();
          await supabase
            .from("watcher_state")
            .update({
              alert_last_evaluated_at: nowIso,
              alert_next_evaluate_at: nextEval,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);

          alertsDispatched++;
        } catch (e) {
          console.warn(`Alert evaluation dispatch failed for ${row.game_id}:`, e);
          // Alert evaluation doesn't need backoff — just skip and retry next cycle
          const nextEval = new Date(now.getTime() + ALERT_INTERVAL_MS).toISOString();
          await supabase
            .from("watcher_state")
            .update({
              alert_next_evaluate_at: nextEval,
              updated_at: nowIso,
            })
            .eq("game_id", row.game_id);
        }
      }
    }

    const result = {
      success: true,
      activeGames: activeGameIds.length,
      watchersDeactivated: staleIds.length,
      sportradarBudgetRemaining,
      pbpDispatched,
      summaryDispatched,
      alertsDispatched,
      timestamp: nowIso,
    };

    console.log(JSON.stringify({
      function: "game-watcher-orchestrator",
      event: "cycle_complete",
      ...result,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("game-watcher-orchestrator error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
