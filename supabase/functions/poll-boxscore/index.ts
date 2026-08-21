// poll-boxscore: Live score updater
// Trigger: pg_cron every 1 minute
//
// Uses ESPN as the PRIMARY score source (free, reliable, always correct).
//
// v2: This function ONLY handles score updates and terminal events (game close).
// PBP, summary, and alert dispatch are handled by game-watcher-orchestrator.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPayload, mapStatus } from "../_shared/utils.ts";
import { isTerminalStatus } from "../_shared/polling-state.ts";

// ncaaf/nfl: ingestion only; alert evaluation is blocked until football rules are ready

// Sport-specific ESPN base URLs
const ESPN_BASES: Record<string, string> = {
  ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball",
  nba:   "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  ncaaf: "https://site.api.espn.com/apis/site/v2/sports/football/college-football",
  nfl:   "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
};

const ESPN_BASE = ESPN_BASES.ncaam;

/** Convert a UTC ISO timestamp to an Eastern-date YYYY-MM-DD string.
 *  Games are indexed by Eastern date, so we must convert. */
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
  espnEventId?: string;
}

/** Derive clock and period for MLB from ESPN status */
function parseMLBClockAndPeriod(status: any): { clock: string | null; period: number } {
  // ESPN MLB: status.period = inning number, displayClock = "Top 7th" etc.
  const inning = status?.period ?? 0;
  const displayClock = status?.displayClock ?? null;
  // Encode as "{T|B}{inning}" e.g. "T7", "B9"
  let clock: string | null = null;
  if (displayClock) {
    const isTop = /top/i.test(displayClock);
    const isBot = /bot|mid|end/i.test(displayClock);
    if (isTop) clock = `T${inning}`;
    else if (isBot) clock = `B${inning}`;
    else clock = displayClock;
  }
  return { clock, period: inning };
}

interface ESPNFetchResult {
  games: ESPNGameData[];
  /** True when the ESPN API request itself failed (network/timeout/non-2xx) */
  fetchFailed: boolean;
  failReason?: string;
}

/** Fetch all scores from ESPN for a given Eastern date and sport.
 *  Returns a structured result so callers can detect ESPN unavailability explicitly. */
