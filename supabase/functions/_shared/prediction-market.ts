// Shared helpers for poll-markets: Kalshi live pricing and matching a
// prediction-market event title ("Ohio St. vs Indiana") to a DB game.
// Extracted from poll-markets/index.ts so the logic is Deno-testable.

import { matchTeamName } from "./team-matching.ts";

export interface PredictionTeam {
  id: string;
  name: string;
  market: string | null;
  abbreviation: string | null;
}

export interface PredictionGame {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
  title?: string | null;
}

export interface KalshiMarketLike {
  ticker?: string;
  last_price_dollars?: string | number | null;
  previous_price_dollars?: string | number | null;
  yes_bid_dollars?: string | number | null;
  yes_ask_dollars?: string | number | null;
  no_bid_dollars?: string | number | null;
  no_ask_dollars?: string | number | null;
  yes_sub_title?: string | null;
  no_sub_title?: string | null;
}

function parseDollars(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function bidAskMidpoint(
  bid: string | number | null | undefined,
  ask: string | number | null | undefined,
): number | null {
  const b = parseDollars(bid);
  const a = parseDollars(ask);
  if (b == null || a == null || a < b) return null;
  if (b === 0 && a === 0) return null;
  return (b + a) / 2;
}

/**
 * Live price (0..1, what PositionCard renders as cents) for the side held.
 * Prefers the yes/no bid-ask midpoint (live, tradeable), falls back to the
 * last trade, then the previous price. For a "no" position the NO book is
 * used when present, otherwise 1 - yesPrice.
 */
export function kalshiCurrentPrice(
  market: KalshiMarketLike | null | undefined,
  positionSide: string,
): number | null {
  if (!market) return null;
  const yesPrice = bidAskMidpoint(market.yes_bid_dollars, market.yes_ask_dollars) ??
    parseDollars(market.last_price_dollars) ??
    parseDollars(market.yes_ask_dollars) ??
    parseDollars(market.yes_bid_dollars) ??
    parseDollars(market.previous_price_dollars);
  if (yesPrice == null) return null;
  let price = yesPrice;
  if (positionSide.toLowerCase() === "no") {
    price = bidAskMidpoint(market.no_bid_dollars, market.no_ask_dollars) ??
      (1 - yesPrice);
  }
  const clamped = Math.min(1, Math.max(0, price));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Open-position P&L in dollars: realized P&L plus unrealized
 * quantity * (current - avg). Returns realized (or null) when no live
 * price or no cost basis is available.
 */
export function computeOpenPnl(opts: {
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  realizedPnl: number | null;
}): number | null {
  const realized = opts.realizedPnl ?? 0;
  if (opts.currentPrice == null || !(opts.avgPrice > 0) || !(opts.quantity > 0)) {
    return opts.realizedPnl;
  }
  const pnl = realized + opts.quantity * (opts.currentPrice - opts.avgPrice);
  return Math.round(pnl * 100) / 100;
}

/** Split an event title into candidate team-name segments. */
export function extractMatchupTeamNames(marketTitle: string): string[] {
  let cleaned = marketTitle;
  cleaned = cleaned.replace(/^Men'?s College Basketball Men'?s Game,?\s*/i, "");
  cleaned = cleaned.replace(/^Women'?s College Basketball[^,]*,?\s*/i, "");
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, "");
  cleaned = cleaned.replace(/\s*Winner\??$/i, "");
  const segments: string[] = [];
  for (const commaPart of cleaned.split(/\s*,\s*/)) {
    for (const part of commaPart.split(/\s+(?:vs\.?|v\.?|at|versus)\s+/i)) {
      const t = part.trim();
      if (t) segments.push(t);
    }
  }
  return [...new Set(segments)];
}

/**
 * Match an event title to a game. Requires both teams to resolve (via
 * matchTeamName, which canonicalizes Ohio St./NOLA/NY etc.) to the two
 * teams of one game, in either orientation. Falls back to a single-team
 * match only when exactly one game involves that team.
 */
export function matchMarketTitleToGame(
  marketTitle: string,
  dbTeams: PredictionTeam[],
  dbGames: PredictionGame[],
): string | null {
  if (!marketTitle?.trim()) return null;
  const segments = extractMatchupTeamNames(marketTitle);
  const matched = new Map<string, PredictionTeam>();
  for (const seg of segments) {
    const team = matchTeamName(seg, dbTeams);
    if (team) matched.set(team.id, team);
  }
  const matchedTeams = [...matched.values()];
  if (matchedTeams.length >= 2) {
    for (const game of dbGames) {
      if (!game.home_team_id || !game.away_team_id) continue;
      const ids = new Set([game.home_team_id, game.away_team_id]);
      if (matchedTeams.every((t) => ids.has(t.id))) return game.id;
    }
  }
  if (matchedTeams.length === 1) {
    const teamId = matchedTeams[0].id;
    const candidates = dbGames.filter(
      (g) => g.home_team_id === teamId || g.away_team_id === teamId,
    );
    if (candidates.length === 1) return candidates[0].id;
  }
  return null;
}
