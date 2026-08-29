// evaluate-alerts/logic.ts — Pure functions extracted for testability

import { parseWagerTarget } from "../_shared/wager-target-parser.ts";
import type { WagerTarget } from "../_shared/wager-target-parser.ts";
import { computeProximity } from "../_shared/outcome-proximity.ts";
import type { ProximityResult } from "../_shared/outcome-proximity.ts";

export type { WagerTarget, ProximityResult };

export const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between same-type alerts

// --- Interfaces ---

export interface GameState {
  id: string;
  status: string;
  home_score: number;
  away_score: number;
  clock: string | null;
  period: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  sportradar_id: string | null;
  coverage_level: string | null;
  broadcast: string | null;
  home_team: { name: string; abbreviation: string } | null;
  away_team: { name: string; abbreviation: string } | null;
  sport?: string | null;
  /** Tournament identifier surfaced by the ingestion path (e.g. "Sweet 16",
   *  "Bowl Game"). Optional — poll-* functions attach it opportunistically. */
  tournament_round?: string | null;
}

export interface UserWager {
  id: number;
  user_id: string;
  wager_type: string | null;
  team_id: string | null;
  line: number | null;
  odds: string | null;
  description: string;
  sportsbook: string | null;
  parsed_target?: WagerTarget | null;
}

export interface UserPosition {
  id: number;
  user_id: string;
  platform: string;
  market_title: string;
  position_side: string;
  quantity: number;
  avg_price: number;
  parsed_target?: WagerTarget | null;
  settled?: boolean;
  outcome?: string | null;       // "yes" | "no" | "unknown" — set by resolve-predictions
  payout_amount?: number | null; // net dollar amount; positive = profit, negative = loss
}

export interface SummaryStats {
  source: string;
  home: {
    points: number;
    biggest_lead: number;
    bench_points: number;
    effective_fg_pct: number;
    points_off_turnovers: number;
    turnovers: number;
    players: Array<{
      full_name: string;
      starter: boolean;
      on_court: boolean;
      fouled_out: boolean;
      personal_fouls: number;
      points: number;
      rebounds: number;
      assists: number;
    }>;
  };
  away: {
    points: number;
    biggest_lead: number;
    bench_points: number;
    effective_fg_pct: number;
    points_off_turnovers: number;
    turnovers: number;
    players: Array<{
      full_name: string;
      starter: boolean;
      on_court: boolean;
      fouled_out: boolean;
      personal_fouls: number;
      points: number;
      rebounds: number;
      assists: number;
    }>;
  };
}

export interface AlertCandidate {
  alertType: string;
  title: string;
  body: string;
  why: string;
}

export function parseClockMinutes(clock: string | null): number | null {
  if (!clock) return null;
  const parts = clock.split(":");
  if (parts.length !== 2) return null;
  return parseInt(parts[0]) + parseInt(parts[1]) / 60;
}

// --- Spread Alert ---
// Fire when the margin is approaching/crossing the spread line in the second half

export function evaluateSpread(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null
): AlertCandidate | null {
  if (wager.wager_type !== "spread" || wager.line == null || !wager.team_id) return null;
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Only alert in the second half or OT, within final 10 minutes
  if (game.period < 2) return null;
  if (game.period === 2 && clockMins > 10) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const margin = game.home_score - game.away_score; // positive = home leading
  const currentMargin = isHomeTeamBet ? margin : -margin;
  const spreadLine = wager.line;

  // Alert when margin is within 4 points of the spread line
  const diff = currentMargin - spreadLine;
  if (Math.abs(diff) > 4) return null;

  const covering = diff > 0;
  const absMargin = Math.abs(margin);
  const periodLabel = game.period > 2 ? "OT" : "2nd half";

  // Build context from summary stats if available
  let context = "";
  if (summary) {
    const betSide = isHomeTeamBet ? "home" : "away";
    const biggestLead = summary[betSide].biggest_lead;
    if (biggestLead > absMargin + 5) {
      context = ` ${betTeamName} led by as many as ${biggestLead}.`;
    }
  }

  return {
    alertType: "spread_alert",
    title: `${betTeamName} ${spreadLine > 0 ? "+" : ""}${spreadLine}`,
    body: `${covering ? "Covering" : "Not covering"} — margin is ${absMargin} with ${game.clock} left`,
    why: `Your ${betTeamName} ${spreadLine > 0 ? "+" : ""}${spreadLine} bet is live — they ${currentMargin > 0 ? "lead" : "trail"} by ${absMargin} with ${game.clock} left in the ${periodLabel}.${context} Tune in now.`,
  };
}

// --- Over/Under Alert ---
// Fire when the scoring pace clearly indicates the total will go over or under

export function evaluateTotal(
  game: GameState,
  wager: UserWager
): AlertCandidate | null {
  if (wager.wager_type !== "over_under" || wager.line == null) return null;
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  const total = game.home_score + game.away_score;
  const line = wager.line;

  // Calculate minutes elapsed (college basketball: two 20-minute halves)
  const minutesElapsed = game.period === 1
    ? 20 - clockMins
    : game.period === 2
      ? 40 - clockMins
      : 40 + (5 * (game.period - 2)) - clockMins; // OT = 5 min periods

  // Need at least 15 minutes of data for pace to be meaningful
  if (minutesElapsed < 15) return null;

  const pace = (total / minutesElapsed) * 40;
  const description = wager.description.toLowerCase();
  const isOver = description.includes("over");
  const paceVsLine = pace - line;

  // Only alert when pace diverges meaningfully from the line
  if (Math.abs(paceVsLine) < 8) return null;

  // Only alert in second half
  if (game.period < 2) return null;

  const tracking = isOver
    ? (paceVsLine > 0 ? "on pace to hit" : "in danger")
    : (paceVsLine > 0 ? "in danger" : "on pace to hit");

  const betLabel = isOver ? `OVER ${line}` : `UNDER ${line}`;

  return {
    alertType: "total_alert",
    title: betLabel,
    body: `Total is ${total} — pace of ${Math.round(pace)} per 40 min`,
    why: `Your ${betLabel} is ${tracking}. Combined score is ${total} with ${game.clock} left, on pace for ~${Math.round(pace)}. Tune in now.`,
  };
}