async function fetchEspnGames(easternDate: string, sport = "ncaam"): Promise<ESPNFetchResult> {
  const espnBase = ESPN_BASES[sport] ?? ESPN_BASES.ncaam;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const espnDate = toEspnDate(easternDate);
    const groupsParam = sport === "ncaam" ? "&groups=50" : "";
    const res = await fetch(
      `${espnBase}/scoreboard?dates=${espnDate}${groupsParam}&limit=300`,
      {
        signal: controller.signal,
        // ESPN 403s Mozilla/*/Deno/* UAs; whitelist accepts curl/* etc.
        headers: {
          "User-Agent": "curl/8.7.1 (Watch-NORMA/1.0 poll-boxscore)",
          "Accept": "application/json",
        },
      },
    );
    if (!res.ok) {
      return { games: [], fetchFailed: true, failReason: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const games: ESPNGameData[] = [];
    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const away = comp.competitors?.find((c: any) => c.homeAway === "away");
      const home = comp.competitors?.find((c: any) => c.homeAway === "home");
      if (!away || !home) continue;
      const awayS = away.score;
      const homeS = home.score;

      let clock: string | null;
      let period: number;

      if (sport === "mlb") {
        const parsed = parseMLBClockAndPeriod(comp.status);
        clock = parsed.clock;
        period = parsed.period;
      } else {
        clock = comp.status?.displayClock ?? null;
        period = comp.status?.period ?? 0;
      }

      games.push({
        homeScore: typeof homeS === "object" ? parseInt(homeS?.displayValue ?? "0") : parseInt(homeS ?? "0"),
        awayScore: typeof awayS === "object" ? parseInt(awayS?.displayValue ?? "0") : parseInt(awayS ?? "0"),
        // CRITICAL: Use type.description ("In Progress", "Final", "Scheduled") NOT type.name
        // ("STATUS_IN_PROGRESS", "STATUS_FINAL") — type.name uses machine codes that mapStatus()
        // cannot parse, causing games to be stored with invalid status values and orphaned.
        status: comp.status?.type?.description ?? comp.status?.type?.name ?? "Unknown",
        homeDisplayName: home.team?.displayName ?? "",
        awayDisplayName: away.team?.displayName ?? "",
        clock,
        period,
        espnEventId: event.id ?? undefined,
      });
    }
    return { games, fetchFailed: false };
  } catch (e) {
    const reason = (e as Error).message ?? "fetch error";
    console.warn(`ESPN fetch failed for sport=${sport}: ${reason}`);
    return { games: [], fetchFailed: true, failReason: reason };
  } finally {
    clearTimeout(timer);
  }
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
    // Now includes sport column so we can route to the right ESPN endpoint.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    // Query active games. Include non-standard status values (status_in_progress, status_halftime,
    // end of period) that may have been written by earlier buggy ESPN status mapping, so we can
    // heal them by re-evaluating with the fixed mapStatus function.
    const { data: activeGames, error: fetchError } = await supabase
      .from("games")
      .select("id, sport, espn_id, sportradar_id, coverage_level, snapshot_hash, status, scheduled_at, home_team:teams!games_home_team_id_fkey(abbreviation,market,name), away_team:teams!games_away_team_id_fkey(abbreviation,market,name)")
      .or(`status.in.("inprogress","halftime","status_in_progress","status_halftime","status_scheduled","end of period"),and(status.eq.scheduled,scheduled_at.lte.${fiveMinAgo})`);

    if (fetchError) throw fetchError;
    if (!activeGames || activeGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active games", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect all unique (sport, date) combos we need to fetch ESPN scores for.
    const sportDatesToFetch = new Set<string>(); // encoded as "sport|date"
    const datesToFetch = new Set<string>();
    for (const game of activeGames) {
      if (game.scheduled_at) {
        const easternDate = utcToEasternDate(game.scheduled_at);
        datesToFetch.add(easternDate);
      }
    }

    // Collect unique sport+date combos for ESPN fetches
    for (const game of activeGames) {
      if (game.scheduled_at) {
        const sport = (game as any).sport ?? "ncaam";
        const easternDate = utcToEasternDate(game.scheduled_at);
        sportDatesToFetch.add(`${sport}|${easternDate}`);
        datesToFetch.add(easternDate);
      }
    }

    // Fetch ESPN scores for all relevant sport+date combos (primary source)
    const espnGamesBySportDate: Map<string, ESPNGameData[]> = new Map();
    const espnFetchFailedBySportDate: Map<string, string> = new Map(); // key → failReason
    for (const key of sportDatesToFetch) {
      const [sport, dateStr] = key.split("|");
      const result = await fetchEspnGames(dateStr, sport);
      espnGamesBySportDate.set(key, result.games);
      if (result.fetchFailed) {
        espnFetchFailedBySportDate.set(key, result.failReason ?? "unknown");
        console.log(JSON.stringify({
          function: "poll-boxscore",
          event: "espn_unavailable",
          sport,
          date: dateStr,
          reason: result.failReason,
          failover_to: null,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    // SportsDataIO score fetching removed 2026-08-20 (owner decision: NORMA uses
    // ESPN, not SportsDataIO). ESPN is now the sole score source.

    let updatedCount = 0;
    const gamesTransitionedToLive: string[] = [];
    const failoverGameIds: string[] = [];

    for (const game of activeGames) {
      try {
        const sport: string = (game as any).sport ?? "ncaam";
        const isMlb = sport === "mlb";
        const easternDate = game.scheduled_at ? utcToEasternDate(game.scheduled_at) : null;
        const espnKey = easternDate ? `${sport}|${easternDate}` : null;
        const espnDateGames = espnKey ? espnGamesBySportDate.get(espnKey) ?? [] : [];

        const homeMarket = (game as any).home_team?.market ?? "";
        const awayMarket = (game as any).away_team?.market ?? "";
        const homeFullName = (game as any).home_team?.name ?? "";
        const awayFullName = (game as any).away_team?.name ?? "";
        const espnData = findEspnMatch(espnDateGames, homeMarket, awayMarket, homeFullName, awayFullName);
        const espnApiDown = espnKey != null && espnFetchFailedBySportDate.has(espnKey);

        // ESPN is the sole score source (SportsDataIO removed 2026-08-20).
        if (!espnData) {
          // Nothing to update from. Still record it when ESPN itself was down, so
          // the failover metric keeps surfacing upstream outages.
          if (espnApiDown) {
            console.log(JSON.stringify({
              function: "poll-boxscore",
              event: "espn_unavailable",
              game_id: game.id,
              sport,
              reason: espnFetchFailedBySportDate.get(espnKey!),
              timestamp: new Date().toISOString(),
            }));
            failoverGameIds.push(game.id);
          }
          continue;
        }

        const bestHomeScore = espnData.homeScore;
        const bestAwayScore = espnData.awayScore;
        const newStatus = mapStatus(espnData.status, false);
        const clock: string | null = espnData.clock;
        const period: number | null = espnData.period || null;
        const scoreSource = "espn_only";

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

        // Store snapshot (scoreSource accurately reflects which data was used)
        await supabase.from("game_snapshots").insert({
          game_id: game.id,
          snapshot_type: "scores",
          payload: { Game: espnData, source: scoreSource },
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
        console.error(`Error processing game ${game.id}:`, e);
      }
    }

    console.log(JSON.stringify({
      function: "poll-boxscore",
      event: "completed",
      activeGames: activeGames.length,
      updated: updatedCount,
      gamesTransitionedToLive: gamesTransitionedToLive.length,
      failover_games: failoverGameIds.length,
      failover_game_ids: failoverGameIds,
      espn_fetch_failures: espnFetchFailedBySportDate.size,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        activeGames: activeGames.length,
        updated: updatedCount,
        gamesTransitionedToLive: gamesTransitionedToLive.length,
        failover_games: failoverGameIds.length,
        espn_fetch_failures: espnFetchFailedBySportDate.size,
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
