// poll-boxscore: Smart polling orchestrator — live score updates + cost-aware dispatch
// Trigger: pg_cron every 1 minute during active game windows
//
// Uses ESPN as the PRIMARY score source (free, reliable, always correct).
// Falls back to SportsDataIO /scores/json/GamesByDate for games ESPN doesn't cover.
// SportsDataIO scores freeze at mid-game values on free/trial tiers, so ESPN
// is critical for accurate final scores.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload, mapStatus } from "../_shared/utils.ts";
import {
  shouldPollPbp,
  shouldPollSummary,
  markPbpPolled,
  markSummaryPolled,
  isTerminalStatus,
} from "../_shared/polling-state.ts";

const SPORTSDATAIO_BASE = "https://api.sportsdata.io/v3/cbb";
const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_API_KEY")!;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

/** Convert a UTC ISO timestamp to an Eastern-date YYYY-MM-DD string.
 *  SportsDataIO indexes games by Eastern date, so we must convert. */
function utcToEasternDate(utcIso: string): string {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const dd = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${dd}`;
}

/** Convert a date to YYYYMMDD format for ESPN API */
function toEspnDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

interface ESPNGameData {
  homeScore: number;
  awayScore: number;
  status: string;
  homeDisplayName: string;
  awayDisplayName: string;
}

/** Fetch all scores from ESPN for a given Eastern date */
async function fetchEspnGames(easternDate: string): Promise<ESPNGameData[]> {
  const games: ESPNGameData[] = [];
  try {
    const espnDate = toEspnDate(easternDate);
    const res = await fetch(`${ESPN_BASE}/scoreboard?dates=${espnDate}&groups=50&limit=300`);
    if (!res.ok) return games;
    const data = await res.json();
    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const away = comp.competitors?.find((c: any) => c.homeAway === "away");
      const home = comp.competitors?.find((c: any) => c.homeAway === "home");
      if (!away || !home) continue;
      const awayS = away.score;
      const homeS = home.score;
      games.push({
        homeScore: typeof homeS === "object" ? parseInt(homeS?.displayValue ?? "0") : parseInt(homeS ?? "0"),
        awayScore: typeof awayS === "object" ? parseInt(awayS?.displayValue ?? "0") : parseInt(awayS ?? "0"),
        status: comp.status?.type?.description ?? "Unknown",
        homeDisplayName: home.team?.displayName ?? "",
        awayDisplayName: away.team?.displayName ?? "",
      });
    }
  } catch (e) {
    console.warn("ESPN fetch failed (non-critical):", e);
  }
  return games;
}

/** Normalize a string for fuzzy matching: lowercase, strip accents, remove punctuation */
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Check if two team references likely refer to the same team using word overlap */
function teamsMatch(dbName: string, espnDisplayName: string): boolean {
  const normDb = normalize(dbName);
  const normEspn = normalize(espnDisplayName);
  if (normEspn.includes(normDb) || normDb.includes(normEspn)) return true;
  const dbWords = normDb.split(" ").filter(w => w.length > 1);
  const espnWords = normEspn.split(" ").filter(w => w.length > 1);
  const shorter = dbWords.length <= espnWords.length ? dbWords : espnWords;
  const longer = dbWords.length <= espnWords.length ? espnWords : dbWords;
  const longerStr = longer.join(" ");
  const matches = shorter.filter(w => longerStr.includes(w)).length;
  return shorter.length > 0 && matches / shorter.length >= 0.5;
}

/** Match a game to ESPN data by team name (handles abbreviation differences) */
function findEspnMatch(
  espnGames: ESPNGameData[],
  homeTeamMarket: string,
  awayTeamMarket: string,
  homeTeamFullName?: string,
  awayTeamFullName?: string,
): ESPNGameData | null {
  for (const espn of espnGames) {
    const homeMatch = teamsMatch(homeTeamMarket, espn.homeDisplayName) ||
      (homeTeamFullName ? teamsMatch(homeTeamFullName, espn.homeDisplayName) : false);
    const awayMatch = teamsMatch(awayTeamMarket, espn.awayDisplayName) ||
      (awayTeamFullName ? teamsMatch(awayTeamFullName, espn.awayDisplayName) : false);
    if (homeMatch && awayMatch) return espn;
  }
  return null;
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

    // Get active games + scheduled games whose start time has passed (they may have started)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: activeGames, error: fetchError } = await supabase
      .from("games")
      .select("id, sportsdataio_id, sportradar_id, coverage_level, snapshot_hash, status, scheduled_at, home_team:teams!games_home_team_id_fkey(abbreviation,market,name), away_team:teams!games_away_team_id_fkey(abbreviation,market,name)")
      .or(`status.in.("inprogress","halftime"),and(status.eq.scheduled,scheduled_at.lte.${fiveMinAgo})`);

    if (fetchError) throw fetchError;
    if (!activeGames || activeGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active games", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect all unique EASTERN dates we need to fetch scores for.
    // SportsDataIO indexes games by Eastern date, not UTC date.
    const datesToFetch = new Set<string>();
    for (const game of activeGames) {
      if (game.scheduled_at) {
        const easternDate = utcToEasternDate(game.scheduled_at);
        datesToFetch.add(easternDate);
      }
    }

    // Fetch ESPN scores for all relevant dates (primary source — always accurate)
    const espnGamesByDate: Map<string, ESPNGameData[]> = new Map();
    for (const dateStr of datesToFetch) {
      const espnGames = await fetchEspnGames(dateStr);
      espnGamesByDate.set(dateStr, espnGames);
    }

    // Fetch SportsDataIO scores as fallback (for status/period/clock info and games ESPN misses)
    const scoresByGameId: Record<number, {
      HomeTeamScore: number | null;
      AwayTeamScore: number | null;
      Status: string;
      IsClosed: boolean;
      Period: string | null;
      TimeRemainingMinutes: number | null;
      TimeRemainingSeconds: number | null;
      HomeTeam: string;
      AwayTeam: string;
    }> = {};

    for (const dateStr of datesToFetch) {
      const url = `${SPORTSDATAIO_BASE}/scores/json/GamesByDate/${dateStr}?key=${SPORTSDATAIO_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`GamesByDate fetch failed for ${dateStr}: ${res.status}`);
        continue;
      }
      const games = await res.json();
      for (const g of games) {
        scoresByGameId[g.GameID] = {
          HomeTeamScore: g.HomeTeamScore,
          AwayTeamScore: g.AwayTeamScore,
          Status: g.Status,
          IsClosed: g.IsClosed,
          Period: g.Period,
          TimeRemainingMinutes: g.TimeRemainingMinutes,
          TimeRemainingSeconds: g.TimeRemainingSeconds,
          HomeTeam: g.HomeTeam,
          AwayTeam: g.AwayTeam,
        };
      }
    }

    let updatedCount = 0;
    const evaluateAlertCalls: string[] = [];
    let pbpDispatched = 0;
    let summaryDispatched = 0;

    for (const game of activeGames) {
      if (!game.sportsdataio_id) continue;

      const gameData = scoresByGameId[game.sportsdataio_id];
      if (!gameData) continue;

      try {
        // Try to get ESPN scores for cross-reference (ESPN is always accurate)
        const easternDate = game.scheduled_at ? utcToEasternDate(game.scheduled_at) : null;
        const espnDateGames = easternDate ? espnGamesByDate.get(easternDate) ?? [] : [];

        // Match by team name (handles abbreviation differences like AKRON vs AKR, NC State, San José)
        const homeMarket = (game as any).home_team?.market ?? "";
        const awayMarket = (game as any).away_team?.market ?? "";
        const homeFullName = (game as any).home_team?.name ?? "";
        const awayFullName = (game as any).away_team?.name ?? "";
        const espnData = findEspnMatch(espnDateGames, homeMarket, awayMarket, homeFullName, awayFullName);

        // Determine best scores: prefer ESPN if game is closed/final (SportsDataIO freezes scores)
        let bestHomeScore = gameData.HomeTeamScore ?? 0;
        let bestAwayScore = gameData.AwayTeamScore ?? 0;
        const newStatus = mapStatus(gameData.Status, gameData.IsClosed);

        if (espnData && (espnData.status === "Final" || newStatus === "closed")) {
          bestHomeScore = espnData.homeScore;
          bestAwayScore = espnData.awayScore;
          console.log(`[ESPN] Using ESPN scores for ${awayMarket}@${homeMarket}: ${bestAwayScore}-${bestHomeScore} (SDIO had ${gameData.AwayTeamScore}-${gameData.HomeTeamScore})`);
        } else if (espnData && espnData.homeScore + espnData.awayScore > bestHomeScore + bestAwayScore) {
          bestHomeScore = espnData.homeScore;
          bestAwayScore = espnData.awayScore;
        }

        // Compute hash for dedup
        const scoreData = {
          homeScore: bestHomeScore,
          awayScore: bestAwayScore,
          period: gameData.Period,
          timeRemMins: gameData.TimeRemainingMinutes,
          timeRemSecs: gameData.TimeRemainingSeconds,
          status: gameData.Status,
          isClosed: gameData.IsClosed,
        };
        const newHash = hashPayload(scoreData);

        if (newHash === game.snapshot_hash) {
          // No change — still check if we should poll PBP/summary
        } else {
          const clock =
            gameData.TimeRemainingMinutes != null &&
            gameData.TimeRemainingSeconds != null
              ? `${gameData.TimeRemainingMinutes}:${String(gameData.TimeRemainingSeconds).padStart(2, "0")}`
              : null;

          // Update game row
          const { error: updateError } = await supabase
            .from("games")
            .update({
              home_score: bestHomeScore,
              away_score: bestAwayScore,
              clock,
              period: gameData.Period ? parseInt(gameData.Period) || null : null,
              status: newStatus,
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
            snapshot_type: "scores",
            payload: { Game: gameData },
            payload_hash: newHash,
          });

          updatedCount++;
          evaluateAlertCalls.push(game.id);

          // Handle terminal status transitions
          if (isTerminalStatus(newStatus)) {
            if (newStatus === "closed") {
              try {
                await supabase.functions.invoke("resolve-wagers", {
                  body: { gameId: game.id },
                });
              } catch (e) {
                console.warn(`Failed to invoke resolve-wagers for ${game.id}:`, e);
              }

              try {
                await supabase.functions.invoke("poll-summary", {
                  body: { gameId: game.id },
                });
              } catch (e) {
                console.warn(`Failed to invoke final poll-summary for ${game.id}:`, e);
              }
            }

            continue;
          }
        }

        // Cost-aware PBP dispatch
        if (game.coverage_level === "full" && game.sportradar_id) {
          const { data: lastPbp } = await supabase
            .from("game_snapshots")
            .select("created_at")
            .eq("game_id", game.id)
            .eq("snapshot_type", "pbp")
            .order("created_at", { ascending: false })
            .limit(1);

          const lastPbpTime = lastPbp?.[0]?.created_at ?? null;

          if (shouldPollPbp(game.id, game.coverage_level, lastPbpTime)) {
            try {
              await supabase.functions.invoke("poll-pbp", {
                body: { gameId: game.id },
              });
              markPbpPolled(game.id);
              pbpDispatched++;
            } catch (e) {
              console.warn(`Failed to invoke poll-pbp for ${game.id}:`, e);
            }
          }
        }

        // Cost-aware summary dispatch (every 2 min)
        const { data: lastSummary } = await supabase
          .from("game_snapshots")
          .select("created_at")
          .eq("game_id", game.id)
          .in("snapshot_type", ["summary", "sportradar_summary"])
          .order("created_at", { ascending: false })
          .limit(1);

        const lastSummaryTime = lastSummary?.[0]?.created_at ?? null;

        if (shouldPollSummary(game.id, lastSummaryTime)) {
          try {
            await supabase.functions.invoke("poll-summary", {
              body: { gameId: game.id },
            });
            markSummaryPolled(game.id);
            summaryDispatched++;
          } catch (e) {
            console.warn(`Failed to invoke poll-summary for ${game.id}:`, e);
          }
        }
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
        pbpDispatched,
        summaryDispatched,
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