// --- Moneyline Alert ---
// Fire when the user's moneyline team is in a tight game in the second half

export function evaluateMoneyline(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null
): AlertCandidate | null {
  if (wager.wager_type !== "moneyline" || !wager.team_id) return null;
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Only alert in second half or OT, within final 8 minutes
  if (game.period < 2) return null;
  if (game.period === 2 && clockMins > 8) return null;

  const margin = Math.abs(game.home_score - game.away_score);

  // Only alert when the game is close enough to be in doubt (within 8)
  if (margin > 8) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const oppTeamName = isHomeTeamBet
    ? (game.away_team?.abbreviation ?? "Away")
    : (game.home_team?.abbreviation ?? "Home");

  const homeLeading = game.home_score > game.away_score;
  const betTeamLeading = isHomeTeamBet ? homeLeading : !homeLeading;
  const periodLabel = game.period > 2 ? "overtime" : "the final minutes";

  let context = "";
  if (summary) {
    const betSide = isHomeTeamBet ? "home" : "away";
    if (summary[betSide].biggest_lead > margin + 8) {
      context = ` ${betTeamName} had led by ${summary[betSide].biggest_lead} earlier.`;
    }
  }

  return {
    alertType: "moneyline_alert",
    title: `${betTeamName} ML`,
    body: `${betTeamLeading ? "Leading" : "Trailing"} by ${margin} with ${game.clock} left`,
    why: `Your ${betTeamName} moneyline is ${betTeamLeading ? "alive but tight" : "at risk"} — ${margin}-point game in ${periodLabel}.${context} Tune in now.`,
  };
}

// --- MLB Alerts ---
// Basketball evaluators above require a MM:SS clock; MLB uses "T7"/"B9" (inning) format.
// These three functions handle spread/total/moneyline for baseball games.

export function parseMLBClock(clock: string | null): { inning: number; isTop: boolean } | null {
  if (!clock) return null;
  const m = clock.match(/^([TB])(\d+)$/);
  if (!m) return null;
  return { inning: parseInt(m[2], 10), isTop: m[1] === "T" };
}

export function evaluateMLBSpread(
  game: GameState,
  wager: UserWager,
  _summary: SummaryStats | null,
): AlertCandidate | null {
  if (wager.wager_type !== "spread" || wager.line == null || !wager.team_id) return null;
  if (game.status !== "inprogress") return null;
  const mlb = parseMLBClock(game.clock);
  if (!mlb || mlb.inning < 7) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const margin = game.home_score - game.away_score;
  const currentMargin = isHomeTeamBet ? margin : -margin;
  const runLine = wager.line;
  if (Math.abs(currentMargin - runLine) > 1) return null;

  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const covering = currentMargin - runLine >= 0;
  const halfLabel = `${mlb.isTop ? "top" : "bot"} ${mlb.inning}`;

  return {
    alertType: "spread_alert",
    title: `${betTeamName} ${runLine > 0 ? "+" : ""}${runLine}`,
    body: `${covering ? "Covering" : "Not covering"} — margin ${Math.abs(margin)} in ${halfLabel}`,
    why: `Your ${betTeamName} run line (${runLine > 0 ? "+" : ""}${runLine}) is live. They ${currentMargin > 0 ? "lead" : "trail"} by ${Math.abs(margin)} in inning ${mlb.inning}. Tune in now.`,
  };
}

export function evaluateMLBTotal(
  game: GameState,
  wager: UserWager,
): AlertCandidate | null {
  if (wager.wager_type !== "over_under" || wager.line == null) return null;
  if (game.status !== "inprogress") return null;
  const mlb = parseMLBClock(game.clock);
  if (!mlb || mlb.inning < 6) return null;

  const total = game.home_score + game.away_score;
  const line = wager.line;
  const inningsPlayed = mlb.inning - (mlb.isTop ? 1 : 0);
  if (inningsPlayed < 1) return null;
  const pace = (total / inningsPlayed) * 9;
  const description = wager.description.toLowerCase();
  const isOver = description.includes("over");
  const paceVsLine = pace - line;
  if (Math.abs(paceVsLine) < 2) return null;

  const tracking = isOver
    ? (paceVsLine > 0 ? "on pace to hit" : "in danger")
    : (paceVsLine > 0 ? "in danger" : "on pace to hit");
  const betLabel = isOver ? `OVER ${line}` : `UNDER ${line}`;
  const halfLabel = `${mlb.isTop ? "top" : "bot"} ${mlb.inning}`;

  return {
    alertType: "total_alert",
    title: betLabel,
    body: `Total ${total} through ${inningsPlayed} innings — pace ~${Math.round(pace)} runs`,
    why: `Your ${betLabel} is ${tracking}. Combined runs: ${total} through ${inningsPlayed} innings, on pace for ~${Math.round(pace)}. Now in ${halfLabel}.`,
  };
}

