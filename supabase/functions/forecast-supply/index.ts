// forecast-supply: Generate 7-day supply forecasts (P2-04 enhanced)
// Trigger: Cron daily at 2 AM
// Predicts available moment inventory from scheduled games + historical rates.
// Uses intent_moments history where available; degrades gracefully to hardcoded
// fallbacks with a wide uncertainty band for sports with insufficient history.

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
          blended[row.moment_type] = row.observed_rate;
        }
      }
    }
  } catch {
    // Fall back to hardcoded rates on any error
  }

  return blended;
}

// P2-04: Compute moment rates from intent_moments historical data.
// Returns rates with 80% confidence bands (Wald interval).
// Returns null if sport has insufficient history (< MIN_SAMPLE_GAMES).
const MIN_SAMPLE_GAMES = 10;

interface HistoricalRate {
  mean: number;
  low: number;
  high: number;
  sample_games: number;
}

export async function getIntentMomentRates(
  supabase: ReturnType<typeof createClient>,
  sport: string,
  windowDays = 30,
): Promise<{ rates: Record<string, HistoricalRate>; basis: string } | null> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: moments } = await supabase
      .from("intent_moments")
      .select("game_id, moment_type")
      .eq("sport", sport)
      .gte("fired_at", cutoff);

    if (!moments || moments.length === 0) {
      return null;
    }

    // Count unique games and whether each moment_type fired per game
    const gameMoments = new Map<string, Set<string>>();
    for (const m of moments as Array<{ game_id: string; moment_type: string }>) {
      if (!gameMoments.has(m.game_id)) gameMoments.set(m.game_id, new Set());
      gameMoments.get(m.game_id)!.add(m.moment_type);
    }

    const sampleGames = gameMoments.size;
    if (sampleGames < MIN_SAMPLE_GAMES) {
      return null; // Caller should use hardcoded fallback and wide band
    }

    // Fire rate per moment_type = games where type fired / total games
    const typeFireCount = new Map<string, number>();
    for (const [, typesSet] of gameMoments) {
      for (const t of typesSet) {
        typeFireCount.set(t, (typeFireCount.get(t) ?? 0) + 1);
      }
    }

    const rates: Record<string, HistoricalRate> = {};
    for (const [type, count] of typeFireCount) {
      const mean = count / sampleGames;
      // Wald 80% CI: p ± 1.282 * sqrt(p*(1-p)/n)
      const se = Math.sqrt(mean * (1 - mean) / sampleGames);
      rates[type] = {
        mean,
        low: Math.max(0, mean - 1.282 * se),
        high: Math.min(1, mean + 1.282 * se),
        sample_games: sampleGames,
      };
    }

    return { rates, basis: `${sampleGames} games (last ${windowDays} days from intent_moments)` };
  } catch {
    return null;
  }
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
      predicted_moments_low: number | null;
      predicted_moments_high: number | null;
      basis_note: string;
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

    // P2-04: Fetch historical rates from intent_moments per sport
    // Sports supported for forecasting
    const FORECAST_SPORTS = [
      { sport: "ncaam", league: "ncaa_basketball" },
      { sport: "nba", league: "nba" },
      { sport: "mlb", league: "mlb" },
      { sport: "ncaaf", league: "ncaaf" },
      { sport: "nfl", league: "nfl" },
    ];

    const intentRatesBySport = new Map<string, Awaited<ReturnType<typeof getIntentMomentRates>>>();
    for (const { sport } of FORECAST_SPORTS) {
      intentRatesBySport.set(sport, await getIntentMomentRates(supabase, sport));
    }

    // Generate forecasts for next 7 days
    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + dayOffset);
      const dateStr = forecastDate.toISOString().split("T")[0];

      const dayStart = new Date(dateStr + "T00:00:00Z");
      const dayEnd = new Date(dateStr + "T23:59:59Z");

      // Confidence decreases for further-out days
      const dayConfidence = baseConfidence * (1 - dayOffset * 0.05);

      for (const { sport, league } of FORECAST_SPORTS) {
        // Count scheduled games for this sport + date
        const { count: gamesScheduled } = await supabase
          .from("games")
          .select("*", { count: "exact", head: true })
          .gte("scheduled_at", dayStart.toISOString())
          .lte("scheduled_at", dayEnd.toISOString())
          .in("status", ["scheduled", "inprogress", "halftime"])
          .eq("sport", sport);

        const gameCount = gamesScheduled ?? 0;

        const intentHistory = intentRatesBySport.get(sport);

        // Determine moment types to forecast for this sport
        const momentTypesToForecast: string[] =
          intentHistory
            ? Object.keys(intentHistory.rates)
            : Object.keys(learnedRates);

        for (const momentType of momentTypesToForecast) {
          let predicted: number;
          let low: number | null = null;
          let high: number | null = null;
          let basisNote: string;
          let confidence: number;

          if (intentHistory && intentHistory.rates[momentType]) {
            // Use observed rates from intent_moments history
            const r = intentHistory.rates[momentType];
            predicted = Math.round(gameCount * r.mean);
            low = Math.round(gameCount * r.low);
            high = Math.round(gameCount * r.high);
            basisNote = intentHistory.basis;
            confidence = Math.min(r.sample_games / 50, 0.95) * (1 - dayOffset * 0.04);
          } else if (intentHistory === null) {
            // Insufficient history for this sport — use hardcoded with wide band
            const rate = learnedRates[momentType] ?? 0.3;
            predicted = Math.round(gameCount * rate);
            // Wide band: ±50% to signal high uncertainty
            low = Math.round(predicted * 0.5);
            high = Math.round(predicted * 1.5);
            basisNote = `Statistical projection (insufficient history — <${MIN_SAMPLE_GAMES} comparable games)`;
            confidence = Math.max(0.1, dayConfidence * 0.5); // lower confidence
          } else {
            // momentType not in intent_moments history for this sport — use learned rate
            const rate = learnedRates[momentType] ?? 0;
            predicted = Math.round(gameCount * rate);
            basisNote = intentHistory?.basis ?? "Statistical projection";
            confidence = Math.max(0.1, dayConfidence);
          }

          forecasts.push({
            forecast_date: dateStr,
            moment_type: momentType,
            league,
            predicted_moments: predicted,
            predicted_eligible_users: Math.round(predicted * avgUsersPerGame),
            confidence: Math.max(0.05, confidence),
            games_scheduled: gameCount,
            predicted_moments_low: low,
            predicted_moments_high: high,
            basis_note: basisNote,
          });
        }
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
