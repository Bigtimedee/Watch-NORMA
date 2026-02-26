// forecast-supply: Generate 7-day supply forecasts
// Trigger: Cron daily at 2 AM
// Predicts available moment inventory from scheduled games + historical rates

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Historical moment rates per game (from past data analysis)
const MOMENT_RATES: Record<string, number> = {
  prediction_resolved: 0.85,  // most games with predictions resolve
  close_game: 0.35,           // 35% of games have close finish
  overtime: 0.04,              // 4% go to OT
  bet_resolved: 1.0,           // every game ends
  spread_alert: 0.6,           // 60% have spread-relevant moments
  moneyline_alert: 0.4,
  total_alert: 0.3,
  foul_trouble: 0.15,
  follow_alert: 0.8,
  prop_alert: 0.2,
  position_alert: 0.15,
};

/**
 * Fetch learned moment rates from DB and blend with hardcoded fallbacks.
 * Uses confidence weighting: learned * confidence + hardcoded * (1 - confidence)
 */
async function getMomentRates(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, number>> {
  const blended = { ...MOMENT_RATES };

  try {
    const { data: learned } = await supabase
      .from("learned_moment_rates")
      .select("moment_type, observed_rate, confidence");

    if (learned && learned.length > 0) {
      for (const row of learned) {
        const hardcoded = MOMENT_RATES[row.moment_type];
        if (hardcoded !== undefined) {
          const confidence = Math.min(row.confidence, 1);
          blended[row.moment_type] =
            row.observed_rate * confidence + hardcoded * (1 - confidence);
        } else {
          // New moment type learned from data — use directly
          blended[row.moment_type] = row.observed_rate;
        }
      }
    }
  } catch {
    // Fall back to hardcoded rates on any error
  }

  return blended;
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

    const forecasts: Array<{
      forecast_date: string;
      moment_type: string;
      league: string;
      predicted_moments: number;
      predicted_eligible_users: number;
      confidence: number;
      games_scheduled: number;
    }> = [];

    // Get average eligible users per game from recent data
    const { data: recentAlerts } = await supabase
      .from("alerts")
      .select("game_id, user_id")
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate avg users per game
    const gameUserCounts = new Map<string, Set<string>>();
    for (const alert of recentAlerts ?? []) {
      if (!alert.game_id) continue;
      if (!gameUserCounts.has(alert.game_id)) {
        gameUserCounts.set(alert.game_id, new Set());
      }
      gameUserCounts.get(alert.game_id)!.add(alert.user_id);
    }

    const avgUsersPerGame =
      gameUserCounts.size > 0
        ? Array.from(gameUserCounts.values()).reduce((sum, s) => sum + s.size, 0) /
          gameUserCounts.size
        : 10; // default estimate

    // Confidence based on sample size
    const baseConfidence = Math.min(gameUserCounts.size / 100, 0.9);

    // Fetch learned moment rates (blended with hardcoded fallbacks)
    const learnedRates = await getMomentRates(supabase);

    // Generate forecasts for next 7 days
    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + dayOffset);
      const dateStr = forecastDate.toISOString().split("T")[0];

      // Count scheduled games for this date
      const dayStart = new Date(dateStr + "T00:00:00Z");
      const dayEnd = new Date(dateStr + "T23:59:59Z");

      const { count: gamesScheduled } = await supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .gte("scheduled_at", dayStart.toISOString())
        .lte("scheduled_at", dayEnd.toISOString())
        .in("status", ["scheduled", "inprogress", "halftime"]);

      const gameCount = gamesScheduled ?? 0;

      // Confidence decreases for further-out days
      const dayConfidence = baseConfidence * (1 - dayOffset * 0.05);

      // Generate forecast for each moment type (using learned rates)
      for (const [momentType, rate] of Object.entries(learnedRates)) {
        const predictedMoments = Math.round(gameCount * rate);
        const predictedUsers = Math.round(predictedMoments * avgUsersPerGame);

        forecasts.push({
          forecast_date: dateStr,
          moment_type: momentType,
          league: "ncaa_basketball",
          predicted_moments: predictedMoments,
          predicted_eligible_users: predictedUsers,
          confidence: Math.max(0.1, dayConfidence),
          games_scheduled: gameCount,
        });
      }
    }

    // Upsert forecasts (replace existing for same date/moment/league)
    if (forecasts.length > 0) {
      const { error } = await supabase
        .from("supply_forecasts")
        .upsert(forecasts, {
          onConflict: "forecast_date,moment_type,league",
        });

      if (error) {
        console.error("Forecast upsert error:", error);
        throw error;
      }
    }

    const result = {
      success: true,
      forecasts_generated: forecasts.length,
      days_forecasted: 7,
      avg_users_per_game: Math.round(avgUsersPerGame),
      sample_size: gameUserCounts.size,
    };

    console.log(JSON.stringify({
      function: "forecast-supply",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("forecast-supply error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