export function evaluateMLBMoneyline(
  game: GameState,
  wager: UserWager,
  _summary: SummaryStats | null,
): AlertCandidate | null {
  if (wager.wager_type !== "moneyline" || !wager.team_id) return null;
  if (game.status !== "inprogress") return null;
  const mlb = parseMLBClock(game.clock);
  if (!mlb || mlb.inning < 7) return null;

  const margin = Math.abs(game.home_score - game.away_score);
  if (margin > 2) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const homeLeading = game.home_score > game.away_score;
  const betTeamLeading = isHomeTeamBet ? homeLeading : !homeLeading;
  const halfLabel = `${mlb.isTop ? "top" : "bot"} ${mlb.inning}`;

  return {
    alertType: "moneyline_alert",
    title: `${betTeamName} ML`,
    body: `${betTeamLeading ? "Leading" : "Trailing"} by ${margin} in ${halfLabel}`,
    why: `Your ${betTeamName} moneyline is live — they ${betTeamLeading ? "lead" : "trail"} by ${margin} run${margin !== 1 ? "s" : ""} in inning ${mlb.inning}. Tune in now.`,
  };
}

// --- Prop Bet Alert ---
// Fire when the player stat is approaching/crossing the prop line (proximity-based)

export function evaluateProp(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null
): AlertCandidate | null {
  if (wager.wager_type !== "prop") return null;
  if (game.status !== "inprogress" && game.status !== "closed") return null;

  // Get or parse the wager target
  const target = wager.parsed_target ?? parseWagerTarget(wager.description);
  if (!target || target.target_type !== "player_stat") {
    // Fallback: if we can't parse a structured target, skip (no generic "on court" alerts)
    return null;
  }

  if (!summary) return null;

  const proximity = computeProximity(target, game, summary);
  if (!proximity) return null;

  // Only alert at HIGH or RESOLVED — not on generic game state
  if (proximity.level !== "HIGH" && proximity.level !== "RESOLVED") return null;

  const playerName = target.player_name ?? "Player";
  const statLabel = (target.stat_type ?? "stat").replace(/_/g, " ");
  const targetLine = target.line ?? 0;

  if (proximity.level === "RESOLVED") {
    const hit = proximity.current_value >= targetLine;
    const outcomeLabel = target.is_over
      ? (hit ? "Hit" : "Missed")
      : (hit ? "Missed" : "Hit");

    return {
      alertType: "prop_alert",
      title: `${playerName} — ${outcomeLabel}`,
      body: `${proximity.current_value} ${statLabel} (line: ${targetLine})`,
      why: `${playerName} finished with ${proximity.current_value} ${statLabel}. Your ${target.is_over ? "over" : "under"} ${targetLine} ${outcomeLabel.toLowerCase()}.`,
    };
  }

  // HIGH proximity
  const remaining = Math.max(0, Math.ceil(targetLine - proximity.current_value));
  const trendLabel = proximity.trend === "favorable" ? "on pace" : proximity.trend === "unfavorable" ? "needs to pick up" : "";

  return {
    alertType: "prop_alert",
    title: `${playerName} at ${proximity.current_value} ${statLabel} — ${remaining} away from ${targetLine}`,
    body: proximity.description,
    why: `${proximity.description}${trendLabel ? `. ${playerName} ${trendLabel}` : ""}. ${game.clock ? `${game.clock} remaining.` : ""} Tune in now.`,
  };
}

// --- Prediction Position Alert ---
// Fire when position is near resolution (proximity-based for player/total markets)

export function evaluatePosition(
  game: GameState,
  position: UserPosition,
  summary: SummaryStats | null = null,
): AlertCandidate | null {
  const liveStatuses = ["inprogress", "halftime", "closed"];
  if (!liveStatuses.includes(game.status)) return null;

  const margin = Math.abs(game.home_score - game.away_score);

  // Try proximity-based alerting first
  const target = position.parsed_target ?? parseWagerTarget(position.market_title);

  if (target && summary) {
    const proximity = computeProximity(target, game, summary);

    if (proximity && (proximity.level === "HIGH" || proximity.level === "RESOLVED")) {
      if (proximity.level === "RESOLVED") {
        return {
          alertType: "position_alert",
          title: `${position.platform} — Position Resolved`,
          body: proximity.description,
          why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" has resolved. ${proximity.description}`,
        };
      }

      return {
        alertType: "position_alert",
        title: `${position.platform} — Near Resolution`,
        body: proximity.description,
        why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" is close to resolving. ${proximity.description}${game.clock ? ` ${game.clock} remaining.` : ""} Tune in now.`,
      };
    }

    // If we have a parseable target but proximity isn't HIGH/RESOLVED, don't fall through to generic
    if (proximity) return null;
  }

  // Halftime alert: if the game is at halftime and within 6 points, alert the user
  if (game.status === "halftime" && margin <= 6) {
    return {
      alertType: "position_alert",
      title: `Halftime — ${margin}-Point Game`,
      body: `Your ${position.platform} position on "${position.market_title}"`,
      why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" — ${margin}-point game at halftime (${game.home_score}-${game.away_score}). Tune in for the 2nd half.`,
    };
  }

  // Fallback to generic game-state logic for unparseable markets
  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  if (game.period < 2) return null;
  if (margin > 8) return null;
  if (game.period === 2 && clockMins > 10) return null;

  const periodLabel = game.period > 2 ? "OT" : "2nd half";

  return {
    alertType: "position_alert",
    title: `${position.platform} — ${position.position_side}`,
    body: `"${position.market_title}" — ${margin}-point game`,
    why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" — game within ${margin} in the ${periodLabel} with ${game.clock} left. Tune in now.`,
  };
}

