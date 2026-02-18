// evaluate-alerts/logic.ts — Pure functions extracted for testability

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
}

export interface UserPosition {
  id: number;
  user_id: string;
  platform: string;
  market_title: string;
  position_side: string;
  quantity: number;
  avg_price: number;
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
  if (game.status !== "inprogress") return null;

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
  if (game.status !== "inprogress") return null;

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
  if (game.status !== "inprogress") return null;

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

// --- Prop Bet Alert ---
// Fire when game state indicates a player prop is about to be decided

export function evaluateProp(
  game: GameState,
  wager: UserWager,
  summary: SummaryStats | null
): AlertCandidate | null {
  if (wager.wager_type !== "prop") return null;
  if (game.status !== "inprogress") return null;
  if (!summary) return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  // Parse the prop description for player name and stat
  const desc = wager.description;

  // Search both teams' players for anyone mentioned in the prop
  const allPlayers = [
    ...summary.home.players.map((p) => ({ ...p, side: "home" as const })),
    ...summary.away.players.map((p) => ({ ...p, side: "away" as const })),
  ];

  for (const player of allPlayers) {
    // Check if this player is referenced in the wager description
    const nameInDesc =
      desc.toLowerCase().includes(player.full_name.toLowerCase()) ||
      desc.toLowerCase().includes(player.full_name.split(" ").pop()?.toLowerCase() ?? "");

    if (!nameInDesc) continue;

    // Player is on court and relevant to the prop — alert
    if (player.on_court) {
      const teamName = player.side === "home"
        ? (game.home_team?.abbreviation ?? "Home")
        : (game.away_team?.abbreviation ?? "Away");

      // Build stat context
      const statLine = `${player.points}pts, ${player.rebounds}reb, ${player.assists}ast`;

      return {
        alertType: "prop_alert",
        title: `${player.full_name} Prop`,
        body: `On the court — ${statLine}`,
        why: `Your prop bet "${desc}" — ${player.full_name} (${teamName}) is on the court with ${statLine} and ${game.clock} left. Tune in now.`,
      };
    }

    // Player fouled out — prop is locked
    if (player.fouled_out) {
      return {
        alertType: "prop_alert",
        title: `${player.full_name} Prop`,
        body: `Fouled out — final line: ${player.points}pts`,
        why: `${player.full_name} has fouled out with ${player.points}pts. Your prop "${desc}" outcome may be decided.`,
      };
    }
  }

  return null;
}

// --- Prediction Position Alert ---
// Fire when game state puts a Kalshi/Polymarket position at stake

export function evaluatePosition(
  game: GameState,
  position: UserPosition
): AlertCandidate | null {
  if (game.status !== "inprogress") return null;

  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return null;

  const margin = Math.abs(game.home_score - game.away_score);

  // Only alert in second half or OT, close game
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
