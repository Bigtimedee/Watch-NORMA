// poll-markets: Fetch Kalshi/Polymarket NCAAB prediction market positions
// For each user with a connected Kalshi/Polymarket account, fetches their positions
// and matches them to games in the DB.
//
// Trigger: pg_cron every 5 minutes + on-demand

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { importRsaPrivateKey, signKalshiRequest } from "../_shared/kalshi-crypto.ts";

const KALSHI_API_BASE = "https://api.elections.kalshi.com";
const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com";

/** Normalize a string for matching: lowercase, strip accents, remove punctuation */
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Common NCAAB abbreviation aliases used by Kalshi/Polymarket
 *  that differ from SportsDataIO abbreviations.
 *  Maps external alias → SportsDataIO market name (lowercase). */
const TEAM_ALIASES: Record<string, string> = {
  "unc": "north carolina",
  "uconn": "connecticut",
  "usc": "southern california",
  "smu": "southern methodist",
  "vcu": "virginia commonwealth",
  "etsu": "east tennessee state",
  "utep": "texas el paso",
  "unlv": "nevada las vegas",
  "ucf": "central florida",
  "lsu": "louisiana state",
  "tcu": "texas christian",
  "ole miss": "mississippi",
  "pitt": "pittsburgh",
  "cuse": "syracuse",
  "uva": "virginia",
  "cal": "california",
  "umass": "massachusetts",
  "wisc": "wisconsin",
  "wis": "wisconsin",
  "mich": "michigan",
  "minn": "minnesota",
  "ill": "illinois",
  "ind": "indiana",
  "tenn": "tennessee",
  "ark": "arkansas",
  "stan": "stanford",
  "colo": "colorado",
  "ore": "oregon",
  "wash": "washington",
  "ariz": "arizona",
  "gtown": "georgetown",
};

interface DBTeam {
  id: string;
  name: string;
  market: string | null;
  abbreviation: string | null;
}

interface DBGame {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
  title: string | null;
}

/** Extract team-like words from a market title.
 *  Kalshi titles vary in format:
 *    "Iowa vs Wisconsin"
 *    "Men's College Basketball Men's Game, Louisville, LOU at UNC (Feb 23)"
 *    "Duke vs North Carolina"
 *  We strip common prefixes/suffixes, split on "vs"/"at"/"versus",
 *  and also extract abbreviations. */
function extractTeamNames(marketTitle: string): string[] {
  let cleaned = marketTitle;
  // Strip common Kalshi prefixes
  cleaned = cleaned.replace(/^Men'?s College Basketball Men'?s Game,?\s*/i, "");
  cleaned = cleaned.replace(/^Women'?s College Basketball[^,]*,?\s*/i, "");
  // Strip date suffixes like "(Feb 23)" or "(2/23)"
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, "");
  // Strip "Winner?" suffix
  cleaned = cleaned.replace(/\s*Winner\??$/i, "");

  // Split on commas BEFORE normalizing (normalization removes commas)
  // "Louisville, LOU at UNC" → split commas → ["Louisville", "LOU at UNC"]
  const commaParts = cleaned.split(/\s*,\s*/);

  const result: string[] = [];
  for (const cp of commaParts) {
    const norm = normalize(cp);
    // Split on vs/at/versus separators
    const parts = norm.split(/\s+(?:vs?\.?|at|versus)\s+/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
        // Also add individual words for short abbreviations (LOU, UNC, etc.)
        const words = trimmed.split(/\s+/);
        if (words.length > 1) {
          for (const w of words) {
            if (w.length >= 2) result.push(w);
          }
        }
      }
    }
  }
  return [...new Set(result)]; // dedupe
}

/** Check if a market title references a given team.
 *  Matches against market (school name), full name, and abbreviation.
 *  Uses exact word matching to prevent "Purdue" matching "Purdue Fort Wayne". */