// --- Resolve-Risk Alert ---
// Fire when a Polymarket (or Kalshi) position is on the WRONG side of a game
// that is entering its final 5 minutes, with the margin at or below 6 points.
//
// === Supported market title patterns ===
//   HANDLED:
//     "Will [Team] win?"               — moneyline "yes" = team wins
//     "Will [Team] cover the spread?"  — spread "yes" = team covers
//     "[Team A] vs [Team B] Winner"    — parsed as moneyline; "yes" assumed to mean
//                                        the team the user bet on wins
//     "[Team A] at [Team B]"           — matchup format; same moneyline treatment
//
//   NOT YET HANDLED (will receive generic position_alert instead):
//     "Will [Player] score over X points?" — player-specific market
//     "Over/Under X points"                — game total market
//     "Will [Team] win by more than X?"    — custom margin market
//     Any Kalshi event ticker without a recognizable team name pattern
//
// Detection logic:
//   1. Parse the market_title to identify which team the "yes" side favors.
//   2. Compare that team's current score to the opponent's score.
//   3. If the position_side is "yes" but the favored team is LOSING (margin 1-6),
//      OR position_side is "no" but the favored team is WINNING (margin 1-6),
//      fire a resolve_risk alert.
//
// This function is called BEFORE evaluatePosition so the more specific
// resolve_risk type replaces the generic position_alert in the final minutes.

export function evaluateResolveRisk(
  game: GameState,
  position: UserPosition,
): AlertCandidate | null {
  // Only fire for in-progress games
  if (game.status !== "inprogress") return null;

  // Require clock data
  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // College basketball: 2 halves of 20 minutes each.
  // "Final 5 minutes" = 2nd half with <= 5 minutes left, OR any OT period.
  const isFinalFive =
    (game.period === 2 && clockMins <= 5) ||
    game.period > 2;

  if (!isFinalFive) return null;

  const margin = Math.abs(game.home_score - game.away_score);

  // Only alert when the game is close enough for the position to be at risk
  // (margin 1-6: close but not a tie, not a comfortable lead)
  if (margin === 0 || margin > 6) return null;

  // Determine which team the "yes" side of this market favors.
  // We pattern-match the market_title using the same logic as poll-markets.
  const favoredTeamSide = inferFavoredTeamSide(position.market_title, game);
  if (favoredTeamSide === null) return null; // Unrecognized pattern — skip

  // Determine whether the position is currently at risk.
  // "yes" position + favored team is losing   → at risk
  // "no"  position + favored team is winning  → at risk
  const isYes = position.position_side?.toLowerCase() === "yes";
  const homeLeading = game.home_score > game.away_score;
  const favoredTeamLeading = favoredTeamSide === "home" ? homeLeading : !homeLeading;

  const positionAtRisk = isYes ? !favoredTeamLeading : favoredTeamLeading;
  if (!positionAtRisk) return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const trailingTeam = homeLeading ? awayName : homeName;
  const clockStr = game.clock ?? `${Math.round(clockMins)}:00`;
  const periodLabel = game.period > 2 ? `OT${game.period > 3 ? game.period - 2 : ""}` : "2nd half";

  // Identify the team the user is effectively rooting for, for copy clarity.
  const userRootingFor = isYes
    ? (favoredTeamSide === "home" ? homeName : awayName)
    : (favoredTeamSide === "home" ? awayName : homeName);

  return {
    alertType: "resolve_risk",
    title: `Position at Risk — ${userRootingFor} trails by ${margin}`,
    body: `"${position.market_title}" — ${clockStr} left in ${periodLabel}`,
    why: `Your ${position.platform} position on "${position.market_title}" is at risk — ${trailingTeam} trails by ${margin} with ${clockStr} left in the ${periodLabel}. Tune in now.`,
  };
}

/**
 * Infer which side of the game the "yes" outcome of a market favors.
 * Returns "home" | "away" | null (null = pattern not recognized).
 *
 * Supported patterns (case-insensitive):
 *   "Will [Team] win?"
 *   "Will [Team] cover the spread?"
 *   "[Team A] vs [Team B]" / "[Team A] at [Team B]" — "yes" assumed to favor home
 *   "[Team A] vs [Team B] Winner" — "yes" assumed to favor home
 */
function inferFavoredTeamSide(
  marketTitle: string,
  game: GameState,
): "home" | "away" | null {
  if (!marketTitle) return null;

  const titleLower = marketTitle.toLowerCase();
  const homeName = (game.home_team?.name ?? "").toLowerCase();
  const homeAbbrev = (game.home_team?.abbreviation ?? "").toLowerCase();
  const awayName = (game.away_team?.name ?? "").toLowerCase();
  const awayAbbrev = (game.away_team?.abbreviation ?? "").toLowerCase();

  // "Will [Team] win?" or "Will [Team] cover the spread?" patterns
  const willMatch = titleLower.match(/^will\s+(.+?)\s+(win|cover)/);
  if (willMatch) {
    const teamToken = willMatch[1].trim();
    if (
      (homeName && teamToken.includes(homeName)) ||
      (homeAbbrev && teamToken.includes(homeAbbrev))
    ) return "home";
    if (
      (awayName && teamToken.includes(awayName)) ||
      (awayAbbrev && teamToken.includes(awayAbbrev))
    ) return "away";
    return null; // Team not matched — could be a player or other entity
  }

  // "[Team A] vs/at [Team B]" / "[Team A] vs/at [Team B] Winner" patterns.
  // In Polymarket matchup markets the first team listed is typically the "yes" team.
  const matchupMatch = titleLower.match(/^(.+?)\s+(?:vs?\.?|at)\s+(.+?)(?:\s+winner)?$/);
  if (matchupMatch) {
    const firstTeam = matchupMatch[1].trim();
    if (
      (homeName && firstTeam.includes(homeName)) ||
      (homeAbbrev && firstTeam.includes(homeAbbrev))
    ) return "home";
    if (
      (awayName && firstTeam.includes(awayName)) ||
      (awayAbbrev && firstTeam.includes(awayAbbrev))
    ) return "away";
    // First token not matched — try second token as the favored team
    const secondTeam = matchupMatch[2].replace(/\s+winner$/, "").trim();
    if (
      (homeName && secondTeam.includes(homeName)) ||
      (homeAbbrev && secondTeam.includes(homeAbbrev))
    ) return "home";
    if (
      (awayName && secondTeam.includes(awayName)) ||
      (awayAbbrev && secondTeam.includes(awayAbbrev))
    ) return "away";
    return null;
  }

  return null;
}

