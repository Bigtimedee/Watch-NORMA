// resolve-wagers: Auto-resolve wagers when games end
// Triggered after poll-boxscore detects a game has status = 'closed'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveWager } from "./logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const gameId = body.gameId as string | undefined;

    // Get recently closed games with active wagers
    let gamesQuery = supabase
      .from("games")
      .select("id, home_score, away_score, home_team_id, away_team_id")
      .eq("status", "closed");

    if (gameId) {
      gamesQuery = gamesQuery.eq("id", gameId);
    }

    const { data: closedGames, error: gamesError } = await gamesQuery;
    if (gamesError) throw gamesError;
    if (!closedGames || closedGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, resolved: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gameIds = closedGames.map((g) => g.id);

    // Get active wagers for these games
    const { data: wagers, error: wagersError } = await supabase
      .from("wagers")
      .select("*")
      .in("game_id", gameIds)
      .eq("status", "active");

    if (wagersError) throw wagersError;
    if (!wagers || wagers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, resolved: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let resolvedCount = 0;

    for (const wager of wagers) {
      const game = closedGames.find((g) => g.id === wager.game_id);
      if (!game) continue;

      const newStatus = resolveWager(game, wager);

      if (newStatus) {
        const { error } = await supabase
          .from("wagers")
          .update({ status: newStatus })
          .eq("id", wager.id);

        if (error) {
          console.warn(`Failed to resolve wager ${wager.id}:`, error);
        } else {
          resolvedCount++;
        }
      }
    }

    const result = {
      success: true,
      gamesProcessed: closedGames.length,
      wagersChecked: wagers.length,
      resolved: resolvedCount,
    };

    console.log(JSON.stringify({
      function: "resolve-wagers",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("resolve-wagers error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
