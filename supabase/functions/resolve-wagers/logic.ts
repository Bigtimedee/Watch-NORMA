// resolve-wagers/logic.ts — Pure wager resolution function extracted for testability

export interface ResolveGame {
  id: string;
  home_score: number;
  away_score: number;
  home_team_id: string | null;
  away_team_id: string | null;
}

export interface ResolveWager {
  id: number;
  game_id: string;
  wager_type: string | null;
  market_type?: string | null;
  team_id: string | null;
  line: number | null;
  description: string;
}

/**
 * Normalize wager type from various sources (v1 wager_type, v2 market_type,
 * email parser values) to canonical resolver types.
 *
 * Canonical types: "spread" | "moneyline" | "over_under" | "player_prop" | "parlay" | "futures"
 */
export function normalizeWagerType(
  wagerType: string | null | undefined,
  marketType?: string | null,
): string | null {
  // Prefer market_type if wager_type is missing or generic
  const raw = (wagerType ?? marketType ?? "").toLowerCase().trim();
  if (!raw) return null;

  // Map v2 / email-parser names → canonical resolver names
  switch (raw) {
    case "spread":
      return "spread";
    case "moneyline":
    case "ml":
      return "moneyline";
    case "over_under":
    case "total":
    case "totals":
    case "o/u":
      return "over_under";
    case "prop":
    case "player_prop":
      return "player_prop";
    case "parlay":
      return "parlay";
    case "futures":
    case "future":
      return "futures";
    default:
      return null;
  }
}

/**
 * Determine the outcome of a wager given final game scores.
 * Returns "won", "lost", "push", or null if the wager type is unrecognized
 * or cannot be resolved automatically (e.g., player props, futures, parlays).
 */
export function resolveWager(
  game: ResolveGame,
  wager: ResolveWager
): "won" | "lost" | "push" | null {
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const totalScore = homeScore + awayScore;
  const margin = homeScore - awayScore; // positive = home won

  const type = normalizeWagerType(wager.wager_type, wager.market_type);

  if (type === "spread" && wager.line != null) {
    const isHome = wager.team_id === game.home_team_id;
    const spread = wager.line;
    const coverMargin = isHome ? margin + spread : -margin + spread;
    if (coverMargin > 0) return "won";
    if (coverMargin < 0) return "lost";
    return "push";
  }

  if (type === "moneyline") {
    const isHome = wager.team_id === game.home_team_id;
    if (isHome && margin > 0) return "won";
    if (!isHome && margin < 0) return "won";
    if (margin === 0) return "push";
    return "lost";
  }

  if (type === "over_under" && wager.line != null) {
    const isOver = wager.description.toLowerCase().includes("over");
    if (isOver && totalScore > wager.line) return "won";
    if (isOver && totalScore < wager.line) return "lost";
    if (!isOver && totalScore < wager.line) return "won";
    if (!isOver && totalScore > wager.line) return "lost";
    return "push";
  }

  // Player props, futures, and parlays require external data (box score stats,
  // future event outcomes, all leg results) that we don't have in this function.
  // Return null so they remain "active" until manual resolution or a dedicated
  // resolver is implemented.
  return null;
}
