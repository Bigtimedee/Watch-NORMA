// poll-markets: Fetch Kalshi/Polymarket NCAAB prediction market positions
// For each user with a connected Kalshi/Polymarket account, fetches their positions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { importRsaPrivateKey, signKalshiRequest } from "../_shared/kalshi-crypto.ts";

const KALSHI_API_BASE = "https://api.elections.kalshi.com";
const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com";

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
      .select("id, home_team_id, away_team_id, status")
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

        if (!posRes.ok) continue;

        const posData = await posRes.json();
        const positions = posData.market_positions ?? [];

        for (const pos of positions) {
          // Try to match to a game based on the market title
          let gameId: string | null = null;
          if (dbTeams && dbGames && pos.market_title) {
            for (const game of dbGames) {
              const homeTeam = dbTeams.find((t) => t.id === game.home_team_id);
              const awayTeam = dbTeams.find((t) => t.id === game.away_team_id);
              if (!homeTeam || !awayTeam) continue;

              const title = pos.market_title.toLowerCase();
              if (
                title.includes(homeTeam.name.toLowerCase()) ||
                title.includes(awayTeam.name.toLowerCase())
              ) {
                gameId = game.id;
                break;
              }
            }
          }

          const { error } = await supabase.from("prediction_positions").upsert(
            {
              user_id: conn.user_id,
              platform: "kalshi",
              market_id: pos.market_ticker ?? pos.market_id ?? "",
              market_title: pos.market_title ?? pos.market_ticker ?? "",
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
          let gameId: string | null = null;
          if (dbTeams && dbGames && pos.title) {
            for (const game of dbGames) {
              const homeTeam = dbTeams.find((t) => t.id === game.home_team_id);
              const awayTeam = dbTeams.find((t) => t.id === game.away_team_id);
              if (!homeTeam || !awayTeam) continue;

              const title = (pos.title as string).toLowerCase();
              if (
                title.includes(homeTeam.name.toLowerCase()) ||
                title.includes(awayTeam.name.toLowerCase())
              ) {
                gameId = game.id;
                break;
              }
            }
          }

          const { error } = await supabase.from("prediction_positions").upsert(
            {
              user_id: conn.user_id,
              platform: "polymarket",
              market_id: pos.condition_id ?? pos.token_id ?? "",
              market_title: pos.title ?? "",
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

    return new Response(
      JSON.stringify({
        success: true,
        kalshiUsers: (kalshiConns ?? []).length,
        polymarketUsers: (polyConns ?? []).length,
        positionsUpserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
