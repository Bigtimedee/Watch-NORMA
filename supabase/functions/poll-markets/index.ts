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
 *  Kalshi titles look like: "Iowa vs Wisconsin", "Iowa at Wisconsin",
 *  "Duke vs North Carolina", etc.
 *  We split on "vs", "at", "v.", and return each side as a candidate name. */
function extractTeamNames(marketTitle: string): string[] {
  const norm = normalize(marketTitle);
  // Split on common separators
  const parts = norm.split(/\s+(?:vs?\.?|at|versus)\s+/);
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

/** Check if a market title references a given team.
 *  Matches against market (school name), full name, and abbreviation.
 *  Uses exact word matching to prevent "Purdue" matching "Purdue Fort Wayne". */
function titleReferencesTeam(titleParts: string[], team: DBTeam): boolean {
  const normMarket = normalize(team.market ?? "");
  const normName = normalize(team.name);
  // Drop mascot from full name: "Iowa Hawkeyes" → "Iowa"
  const nameWords = normName.split(" ");
  const nameMarket = nameWords.length > 1 ? nameWords.slice(0, -1).join(" ") : normName;

  for (const part of titleParts) {
    // Exact match against market name (most reliable)
    if (normMarket && part === normMarket) return true;
    if (part === nameMarket) return true;
    if (part === normName) return true;

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
      .in("status", ["scheduled", "inprogress", "halftime"]);

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

        // Enrich positions with market titles from the markets endpoint.
        // Kalshi positions only return ticker, not title — we need to fetch each market.
        const marketTitleCache: Record<string, string> = {};
        for (const pos of positions) {
          const ticker = pos.market_ticker ?? pos.ticker ?? "";
          if (ticker && !marketTitleCache[ticker]) {
            try {
              const mktPath = `/trade-api/v2/markets/${ticker}`;
              const mktTs = Date.now().toString();
              const mktSig = await signKalshiRequest(cryptoKey, mktTs, "GET", mktPath);
              const mktRes = await fetch(`${KALSHI_API_BASE}${mktPath}`, {
                headers: {
                  "KALSHI-ACCESS-KEY": meta.api_key_id,
                  "KALSHI-ACCESS-SIGNATURE": mktSig,
                  "KALSHI-ACCESS-TIMESTAMP": mktTs,
                },
              });
              if (mktRes.ok) {
                const mktData = await mktRes.json();
                const market = mktData.market ?? mktData;
                // Use event_ticker title, subtitle, or market title
                marketTitleCache[ticker] = market.title ?? market.subtitle ?? market.event_ticker ?? ticker;
              }
            } catch (e) {
              console.warn(`Failed to fetch market details for ${ticker}:`, e);
            }
          }
        }

        for (const pos of positions) {
          const ticker = pos.market_ticker ?? pos.ticker ?? "";
          const marketTitle = marketTitleCache[ticker] || pos.market_title || ticker;
          const gameId = matchMarketToGame(marketTitle, dbTeams ?? [], dbGames ?? []);

          if (gameId) {
            positionsMatched++;
          } else {
            positionsUnmatched++;
            console.warn(`[poll-markets] No game match for Kalshi position: "${marketTitle}"`);
          }

          const { error } = await supabase.from("prediction_positions").upsert(
            {
              user_id: conn.user_id,
              platform: "kalshi",
              market_id: pos.market_ticker ?? pos.market_id ?? "",
              market_title: marketTitle,
              game_id: gameId,
              position_side: (pos.total_traded_yes ?? 0) > 0 ? "yes" : "no",
              quantity:
                Math.max(pos.total_traded_yes ?? 0, pos.total_traded_no ?? 0),
              avg_price: pos.average_price ?? 0,
              current_price: pos.market_price ?? null,
              pnl: pos.realized_pnl ?? null,
              settled: pos.is_settled ?? false,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "user_id,platform,market_id", ignoreDuplicates: false }
          );

          if (!error) positionsUpserted++;
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
              market_id: pos.condition_id ?? pos.token_id ?? "",
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
