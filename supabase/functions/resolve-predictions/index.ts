// resolve-predictions: Settle open prediction_positions when a game closes.
//
// Called by game-watcher-orchestrator (Step 2) before evaluate-alerts fires,
// so that evaluatePredictionResolved() has outcome + payout_amount available.
//
// Approach:
//   1. Query unsettled positions for the given game_id
//   2. For each unique market_id, call Kalshi public API to get market result
//   3. Fall back to game-score inference for markets where API fails
//   4. Write outcome ("yes" | "no" | "unknown") + payout_amount to each position
//   5. Mark settled = true
//
// The function is idempotent: positions with settled = true are skipped.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Kalshi public market endpoint — no auth required
const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const KALSHI_TIMEOUT_MS = 8_000;

interface KalshiMarket {
  ticker: string;
  status: string; // "finalized" | "settled" | "open" | ...
  result: string | null; // "yes" | "no" | null (when not finalized)
}

interface SettleResult {
  settled: number;
  skipped: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const nowIso = new Date().toISOString();

  try {
    const { gameId } = await req.json();
    if (!gameId) {
      return new Response(
        JSON.stringify({ error: "gameId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Fetch game for score-inference fallback ---
    const { data: game } = await supabase
      .from("games")
      .select("id, status, home_score, away_score, home_team_id, away_team_id")
      .eq("id", gameId)
      .single();

    // --- Fetch all unsettled positions for this game ---
    const { data: positions, error: posErr } = await supabase
      .from("prediction_positions")
      .select("id, user_id, platform, market_id, market_title, position_side, quantity, avg_price")
      .eq("game_id", gameId)
      .eq("settled", false);

    if (posErr) {
      console.error(JSON.stringify({
        function: "resolve-predictions",
        event: "positions_fetch_error",
        gameId,
        error: posErr.message,
        timestamp: nowIso,
      }));
      return new Response(
        JSON.stringify({ error: "Failed to fetch positions", detail: posErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!positions || positions.length === 0) {
      console.log(JSON.stringify({
        function: "resolve-predictions",
        event: "no_unsettled_positions",
        gameId,
        timestamp: nowIso,
      }));
      return new Response(
        JSON.stringify({ settled: 0, skipped: 0, errors: [] } satisfies SettleResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- De-duplicate market IDs for Kalshi API calls ---
    const uniqueMarketIds = [...new Set(
      positions
        .filter((p) => p.platform?.toLowerCase() === "kalshi" && p.market_id)
        .map((p) => p.market_id as string)
    )];

    // --- Fetch Kalshi market results in parallel ---
    const kalshiResults = new Map<string, KalshiMarket>();
    await Promise.allSettled(
      uniqueMarketIds.map(async (ticker) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), KALSHI_TIMEOUT_MS);
          const resp = await fetch(
            `${KALSHI_API_BASE}/markets/${encodeURIComponent(ticker)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);

          if (resp.ok) {
            const json = await resp.json();
            const market: KalshiMarket = json.market ?? json;
            if (market?.ticker) {
              kalshiResults.set(ticker, market);
            }
          } else {
            console.warn(JSON.stringify({
              function: "resolve-predictions",
              event: "kalshi_api_error",
              ticker,
              status: resp.status,
              timestamp: nowIso,
            }));
          }
        } catch (e) {
          console.warn(JSON.stringify({
            function: "resolve-predictions",
            event: "kalshi_api_timeout",
            ticker,
            error: (e as Error).message,
            timestamp: nowIso,
          }));
        }
      })
    );

    // --- Settle each position ---
    const result: SettleResult = { settled: 0, skipped: 0, errors: [] };

    for (const pos of positions) {
      try {
        let outcome: "yes" | "no" | "unknown" = "unknown";
        let marketResult: string | null = null;

        // Try Kalshi API first
        if (pos.platform?.toLowerCase() === "kalshi" && pos.market_id) {
          const market = kalshiResults.get(pos.market_id);
          if (
            market &&
            (market.status === "finalized" || market.status === "settled") &&
            (market.result === "yes" || market.result === "no")
          ) {
            marketResult = market.result;
          }
        }

        // Fallback: infer from game score if market_title contains a team name
        if (marketResult === null && game) {
          marketResult = inferOutcomeFromScore(pos.market_title, pos.position_side, game);
        }

        if (marketResult === "yes" || marketResult === "no") {
          outcome = pos.position_side?.toLowerCase() === marketResult ? "yes" : "no";
        }

        // Compute payout_amount
        // Kalshi contracts: each "yes" contract pays $1 if yes wins, $0 if no wins.
        // A position bought at avg_price (e.g. $0.60) for quantity contracts:
        //   Win:  profit = quantity * (1 - avg_price)
        //   Loss: loss   = quantity * avg_price  (as a negative number)
        let payout_amount: number | null = null;
        if (outcome === "yes") {
          payout_amount = pos.quantity * (1 - pos.avg_price);
        } else if (outcome === "no") {
          payout_amount = -(pos.quantity * pos.avg_price);
        }

        // Round to 2 decimal places
        if (payout_amount !== null) {
          payout_amount = Math.round(payout_amount * 100) / 100;
        }

        const { error: updateErr } = await supabase
          .from("prediction_positions")
          .update({
            outcome,
            payout_amount,
            settled: true,
          })
          .eq("id", pos.id);

        if (updateErr) {
          result.errors.push(`position ${pos.id}: ${updateErr.message}`);
        } else {
          result.settled++;
        }
      } catch (e) {
        result.errors.push(`position ${pos.id}: ${(e as Error).message}`);
      }
    }

    console.log(JSON.stringify({
      function: "resolve-predictions",
      event: "completed",
      gameId,
      settled: result.settled,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: nowIso,
    }));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(JSON.stringify({
      function: "resolve-predictions",
      event: "unhandled_error",
      error: (e as Error).message,
      timestamp: nowIso,
    }));
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Score inference fallback ---
// Checks whether the market_title mentions a team name that won/lost,
// then maps that to "yes" or "no" based on position_side.
// Returns null when inference is not possible.
function inferOutcomeFromScore(
  marketTitle: string,
  positionSide: string,
  game: { home_score: number; away_score: number; home_team_id: string; away_team_id: string }
): "yes" | "no" | null {
  if (!marketTitle || game.home_score == null || game.away_score == null) return null;
  if (game.home_score === game.away_score) return null; // tie — no inference

  const titleLower = marketTitle.toLowerCase();
  const homeName = game.home_team_id?.toLowerCase() ?? "";
  const awayName = game.away_team_id?.toLowerCase() ?? "";

  // We don't have team names here, only IDs. We can only infer if the
  // market_title contains "moneyline" or "win" phrasing.
  // For now, return null — the Kalshi API is the authoritative source.
  // This can be enhanced later with a team name join.
  void titleLower;
  void homeName;
  void awayName;

  return null;
}
