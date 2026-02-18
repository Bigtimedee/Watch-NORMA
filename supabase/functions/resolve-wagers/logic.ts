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
  team_id: string | null;
  line: number | null;
  description: string;
}

/**
 * Determine the outcome of a wager given final game scores.
 * Returns "won", "lost", "push", or null if the wager type is unrecognized.
 */
export function resolveWager(
  game: ResolveGame,
  wager: ResolveWager
): "won" | "lost" | "push" | null {
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const totalScore = homeScore + awayScore;
  const margin = homeScore - awayScore; // positive = home won

  if (wager.wager_type === "spread" && wager.line != null) {
    const isHome = wager.team_id === game.home_team_id;
    const spread = wager.line;
    const coverMargin = isHome ? margin + spread : -margin + spread;
    if (coverMargin > 0) return "won";
    if (coverMargin < 0) return "lost";
    return "push";
  }

  if (wager.wager_type === "moneyline") {
    const isHome = wager.team_id === game.home_team_id;
    if (isHome && margin > 0) return "won";
    if (!isHome && margin < 0) return "won";
    if (margin === 0) return "push";
    return "lost";
  }

  if (wager.wager_type === "over_under" && wager.line != null) {
    const isOver = wager.description.toLowerCase().includes("over");
    if (isOver && totalScore > wager.line) return "won";
    if (isOver && totalScore < wager.line) return "lost";
    if (!isOver && totalScore < wager.line) return "won";
    if (!isOver && totalScore > wager.line) return "lost";
    return "push";
  }

  return null;
}
