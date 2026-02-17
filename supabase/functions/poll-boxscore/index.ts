// poll-boxscore: Live score updates from SportsDataIO
// Trigger: pg_cron every 15 seconds during active game windows

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SPORTSDATAIO_BASE = "https://api.sportsdata.io/v3/cbb";
const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_API_KEY")!;

function hashPayload(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

function mapStatus(sdioStatus: string, isClosed: boolean): string {
  if (isClosed) return "closed";
  const s = sdioStatus?.toLowerCase() ?? "";
  if (s === "inprogress" || s === "in progress") return "inprogress";
  if (s === "halftime" || s === "half") return "halftime";
  if (s === "final" || s === "f" || s === "f/ot") return "closed";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "postponed") return "postponed";
  return s || "scheduled";
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

    // Get currently active games
    const { data: activeGames, error: fetchError } = await supabase
      .from("games")
      .select("id, sportsdataio_id, snapshot_hash")
      .in("status", ["inprogress", "halftime"]);

    if (fetchError) throw fetchError;
    if (!activeGames || activeGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active games", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let updatedCount = 0;
    const evaluateAlertCalls: string[] = [];

    for (const game of activeGames) {
      if (!game.sportsdataio_id) continue;

      try {
        // Fetch box score from SportsDataIO
        const boxUrl = `${SPORTSDATAIO_BASE}/stats/json/BoxScore/${game.sportsdataio_id}?key=${SPORTSDATAIO_KEY}`;
        const boxRes = await fetch(boxUrl);

        if (!boxRes.ok) {
          console.warn(`Box score fetch failed for game ${game.sportsdataio_id}: ${boxRes.status}`);
          continue;
        }

        const boxScore = await boxRes.json();
        const gameData = boxScore.Game;
        if (!gameData) continue;

        // Compute hash for dedup
        const scoreData = {
          homeScore: gameData.HomeTeamScore,
          awayScore: gameData.AwayTeamScore,
          period: gameData.Period,
          timeRemMins: gameData.TimeRemainingMinutes,
          timeRemSecs: gameData.TimeRemainingSeconds,
          status: gameData.Status,
          isClosed: gameData.IsClosed,
        };
        const newHash = hashPayload(scoreData);

        if (newHash === game.snapshot_hash) {
          continue; // No change
        }

        const clock =
          gameData.TimeRemainingMinutes != null &&
          gameData.TimeRemainingSeconds != null
            ? `${gameData.TimeRemainingMinutes}:${String(gameData.TimeRemainingSeconds).padStart(2, "0")}`
            : null;

        // Update game row
        const { error: updateError } = await supabase
          .from("games")
          .update({
            home_score: gameData.HomeTeamScore ?? 0,
            away_score: gameData.AwayTeamScore ?? 0,
            clock,
            period: gameData.Period ? parseInt(gameData.Period) || null : null,
            status: mapStatus(gameData.Status, gameData.IsClosed),
            snapshot_hash: newHash,
            updated_at: new Date().toISOString(),
          })
          .eq("id", game.id);

        if (updateError) {
          console.error(`Failed to update game ${game.id}:`, updateError);
          continue;
        }

        // Store snapshot
        await supabase.from("game_snapshots").insert({
          game_id: game.id,
          snapshot_type: "boxscore",
          payload: boxScore,
          payload_hash: newHash,
        });

        updatedCount++;
        evaluateAlertCalls.push(game.id);
      } catch (e) {
        console.error(`Error processing game ${game.sportsdataio_id}:`, e);
      }
    }

    // Trigger alert evaluation for updated games
    for (const gameId of evaluateAlertCalls) {
      try {
        await supabase.functions.invoke("evaluate-alerts", {
          body: { gameId },
        });
      } catch (e) {
        console.warn(`Failed to invoke evaluate-alerts for ${gameId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        activeGames: activeGames.length,
        updated: updatedCount,
        alertsTriggered: evaluateAlertCalls.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("poll-boxscore error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
