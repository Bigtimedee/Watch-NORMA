// poll-summary: Game summary stats — dual-source (Sportradar for richer stats, SportsDataIO fallback)
// Trigger: Called by poll-boxscore orchestrator every 2 minutes for active games

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload } from "../_shared/utils.ts";
import {
  fetchSummary as fetchSportradarSummary,
  resetCallCount,
  getCallCount,
} from "../_shared/sportradar.ts";
import type { SportradarSummaryResponse } from "../_shared/sportradar.ts";

/** Extract the most useful stats from a Sportradar summary for alert evaluation */
function extractSportradarSummary(
  sr: SportradarSummaryResponse
): Record<string, unknown> {
  const extractTeam = (team: SportradarSummaryResponse["home"]) => ({
    points: team.points,
    field_goals_made: team.statistics.field_goals_made,
    field_goals_att: team.statistics.field_goals_att,
    field_goals_pct: team.statistics.field_goals_pct,
    three_points_made: team.statistics.three_points_made,
    three_points_att: team.statistics.three_points_att,
    free_throws_made: team.statistics.free_throws_made,
    free_throws_att: team.statistics.free_throws_att,
    rebounds: team.statistics.rebounds,
    assists: team.statistics.assists,
    turnovers: team.statistics.turnovers,
    steals: team.statistics.steals,
    blocks: team.statistics.blocks,
    bench_points: team.statistics.bench_points ?? 0,
    points_off_turnovers: team.statistics.points_off_turnovers ?? 0,
    biggest_lead: team.statistics.biggest_lead ?? 0,
    fast_break_points: team.statistics.fast_break_points ?? 0,
    second_chance_points: team.statistics.second_chance_points ?? 0,
    effective_fg_pct: team.statistics.effective_fg_pct ?? 0,
    true_shooting_pct: team.statistics.true_shooting_pct ?? 0,
    players: (team.players ?? []).map((p) => ({
      full_name: p.full_name,
      jersey_number: p.jersey_number,
      starter: p.starter,
      played: p.played,
      on_court: p.on_court,
      fouled_out: p.fouled_out,
      ejected: p.ejected,
      minutes: p.statistics.minutes,
      personal_fouls: p.statistics.personal_fouls,
      points: p.statistics.points,
      rebounds: p.statistics.rebounds,
      assists: p.statistics.assists,
      field_goals_made: p.statistics.field_goals_made,
      field_goals_att: p.statistics.field_goals_att,
    })),
  });

  return {
    source: "sportradar",
    game_id: sr.id,
    status: sr.status,
    coverage: sr.coverage,
    home: extractTeam(sr.home),
    away: extractTeam(sr.away),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    resetCallCount();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept optional gameId from orchestrator
    let body: { gameId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body — fetch all active games
    }

    let gamesToPoll: Array<{
      id: string;
      sportsdataio_id: number | null;
      sportradar_id: string | null;
      coverage_level: string | null;
    }>;

    if (body.gameId) {
      const { data, error } = await supabase
        .from("games")
        .select("id, sportsdataio_id, sportradar_id, coverage_level")
        .eq("id", body.gameId)
        .single();
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Game not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      gamesToPoll = [data];
    } else {
      const { data, error } = await supabase
        .from("games")
        .select("id, sportsdataio_id, sportradar_id, coverage_level")
        .in("status", ["inprogress", "halftime"]);
      if (error) throw error;
      gamesToPoll = data ?? [];
    }

    if (gamesToPoll.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active games", stored: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let storedCount = 0;
    let sportradarCount = 0;
    let sdioCount = 0;

    for (const game of gamesToPoll) {
      try {
        let payloadToStore: Record<string, unknown> | null = null;
        let snapshotType = "summary";
        let source = "sportsdataio";

        // Try Sportradar first for games with sportradar_id
        if (game.sportradar_id) {
          try {
            const summary = await fetchSportradarSummary(game.sportradar_id);
            payloadToStore = extractSportradarSummary(summary);
            snapshotType = "sportradar_summary";
            source = "sportradar";
            sportradarCount++;
          } catch (e) {
            console.warn(
              `Sportradar summary failed for ${game.sportradar_id}, falling back:`,
              e
            );
          }
        }

        // SportsDataIO fallback
        if (!payloadToStore && game.sportsdataio_id) {
          const url = `${SPORTSDATAIO_BASE}/stats/json/BoxScore/${game.sportsdataio_id}?key=${SPORTSDATAIO_KEY}`;
          const res = await fetch(url);

          if (!res.ok) {
            console.warn(`Summary fetch failed for ${game.sportsdataio_id}: ${res.status}`);
            continue;
          }

          payloadToStore = await res.json();
          snapshotType = "summary";
          source = "sportsdataio";
          sdioCount++;
        }

        if (!payloadToStore) continue;

        const payloadHash = hashPayload(payloadToStore);

        // Check if we already stored this exact snapshot
        const { data: existing } = await supabase
          .from("game_snapshots")
          .select("id")
          .eq("game_id", game.id)
          .eq("snapshot_type", snapshotType)
          .eq("payload_hash", payloadHash)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("game_snapshots").insert({
          game_id: game.id,
          snapshot_type: snapshotType,
          payload: payloadToStore,
          payload_hash: payloadHash,
        });

        // Update last_summary_source on the game
        await supabase
          .from("games")
          .update({ last_summary_source: source })
          .eq("id", game.id);

        // Update game_summary_cache with extracted insights
        if (source === "sportradar" && payloadToStore) {
          const p = payloadToStore as any;
          const homePlayers = p.home?.players ?? [];
          const awayPlayers = p.away?.players ?? [];

          // Foul trouble: players with 4+ fouls who haven't fouled out
          const foulTrouble = [
            ...homePlayers
              .filter((pl: any) => pl.personal_fouls >= 4 && !pl.fouled_out)
              .map((pl: any) => ({ player_name: pl.full_name, team_side: "home", fouls: pl.personal_fouls, starter: pl.starter, points: pl.points, on_court: pl.on_court })),
            ...awayPlayers
              .filter((pl: any) => pl.personal_fouls >= 4 && !pl.fouled_out)
              .map((pl: any) => ({ player_name: pl.full_name, team_side: "away", fouls: pl.personal_fouls, starter: pl.starter, points: pl.points, on_court: pl.on_court })),
          ];

          // Top scorers on court (top 4 by points, currently on court)
          const allOnCourt = [
            ...homePlayers.filter((pl: any) => pl.on_court).map((pl: any) => ({ ...pl, team_side: "home" })),
            ...awayPlayers.filter((pl: any) => pl.on_court).map((pl: any) => ({ ...pl, team_side: "away" })),
          ]
            .sort((a: any, b: any) => (b.points ?? 0) - (a.points ?? 0))
            .slice(0, 4)
            .map((pl: any) => ({ player_name: pl.full_name, team_side: pl.team_side, points: pl.points, rebounds: pl.rebounds, assists: pl.assists, on_court: true }));

          const homeBench = p.home?.bench_points ?? 0;
          const awayBench = p.away?.bench_points ?? 0;
          const homeEfg = p.home?.effective_fg_pct ?? 0;
          const awayEfg = p.away?.effective_fg_pct ?? 0;

          await supabase
            .from("game_summary_cache")
            .upsert({
              game_id: game.id,
              payload_hash: payloadHash,
              home_biggest_lead: p.home?.biggest_lead ?? 0,
              away_biggest_lead: p.away?.biggest_lead ?? 0,
              home_bench_points: homeBench,
              away_bench_points: awayBench,
              bench_delta: Math.abs(homeBench - awayBench),
              home_efg_pct: homeEfg,
              away_efg_pct: awayEfg,
              efg_delta: Math.abs(homeEfg - awayEfg),
              home_turnovers: p.home?.turnovers ?? 0,
              away_turnovers: p.away?.turnovers ?? 0,
              foul_trouble: foulTrouble,
              top_scorers_on_court: allOnCourt,
              updated_at: new Date().toISOString(),
            }, { onConflict: "game_id" });
          // Non-critical cache update — errors handled by outer try/catch
        }

        storedCount++;
      } catch (e) {
        console.error(`Error fetching summary for game ${game.id}:`, e);
      }
    }

    const result = {
      success: true,
      activeGames: gamesToPoll.length,
      stored: storedCount,
      sportradarSummary: sportradarCount,
      sdioSummary: sdioCount,
      sportradarApiCalls: getCallCount(),
    };

    console.log(JSON.stringify({
      function: "poll-summary",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
