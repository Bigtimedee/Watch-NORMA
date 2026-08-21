// poll-pbp: Play-by-play events from Sportradar
// Trigger: Called by poll-boxscore orchestrator for active games

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload } from "../_shared/utils.ts";
import {
  fetchPbp as fetchSportradarPbp,
  fetchPbpForSport,
  fetchMLBPbp,
  resetCallCount,
  getCallCount,
} from "../_shared/sportradar.ts";
import type {
  SportradarPbpResponse,
  SportradarPbpEvent,
  SportradarMLBPbpResponse,
  SportradarMLBPbpEvent,
} from "../_shared/sportradar.ts";


/** Parse Sportradar PBP events into structured format for alert evaluation */
function parseSportradarEvents(pbp: SportradarPbpResponse): Record<string, unknown> {
  const scoringPlays: Array<{
    clock: string;
    period: number;
    team: string;
    player: string;
    points: number;
    description: string;
    home_points: number;
    away_points: number;
  }> = [];

  const runs: Array<{
    team: string;
    points: number;
    startClock: string;
    endClock: string;
    period: number;
  }> = [];

  const fouls: Array<{
    clock: string;
    period: number;
    team: string;
    player: string;
    description: string;
  }> = [];

  const timeouts: Array<{
    clock: string;
    period: number;
    team: string;
  }> = [];

  // Track runs (consecutive scoring by one team)
  let currentRunTeam: string | null = null;
  let currentRunPoints = 0;
  let runStartClock = "";
  let runEndClock = "";
  let runPeriod = 0;

  for (const period of pbp.periods ?? []) {
    for (const event of period.events ?? []) {
      // Scoring plays
      if (event.scoring_play && event.points && event.points > 0) {
        const teamName = event.attribution?.name ?? event.attribution?.market ?? "Unknown";
        scoringPlays.push({
          clock: event.clock,
          period: period.number,
          team: teamName,
          player: event.player?.full_name ?? "Unknown",
          points: event.points,
          description: event.description,
          home_points: event.home_points ?? 0,
          away_points: event.away_points ?? 0,
        });

        // Track runs
        if (teamName === currentRunTeam) {
          currentRunPoints += event.points;
          runEndClock = event.clock;
        } else {
          // Save previous run if significant
          if (currentRunTeam && currentRunPoints >= 6) {
            runs.push({
              team: currentRunTeam,
              points: currentRunPoints,
              startClock: runStartClock,
              endClock: runEndClock,
              period: runPeriod,
            });
          }
          currentRunTeam = teamName;
          currentRunPoints = event.points;
          runStartClock = event.clock;
          runEndClock = event.clock;
          runPeriod = period.number;
        }
      } else if (event.scoring_play === false && event.attribution) {
        // Non-scoring play by a team breaks the run for the OTHER team
        const teamName = event.attribution?.name ?? "";
        if (teamName !== currentRunTeam && currentRunTeam) {
          if (currentRunPoints >= 6) {
            runs.push({
              team: currentRunTeam,
              points: currentRunPoints,
              startClock: runStartClock,
              endClock: runEndClock,
              period: runPeriod,
            });
          }
          currentRunTeam = null;
          currentRunPoints = 0;
        }
      }

      // Fouls
      if (event.type === "foul" || event.type === "personalfoul") {
        fouls.push({
          clock: event.clock,
          period: period.number,
          team: event.attribution?.name ?? "Unknown",
          player: event.player?.full_name ?? "Unknown",
          description: event.description,
        });
      }

      // Timeouts
      if (event.type === "timeout") {
        timeouts.push({
          clock: event.clock,
          period: period.number,
          team: event.attribution?.name ?? "Unknown",
        });
      }
    }
  }

  // Don't forget the last run
  if (currentRunTeam && currentRunPoints >= 6) {
    runs.push({
      team: currentRunTeam,
      points: currentRunPoints,
      startClock: runStartClock,
      endClock: runEndClock,
      period: runPeriod,
    });
  }

  return {
    source: "sportradar",
    totalScoringPlays: scoringPlays.length,
    recentScoringPlays: scoringPlays.slice(-20),
    runs: runs.filter((r) => r.points >= 8), // Only significant runs
    fouls,
    timeouts,
  };
}