function titleReferencesTeam(titleParts: string[], team: DBTeam): boolean {
  const normMarket = normalize(team.market ?? "");
  const normName = normalize(team.name);
  const normAbbrev = normalize(team.abbreviation ?? "");
  // Drop mascot from full name: "Iowa Hawkeyes" → "Iowa"
  const nameWords = normName.split(" ");
  const nameMarket = nameWords.length > 1 ? nameWords.slice(0, -1).join(" ") : normName;

  for (const part of titleParts) {
    // Resolve alias (e.g., "unc" → "north carolina")
    const resolved = TEAM_ALIASES[part] ?? part;

    // Exact match against market name (most reliable)
    if (normMarket && (part === normMarket || resolved === normMarket)) return true;
    if (part === nameMarket || resolved === nameMarket) return true;
    if (part === normName || resolved === normName) return true;

    // Abbreviation match (handles "LOU", "NCAR", etc.)
    if (normAbbrev && part === normAbbrev) return true;

    // Check if the part starts with the market name at a word boundary
    // (handles "Iowa Hawkeyes" in title matching "Iowa" market)
    if (normMarket && part.startsWith(normMarket) &&
        (part.length === normMarket.length || part[normMarket.length] === " ")) {
      return true;
    }
    if (nameMarket && part.startsWith(nameMarket) &&
        (part.length === nameMarket.length || part[nameMarket.length] === " ")) {
      return true;
    }

    // Check if market starts with the part (handles short Kalshi names)
    // "iowa" matches team market "iowa" but NOT "iowa state"
    if (normMarket && normMarket === part) return true;
  }
  return false;
}

/** Find the best matching game for a market title.
 *  Returns game_id or null. Requires BOTH teams in the title to match. */
