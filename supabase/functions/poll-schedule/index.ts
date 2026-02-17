// poll-schedule: Discover today's games from SportsDataIO + ESPN
// Trigger: pg_cron every 30 minutes (more frequent on game days)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SPORTSDATAIO_BASE = "https://api.sportsdata.io/v3/cbb";
const SPORTSDATAIO_KEY = Deno.env.get("SPORTSDATAIO_API_KEY")!;
const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

interface SportsDataIOGame {
  GameID: number;
  Status: string;
  Day: string;
  DateTime: string;
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

function mapStatus(sdioStatus: string, isClosed: boolean): string {
  if (isClosed) return "closed";
  const s = sdioStatus?.toLowerCase() ?? "";
  if (s === "scheduled" || s === "created") return "scheduled";
  if (s === "inprogress" || s === "in progress") return "inprogress";
  if (s === "halftime" || s === "half") return "halftime";
  if (s === "final" || s === "f" || s === "f/ot") return "closed";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "postponed") return "postponed";
  return "scheduled";
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get today's date in YYYY-MMM-DD format for SportsDataIO
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    // 1. Fetch schedule from SportsDataIO
    const sdioUrl = `${SPORTSDATAIO_BASE}/scores/json/GamesByDate/${dateStr}?key=${SPORTSDATAIO_KEY}`;
    const sdioRes = await fetch(sdioUrl);

    if (!sdioRes.ok) {
      throw new Error(
        `SportsDataIO API error: ${sdioRes.status} ${await sdioRes.text()}`
      );
    }

    const sdioGames: SportsDataIOGame[] = await sdioRes.json();

    // 2. Fetch ESPN for supplementary broadcast info
    let espnBroadcasts: Record<string, string> = {};
    try {
      const espnRes = await fetch(`${ESPN_BASE}/scoreboard`);
      if (espnRes.ok) {
        const espnData = await espnRes.json();
        for (const event of espnData.events ?? []) {
          const comp = event.competitions?.[0];
          if (comp?.broadcasts?.[0]?.names?.[0]) {
            // Use team abbreviations as a fuzzy match key
            const away = comp.competitors?.find(
              (c: any) => c.homeAway === "away"
            )?.team?.abbreviation;
            const home = comp.competitors?.find(
              (c: any) => c.homeAway === "home"
            )?.team?.abbreviation;
            if (away && home) {
              espnBroadcasts[`${away}-${home}`] =
                comp.broadcasts[0].names.join(", ");
            }
          }
        }
      }
    } catch (e) {
      console.warn("ESPN fetch failed (non-critical):", e);
    }

    // 3. Ensure teams exist
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

    // 4. Build team ID lookup (sportsdataio_id -> our team id)
    const { data: teamLookup } = await supabase
      .from("teams")
      .select("id, sportsdataio_id, abbreviation")
      .in("sportsdataio_id", Array.from(teamIds));

    const sdioToId: Record<number, string> = {};
    const sdioToAbbr: Record<number, string> = {};
    for (const t of teamLookup ?? []) {
      sdioToId[t.sportsdataio_id] = t.id;
      sdioToAbbr[t.sportsdataio_id] = t.abbreviation ?? "";
    }

    // 5. Upsert games
    let upsertedCount = 0;
    for (const g of sdioGames) {
      const homeId = sdioToId[g.HomeTeamID];
      const awayId = sdioToId[g.AwayTeamID];
      const homeAbbr = sdioToAbbr[g.HomeTeamID] ?? g.HomeTeam;
      const awayAbbr = sdioToAbbr[g.AwayTeamID] ?? g.AwayTeam;

      // Try to find ESPN broadcast
      const broadcastKey = `${awayAbbr}-${homeAbbr}`;
      const broadcast =
        g.Channel || espnBroadcasts[broadcastKey] || null;

      const gameData = {
        id: `sdio-${g.GameID}`,
        sportsdataio_id: g.GameID,
        status: mapStatus(g.Status, g.IsClosed),
        home_team_id: homeId ?? null,
        away_team_id: awayId ?? null,
        home_score: g.HomeTeamScore ?? 0,
        away_score: g.AwayTeamScore ?? 0,
        clock: formatClock(g.TimeRemainingMinutes, g.TimeRemainingSeconds),
        period: g.Period ? parseInt(g.Period) || null : null,
        scheduled_at: g.DateTime || g.Day,
        venue: g.Stadium
          ? `${g.Stadium.Name}, ${g.Stadium.City}, ${g.Stadium.State}`
          : null,
        broadcast,
        tournament_round: g.Round ?? null,
        title: g.Tournament ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("games")
        .upsert(gameData, { onConflict: "id" });

      if (!error) upsertedCount++;
      else console.error(`Failed to upsert game ${g.GameID}:`, error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        gamesFound: sdioGames.length,
        gamesUpserted: upsertedCount,
        date: dateStr,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
