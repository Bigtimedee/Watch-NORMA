// poll-summary: Full stats snapshot from SportsDataIO
// Trigger: pg_cron every 2 minutes for inprogress games, once at close

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get active games
    const { data: activeGames, error } = await supabase
      .from("games")
      .select("id, sportsdataio_id")
      .in("status", ["inprogress", "halftime"]);

    if (error) throw error;
    if (!activeGames || activeGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active games", stored: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let storedCount = 0;

    for (const game of activeGames) {
      if (!game.sportsdataio_id) continue;

      try {
        const url = `${SPORTSDATAIO_BASE}/stats/json/BoxScore/${game.sportsdataio_id}?key=${SPORTSDATAIO_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.warn(`Summary fetch failed for ${game.sportsdataio_id}: ${res.status}`);
          continue;
        }

        const summary = await res.json();
        const payloadHash = hashPayload(summary);

        // Check if we already stored this exact snapshot
        const { data: existing } = await supabase
          .from("game_snapshots")
          .select("id")
          .eq("game_id", game.id)
          .eq("snapshot_type", "summary")
          .eq("payload_hash", payloadHash)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("game_snapshots").insert({
          game_id: game.id,
          snapshot_type: "summary",
          payload: summary,
          payload_hash: payloadHash,
        });

        storedCount++;
      } catch (e) {
        console.error(`Error fetching summary for game ${game.sportsdataio_id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        activeGames: activeGames.length,
        stored: storedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("poll-summary error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