function matchMarketToGame(
  marketTitle: string,
  dbTeams: DBTeam[],
  dbGames: DBGame[],
): string | null {
  if (!marketTitle || marketTitle.trim().length === 0) return null;

  const titleParts = extractTeamNames(marketTitle);
  if (titleParts.length < 2) {
    // Can't identify two teams — try matching against game title directly
    const normTitle = normalize(marketTitle);
    for (const game of dbGames) {
      if (game.title) {
        const normGameTitle = normalize(game.title);
        // Check if market title is contained in game title or vice versa
        if (normGameTitle.includes(normTitle) || normTitle.includes(normGameTitle)) {
          return game.id;
        }
      }
    }
    return null;
  }

  // Build team lookup
  const teamById: Record<string, DBTeam> = {};
  for (const t of dbTeams) {
    teamById[t.id] = t;
  }

  // For each game, check if BOTH teams appear in the market title
  for (const game of dbGames) {
    if (!game.home_team_id || !game.away_team_id) continue;
    const homeTeam = teamById[game.home_team_id];
    const awayTeam = teamById[game.away_team_id];
    if (!homeTeam || !awayTeam) continue;

    const homeMatch = titleReferencesTeam(titleParts, homeTeam);
    const awayMatch = titleReferencesTeam(titleParts, awayTeam);

    if (homeMatch && awayMatch) {
      return game.id;
    }
  }

  // Fallback: try matching against game title field directly
  const normTitle = normalize(marketTitle);
  for (const game of dbGames) {
    if (!game.title) continue;
    const normGameTitle = normalize(game.title);
    if (normGameTitle.includes(normTitle) || normTitle.includes(normGameTitle)) {
      return game.id;
    }
  }

  // Single-team fallback: if only ONE team matches and only ONE game has that team,
  // it's unambiguous
  const matchedGameIds = new Set<string>();
  for (const game of dbGames) {
    if (!game.home_team_id || !game.away_team_id) continue;
    const homeTeam = teamById[game.home_team_id];
    const awayTeam = teamById[game.away_team_id];
    if (!homeTeam || !awayTeam) continue;

    const homeMatch = titleReferencesTeam(titleParts, homeTeam);
    const awayMatch = titleReferencesTeam(titleParts, awayTeam);
    if (homeMatch || awayMatch) {
      matchedGameIds.add(game.id);
    }
  }
  if (matchedGameIds.size === 1) {
    return matchedGameIds.values().next().value!;
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

    // Load teams and active games for matching
    const { data: dbTeams } = await supabase
      .from("teams")
      .select("id, name, market, abbreviation");
    const { data: dbGames } = await supabase
      .from("games")
      .select("id, home_team_id, away_team_id, status, title")
      .in("status", ["scheduled", "inprogress", "halftime", "closed"]);

    // Get all Kalshi connections
    const { data: kalshiConns } = await supabase
      .from("connections")
      .select("user_id, metadata")
      .eq("provider_key", "kalshi")
      .eq("connected", true);

    // Get all Polymarket connections
    const { data: polyConns } = await supabase
      .from("connections")
      .select("user_id, metadata")
      .eq("provider_key", "polymarket")
      .eq("connected", true);

    let positionsUpserted = 0;
    let positionsMatched = 0;
    let positionsUnmatched = 0;

    // Process Kalshi users (RSA-PSS API key auth)
    for (const conn of kalshiConns ?? []) {
      const meta = conn.metadata as {
        api_key_id?: string;
        private_key?: string;
      } | null;
      if (!meta?.api_key_id || !meta?.private_key) continue;

      try {
        const cryptoKey = await importRsaPrivateKey(meta.private_key);
        const posPath = "/trade-api/v2/portfolio/positions";
        const ts = Date.now().toString();
        const sig = await signKalshiRequest(cryptoKey, ts, "GET", posPath);

        const posRes = await fetch(`${KALSHI_API_BASE}${posPath}`, {
          headers: {
            "KALSHI-ACCESS-KEY": meta.api_key_id,
            "KALSHI-ACCESS-SIGNATURE": sig,
            "KALSHI-ACCESS-TIMESTAMP": ts,
          },
        });

        if (!posRes.ok) {
          console.warn(`Kalshi API error for user ${conn.user_id}: ${posRes.status}`);
          continue;
        }

        const posData = await posRes.json();
        const positions = posData.market_positions ?? [];

        // Bug fix 1: Fetch the EVENT title, not the market (contract) title.
        // In Kalshi API v2, market.title is the YES/NO contract description
        // (e.g. "Houston wins by over 1.5 points"), NOT the matchup name.
        // The human-readable event title (e.g. "Houston at Louisville") lives
        // on the event object at /trade-api/v2/events/{event_ticker}.
        const eventTitleCache: Record<string, string> = {};
        for (const pos of positions) {
          const ticker = pos.market_ticker ?? pos.ticker ?? "";
          // event_ticker may be returned directly, or we derive it by stripping
          // the -YES / -NO suffix from the market ticker.
          const eventTicker: string =
            pos.event_ticker ?? ticker.replace(/-[A-Z]{2,6}$/, "");
          if (eventTicker && !eventTitleCache[eventTicker]) {
            try {
              const evtPath = `/trade-api/v2/events/${eventTicker}`;
              const evtTs = Date.now().toString();
              const evtSig = await signKalshiRequest(cryptoKey, evtTs, "GET", evtPath);
              const evtRes = await fetch(`${KALSHI_API_BASE}${evtPath}`, {
                headers: {
                  "KALSHI-ACCESS-KEY": meta.api_key_id,
                  "KALSHI-ACCESS-SIGNATURE": evtSig,
                  "KALSHI-ACCESS-TIMESTAMP": evtTs,
                },
              });
              if (evtRes.ok) {
                const evtData = await evtRes.json();
                const event = evtData.event ?? evtData;
                eventTitleCache[eventTicker] = event.title ?? eventTicker;
              } else {
                eventTitleCache[eventTicker] = eventTicker;
              }
            } catch (e) {
              console.warn(`Failed to fetch event details for ${eventTicker}:`, e);
              eventTitleCache[eventTicker] = eventTicker;
            }
          }
        }

        // Bug fix 3: Deduplicate by event_ticker.
        // Multiple Kalshi markets (YES/NO contracts or spread variants) can belong
        // to the same event. Using market_ticker as the DB key creates duplicate
        // rows for the same game. We group by event_ticker and keep the position
        // with the largest quantity.
        const eventPositions: Record<string, typeof positions[0]> = {};
        for (const pos of positions) {
          const ticker = pos.market_ticker ?? pos.ticker ?? "";
          const eventTicker: string =
            pos.event_ticker ?? ticker.replace(/-[A-Z]{2,6}$/, "");
          const qty = Math.abs(pos.position_fp ?? 0);
          const existing = eventPositions[eventTicker];
          if (!existing) {
            eventPositions[eventTicker] = pos;
          } else {
            const existingQty = Math.abs(existing.position_fp ?? 0);
            if (qty > existingQty) eventPositions[eventTicker] = pos;
          }
        }

        const currentEventTickers: string[] = [];
        for (const [eventTicker, pos] of Object.entries(eventPositions)) {
          const marketTitle = eventTitleCache[eventTicker] ?? eventTicker;
          const gameId = matchMarketToGame(marketTitle, dbTeams ?? [], dbGames ?? []);

          if (gameId) {
            positionsMatched++;
          } else {
            positionsUnmatched++;
            console.warn(`[poll-markets] No game match for Kalshi position: "${marketTitle}"`);
          }

          currentEventTickers.push(eventTicker);

          const { error } = await supabase.from("prediction_positions").upsert(
            {
              user_id: conn.user_id,
              platform: "kalshi",
              market_id: eventTicker,
              market_title: marketTitle,
              game_id: gameId,
              position_side: (pos.position_fp ?? 0) >= 0 ? "yes" : "no",
              quantity: Math.abs(pos.position_fp ?? 0),
              avg_price: pos.market_exposure_dollars != null
                ? parseFloat(pos.market_exposure_dollars) / (Math.abs(pos.position_fp ?? 1) || 1)
                : 0,
              current_price: null,
              pnl: pos.realized_pnl_dollars != null ? parseFloat(pos.realized_pnl_dollars) : null,
              settled: false,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform,market_id", ignoreDuplicates: false }
          );

          if (!error) positionsUpserted++;
        }

        // Bug fix 2: Delete stale positions that are no longer in the user's
        // Kalshi portfolio. Without this, resolved or sold positions persist
        // in the DB indefinitely.
        const { data: existingRows } = await supabase
          .from("prediction_positions")
          .select("id, market_id")
          .eq("user_id", conn.user_id)
          .eq("platform", "kalshi");

        const staleIds = (existingRows ?? [])
          .filter((row) => !currentEventTickers.includes(row.market_id))
          .map((row) => row.id);

        if (staleIds.length > 0) {
          await supabase
            .from("prediction_positions")
            .delete()
            .in("id", staleIds);
        }
      } catch (e) {
        console.warn(`Kalshi fetch error for user ${conn.user_id}:`, e);
      }
    }

    // Process Polymarket users
    for (const conn of polyConns ?? []) {
      const meta = conn.metadata as { wallet_address?: string } | null;
      if (!meta?.wallet_address) continue;

      try {
        const posRes = await fetch(
          `${POLYMARKET_CLOB_BASE}/positions?user=${meta.wallet_address}`
        );
        if (!posRes.ok) continue;

        const positions = await posRes.json();

        for (const pos of Array.isArray(positions) ? positions : []) {
          const marketTitle = (pos.title ?? "") as string;
          const gameId = matchMarketToGame(marketTitle, dbTeams ?? [], dbGames ?? []);

          if (gameId) {
            positionsMatched++;
          } else if (marketTitle) {
            positionsUnmatched++;
            console.warn(`[poll-markets] No game match for Polymarket position: "${marketTitle}"`);
          }

          const { error } = await supabase.from("prediction_positions").upsert(
            {
              user_id: conn.user_id,
              platform: "polymarket",
              market_id: pos.condition_id ?? pos.token_id ?? `poly-${marketTitle.slice(0, 100)}`,
              market_title: marketTitle,
              game_id: gameId,
              position_side: pos.outcome === "Yes" ? "yes" : "no",
              quantity: parseFloat(pos.size ?? "0"),
              avg_price: parseFloat(pos.avg_price ?? "0"),
              current_price: pos.current_price
                ? parseFloat(pos.current_price)
                : null,
              pnl: pos.pnl ? parseFloat(pos.pnl) : null,
              settled: pos.is_settled ?? false,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform,market_id", ignoreDuplicates: false }
          );

          if (!error) positionsUpserted++;
        }
      } catch (e) {
        console.warn(`Polymarket fetch error for user ${conn.user_id}:`, e);
      }
    }

    const result = {
      success: true,
      kalshiUsers: (kalshiConns ?? []).length,
      polymarketUsers: (polyConns ?? []).length,
      positionsUpserted,
      positionsMatched,
      positionsUnmatched,
    };

    console.log(JSON.stringify({
      function: "poll-markets",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("poll-markets error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