// --- Prediction Resolved Alert ---
// Fire when a game ends and a user's prediction position outcome is realized.
// This is the highest-value post-outcome moment: the user knows the result,
// and we can serve contextually relevant ads (e.g., team merchandise for winners).

export function evaluatePredictionResolved(
  game: GameState,
  position: UserPosition,
  summary: SummaryStats | null
): AlertCandidate | null {
  if (game.status !== "closed") return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const scoreStr = `${awayName} ${game.away_score}, ${homeName} ${game.home_score}`;
  const winner = game.home_score > game.away_score
    ? (game.home_team?.name ?? "Home")
    : (game.away_team?.name ?? "Away");

  // Build outcome-aware copy when resolve-predictions has settled this position
  const won = position.outcome === "yes";
  const lost = position.outcome === "no";
  const hasSettledOutcome = won || lost;

  if (hasSettledOutcome) {
    const payoutAbs = Math.abs(position.payout_amount ?? 0);
    const payoutStr = payoutAbs > 0
      ? ` $${Number.isInteger(payoutAbs) ? payoutAbs : payoutAbs.toFixed(2)}`
      : "";
    const resultWord = won ? "won" : "lost";
    const payoutClause = won && payoutStr
      ? ` You won${payoutStr}!`
      : lost && payoutStr
        ? ` You lost${payoutStr}.`
        : "";

    return {
      alertType: "prediction_resolved",
      title: `${position.platform} — You ${won ? "Won" : "Lost"}`,
      body: `${scoreStr}.${payoutClause}`,
      why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" ${resultWord}.${payoutClause} Final: ${scoreStr}.`,
    };
  }

  // Fallback: outcome unknown — use proximity inference if available
  const target = position.parsed_target ?? parseWagerTarget(position.market_title);
  let outcomeDetail = "";

  if (target && summary) {
    const proximity = computeProximity(target, game, summary);
    if (proximity) {
      outcomeDetail = ` ${proximity.description}`;
    }
  }

  return {
    alertType: "prediction_resolved",
    title: `${position.platform} — Prediction Resolved`,
    body: `${scoreStr} — ${winner} wins.${outcomeDetail}`,
    why: `Your ${position.platform} ${position.position_side} position on "${position.market_title}" has resolved. ${winner} wins ${scoreStr}.${outcomeDetail}`,
  };
}

// --- Bet Resolved Alert ---
// Fire when a game ends and the user had active wagers

export function evaluateResolved(
  game: GameState,
  wager: UserWager
): AlertCandidate | null {
  if (game.status !== "closed") return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const scoreStr = `${awayName} ${game.away_score}, ${homeName} ${game.home_score}`;
  const winner = game.home_score > game.away_score
    ? (game.home_team?.name ?? "Home")
    : (game.away_team?.name ?? "Away");

  let outcome = "";

  if (wager.wager_type === "spread" && wager.line != null && wager.team_id) {
    const margin = game.home_score - game.away_score;
    const currentMargin = wager.team_id === game.home_team_id ? margin : -margin;
    const covered = currentMargin > wager.line;
    outcome = covered ? "Spread covered" : "Spread not covered";
  } else if (wager.wager_type === "moneyline" && wager.team_id) {
    const betTeamWon =
      (wager.team_id === game.home_team_id && game.home_score > game.away_score) ||
      (wager.team_id === game.away_team_id && game.away_score > game.home_score);
    outcome = betTeamWon ? "Your team won" : "Your team lost";
  } else if (wager.wager_type === "over_under" && wager.line != null) {
    const total = game.home_score + game.away_score;
    const isOver = wager.description.toLowerCase().includes("over");
    const hit = isOver ? total > wager.line : total < wager.line;
    outcome = hit ? `${isOver ? "Over" : "Under"} hit (${total} total)` : `${isOver ? "Over" : "Under"} missed (${total} total)`;
  } else {
    outcome = `Final: ${scoreStr}`;
  }

  return {
    alertType: "bet_resolved",
    title: "Game Final",
    body: `${scoreStr} — ${outcome}`,
    why: `${winner} wins. ${outcome}. Your bet: "${wager.description}"`,
  };
}

// =============================================================================
// MLB-Specific Alert Rules
// =============================================================================

/** MLB game state from mlb_game_stats table */
export interface MLBGameStats {
  current_inning: number | null;
  inning_half: "T" | "B" | null;
  outs: number;
  balls: number;
  strikes: number;
  runners_on_base: Array<{ base: number; player_name: string }>;
  home_runs: number;
  away_runs: number;
  home_hits: number;
  away_hits: number;
  home_starter_name: string | null;
  home_starter_pitches: number;
  home_starter_still_pitching: boolean;
  away_starter_name: string | null;
  away_starter_pitches: number;
  away_starter_still_pitching: boolean;
  home_no_hitter_active: boolean;
  away_no_hitter_active: boolean;
}

