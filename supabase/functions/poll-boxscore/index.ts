// poll-boxscore: Live score updater
// Trigger: pg_cron every 1 minute
//
// Uses ESPN as the PRIMARY score source (free, reliable, always correct).
// Falls back to SportsDataIO /scores/json/GamesByDate for games ESPN doesn't cover.
//
// v2: This function ONLY handles score updates and terminal events (game close).
// PBP, summary, and alert dispatch are handled by game-watcher-orchestrator.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload, mapStatus } from "../_shared/utils.ts";
import { isTerminalStatus } from "../_shared/polling-state.ts";

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
  clock: string | null;
  period: number;
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
        clock: comp.status?.displayClock ?? null,
        period: comp.status?.period ?? 0,
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

/** Score how well a DB team name matches an ESPN display name.
 *  Returns 0 for no match, higher = better.
 *  Only accepts exact market matches — no prefix/substring matching
 *  to prevent "Purdue" matching "Purdue Fort Wayne" etc. */
function teamMatchScore(dbName: string, espnDisplayName: string): number {
  const normDb = normalize(dbName);
  const normEspn = normalize(espnDisplayName);

  // Extract market portion (drop mascot — last word)
  const dbWords = normDb.split(" ");
  const dbMarket = dbWords.length > 1 ? dbWords.slice(0, -1).join(" ") : normDb;
  const espnWords = normEspn.split(" ");
  const espnMarket = espnWords.length > 1 ? espnWords.slice(0, -1).join(" ") : normEspn;

  // Tier 100: Exact full match
  if (normDb === normEspn) return 100;
  // Tier 90: Exact market match
  if (dbMarket === espnMarket) return 90;
  if (normDb === espnMarket) return 90;
  if (dbMarket === normEspn) return 90;

  // Tier 70: Same word count, all words match both ways (handles abbreviation differences)
  const dbMarketWords = dbMarket.split(" ").filter(w => w.length > 1);
  const espnMarketWords = espnMarket.split(" ").filter(w => w.length > 1);
  if (dbMarketWords.length === espnMarketWords.length && dbMarketWords.length >= 2) {
    const allDbInEspn = dbMarketWords.every(w => espnMarket.includes(w));
    const allEspnInDb = espnMarketWords.every(w => dbMarket.includes(w));
    if (allDbInEspn && allEspnInDb) return 70;
  }

  return 0;
}

