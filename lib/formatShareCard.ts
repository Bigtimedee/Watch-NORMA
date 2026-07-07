import type { Alert, Game } from "./types";

export interface ShareCardData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  clockDisplay: string;
  headline: string;
  topBullet: string | null;
  wagerLine: string | null; // only populated when user opts in — never amounts, stakes, or P&L
}

export function formatAlertShareCard(
  alert: Alert,
  includeWagerLine: boolean,
): ShareCardData {
  const game = alert.game ?? null;
  return {
    homeTeam: game?.home_team?.market ?? game?.home_team?.name ?? "Home",
    awayTeam: game?.away_team?.market ?? game?.away_team?.name ?? "Away",
    homeScore: game && game.status !== "scheduled" ? game.home_score : null,
    awayScore: game && game.status !== "scheduled" ? game.away_score : null,
    clockDisplay: shareClockDisplay(game),
    headline: alert.explanation?.headline ?? alert.title,
    topBullet: alert.explanation?.bullets?.[0] ?? null,
    wagerLine:
      includeWagerLine && alert.explanation?.wager_impact
        ? alert.explanation.wager_impact.wager_description
        : null,
  };
}

export function formatGameShareCard(game: Game): ShareCardData {
  const isLive = game.status === "inprogress" || game.status === "halftime";
  return {
    homeTeam: game.home_team?.market ?? game.home_team?.name ?? "Home",
    awayTeam: game.away_team?.market ?? game.away_team?.name ?? "Away",
    homeScore: game.status !== "scheduled" ? game.home_score : null,
    awayScore: game.status !== "scheduled" ? game.away_score : null,
    clockDisplay: shareClockDisplay(game),
    headline: isLive ? "Watch Now" : game.status === "closed" ? "Final Score" : "Upcoming Game",
    topBullet: null,
    wagerLine: null,
  };
}

function shareClockDisplay(game: Game | null): string {
  if (!game) return "";
  switch (game.status) {
    case "closed": return "Final";
    case "halftime": return "Halftime";
    case "cancelled": return "Cancelled";
    case "postponed": return "Postponed";
    case "scheduled": return "";
    default:
      if (game.clock && game.period) return `${game.clock} · P${game.period}`;
      if (game.period) return `Period ${game.period}`;
      return "Live";
  }
}