/**
 * MLB Close Game alert: 1-run margin after the 7th inning.
 * Analogous to the basketball close-game alert but state-based rather than clock-based.
 */
export function evaluateMLBCloseGame(
  game: GameState,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const inning = mlbStats.current_inning ?? 0;
  if (inning < 8) return null; // Only alert from 8th inning on

  const margin = Math.abs(mlbStats.home_runs - mlbStats.away_runs);
  if (margin > 1) return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const inningLabel = `${mlbStats.inning_half === "T" ? "Top" : "Bot"} ${inning}`;
  const leading = mlbStats.home_runs > mlbStats.away_runs ? homeName : awayName;

  return {
    alertType: "close_game",
    title: `One-Run Game — ${inningLabel}`,
    body: `${awayName} ${mlbStats.away_runs}, ${homeName} ${mlbStats.home_runs} — ${leading} leads by 1`,
    why: `This game is within one run in the ${inningLabel}. ${homeName} ${mlbStats.home_runs}, ${awayName} ${mlbStats.away_runs}. Tune in now.`,
  };
}

/**
 * MLB Scoring Threat alert: runners on 2nd+3rd or bases loaded with 2 outs in 7th+.
 * Signals a potentially decisive moment.
 */
export function evaluateMLBScoringThreat(
  game: GameState,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (game.status !== "inprogress") return null;

  const inning = mlbStats.current_inning ?? 0;
  if (inning < 7) return null;
  if (mlbStats.outs !== 2) return null; // 2 outs = maximum tension

  const bases = mlbStats.runners_on_base.map((r) => r.base);
  const hasSecondAndThird = bases.includes(2) && bases.includes(3);
  const basesLoaded = bases.includes(1) && bases.includes(2) && bases.includes(3);

  if (!hasSecondAndThird && !basesLoaded) return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const inningLabel = `${mlbStats.inning_half === "T" ? "Top" : "Bot"} ${inning}`;
  const battingTeam = mlbStats.inning_half === "T" ? awayName : homeName;
  const situationLabel = basesLoaded ? "bases loaded" : "runners on 2nd and 3rd";

  return {
    alertType: "close_game",
    title: `${battingTeam} — ${basesLoaded ? "Bases Loaded" : "Scoring Threat"}, 2 Outs`,
    body: `${inningLabel}, ${situationLabel}`,
    why: `${battingTeam} has ${situationLabel} with 2 outs in the ${inningLabel}. A single could change this game. Tune in.`,
  };
}

/**
 * MLB No-Hitter in Progress alert: fires when a pitcher has not allowed a hit
 * through 6+ complete innings.
 */
export function evaluateMLBNoHitter(
  game: GameState,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const inning = mlbStats.current_inning ?? 0;
  if (inning < 7) return null;
  if (!mlbStats.home_no_hitter_active && !mlbStats.away_no_hitter_active) return null;

  const homeName = game.home_team?.name ?? "Home";
  const awayName = game.away_team?.name ?? "Away";

  // home_no_hitter_active means the home pitcher has not allowed hits (away team is no-hitting home)
  // Wait — the convention from migration 050:
  // home_no_hitter_active = away starting pitcher has no hits against home batters (away pitcher is throwing NH)
  // Let's use the pitcher names for clarity.
  const pitcherName = mlbStats.away_no_hitter_active
    ? (mlbStats.away_starter_name ?? awayName)
    : (mlbStats.home_starter_name ?? homeName);
  const throwingTeam = mlbStats.away_no_hitter_active ? awayName : homeName;

  return {
    alertType: "close_game",
    title: `No-Hitter Watch — ${throwingTeam}`,
    body: `${pitcherName} has not allowed a hit through ${inning - 1} innings`,
    why: `${pitcherName} (${throwingTeam}) is working on a no-hitter through ${inning - 1} complete innings. This is a rare moment. Tune in.`,
  };
}

/**
 * MLB Pitcher Approaching Limit alert: starter has thrown 90+ pitches.
 * Signals a potential pitching change that could shift momentum.
 */
export function evaluateMLBPitcherLimit(
  game: GameState,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const PITCH_LIMIT_ALERT = 90;

  const candidates: AlertCandidate[] = [];

  if (
    mlbStats.home_starter_still_pitching &&
    mlbStats.home_starter_pitches >= PITCH_LIMIT_ALERT
  ) {
    const name = mlbStats.home_starter_name ?? (game.home_team?.abbreviation ?? "Home");
    candidates.push({
      alertType: "close_game",
      title: `${name} at ${mlbStats.home_starter_pitches} Pitches`,
      body: `Starter approaching limit — bullpen decision coming`,
      why: `${name} has thrown ${mlbStats.home_starter_pitches} pitches. A pitching change could come any at-bat and shift the game's momentum. Tune in.`,
    });
  }

  if (
    mlbStats.away_starter_still_pitching &&
    mlbStats.away_starter_pitches >= PITCH_LIMIT_ALERT
  ) {
    const name = mlbStats.away_starter_name ?? (game.away_team?.abbreviation ?? "Away");
    candidates.push({
      alertType: "close_game",
      title: `${name} at ${mlbStats.away_starter_pitches} Pitches`,
      body: `Starter approaching limit — bullpen decision coming`,
      why: `${name} has thrown ${mlbStats.away_starter_pitches} pitches. A pitching change could come any at-bat and shift the game's momentum. Tune in.`,
    });
  }

  // Return the highest-pitch-count alert
  return candidates.sort((a, b) =>
    (b.title.match(/\d+/)?.[0] ?? 0) > (a.title.match(/\d+/)?.[0] ?? 0) ? 1 : -1
  )[0] ?? null;
}