/** Boolean convenience: true if score > 0 */
function teamsMatch(dbName: string, espnDisplayName: string): boolean {
  return teamMatchScore(dbName, espnDisplayName) > 0;
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

    // Fetch SportsDataIO scores as fallback
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
    const gamesTransitionedToLive: string[] = [];

    for (const game of activeGames) {
      try {
        const easternDate = game.scheduled_at ? utcToEasternDate(game.scheduled_at) : null;
        const espnDateGames = easternDate ? espnGamesByDate.get(easternDate) ?? [] : [];

        const homeMarket = (game as any).home_team?.market ?? "";
        const awayMarket = (game as any).away_team?.market ?? "";
        const homeFullName = (game as any).home_team?.name ?? "";
        const awayFullName = (game as any).away_team?.name ?? "";
        const espnData = findEspnMatch(espnDateGames, homeMarket, awayMarket, homeFullName, awayFullName);

        const gameData = game.sportsdataio_id
          ? scoresByGameId[game.sportsdataio_id] ?? null
          : null;

        // Need at least one data source
        if (!espnData && !gameData) continue;

        let bestHomeScore: number;
        let bestAwayScore: number;
        let newStatus: string;
        let clock: string | null = null;
        let period: number | null = null;

        if (espnData && gameData) {
          // Both sources available — ESPN scores are more accurate, SDIO for status/clock
          bestHomeScore = espnData.homeScore;
          bestAwayScore = espnData.awayScore;
          newStatus = mapStatus(gameData.Status, gameData.IsClosed);
          clock = gameData.TimeRemainingMinutes != null && gameData.TimeRemainingSeconds != null
            ? `${gameData.TimeRemainingMinutes}:${String(gameData.TimeRemainingSeconds).padStart(2, "0")}`
            : null;
          period = gameData.Period ? parseInt(gameData.Period) || null : null;
        } else if (espnData) {
          // ESPN only — use ESPN clock and period data
          bestHomeScore = espnData.homeScore;
          bestAwayScore = espnData.awayScore;
          newStatus = mapStatus(espnData.status, false);
          clock = espnData.clock;
          period = espnData.period || null;
        } else {
          // SportsDataIO only
          bestHomeScore = gameData!.HomeTeamScore ?? 0;
          bestAwayScore = gameData!.AwayTeamScore ?? 0;
          newStatus = mapStatus(gameData!.Status, gameData!.IsClosed);
          clock = gameData!.TimeRemainingMinutes != null && gameData!.TimeRemainingSeconds != null
            ? `${gameData!.TimeRemainingMinutes}:${String(gameData!.TimeRemainingSeconds).padStart(2, "0")}`
            : null;
          period = gameData!.Period ? parseInt(gameData!.Period) || null : null;
        }

        // Compute hash for dedup
        const scoreData = {
          homeScore: bestHomeScore,
          awayScore: bestAwayScore,
          period,
          clock,
          status: newStatus,
        };
        const newHash = hashPayload(scoreData);

        if (newHash === game.snapshot_hash) {
          continue; // No change
        }

        // Update game row
        const { error: updateError } = await supabase
          .from("games")
          .update({
            home_score: bestHomeScore,
            away_score: bestAwayScore,
            clock,
            period,
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
          payload: { Game: gameData ?? espnData, source: gameData ? "sdio" : "espn" },
          payload_hash: newHash,
        });

        // Update game_state_cache with pre-computed derived fields
        const gamePeriod = period;
        const clockParts = clock?.split(":") ?? [];
        const clockMins = clockParts.length === 2
          ? parseInt(clockParts[0]) + parseInt(clockParts[1]) / 60
          : null;
        const margin = Math.abs(bestHomeScore - bestAwayScore);
        const inSecondHalf = gamePeriod != null && gamePeriod >= 2;
        const isOT = gamePeriod != null && gamePeriod > 2;
        const isLive = newStatus === "inprogress" || newStatus === "halftime";
        const periodLabel = gamePeriod == null ? null
          : gamePeriod === 1 ? "1H"
          : gamePeriod === 2 ? "2H"
          : `OT${gamePeriod - 2 > 1 ? gamePeriod - 2 : ""}`;

        await supabase
          .from("game_state_cache")
          .upsert({
            game_id: game.id,
            status: newStatus,
            home_score: bestHomeScore,
            away_score: bestAwayScore,
            clock,
            period: gamePeriod,
            margin,
            clock_minutes: clockMins,
            period_label: periodLabel,
            is_close: inSecondHalf && margin <= 6,
            is_final_minutes: inSecondHalf && clockMins != null && clockMins <= 5,
            is_final_two: inSecondHalf && clockMins != null && clockMins <= 2,
            is_overtime: isOT,
            is_live: isLive,
            updated_at: new Date().toISOString(),
          }, { onConflict: "game_id" });
        // Non-critical cache update — ignore errors

        updatedCount++;

        // Track games that just became live (for watcher_state creation by orchestrator)
        if (game.status === "scheduled" && (newStatus === "inprogress" || newStatus === "halftime")) {
          gamesTransitionedToLive.push(game.id);
        }

        // Handle terminal status transitions — these are one-time events, not recurring polls
        if (isTerminalStatus(newStatus)) {
          if (newStatus === "closed") {
            // Resolve wagers on game close
            try {
              await supabase.functions.invoke("resolve-wagers", {
                body: { gameId: game.id },
              });
            } catch (e) {
              console.warn(`Failed to invoke resolve-wagers for ${game.id}:`, e);
            }

            // Final summary snapshot on game close
            try {
              await supabase.functions.invoke("poll-summary", {
                body: { gameId: game.id },
              });
            } catch (e) {
              console.warn(`Failed to invoke final poll-summary for ${game.id}:`, e);
            }

            // Final alert evaluation for bet_resolved alerts
            try {
              await supabase.functions.invoke("evaluate-alerts", {
                body: { gameId: game.id },
              });
            } catch (e) {
              console.warn(`Failed to invoke final evaluate-alerts for ${game.id}:`, e);
            }

            // Deactivate watcher
            await supabase
              .from("watcher_state")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("game_id", game.id);
          }
        }
      } catch (e) {
        console.error(`Error processing game ${game.sportsdataio_id}:`, e);
      }
    }

    console.log(JSON.stringify({
      function: "poll-boxscore",
      event: "completed",
      activeGames: activeGames.length,
      updated: updatedCount,
      gamesTransitionedToLive: gamesTransitionedToLive.length,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        activeGames: activeGames.length,
        updated: updatedCount,
        gamesTransitionedToLive: gamesTransitionedToLive.length,
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