/** Parse Sportradar MLB PBP into structured format for alert evaluation */
function parseMLBPbpEvents(pbp: SportradarMLBPbpResponse): Record<string, unknown> {
  const scoringPlays: Array<{
    inning: number;
    inning_half: string;
    description: string;
    home_runs: number;
    away_runs: number;
  }> = [];

  const pitchCounts: Record<string, number> = {}; // pitcher_name -> count
  const runnersOnBase: Array<{ base: number; player: string }> = [];
  let currentOuts = 0;
  let currentInning = 0;
  let currentHalf = "T";
  let noHitterActive = false;
  let hitsAllowed = 0;

  for (const inning of pbp.innings ?? []) {
    for (const event of inning.events ?? []) {
      // Track current game state
      currentInning = event.inning ?? inning.number;
      currentHalf = event.half_inning ?? "T";
      if (event.outs != null) currentOuts = event.outs;

      // Track runners
      if (event.runners) {
        // Rebuild runners from the latest event that has runner info
        runnersOnBase.length = 0;
        for (const r of event.runners) {
          if (r.ending_base && r.ending_base <= 3) {
            runnersOnBase.push({ base: r.ending_base, player: r.player?.full_name ?? "" });
          }
        }
      }

      // Track pitch counts
      if (event.pitcher?.full_name && event.pitcher.pitch_count) {
        pitchCounts[event.pitcher.full_name] = event.pitcher.pitch_count;
      }

      // Scoring plays
      if (event.type === "run_scored") {
        scoringPlays.push({
          inning: event.inning ?? inning.number,
          inning_half: event.half_inning ?? "T",
          description: event.description ?? "",
          home_runs: event.home_runs ?? 0,
          away_runs: event.away_runs ?? 0,
        });
      }

      // Track hits for no-hitter detection
      if (event.type === "at_bat_complete" && event.pitch_result === "in_play") {
        hitsAllowed++;
      }
    }
  }

  noHitterActive = hitsAllowed === 0 && currentInning >= 6;

  return {
    source: "sportradar_mlb",
    scoringPlays: scoringPlays.slice(-10),
    pitchCounts,
    currentInning,
    currentHalf,
    currentOuts,
    runnersOnBase,
    noHitterActive,
    hitsAllowed,
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

    // Accept optional gameId from orchestrator, otherwise fetch all active
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
        .in("status", ["inprogress"]);
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
        let snapshotType = "pbp";
        let source = "sportradar";

        if (isMlb && game.sportradar_id) {
          // MLB PBP — use MLB-specific Sportradar endpoint
          try {
            const mlbPbp = await fetchMLBPbp(game.sportradar_id);
            payloadToStore = parseMLBPbpEvents(mlbPbp);
            snapshotType = "pbp_mlb";
            source = "sportradar_mlb";
            sportradarCount++;
          } catch (e) {
            console.warn(`Sportradar MLB PBP failed for ${game.sportradar_id}:`, e);
            // No fallback — skip if Sportradar fails
          }
        } else if (!isMlb && game.coverage_level === "full" && game.sportradar_id) {
          // Basketball (NCAA or NBA) — use sport-aware Sportradar endpoint
          try {
            const pbp = sport === "nba"
              ? await fetchPbpForSport("nba", game.sportradar_id)
              : await fetchSportradarPbp(game.sportradar_id);
            payloadToStore = parseSportradarEvents(pbp);
            snapshotType = "pbp";
            source = "sportradar";
            sportradarCount++;
          } catch (e) {
            console.warn(
              `Sportradar PBP failed for ${game.sportradar_id}, skipping:`,
              e
            );
          }
        }

        // SportsDataIO PBP fallback removed 2026-08-20 (owner decision: NORMA uses
        // ESPN, not SportsDataIO). Sportradar is now the sole PBP source; games it
        // cannot cover are skipped by the guard below.

        if (!payloadToStore) continue;

        const payloadHash = hashPayload(payloadToStore);

        // Check for duplicate
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

        // Update last_pbp_source on the game
        await supabase
          .from("games")
          .update({ last_pbp_source: source })
          .eq("id", game.id);

        // Insert normalized events into game_events table
        if (source === "sportradar" && payloadToStore) {
          try {
            const p = payloadToStore as any;
            const scoringPlays = p.recentScoringPlays ?? [];

            if (scoringPlays.length > 0) {
              // Get the max sequence already stored for this game
              const { data: maxSeqRow } = await supabase
                .from("game_events")
                .select("sequence")
                .eq("game_id", game.id)
                .order("sequence", { ascending: false })
                .limit(1);

              const maxSeq = maxSeqRow?.[0]?.sequence ?? 0;

              // Only insert events with sequence > maxSeq
              const newEvents = scoringPlays
                .map((sp: any, idx: number) => ({
                  game_id: game.id,
                  sequence: maxSeq + idx + 1,
                  event_type: sp.points === 3 ? "threepointmade" : sp.points === 2 ? "twopointmade" : "freethrowmade",
                  clock: sp.clock,
                  period: sp.period,
                  team_id: null, // We don't have sportradar team IDs in scoring plays
                  player_name: sp.player,
                  points: sp.points,
                  scoring_play: true,
                  home_score_after: sp.home_points,
                  away_score_after: sp.away_points,
                  description: sp.description,
                }));

              if (newEvents.length > 0) {
                await supabase
                  .from("game_events")
                  .upsert(newEvents, { onConflict: "game_id,sequence", ignoreDuplicates: true });
                // Non-critical event upsert — errors handled by outer try/catch
              }
            }
          } catch (e) {
            console.warn(`Failed to normalize PBP events for ${game.id}:`, e);
          }
        }

        storedCount++;
      } catch (e) {
        console.error(`Error fetching PBP for game ${game.id}:`, e);
      }
    }

    const result = {
      success: true,
      activeGames: gamesToPoll.length,
      stored: storedCount,
      sportradarPbp: sportradarCount,
      sportradarApiCalls: getCallCount(),
    };

    console.log(JSON.stringify({
      function: "poll-pbp",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("poll-pbp error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