/**
 * MLB Walk-Off Situation alert: tie or trailing by 1, bottom of 9th or later.
 */
export function evaluateMLBWalkOff(
  game: GameState,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (game.status !== "inprogress") return null;

  const inning = mlbStats.current_inning ?? 0;
  const half = mlbStats.inning_half;

  // Walk-off only possible in bottom half when home team is batting
  if (half !== "B") return null;
  if (inning < 9) return null;

  // Home team is trailing or tied
  const runDiff = mlbStats.away_runs - mlbStats.home_runs;
  if (runDiff > 1) return null; // Down by 2+ — not walk-off territory without runners

  const homeName = game.home_team?.name ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const inningLabel = inning === 9 ? "9th" : `${inning}th`;
  const situationLabel = runDiff === 0 ? "tied" : `trailing ${awayName} by 1`;

  return {
    alertType: "close_game",
    title: `Walk-Off Watch — Bottom ${inningLabel}`,
    body: `${homeName} ${situationLabel} at home`,
    why: `${homeName} is ${situationLabel} in the bottom of the ${inningLabel} inning. A single run ends it. Tune in for a potential walk-off.`,
  };
}

/**
 * MLB Run-Line wager alert: live margin approaching the run line the user bet.
 */
export function evaluateMLBRunLine(
  game: GameState,
  wager: UserWager,
  mlbStats: MLBGameStats
): AlertCandidate | null {
  if (wager.wager_type !== "spread" || wager.line == null || !wager.team_id) return null;
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const inning = mlbStats.current_inning ?? 0;
  if (inning < 7) return null; // Too early for meaningful run-line alerts

  const isHomeBet = wager.team_id === game.home_team_id;
  const margin = mlbStats.home_runs - mlbStats.away_runs;
  const currentMargin = isHomeBet ? margin : -margin;
  const runLine = wager.line;
  const diff = currentMargin - runLine;

  if (Math.abs(diff) > 1) return null; // Only alert within 1 run of the line

  const betTeamName = isHomeBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const covering = diff > 0;
  const inningLabel = `${mlbStats.inning_half === "T" ? "Top" : "Bot"} ${inning}`;

  return {
    alertType: "spread_alert",
    title: `${betTeamName} ${runLine > 0 ? "+" : ""}${runLine} Run Line`,
    body: `${covering ? "Covering" : "Not covering"} — margin is ${Math.abs(margin)} in ${inningLabel}`,
    why: `Your ${betTeamName} run line bet (${runLine > 0 ? "+" : ""}${runLine}) is live. They ${currentMargin > 0 ? "lead" : "trail"} by ${Math.abs(margin)} in the ${inningLabel}. Tune in.`,
  };
}

// --- NFL / NCAAF Alert Evaluators ---
// ESPN stores football clock as "MM:SS" — identical to basketball format.
// parseClockMinutes() handles both without modification.
// Football quarters: 1=Q1, 2=Q2, 3=Q3, 4=Q4, 5+=OT.
//
// These evaluators are wired in index.ts but gated behind ALERTABLE_SPORTS,
// which does not include "nfl" or "ncaaf" yet. They will become active when
// football alert rules ship to production (target: Sept 1).

// Spread alert for football.
// Fires in Q4 (or OT) when the margin is within ±4 of the spread line.
export function evaluateFootballSpread(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null,
): AlertCandidate | null {
  if (wager.wager_type !== "spread" || wager.line == null || !wager.team_id) return null;
  if (game.status !== "inprogress") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Alert only in Q4 or OT — no alerts during Q1/Q2/Q3 (too early)
  if (game.period < 4) return null;
  // In Q4 only alert within the final 10 minutes
  if (game.period === 4 && clockMins > 10) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const margin = game.home_score - game.away_score;
  const currentMargin = isHomeTeamBet ? margin : -margin;
  const spreadLine = wager.line;

  if (Math.abs(currentMargin - spreadLine) > 4) return null;

  const covering = currentMargin - spreadLine >= 0;
  const absMargin = Math.abs(margin);
  const periodLabel = game.period > 4 ? `OT${game.period > 5 ? game.period - 4 : ""}` : "4th";

  let context = "";
  if (summary) {
    const betSide = isHomeTeamBet ? "home" : "away";
    const biggestLead = summary[betSide].biggest_lead;
    if (biggestLead > absMargin + 7) {
      context = ` ${betTeamName} led by as many as ${biggestLead} earlier.`;
    }
  }

  return {
    alertType: "football_close_game",
    title: `${betTeamName} ${spreadLine > 0 ? "+" : ""}${spreadLine}`,
    body: `${covering ? "Covering" : "Not covering"} — margin is ${absMargin} with ${game.clock} left`,
    why: `Your ${betTeamName} ${spreadLine > 0 ? "+" : ""}${spreadLine} spread is live — they ${currentMargin > 0 ? "lead" : "trail"} by ${absMargin} with ${game.clock} left in the ${periodLabel}.${context} Tune in now.`,
  };
}

