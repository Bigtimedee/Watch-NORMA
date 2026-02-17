// evaluate-alerts: Alert rules engine
// Trigger: Called by poll-boxscore after each game update

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

interface GameState {
  id: string;
  status: string;
  home_score: number;
  away_score: number;
  clock: string | null;
  period: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team: { name: string; abbreviation: string } | null;
  away_team: { name: string; abbreviation: string } | null;
}

interface AlertCandidate {
  userId: string;
  alertType: string;
  title: string;
  body: string;
  why: string;
}

function parseClockMinutes(clock: string | null): number | null {
  if (!clock) return null;
  const parts = clock.split(":");
  if (parts.length !== 2) return null;
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

function evaluateRules(game: GameState): Omit<AlertCandidate, "userId">[] {
  const alerts: Omit<AlertCandidate, "userId">[] = [];
  const margin = Math.abs(game.home_score - game.away_score);
  const clockMins = parseClockMinutes(game.clock);
  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const scoreStr = `${awayName} ${game.away_score} - ${homeName} ${game.home_score}`;

  // Game Start
  if (game.status === "inprogress" && game.period === 1 && clockMins != null && clockMins >= 19) {
    alerts.push({
      alertType: "game_start",
      title: "Game Starting",
      body: `${game.away_team?.name ?? "Away"} vs ${game.home_team?.name ?? "Home"} is tipping off!`,
      why: "Your followed game is starting",
    });
  }

  // Halftime
  if (game.status === "halftime") {
    alerts.push({
      alertType: "halftime",
      title: "Halftime",
      body: `${scoreStr} at the half`,
      why: "Halftime score update",
    });
  }

  // Close game - final 8 minutes, margin <= 5
  if (
    game.status === "inprogress" &&
    game.period != null &&
    game.period >= 2 &&
    clockMins != null &&
    clockMins <= 8 &&
    margin <= 5
  ) {
    alerts.push({
      alertType: "close_game",
      title: "Close Game!",
      body: `${scoreStr} with ${game.clock} left`,
      why: margin <= 3 && clockMins <= 4
        ? "Crunch time! Margin within 3 in the final 4 minutes"
        : "Close game in the final 8 minutes",
    });
  }

  // Overtime
  if (game.status === "inprogress" && game.period != null && game.period > 2) {
    const otPeriod = game.period - 2;
    alerts.push({
      alertType: "overtime",
      title: `Overtime${otPeriod > 1 ? ` (${otPeriod}OT)` : ""}!`,
      body: `${scoreStr} in OT${otPeriod > 1 ? otPeriod : ""}`,
      why: `Game is in overtime period ${otPeriod}`,
    });
  }

  // Game End
  if (game.status === "closed") {
    const winner =
      game.home_score > game.away_score
        ? game.home_team?.name ?? "Home"
        : game.away_team?.name ?? "Away";
    alerts.push({
      alertType: "game_end",
      title: "Final Score",
      body: `${scoreStr} - ${winner} wins!`,
      why: "Your followed game has ended",
    });
  }

  return alerts;
}

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

    // Get game state
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

    // Evaluate alert rules
    const candidateAlerts = evaluateRules(game as GameState);
    if (candidateAlerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alertsSent: 0, reason: "No rules triggered" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all users following this game or its teams
    const followFilters = [`game_id.eq.${gameId}`];
    if (game.home_team_id) followFilters.push(`team_id.eq.${game.home_team_id}`);
    if (game.away_team_id) followFilters.push(`team_id.eq.${game.away_team_id}`);

    const { data: follows } = await supabase
      .from("follows")
      .select("user_id")
      .or(followFilters.join(","));

    const userIds = [...new Set((follows ?? []).map((f: any) => f.user_id))];
    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alertsSent: 0, reason: "No followers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check notification preferences
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, notifications_enabled")
      .in("id", userIds)
      .eq("notifications_enabled", true);

    const enabledUserIds = (profiles ?? []).map((p: any) => p.id);

    let totalAlerts = 0;
    const alertsToSendPush: number[] = [];

    for (const userId of enabledUserIds) {
      for (const candidate of candidateAlerts) {
        // Rate limit: check recent alerts of this type for this user+game
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

        // Insert alert
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
        rulesTriggered: candidateAlerts.length,
        followers: userIds.length,
        alertsSent: totalAlerts,
        pushSent: alertsToSendPush.length,
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
