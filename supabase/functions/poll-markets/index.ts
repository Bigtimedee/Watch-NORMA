// poll-markets: Fetch Kalshi/Polymarket NCAAB prediction market positions
// For each user with a connected Kalshi/Polymarket account, fetches their positions
// and matches them to games in the DB.
//
// Trigger: pg_cron every 5 minutes + on-demand

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { importRsaPrivateKey, signKalshiRequest, decryptPrivateKey } from "../_shared/kalshi-crypto.ts";
import {
  computeOpenPnl,
  kalshiCurrentPrice,
  matchMarketTitleToGame,
  type KalshiMarketLike,
} from "../_shared/prediction-market.ts";

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
      .select("id, home_team_id, away_team_id, status, title")
      .in("status", ["scheduled", "inprogress", "halftime", "closed"]);

    // Get all Kalshi connections
    const { data: kalshiConns } = await supabase
      .from("connections")
      .select("user_id, metadata, private_key_enc")
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

    const kalshiEncKey = Deno.env.get("KALSHI_ENCRYPTION_KEY");

    // Process Kalshi users (RSA-PSS API key auth)
    for (const conn of kalshiConns ?? []) {
      const meta = conn.metadata as {
        api_key_id?: string;
        private_key?: string;
      } | null;
      if (!meta?.api_key_id) continue;

      // Prefer encrypted column; fall back to legacy plaintext in metadata
      let privateKeyPem: string | undefined;
      if (conn.private_key_enc && kalshiEncKey) {
        try {
          privateKeyPem = await decryptPrivateKey(conn.private_key_enc, kalshiEncKey);
        } catch {
          console.warn(`Kalshi decrypt failed for user ${conn.user_id} — skipping`);
          continue;
        }
      } else if (meta?.private_key) {
        privateKeyPem = meta.private_key;
      }
      if (!privateKeyPem) continue;

      try {
        const cryptoKey = await importRsaPrivateKey(privateKeyPem);
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
        // Event cache now also keeps the event's sub-markets: each carries
        // its own live book (yes/no bid-ask, last trade) keyed by ticker,
        // which is what prices a position. NOTE: Kalshi also reports which
        // team a sub-market is on (yes_sub_title, e.g. "Ohio St."), but
        // prediction_positions has no column for it, so it is not persisted;
        // position_side + the priced sub-market ticker identify it in logs.
        const eventTitleCache: Record<string, { title: string; markets: KalshiMarketLike[] }> = {};
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
                eventTitleCache[eventTicker] = {
                  title: event.title ?? eventTicker,
                  markets: (evtData.markets ?? event.markets ?? []) as KalshiMarketLike[],
                };
              } else {
                eventTitleCache[eventTicker] = { title: eventTicker, markets: [] };
              }
            } catch (e) {
              console.warn(`Failed to fetch event details for ${eventTicker}:`, e);
              eventTitleCache[eventTicker] = { title: eventTicker, markets: [] };
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
          const marketTitle = eventTitleCache[eventTicker]?.title ?? eventTicker;
          const gameId = matchMarketTitleToGame(marketTitle, dbTeams ?? [], dbGames ?? []);

          // Live price for THIS position's sub-market (pos.market_ticker,
          // e.g. ...-OSU), not the event. Prefer the markets already returned
          // with the event; fall back to the public market endpoint (no auth,
          // same pattern as resolve-predictions).
          const positionSide = (pos.position_fp ?? 0) >= 0 ? "yes" : "no";
          const marketTicker = pos.market_ticker ?? pos.ticker ?? "";
          let kalshiMarket: KalshiMarketLike | null =
            eventTitleCache[eventTicker]?.markets.find((m) => m.ticker === marketTicker) ?? null;
          if (!kalshiMarket && marketTicker) {
            try {
              const mRes = await fetch(`${KALSHI_API_BASE}/trade-api/v2/markets/${encodeURIComponent(marketTicker)}`);
              if (mRes.ok) {
                const mData = await mRes.json();
                kalshiMarket = (mData.market ?? mData) as KalshiMarketLike;
              }
            } catch (e) {
              console.warn(`Failed to fetch Kalshi market ${marketTicker}:`, e);
            }
          }
          const currentPrice = kalshiCurrentPrice(kalshiMarket, positionSide);
          const avgPrice = pos.market_exposure_dollars != null
            ? parseFloat(pos.market_exposure_dollars) / (Math.abs(pos.position_fp ?? 1) || 1)
            : 0;
          const pnl = computeOpenPnl({
            quantity: Math.abs(pos.position_fp ?? 0),
            avgPrice,
            currentPrice,
            realizedPnl: pos.realized_pnl_dollars != null ? parseFloat(pos.realized_pnl_dollars) : null,
          });

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
              position_side: positionSide,
              quantity: Math.abs(pos.position_fp ?? 0),
              avg_price: avgPrice,
              current_price: currentPrice,
              pnl,
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
          const gameId = matchMarketTitleToGame(marketTitle, dbTeams ?? [], dbGames ?? []);

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