// Over/Under alert for football.
// Uses pace analysis: projects final score from current pace.
// Requires at least 30 minutes of game time (a full half) to be meaningful.
export function evaluateFootballTotal(
  game: GameState,
  wager: UserWager,
): AlertCandidate | null {
  if (wager.wager_type !== "over_under" || wager.line == null) return null;
  if (game.status !== "inprogress") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Only alert in 2nd half (Q3/Q4) — need pace data from at least a half
  if (game.period < 3) return null;

  const total = game.home_score + game.away_score;
  const line = wager.line;

  // Minutes elapsed in a 60-minute game (4 quarters × 15 min each)
  const minutesElapsed = (game.period - 1) * 15 + Math.max(0, 15 - clockMins);
  if (minutesElapsed < 30) return null;

  const pace = (total / minutesElapsed) * 60;
  const description = wager.description.toLowerCase();
  const isOver = description.includes("over");
  const paceVsLine = pace - line;

  // Football variance is high — require 10+ point divergence to avoid false alerts
  if (Math.abs(paceVsLine) < 10) return null;

  const tracking = isOver
    ? (paceVsLine > 0 ? "on pace to hit" : "in danger")
    : (paceVsLine > 0 ? "in danger" : "on pace to hit");

  const betLabel = isOver ? `OVER ${line}` : `UNDER ${line}`;
  const periodLabel = game.period === 4 ? "4th quarter" : game.period === 3 ? "3rd quarter" : "OT";

  return {
    alertType: "football_close_game",
    title: betLabel,
    body: `Total is ${total} — pace of ~${Math.round(pace)} per game`,
    why: `Your ${betLabel} is ${tracking}. Combined score is ${total} with ${game.clock} left in the ${periodLabel}, on pace for ~${Math.round(pace)}. Tune in now.`,
  };
}

// Moneyline alert for football.
// Fires when the user's team is in a one-score game (margin ≤8) in Q4 with < 8 min left.
export function evaluateFootballMoneyline(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null,
): AlertCandidate | null {
  if (wager.wager_type !== "moneyline" || !wager.team_id) return null;
  if (game.status !== "inprogress") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Alert only in Q4 or OT, and only in the final 8 minutes of Q4
  if (game.period < 4) return null;
  if (game.period === 4 && clockMins > 8) return null;

  // One-score game: margin ≤ 8 (one TD + conversion)
  const margin = Math.abs(game.home_score - game.away_score);
  if (margin > 8) return null;

  const isHomeTeamBet = wager.team_id === game.home_team_id;
  const betTeamName = isHomeTeamBet
    ? (game.home_team?.abbreviation ?? "Home")
    : (game.away_team?.abbreviation ?? "Away");
  const homeLeading = game.home_score > game.away_score;
  const betTeamLeading = isHomeTeamBet ? homeLeading : !homeLeading;
  const periodLabel = game.period > 4 ? "overtime" : "4th quarter";

  let context = "";
  if (summary) {
    const betSide = isHomeTeamBet ? "home" : "away";
    if (summary[betSide].biggest_lead > margin + 10) {
      context = ` ${betTeamName} had led by ${summary[betSide].biggest_lead} earlier.`;
    }
  }

  return {
    alertType: "football_close_game",
    title: `${betTeamName} ML`,
    body: `${betTeamLeading ? "Leading" : "Trailing"} by ${margin} with ${game.clock} left`,
    why: `Your ${betTeamName} moneyline is ${betTeamLeading ? "alive" : "at risk"} — ${margin}-point game in the ${periodLabel}.${context} Tune in now.`,
  };
}

// Close-game alert for football follow users (no wager required).
// Fires in Q4 or OT when the margin is one score or less with < 5 minutes left.
// Used by the v2 scoring pipeline for users who follow a team but have no wager.
export function evaluateFootballCloseGame(
  game: GameState,
): AlertCandidate | null {
  if (game.status !== "inprogress") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Q4 with < 5 min, or OT
  if (game.period < 4) return null;
  if (game.period === 4 && clockMins > 5) return null;

  const margin = Math.abs(game.home_score - game.away_score);
  if (margin > 8) return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const leading = game.home_score > game.away_score ? homeName : awayName;
  const periodLabel = game.period > 4 ? `OT${game.period > 5 ? game.period - 4 : ""}` : "4th";

  return {
    alertType: "football_close_game",
    title: `${margin === 0 ? "Tied" : `${margin}-Point Game`} — ${periodLabel} Quarter`,
    body: `${awayName} ${game.away_score}, ${homeName} ${game.home_score} — ${game.clock} left`,
    why: `${margin === 0 ? "Tied game" : `${leading} leads by just ${margin}`} with ${game.clock} left in the ${periodLabel}. One score away. Tune in now.`,
  };
}

/**
 * NBA-specific close game alert: uses tighter margin threshold (6 pts vs 8 for NCAA)
 * and triggers only in the 4th quarter with under 3 minutes left.
 */
export function evaluateNBACloseGame(
  game: GameState
): AlertCandidate | null {
  if (game.status !== "inprogress" && game.status !== "halftime") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // NBA: 4 quarters — alert in 4th quarter (period 4) or OT
  if (game.period < 4) return null;
  if (game.period === 4 && clockMins > 3) return null;

  const margin = Math.abs(game.home_score - game.away_score);
  if (margin > 6) return null;

  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const leading = game.home_score > game.away_score ? homeName : awayName;
  const periodLabel = game.period > 4 ? `OT${game.period - 4 > 1 ? game.period - 4 : ""}` : "4th";

  return {
    alertType: "close_game",
    title: `${margin}-Point Game — ${periodLabel} Quarter`,
    body: `${awayName} ${game.away_score}, ${homeName} ${game.home_score} — ${game.clock} left`,
    why: `${leading} leads by just ${margin} points with ${game.clock} left in the ${periodLabel}. NBA games move fast — tune in now.`,
  };
}
