// poll-odds: Fetch NCAAB odds from The Odds API
// Trigger: pg_cron every 5 minutes

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { matchGame } from "../_shared/team-matching.ts";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY")!;
const BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "espnbet"];
const MARKETS = ["spreads", "totals", "h2h"];

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
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

    // Fetch odds from The Odds API
    const url = `${ODDS_API_BASE}/sports/basketball_ncaab/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=${MARKETS.join(",")}&bookmakers=${BOOKMAKERS.join(",")}`;
    const oddsController = new AbortController();
    const oddsTimer = setTimeout(() => oddsController.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, { signal: oddsController.signal });
    } finally {
      clearTimeout(oddsTimer);
    }

    if (!res.ok) {
      throw new Error(`Odds API returned ${res.status}: ${await res.text()}`);
    }

    const events: OddsEvent[] = await res.json();

    // Get our teams and active games for matching
    const { data: dbTeams } = await supabase
      .from("teams")
      .select("id, name, market, abbreviation");
    const { data: dbGames } = await supabase
      .from("games")
      .select("id, home_team_id, away_team_id, status")
      .in("status", ["scheduled", "inprogress", "halftime"]);

    if (!dbTeams || !dbGames) {
      throw new Error("Failed to fetch teams or games from database");
    }

    let upsertCount = 0;

    for (const event of events) {
      const gameId = matchGame(
        event.home_team,
        event.away_team,
        dbTeams,
        dbGames
      );

      if (!gameId) continue;

      for (const bookmaker of event.bookmakers) {
        if (!BOOKMAKERS.includes(bookmaker.key)) continue;

        for (const market of bookmaker.markets) {
          const row: Record<string, unknown> = {
            game_id: gameId,
            sportsbook: bookmaker.key,
            market_type: market.key,
            last_update: new Date().toISOString(),
          };

          if (market.key === "spreads") {
            const home = market.outcomes.find((o) => o.name === event.home_team);
            const away = market.outcomes.find((o) => o.name === event.away_team);
            row.home_line = home?.point ?? null;
            row.away_line = away?.point ?? null;
            row.home_price = home?.price ?? null;
            row.away_price = away?.price ?? null;
          } else if (market.key === "totals") {
            const over = market.outcomes.find((o) => o.name === "Over");
            const under = market.outcomes.find((o) => o.name === "Under");
            row.over_under = over?.point ?? null;
            row.over_price = over?.price ?? null;
            row.under_price = under?.price ?? null;
          } else if (market.key === "h2h") {
            const home = market.outcomes.find((o) => o.name === event.home_team);
            const away = market.outcomes.find((o) => o.name === event.away_team);
            row.home_price = home?.price ?? null;
            row.away_price = away?.price ?? null;
          }

          const { error } = await supabase.from("game_odds").upsert(row, {
            onConflict: "game_id,sportsbook,market_type",
          });

          if (error) {
            console.warn(`Upsert error for ${gameId}/${bookmaker.key}/${market.key}:`, error);
          } else {
            upsertCount++;
          }
        }
      }
    }

    const result = {
      success: true,
      eventsReceived: events.length,
      oddsUpserted: upsertCount,
    };

    console.log(JSON.stringify({
      function: "poll-odds",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("poll-odds error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
