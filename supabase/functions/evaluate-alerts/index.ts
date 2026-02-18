// evaluate-alerts: Wager-only "Tune In Now" engine
// Alerts ONLY fire when a user has an active wager or prediction position
// and the game state makes that bet relevant RIGHT NOW.
// Trigger: Called by poll-boxscore after each game update

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  ALERT_COOLDOWN_MS,
  evaluateSpread,
  evaluateTotal,
  evaluateMoneyline,
  evaluateProp,
  evaluatePosition,
  evaluateResolved,
} from "./logic.ts";
import type {
  GameState,
  UserWager,
  UserPosition,
  SummaryStats,
  AlertCandidate,
} from "./logic.ts";

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { gameId } = await req.json();
    if (!gameId) {
      return new Response(
        JSON.stringify({ error: "gameId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get game state with team info
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey(name, abbreviation),
        away_team:teams!games_away_team_id_fkey(name, abbreviation)
      `)
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ error: "Game not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gameState = game as unknown as GameState;

    // Find ALL users with active wagers on this game
    const { data: wagers } = await supabase
      .from("wagers")
      .select("id, user_id, wager_type, team_id, line, odds, description, sportsbook")
      .eq("game_id", gameId)
      .eq("status", "active");

    // Find ALL users with active prediction positions on this game
    const { data: positions } = await supabase
      .from("prediction_positions")
      .select("id, user_id, platform, market_title, position_side, quantity, avg_price")
      .eq("game_id", gameId)
      .eq("settled", false);

    // No wagers AND no positions = no alerts. Period.
    if ((!wagers || wagers.length === 0) && (!positions || positions.length === 0)) {
      return new Response(
        JSON.stringify({ success: true, alertsSent: 0, reason: "No active wagers or positions on this game" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch latest Sportradar summary (for richer context in alerts)
    let summaryStats: SummaryStats | null = null;
    const { data: summarySnapshots } = await supabase
      .from("game_snapshots")
      .select("payload")
      .eq("game_id", gameId)
      .eq("snapshot_type", "sportradar_summary")
      .order("created_at", { ascending: false })
      .limit(1);

    if (summarySnapshots && summarySnapshots.length > 0) {
      const payload = summarySnapshots[0].payload as any;
      if (payload?.source === "sportradar" && payload?.home && payload?.away) {
        summaryStats = payload as SummaryStats;
      }
    }

    // Collect unique user IDs from wagers + positions
    const userWagerMap = new Map<string, UserWager[]>();
    for (const w of (wagers ?? []) as UserWager[]) {
      const list = userWagerMap.get(w.user_id) ?? [];
      list.push(w);
      userWagerMap.set(w.user_id, list);
    }

    const userPositionMap = new Map<string, UserPosition[]>();
    for (const p of (positions ?? []) as UserPosition[]) {
      const list = userPositionMap.get(p.user_id) ?? [];
      list.push(p);
      userPositionMap.set(p.user_id, list);
    }

    const allUserIds = new Set([...userWagerMap.keys(), ...userPositionMap.keys()]);

    // Check notification preferences
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, notifications_enabled")
      .in("id", Array.from(allUserIds))
      .eq("notifications_enabled", true);

    const enabledUserIds = new Set((profiles ?? []).map((p: any) => p.id));

    let totalAlerts = 0;
    const alertsToSendPush: number[] = [];

    for (const userId of enabledUserIds) {
      const userWagers = userWagerMap.get(userId) ?? [];
      const userPositions = userPositionMap.get(userId) ?? [];
      const candidates: AlertCandidate[] = [];

      // Evaluate each wager
      for (const wager of userWagers) {
        const spread = evaluateSpread(gameState, wager, summaryStats);
        if (spread) candidates.push(spread);

        const total = evaluateTotal(gameState, wager);
        if (total) candidates.push(total);

        const ml = evaluateMoneyline(gameState, wager, summaryStats);
        if (ml) candidates.push(ml);

        const prop = evaluateProp(gameState, wager, summaryStats);
        if (prop) candidates.push(prop);

        const resolved = evaluateResolved(gameState, wager);
        if (resolved) candidates.push(resolved);
      }

      // Evaluate each prediction position
      for (const position of userPositions) {
        const posAlert = evaluatePosition(gameState, position);
        if (posAlert) candidates.push(posAlert);
      }

      // De-duplicate and rate-limit
      for (const candidate of candidates) {
        const cutoff = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
        const { data: recentAlerts } = await supabase
          .from("alerts")
          .select("id")
          .eq("user_id", userId)
          .eq("game_id", gameId)
          .eq("alert_type", candidate.alertType)
          .gte("created_at", cutoff)
          .limit(1);

        if (recentAlerts && recentAlerts.length > 0) continue;

        const { data: newAlert, error: insertError } = await supabase
          .from("alerts")
          .insert({
            user_id: userId,
            game_id: gameId,
            alert_type: candidate.alertType,
            title: candidate.title,
            body: candidate.body,
            why: candidate.why,
          })
          .select("id")
          .single();

        if (!insertError && newAlert) {
          totalAlerts++;
          alertsToSendPush.push(newAlert.id);
        }
      }
    }

    // Send push notifications
    for (const alertId of alertsToSendPush) {
      try {
        await supabase.functions.invoke("send-push", {
          body: { alertId },
        });
      } catch (e) {
        console.warn(`Failed to send push for alert ${alertId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        usersWithWagers: userWagerMap.size,
        usersWithPositions: userPositionMap.size,
        alertsSent: totalAlerts,
        pushSent: alertsToSendPush.length,
        hasSummaryData: !!summaryStats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("evaluate-alerts error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
