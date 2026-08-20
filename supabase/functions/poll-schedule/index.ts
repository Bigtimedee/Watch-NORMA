// poll-schedule: Discover today's games from SportsDataIO + ESPN + Sportradar
// Trigger: pg_cron every 30 minutes (more frequent on game days)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { mapStatus } from "../_shared/utils.ts";
import {
  fetchSchedule as fetchSportradarSchedule,
  fetchScheduleForSport,
  resetCallCount,
  getCallCount,
} from "../_shared/sportradar.ts";
import type { SportradarScheduleGame } from "../_shared/sportradar.ts";
import { matchTeamName, teamMatchScore } from "../_shared/team-matching.ts";

// Sport-specific base URLs
// ncaaf/nfl are ingestion-only — alert rules not yet implemented (see doc 09 roadmap)
const SPORTSDATAIO_BASES: Record<string, string> = {
  ncaam: "https://api.sportsdata.io/v3/cbb",
  nba:   "https://api.sportsdata.io/v3/nba",
  mlb:   "https://api.sportsdata.io/v3/mlb",
  ncaaf: "https://api.sportsdata.io/v3/cfb",
  nfl:   "https://api.sportsdata.io/v3/nfl",
};
const ESPN_BASES: Record<string, string> = {
  ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball",
  nba:   "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  ncaaf: "https://site.api.espn.com/apis/site/v2/sports/football/college-football",
  nfl:   "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
};

const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_API_KEY")!;

// ESPN's public scoreboard endpoints 403 on Mozilla/* and Deno/* User-Agents;
// they whitelist well-known HTTP client library UAs. Leading with `curl/*`
// (and appending an app identifier for accountability) reliably returns 200.
const ESPN_FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "curl/8.7.1 (Watch-NORMA/1.0 poll-schedule)",
  "Accept": "application/json",
};
// Legacy constants for backward compatibility in NCAA-only code paths
const SPORTSDATAIO_BASE = SPORTSDATAIO_BASES.ncaam;
const ESPN_BASE = ESPN_BASES.ncaam;
const HAS_SPORTRADAR = !!Deno.env.get("SPORTRADAR_API_KEY");

// Which sports to ingest (driven by env vars — if key missing, sport is skipped)
// ncaaf/nfl: schedule + score ingestion only; alert evaluation is a no-op until
// football-specific alert rules are implemented (see evaluate-alerts guard).
const ENABLED_SPORTS: Array<{ key: string; hasSportradar: boolean }> = [
  { key: "ncaam", hasSportradar: HAS_SPORTRADAR },
  { key: "nba",   hasSportradar: !!Deno.env.get("SPORTRADAR_NBA_API_KEY") || HAS_SPORTRADAR },
  { key: "mlb",   hasSportradar: !!Deno.env.get("SPORTRADAR_MLB_API_KEY") || HAS_SPORTRADAR },
  { key: "ncaaf", hasSportradar: !!Deno.env.get("SPORTRADAR_NCAAF_API_KEY") },
  { key: "nfl",   hasSportradar: !!Deno.env.get("SPORTRADAR_NFL_API_KEY") },
];

interface SportsDataIOGame {
  GameID: number;
  Status: string;
  Day: string;
  DateTime: string;
  DateTimeUTC: string | null;
  AwayTeam: string;
  HomeTeam: string;
  AwayTeamID: number;
  HomeTeamID: number;
  AwayTeamScore: number | null;
  HomeTeamScore: number | null;
  Period: string | null;
  TimeRemainingMinutes: number | null;
  TimeRemainingSeconds: number | null;
  Channel: string | null;
  Stadium: { Name: string; City: string; State: string } | null;
  IsClosed: boolean;
  NeutralVenue: boolean | null;
  Tournament?: string | null;
  Round?: string | null;
}

