// poll-summary: Game summary stats from Sportradar
// Trigger: Called by poll-boxscore orchestrator every 2 minutes for active games

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload } from "../_shared/utils.ts";
import {
  fetchSummary as fetchSportradarSummary,
  fetchSummaryForSport,
  fetchMLBSummary,
  resetCallCount,
  getCallCount,
} from "../_shared/sportradar.ts";
import type {
  SportradarSummaryResponse,
  SportradarMLBSummaryResponse,
} from "../_shared/sportradar.ts";


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

/** Extract and structure an MLB Sportradar summary for storage and alert evaluation */
function extractMLBSummary(sr: SportradarMLBSummaryResponse): Record<string, unknown> {
  const extractPitcher = (p: any) => ({
    name: p?.full_name ?? "",
    pitch_count: p?.statistics?.pitching?.pitch_count ?? 0,
    innings_pitched: p?.statistics?.pitching?.innings_pitched ?? 0,
    earned_runs: p?.statistics?.pitching?.earned_runs ?? 0,
    hits_allowed: p?.statistics?.pitching?.hits ?? 0,
    walks: p?.statistics?.pitching?.walks ?? 0,
    strikeouts: p?.statistics?.pitching?.strikeouts ?? 0,
    era: p?.statistics?.pitching?.era ?? null,
    whip: p?.statistics?.pitching?.whip ?? null,
  });

  const extractBatter = (b: any) => ({
    name: b?.full_name ?? "",
    at_bats: b?.statistics?.hitting?.at_bats ?? 0,
    hits: b?.statistics?.hitting?.hits ?? 0,
    rbi: b?.statistics?.hitting?.rbi ?? 0,
    home_runs: b?.statistics?.hitting?.home_runs ?? 0,
    walks: b?.statistics?.hitting?.walks ?? 0,
    avg: b?.statistics?.hitting?.avg ?? null,
    ops: b?.statistics?.hitting?.ops ?? null,
  });

  return {
    source: "sportradar_mlb",
    game_id: sr.id,
    status: sr.status,
    current_inning: sr.inning,
    inning_half: sr.inning_half,
    outs: sr.outs,
    runners_on_base: (sr.runners_on_base ?? []).map((r: any) => ({
      base: r.base,
      player: r.player?.full_name ?? "",
    })),
    home: {
      runs: sr.home?.runs ?? 0,
      hits: sr.home?.hits ?? 0,
      errors: sr.home?.errors ?? 0,
      starting_pitcher: extractPitcher(sr.home?.starting_pitcher),
      pitchers: (sr.home?.pitchers ?? []).map(extractPitcher),
      lineup: (sr.home?.batters ?? []).slice(0, 9).map(extractBatter),
    },
    away: {
      runs: sr.away?.runs ?? 0,
      hits: sr.away?.hits ?? 0,
      errors: sr.away?.errors ?? 0,
      starting_pitcher: extractPitcher(sr.away?.starting_pitcher),
      pitchers: (sr.away?.pitchers ?? []).map(extractPitcher),
      lineup: (sr.away?.batters ?? []).slice(0, 9).map(extractBatter),
    },
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
      sport: string;
      sportradar_id: string | null;
      coverage_level: string | null;
    }>;

    if (body.gameId) {
      const { data, error } = await supabase
        .from("games")
        .select("id, sport, sportradar_id, coverage_level")
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
        .select("id, sport, sportradar_id, coverage_level")
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

    for (const game of gamesToPoll) {
      try {
        const sport = game.sport ?? "ncaam";
        const isMlb = sport === "mlb";
        let payloadToStore: Record<string, unknown> | null = null;
        let snapshotType = "summary";
        let source = "sportradar";

        if (isMlb && game.sportradar_id) {
          // MLB: use MLB-specific Sportradar summary endpoint
          try {
            const mlbSummary = await fetchMLBSummary(game.sportradar_id);
            payloadToStore = extractMLBSummary(mlbSummary);
            snapshotType = "sportradar_summary_mlb";
            source = "sportradar_mlb";
            sportradarCount++;

            // Upsert mlb_game_stats table from this summary
            const p = payloadToStore as any;
            const newHash = hashPayload(p);
            await supabase.from("mlb_game_stats").upsert({
              game_id: game.id,
              home_runs: p.home?.runs ?? 0,
              away_runs: p.away?.runs ?? 0,
              home_hits: p.home?.hits ?? 0,
              away_hits: p.away?.hits ?? 0,
              home_errors: p.home?.errors ?? 0,
              away_errors: p.away?.errors ?? 0,
              current_inning: p.current_inning ?? null,
              inning_half: p.inning_half ?? null,
              outs: p.outs ?? 0,
              runners_on_base: p.runners_on_base ?? [],
              home_starter_name: p.home?.starting_pitcher?.name ?? null,
              home_starter_pitches: p.home?.starting_pitcher?.pitch_count ?? 0,
              home_starter_hits_allowed: p.home?.starting_pitcher?.hits_allowed ?? 0,
              home_starter_runs_allowed: p.home?.starting_pitcher?.earned_runs ?? 0,
              home_starter_strikeouts: p.home?.starting_pitcher?.strikeouts ?? 0,
              home_starter_walks: p.home?.starting_pitcher?.walks ?? 0,
              away_starter_name: p.away?.starting_pitcher?.name ?? null,
              away_starter_pitches: p.away?.starting_pitcher?.pitch_count ?? 0,
              away_starter_hits_allowed: p.away?.starting_pitcher?.hits_allowed ?? 0,
              away_starter_runs_allowed: p.away?.starting_pitcher?.earned_runs ?? 0,
              away_starter_strikeouts: p.away?.starting_pitcher?.strikeouts ?? 0,
              away_starter_walks: p.away?.starting_pitcher?.walks ?? 0,
              // No-hitter: if hits_allowed == 0 after inning 6
              home_no_hitter_active: (p.away?.starting_pitcher?.hits_allowed ?? 0) === 0 && (p.current_inning ?? 0) >= 7,
              away_no_hitter_active: (p.home?.starting_pitcher?.hits_allowed ?? 0) === 0 && (p.current_inning ?? 0) >= 7,
              payload_hash: newHash,
              updated_at: new Date().toISOString(),
            }, { onConflict: "game_id" });
          } catch (e) {
            console.warn(`Sportradar MLB summary failed for ${game.sportradar_id}:`, e);
          }
        } else if (!isMlb && game.sportradar_id) {
          // Basketball (NCAA or NBA) — use sport-aware endpoint
          try {
            const summary = sport === "nba"
              ? await fetchSummaryForSport("nba", game.sportradar_id)
              : await fetchSportradarSummary(game.sportradar_id);
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

        // SportsDataIO summary fallback removed 2026-08-20 (owner decision: NORMA
        // uses ESPN, not SportsDataIO). Sportradar is now the sole summary source;
        // games it cannot cover are skipped by the guard below.

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
