// poll-odds: Fetch odds from The Odds API for all enabled sports
// Trigger: pg_cron every 5 minutes
//
// Sports covered: NCAAB (ncaam), NBA (nba), MLB (mlb), NCAAF (ncaaf), NFL (nfl).
// Football was added 2026-08-23 (FX5 / BL-2 in the season-readiness audit).
// To disable a sport at runtime without a redeploy, set the env var:
//   ODDS_DISABLED_SPORTS=americanfootball_ncaaf,americanfootball_nfl
// Each entry is the Odds API sport key (oddsApiKey column below).
//
// Quota note: adding the two football sports increases daily request volume by
// ~66% (5 sports x 12 polls/hour x 24 hours vs. prior 3 sports). ODDS_DISABLED_SPORTS
// is the kill switch if quota headroom becomes tight during peak weeks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { matchGame } from "../_shared/team-matching.ts";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY")!;
const BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "espnbet"];
const MARKETS = ["spreads", "totals", "h2h"];

// Maps Odds API sport keys → our DB sport enum values.
// Adding a new sport here is sufficient — no code change needed.
const SPORT_CONFIG: Array<{ oddsApiKey: string; dbSport: string }> = [
  { oddsApiKey: "basketball_ncaab",     dbSport: "ncaam" },
  { oddsApiKey: "basketball_nba",       dbSport: "nba"   },
  { oddsApiKey: "baseball_mlb",         dbSport: "mlb"   },
  { oddsApiKey: "americanfootball_ncaaf", dbSport: "ncaaf" },
  { oddsApiKey: "americanfootball_nfl",   dbSport: "nfl"   },
];

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

    // Filter enabled sports from env override
    const disabledSet = new Set(
      (Deno.env.get("ODDS_DISABLED_SPORTS") ?? "").split(",").filter(Boolean)
    );
    const enabledSports = SPORT_CONFIG.filter(s => !disabledSet.has(s.oddsApiKey));

    if (enabledSports.length === 0) {
      return new Response(JSON.stringify({ success: true, oddsUpserted: 0, perSport: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all teams + active games once; filter by sport per iteration
    const { data: dbTeams } = await supabase
      .from("teams")
      .select("id, name, market, abbreviation, sport");
    const { data: dbGames } = await supabase
      .from("games")
      .select("id, home_team_id, away_team_id, status, sport")
      .in("status", ["scheduled", "inprogress", "halftime"]);

    if (!dbTeams || !dbGames) {
      throw new Error("Failed to fetch teams or games from database");
    }

    let totalUpserted = 0;
    const perSport: Record<string, { events: number; matched: number; upserted: number }> = {};

    for (const { oddsApiKey, dbSport } of enabledSports) {
      // Sport-scoped slices prevent cross-sport team-name collisions
      // (e.g., Indiana Pacers vs Indiana Hoosiers).
      const sportTeams = dbTeams.filter(t => t.sport === dbSport);
      const sportGames = dbGames.filter(g => g.sport === dbSport);

      const url = `${ODDS_API_BASE}/sports/${oddsApiKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=${MARKETS.join(",")}&bookmakers=${BOOKMAKERS.join(",")}`;
      const oddsController = new AbortController();
      const oddsTimer = setTimeout(() => oddsController.abort(), 10000);
      let res: Response;
      try {
        res = await fetch(url, { signal: oddsController.signal });
      } finally {
        clearTimeout(oddsTimer);
      }

      if (!res.ok) {
        const body = await res.text();
        console.warn(JSON.stringify({
          function: "poll-odds",
          event: "fetch_failed",
          sport: oddsApiKey,
          status: res.status,
          body,
        }));
        perSport[oddsApiKey] = { events: 0, matched: 0, upserted: 0 };
        continue;
      }

      const requestsRemaining = res.headers.get("x-requests-remaining");
      const requestsUsed = res.headers.get("x-requests-used");
      if (requestsRemaining !== null) {
        console.log(JSON.stringify({
          function: "poll-odds",
          event: "quota",
          sport: oddsApiKey,
          requests_remaining: parseInt(requestsRemaining, 10),
          requests_used: requestsUsed !== null ? parseInt(requestsUsed, 10) : null,
        }));
      }

      const events: OddsEvent[] = await res.json();
      let sportMatched = 0;
      let sportUpserted = 0;

      for (const event of events) {
        const gameId = matchGame(
          event.home_team,
          event.away_team,
          sportTeams,
          sportGames
        );

        if (!gameId) continue;
        sportMatched++;

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
              sportUpserted++;
            }
          }
        }
      }

      totalUpserted += sportUpserted;
      perSport[oddsApiKey] = { events: events.length, matched: sportMatched, upserted: sportUpserted };
    }

    const result = {
      success: true,
      oddsUpserted: totalUpserted,
      perSport,
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