function formatClock(mins: number | null, secs: number | null): string | null {
  if (mins == null || secs == null) return null;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

    // Allow overriding the date via request body (for manual triggers)
    let overrideDate: string | null = null;
    try {
      const body = await req.json();
      if (body?.date) overrideDate = body.date;
    } catch {
      // No body or invalid JSON — that's fine, use today's date
    }

    // Use US Eastern date (NCAAMB games are US-based) to avoid UTC midnight rollover.
    // After 6 PM CST / 7 PM EST, UTC rolls to the next day, but games are still "today" locally.
    const now = new Date();
    const eastern = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = eastern.find((p) => p.type === "year")!.value;
    const m = eastern.find((p) => p.type === "month")!.value;
    const d = eastern.find((p) => p.type === "day")!.value;
    const dateStr = overrideDate ?? `${y}-${m}-${d}`;

    // 1. Fetch schedule from SportsDataIO (may fail if quota exhausted)
    let sdioGames: SportsDataIOGame[] = [];
    let sdioAvailable = true;
    const sdioUrl = `${SPORTSDATAIO_BASE}/scores/json/GamesByDate/${dateStr}?key=${SPORTSDATAIO_KEY}`;
    try {
      const sdioRes = await fetch(sdioUrl);
      if (sdioRes.ok) {
        sdioGames = await sdioRes.json();
      } else {
        const errText = await sdioRes.text();
        console.warn(`SportsDataIO unavailable (${sdioRes.status}): ${errText.slice(0, 200)}`);
        sdioAvailable = false;
      }
    } catch (e) {
      console.warn("SportsDataIO fetch failed:", e);
      sdioAvailable = false;
    }

    // 2. Fetch ESPN for supplementary broadcast info AND accurate scores
    //    SportsDataIO scores freeze at mid-game values on free/trial tiers,
    //    so ESPN is the authoritative source for final scores.
    let espnBroadcasts: Record<string, string> = {};

    // ESPN game data keyed by MULTIPLE forms of team identifier for robust matching.
    // SportsDataIO and ESPN use different abbreviations (e.g., AKRON vs AKR, WMICH vs WMU).
    interface ESPNGameData {
      espnId: string;
      homeScore: number;
      awayScore: number;
      status: string;
      statusDetail: string;
      broadcast: string | null;
      homeDisplayName: string;
      awayDisplayName: string;
      homeAbbreviation: string;
      awayAbbreviation: string;
      scheduledAt: string | null;
      venue: string | null;
      clock: string | null;
      period: number;
      shortDetail: string;
    }
    const espnGames: ESPNGameData[] = [];
    try {
      const espnDate = dateStr.replace(/-/g, "");
      const espnRes = await fetch(`${ESPN_BASE}/scoreboard?dates=${espnDate}&groups=50&limit=300`, {
        headers: ESPN_FETCH_HEADERS,
      });
      if (espnRes.ok) {
        const espnData = await espnRes.json();
        for (const event of espnData.events ?? []) {
          const comp = event.competitions?.[0];
          if (!comp) continue;
          const away = comp.competitors?.find(
            (c: any) => c.homeAway === "away"
          );
          const home = comp.competitors?.find(
            (c: any) => c.homeAway === "home"
          );
          if (!away || !home) continue;
          const broadcast = comp.broadcasts?.[0]?.names?.[0]
            ? comp.broadcasts[0].names.join(", ") : null;
          const awayS = away.score;
          const homeS = home.score;
          const awayPts = typeof awayS === "object" ? parseInt(awayS?.displayValue ?? "0") : parseInt(awayS ?? "0");
          const homePts = typeof homeS === "object" ? parseInt(homeS?.displayValue ?? "0") : parseInt(homeS ?? "0");
          const venue = comp.venue
            ? `${comp.venue.fullName ?? ""}, ${comp.venue.address?.city ?? ""}, ${comp.venue.address?.state ?? ""}`.replace(/, ,/g, ",").replace(/^, |, $/g, "")
            : null;
          espnGames.push({
            espnId: event.id ?? "",
            homeScore: homePts,
            awayScore: awayPts,
            status: comp.status?.type?.description ?? "",
            statusDetail: comp.status?.type?.detail ?? "",
            broadcast,
            homeDisplayName: home.team?.displayName ?? "",
            awayDisplayName: away.team?.displayName ?? "",
            homeAbbreviation: home.team?.abbreviation ?? "",
            awayAbbreviation: away.team?.abbreviation ?? "",
            scheduledAt: event.date ?? null,
            venue,
            clock: comp.status?.displayClock ?? null,
            period: comp.status?.period ?? 0,
            shortDetail: comp.status?.type?.shortDetail ?? "",
          });
        }
      }
      console.log(`[ESPN] Fetched ${espnGames.length} games for ${dateStr}`);
    } catch (e) {
      console.warn("ESPN fetch failed (non-critical):", e);
    }

    // 3. Fetch Sportradar schedule for cross-mapping (if API key available)
    let sportradarGames: SportradarScheduleGame[] = [];
    if (HAS_SPORTRADAR) {
      try {
        const srSchedule = await fetchSportradarSchedule(
          parseInt(y),
          parseInt(m),
          parseInt(d)
        );
        sportradarGames = srSchedule.games ?? [];
        console.log(
          `[Sportradar] Fetched ${sportradarGames.length} games for ${dateStr}`
        );
      } catch (e) {
        console.warn("Sportradar schedule fetch failed (non-critical):", e);
      }
    }

    // 4. Ensure teams exist
    const teamIds = new Set<number>();
    for (const g of sdioGames) {
      teamIds.add(g.HomeTeamID);
      teamIds.add(g.AwayTeamID);
    }

    // Check which teams we already have
    const { data: existingTeams } = await supabase
      .from("teams")
      .select("sportsdataio_id")
      .in("sportsdataio_id", Array.from(teamIds));

    const existingIds = new Set(
      (existingTeams ?? []).map((t: any) => t.sportsdataio_id)
    );
    const missingIds = Array.from(teamIds).filter((id) => !existingIds.has(id));

    // Fetch and insert missing teams
    if (missingIds.length > 0) {
      try {
        const teamsRes = await fetch(
          `${SPORTSDATAIO_BASE}/scores/json/teams?key=${SPORTSDATAIO_KEY}`
        );
        if (teamsRes.ok) {
          const allTeams = await teamsRes.json();
          const toInsert = allTeams
            .filter((t: any) => missingIds.includes(t.TeamID))
            .map((t: any) => ({
              id: `sdio-${t.TeamID}`,
              sportsdataio_id: t.TeamID,
              name: `${t.School} ${t.Name}`,
              market: t.School,
              abbreviation: t.Key,
              conference: t.Conference,
              logo_url: t.TeamLogoUrl,
            }));

          if (toInsert.length > 0) {
            await supabase.from("teams").upsert(toInsert, {
              onConflict: "sportsdataio_id",
              ignoreDuplicates: true,
            });
          }
        }
      } catch (e) {
        console.warn("Team fetch failed:", e);
      }
    }

    // 5. Build team ID lookup (sportsdataio_id -> our team id)
    const { data: teamLookup } = await supabase
      .from("teams")
      .select("id, sportsdataio_id, abbreviation, name, market")
      .in("sportsdataio_id", Array.from(teamIds));

    const sdioToId: Record<number, string> = {};
    const sdioToAbbr: Record<number, string> = {};
    for (const t of teamLookup ?? []) {
      sdioToId[t.sportsdataio_id] = t.id;
      sdioToAbbr[t.sportsdataio_id] = t.abbreviation ?? "";
    }

    // 6. Cross-map Sportradar IDs to our teams
    let sportradarMapped = 0;
    if (sportradarGames.length > 0 && teamLookup && teamLookup.length > 0) {
      const dbTeams = teamLookup.map((t: any) => ({
        id: t.id,
        name: t.name,
        market: t.market,
        abbreviation: t.abbreviation,
      }));

      for (const srGame of sportradarGames) {
        // Match home team
        const homeMatch = matchTeamName(
          `${srGame.home.market} ${srGame.home.name}`,
          dbTeams
        );
        if (homeMatch) {
          const { error } = await supabase
            .from("teams")
            .update({ sportradar_id: srGame.home.id })
            .eq("id", homeMatch.id)
            .is("sportradar_id", null);
          if (!error) sportradarMapped++;
        }

        // Match away team
        const awayMatch = matchTeamName(
          `${srGame.away.market} ${srGame.away.name}`,
          dbTeams
        );
        if (awayMatch) {
          const { error } = await supabase
            .from("teams")
            .update({ sportradar_id: srGame.away.id })
            .eq("id", awayMatch.id)
            .is("sportradar_id", null);
          if (!error) sportradarMapped++;
        }
      }
    }

    // 6b. Build team lookup for ESPN matching
    const abbrToNames: Record<string, { market: string; name: string }> = {};
    for (const t of teamLookup ?? []) {
      if (t.abbreviation) {
        abbrToNames[t.abbreviation] = { market: t.market ?? "", name: t.name ?? "" };
      }
    }

    // teamMatchScore is now imported from _shared/team-matching.ts

    /** Boolean convenience wrapper: true if score > 0 */
    function teamsMatch(dbMarket: string, dbFullName: string, espnDisplayName: string): boolean {
      return teamMatchScore(dbMarket, dbFullName, espnDisplayName) > 0;
    }

    /** Match a SportsDataIO game to ESPN data by team name similarity */
    function findEspnMatch(sdioHomeAbbr: string, sdioAwayAbbr: string): ESPNGameData | null {
      const homeInfo = abbrToNames[sdioHomeAbbr] ?? { market: sdioHomeAbbr, name: sdioHomeAbbr };
      const awayInfo = abbrToNames[sdioAwayAbbr] ?? { market: sdioAwayAbbr, name: sdioAwayAbbr };
      for (const espn of espnGames) {
        if (teamsMatch(homeInfo.market, homeInfo.name, espn.homeDisplayName) &&
            teamsMatch(awayInfo.market, awayInfo.name, espn.awayDisplayName)) {
          return espn;
        }
      }
      return null;
    }

    // 7. Build Sportradar game lookup by home+away team IDs for cross-mapping
    const srGameByTeams: Record<string, SportradarScheduleGame> = {};
    for (const srGame of sportradarGames) {
      // Look up our internal team IDs for each Sportradar team
      const homeTeam = teamLookup?.find(
        (t: any) => t.sportradar_id === srGame.home.id ||
          matchTeamName(`${srGame.home.market} ${srGame.home.name}`, [
            { id: t.id, name: t.name, market: t.market, abbreviation: t.abbreviation },
          ])
      );
      const awayTeam = teamLookup?.find(
        (t: any) => t.sportradar_id === srGame.away.id ||
          matchTeamName(`${srGame.away.market} ${srGame.away.name}`, [
            { id: t.id, name: t.name, market: t.market, abbreviation: t.abbreviation },
          ])
      );
      if (homeTeam && awayTeam) {
        srGameByTeams[`${homeTeam.id}:${awayTeam.id}`] = srGame;
      }
    }

    // 7b. ESPN-only fallback: when SportsDataIO is unavailable, create games from ESPN
    let espnOnlyCount = 0;
    if (!sdioAvailable && espnGames.length > 0) {
      console.log(`[ESPN Fallback] SportsDataIO unavailable, creating ${espnGames.length} games from ESPN`);

      /** Map ESPN status description to our internal status */
      function mapEspnStatus(desc: string): string {
        const s = desc.toLowerCase();
        if (s.includes("scheduled") || s.includes("pre")) return "scheduled";
        if (s.includes("in progress") || s.includes("in_progress")) return "inprogress";
        if (s.includes("halftime")) return "halftime";
        if (s.includes("final") || s.includes("end of")) return "closed";
        if (s.includes("canceled") || s.includes("cancelled")) return "cancelled";
        if (s.includes("postponed")) return "postponed";
        if (s.includes("delayed")) return "scheduled";
        return "scheduled";
      }

      // Fetch all teams once for matching (mutable — we'll add new teams as we create them)
      const { data: initialDbTeams } = await supabase
        .from("teams")
        .select("id, name, market, abbreviation, sportsdataio_id");
      const allDbTeams = initialDbTeams ?? [];

      /** Create a team from ESPN data if it doesn't exist in the DB.
       *  Returns the new team's id, or null on failure. */
      async function ensureTeamFromEspn(displayName: string, abbreviation: string): Promise<string | null> {
        const teamId = `espn-${abbreviation.toLowerCase()}-${normalize(displayName).replace(/\s+/g, "-")}`;
        // Parse market (school name) from displayName by dropping the last word (mascot)
        const words = displayName.split(" ");
        const market = words.length > 1 ? words.slice(0, -1).join(" ") : displayName;
        const teamRow = {
          id: teamId,
          name: displayName,
          market,
          abbreviation: abbreviation.slice(0, 4).toUpperCase(),
        };
        const { error } = await supabase
          .from("teams")
          .upsert(teamRow, { onConflict: "id", ignoreDuplicates: true });
        if (error) {
          console.warn(`Failed to create team from ESPN: ${displayName}`, error);
          return null;
        }
        // Add to local cache so subsequent games in this loop can find it
        allDbTeams.push({ ...teamRow, sportsdataio_id: null });
        return teamId;
      }

      for (const espn of espnGames) {
        const status = mapEspnStatus(espn.status);
        if (status === "cancelled") continue;

        // Find BEST matching DB team for each side (highest score wins, not first match)
        let homeTeamId: string | null = null;
        let awayTeamId: string | null = null;
        let homeBestScore = 0;
        let awayBestScore = 0;

        for (const t of allDbTeams) {
          const homeScore = teamMatchScore(t.market ?? "", t.name ?? "", espn.homeDisplayName);
          if (homeScore > homeBestScore) {
            homeBestScore = homeScore;
            homeTeamId = t.id;
          }
          const awayScore = teamMatchScore(t.market ?? "", t.name ?? "", espn.awayDisplayName);
          if (awayScore > awayBestScore) {
            awayBestScore = awayScore;
            awayTeamId = t.id;
          }
        }

        // Guard: a team cannot play itself — if both matched the same DB row,
        // the fuzzy match was wrong. Clear both to force re-creation from ESPN.
        if (homeTeamId && homeTeamId === awayTeamId) {
          console.warn(`[ESPN Fallback] Same team matched for both sides: ${espn.homeDisplayName} vs ${espn.awayDisplayName} → ${homeTeamId}. Clearing both.`);
          homeTeamId = null;
          awayTeamId = null;
        }

        // Create missing teams from ESPN data
        if (!homeTeamId) {
          homeTeamId = await ensureTeamFromEspn(espn.homeDisplayName, espn.homeAbbreviation);
        }
        if (!awayTeamId) {
          awayTeamId = await ensureTeamFromEspn(espn.awayDisplayName, espn.awayAbbreviation);
        }

        const gameData: Record<string, unknown> = {
          id: `espn-${espn.espnId}`,
          sportsdataio_id: null,
          sport: "ncaam",
          status,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_score: espn.homeScore,
          away_score: espn.awayScore,
          clock: espn.clock ?? null,
          period: espn.period || null,
          scheduled_at: espn.scheduledAt,
          venue: espn.venue,
          broadcast: espn.broadcast,
          title: `${espn.awayDisplayName} at ${espn.homeDisplayName}`,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("games")
          .upsert(gameData, { onConflict: "id" });

        if (!error) espnOnlyCount++;
        else console.error(`Failed to upsert ESPN game ${espn.espnId}:`, error);
      }
    }

    // 8. Upsert games with Sportradar cross-mapping (skip cancelled games)
    let upsertedCount = 0;
    let cancelledSkipped = 0;
    for (const g of sdioGames) {
      if (g.Status === "Canceled" || g.Status === "Cancelled") {
        cancelledSkipped++;
        continue;
      }
      const homeId = sdioToId[g.HomeTeamID];
      const awayId = sdioToId[g.AwayTeamID];
      const homeAbbr = sdioToAbbr[g.HomeTeamID] ?? g.HomeTeam;
      const awayAbbr = sdioToAbbr[g.AwayTeamID] ?? g.AwayTeam;

      // Try to find matching ESPN game by team name
      const espnGame = findEspnMatch(g.HomeTeam, g.AwayTeam);
      const broadcast = g.Channel || espnGame?.broadcast || null;

      // ALWAYS prefer ESPN scores (free, reliable, always correct).
      // SportsDataIO on free/trial tiers returns inflated or frozen scores.
      // Fall back to SportsDataIO only when ESPN has no matching game.
      let homeScore: number;
      let awayScore: number;
      if (espnGame) {
        homeScore = espnGame.homeScore;
        awayScore = espnGame.awayScore;
      } else {
        homeScore = g.HomeTeamScore ?? 0;
        awayScore = g.AwayTeamScore ?? 0;
      }

      // Try to find matching Sportradar game
      const srKey = homeId && awayId ? `${homeId}:${awayId}` : null;
      const srGame = srKey ? srGameByTeams[srKey] : null;

      const gameData: Record<string, unknown> = {
        id: `sdio-${g.GameID}`,
        sportsdataio_id: g.GameID,
        sport: "ncaam",
        status: mapStatus(g.Status, g.IsClosed),
        home_team_id: homeId ?? null,
        away_team_id: awayId ?? null,
        home_score: homeScore,
        away_score: awayScore,
        clock: formatClock(g.TimeRemainingMinutes, g.TimeRemainingSeconds),
        period: g.Period ? parseInt(g.Period) || null : null,
        scheduled_at: g.DateTimeUTC
          ? `${g.DateTimeUTC}Z`
          : g.DateTime
            ? `${g.DateTime}-05:00`
            : g.Day,
        venue: g.Stadium
          ? `${g.Stadium.Name}, ${g.Stadium.City}, ${g.Stadium.State}`
          : null,
        broadcast,
        tournament_round: g.Round ?? null,
        title: g.Tournament ?? null,
        updated_at: new Date().toISOString(),
      };

      // Add Sportradar data if we found a match
      if (srGame) {
        gameData.sportradar_id = srGame.id;
        gameData.coverage_level = srGame.coverage ?? "basic";
      }

      const { error } = await supabase
        .from("games")
        .upsert(gameData, { onConflict: "id" });

      if (!error) upsertedCount++;
      else console.error(`Failed to upsert game ${g.GameID}:`, error);
    }

    // 9. Ingest all non-NCAAM sports (NBA, MLB, NCAAF, NFL) from ESPN — always available, no SDIO key needed.
    // ESPN is the canonical real-time source for scores and live game state across every sport.
    let multiSportCount = 0;
    const multiSportDebug: Record<string, { events: number; upserted: number; errors: number; lastStatus: number | null }> = {};
    {
      const espnDateMulti = dateStr.replace(/-/g, "");

      function mapEspnStatusMulti(desc: string): string {
        const s = desc.toLowerCase();
        if (s.includes("scheduled") || s.includes("pre")) return "scheduled";
        if (s.includes("in progress") || s.includes("in_progress")) return "inprogress";
        if (s.includes("halftime")) return "halftime";
        if (s.includes("final") || s.includes("end of")) return "closed";
        if (s.includes("canceled") || s.includes("cancelled")) return "cancelled";
        if (s.includes("postponed")) return "postponed";
        if (s.includes("delayed")) return "scheduled";
        return "scheduled";
      }

      const { data: allTeamsForMulti } = await supabase
        .from("teams")
        .select("id, name, market, abbreviation, sportsdataio_id, sport");
      const multiTeamCache: Array<{ id: string; name: string | null; market: string | null; abbreviation: string | null; sportsdataio_id: number | null; sport: string | null }> = allTeamsForMulti ?? [];

      // Teams whose mascot is more than one word — the city/market is everything before these.
      const MULTI_WORD_MASCOTS: Record<string, string> = {
        "trail blazers": "Portland",
        "red sox":       "Boston",
        "white sox":     "Chicago",
        "blue jays":     "Toronto",
      };

      async function ensureTeamForSport(displayName: string, abbreviation: string, sportKey: string): Promise<string | null> {
        const teamId = `espn-${sportKey}-${abbreviation.toLowerCase()}`;
        const lower = displayName.toLowerCase();
        // Check known multi-word mascots first; fall back to dropping the last word.
        const multiWordEntry = Object.entries(MULTI_WORD_MASCOTS).find(([mascot]) => lower.endsWith(mascot));
        const market = multiWordEntry
          ? multiWordEntry[1]
          : displayName.split(" ").length > 1
            ? displayName.split(" ").slice(0, -1).join(" ")
            : displayName;
        const teamRow = {
          id: teamId,
          name: displayName,
          market,
          abbreviation: abbreviation.slice(0, 4).toUpperCase(),
          sport: sportKey,
        };
        const { error } = await supabase
          .from("teams")
          .upsert(teamRow, { onConflict: "id", ignoreDuplicates: true });
        if (error) {
          console.warn(`[MultiSport] Failed to create team ${displayName}:`, error);
          return null;
        }
        multiTeamCache.push({ ...teamRow, sportsdataio_id: null });
        return teamId;
      }

      for (const sport of ENABLED_SPORTS.filter((s) => s.key !== "ncaam")) {
        const sportKey = sport.key;
        const espnBase = ESPN_BASES[sportKey];
        multiSportDebug[sportKey] = { events: 0, upserted: 0, errors: 0, lastStatus: null };
        if (!espnBase) { multiSportDebug[sportKey].errors++; continue; }

        try {
          // ESPN's public scoreboard endpoints 403 on Deno's default UA and
          // on browser-like Mozilla/* strings. They allow well-known HTTP
          // client library UAs (curl, python-requests, Go-http-client, etc.).
          // We lead with `curl/*` and append the app identifier for
          // accountability. See ESPN_FETCH_HEADERS below.
          const res = await fetch(`${espnBase}/scoreboard?dates=${espnDateMulti}&limit=300`, {
            headers: ESPN_FETCH_HEADERS,
          });
          multiSportDebug[sportKey].lastStatus = res.status;
          if (!res.ok) {
            console.warn(`[MultiSport] ESPN ${sportKey} scoreboard returned ${res.status}`);
            multiSportDebug[sportKey].errors++;
            continue;
          }
          const data = await res.json();
          const events: any[] = data.events ?? [];
          multiSportDebug[sportKey].events = events.length;
          console.log(`[MultiSport] ESPN ${sportKey}: ${events.length} events`);

          for (const event of events) {
            const comp = event.competitions?.[0];
            if (!comp) continue;
            const away = comp.competitors?.find((c: any) => c.homeAway === "away");
            const home = comp.competitors?.find((c: any) => c.homeAway === "home");
            if (!away || !home) continue;

            const status = mapEspnStatusMulti(comp.status?.type?.description ?? "");
            if (status === "cancelled") continue;

            const awayS = away.score;
            const homeS = home.score;
            const awayPts = typeof awayS === "object" ? parseInt(awayS?.displayValue ?? "0") : parseInt(awayS ?? "0");
            const homePts = typeof homeS === "object" ? parseInt(homeS?.displayValue ?? "0") : parseInt(homeS ?? "0");
            const broadcast = comp.broadcasts?.[0]?.names?.[0]
              ? comp.broadcasts[0].names.join(", ") : null;
            const venue = comp.venue
              ? `${comp.venue.fullName ?? ""}, ${comp.venue.address?.city ?? ""}, ${comp.venue.address?.state ?? ""}`.replace(/, ,/g, ",").replace(/^, |, $/g, "")
              : null;

            const homeDisplayName: string = home.team?.displayName ?? "";
            const awayDisplayName: string = away.team?.displayName ?? "";
            const homeAbbr: string = home.team?.abbreviation ?? "";
            const awayAbbr: string = away.team?.abbreviation ?? "";

            let homeTeamId: string | null = null;
            let awayTeamId: string | null = null;
            let homeBest = 0;
            let awayBest = 0;

            // Only match against teams of the same sport to prevent NCAA teams
            // (e.g., "Arizona Wildcats") from matching pro teams via shared market
            // (e.g., "Arizona Diamondbacks" → market "Arizona").
            const sportTeams = multiTeamCache.filter((t) => !t.sport || t.sport === sportKey);
            for (const t of sportTeams) {
              const hs = teamMatchScore(t.market ?? "", t.name ?? "", homeDisplayName);
              if (hs > homeBest) { homeBest = hs; homeTeamId = t.id; }
              const as2 = teamMatchScore(t.market ?? "", t.name ?? "", awayDisplayName);
              if (as2 > awayBest) { awayBest = as2; awayTeamId = t.id; }
            }

            if (homeTeamId && homeTeamId === awayTeamId) {
              homeTeamId = null;
              awayTeamId = null;
            }
            if (!homeTeamId) homeTeamId = await ensureTeamForSport(homeDisplayName, homeAbbr, sportKey);
            if (!awayTeamId) awayTeamId = await ensureTeamForSport(awayDisplayName, awayAbbr, sportKey);

            const gameData: Record<string, unknown> = {
              id: `espn-${sportKey}-${event.id}`,
              sportsdataio_id: null,
              sport: sportKey,
              status,
              home_team_id: homeTeamId,
              away_team_id: awayTeamId,
              home_score: homePts,
              away_score: awayPts,
              clock: comp.status?.displayClock ?? null,
              period: comp.status?.period ?? null,
              scheduled_at: event.date ?? null,
              venue,
              broadcast,
              title: `${awayDisplayName} at ${homeDisplayName}`,
              updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
              .from("games")
              .upsert(gameData, { onConflict: "id" });
            if (!error) {
              multiSportCount++;
              multiSportDebug[sportKey].upserted++;
            } else {
              multiSportDebug[sportKey].errors++;
              console.error(`[MultiSport] Failed to upsert ${sportKey} game ${event.id}:`, error);
            }
          }
        } catch (e) {
          console.warn(`[MultiSport] ESPN ${sportKey} fetch failed:`, e);
        }
      }

      console.log(`[MultiSport] Upserted ${multiSportCount} NBA/MLB games`);
    }

    const result = {
      success: true,
      sdioAvailable,
      gamesFound: sdioAvailable ? sdioGames.length : espnGames.length,
      gamesUpserted: upsertedCount,
      multiSportGames: multiSportCount,
      multiSportBySport: multiSportDebug,
      espnOnlyGames: espnOnlyCount,
      sportradarGames: sportradarGames.length,
      sportradarTeamsMapped: sportradarMapped,
      sportradarApiCalls: getCallCount(),
      date: dateStr,
    };

    console.log(JSON.stringify({
      function: "poll-schedule",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("poll-schedule error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
