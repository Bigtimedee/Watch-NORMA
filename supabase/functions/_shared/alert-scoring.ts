// alert-scoring.ts — Signal extraction, weighted scoring, and WhyNow explanation
// Used by evaluate-alerts v2 pipeline

import type { GameState, SummaryStats, UserWager, AlertCandidate, WagerTarget, ProximityResult } from "../evaluate-alerts/logic.ts";
import { parseClockMinutes } from "../evaluate-alerts/logic.ts";
import { parseWagerTarget } from "./wager-target-parser.ts";
import { computeProximity } from "./outcome-proximity.ts";
import type { ProximityLevel } from "./outcome-proximity.ts";

// --- Signal Vector ---

export interface SignalVector {
  // Game state
  margin: number;
  clock_minutes: number | null;
  period: number | null;
  is_close_game: boolean;       // margin <= 6 in 2nd half
  is_final_minutes: boolean;    // under 5:00 in 2nd half
  is_final_two: boolean;        // under 2:00 in 2nd half
  is_overtime: boolean;
  is_closed: boolean;

  // From Sportradar summary
  home_biggest_lead: number;
  away_biggest_lead: number;
  bench_points_delta: number;
  efg_delta: number;
  foul_trouble: Array<{ player: string; fouls: number; starter: boolean; side: "home" | "away" }>;
  lead_changes_recent: number;  // approximated from summary data

  // User relevance
  follows_team: boolean;
  follows_player_on_court: boolean;
  has_wager: boolean;
  wager_line_crossed: boolean;
  has_position: boolean;

  // Proximity (wager-outcome awareness)
  proximity_level: ProximityLevel | null;
  proximity_result: ProximityResult | null;
}

// --- Scoring Weights ---

const WEIGHTS = {
  has_wager: 30,
  wager_line_crossed: 25,
  proximity_high: 35,
  proximity_resolved: 40,
  close_game: 20,
  follows_team: 15,
  final_five_minutes: 10,
  lead_change_recent: 10,
  foul_trouble: 8,
  bench_swing: 5,
  efg_divergence: 5,
  follows_player: 5,
};

const SCORE_THRESHOLD = 40;

// --- Must-Notify Rules ---

export interface MustNotifyResult {
  alertType: string;
  headline: string;
  bullets: string[];
}

export function checkMustNotify(
  game: GameState,
  summary: SummaryStats | null,
  userWagers: UserWager[],
  sport?: string,
  leadChangesRecent: number = 0,
): MustNotifyResult | null {
  const clockMins = parseClockMinutes(game.clock);
  const margin = Math.abs(game.home_score - game.away_score);
  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const scoreStr = `${awayName} ${game.away_score}, ${homeName} ${game.home_score}`;
  const isFootball = sport === "nfl" || sport === "ncaaf";

  // Game final (bet resolved) — always notify wager holders, all sports
  if (game.status === "closed" && userWagers.length > 0) {
    return {
      alertType: "bet_resolved",
      headline: "Game Final",
      bullets: [`Final: ${scoreStr}`],
    };
  }

  if (isFootball) {
    // Football: OT is period 5+ (4 quarters + overtime period)
    if (game.status === "inprogress" && game.period != null && game.period >= 5 && clockMins != null && clockMins > 9) {
      return {
        alertType: "football_overtime",
        headline: "Overtime!",
        bullets: [`${scoreStr} — headed to OT`],
      };
    }

    // Football: one-score game (≤8 pts) under 2:00 in Q4
    if (game.status === "inprogress" && game.period === 4 && clockMins != null && clockMins <= 2.0 && margin <= 8) {
      return {
        alertType: "football_two_minute",
        headline: margin === 0 ? "Tied — Two Minutes Left" : `${margin}-Point Game — Two Minutes Left`,
        bullets: [`${scoreStr} — ${game.clock} remaining in Q4`],
      };
    }

    // NFL only: one-score game under 2:00 in Q2 (halftime-adjacent urgency)
    if (sport === "nfl" && game.status === "inprogress" && game.period === 2 && clockMins != null && clockMins <= 2.0 && margin <= 8) {
      return {
        alertType: "football_two_minute",
        headline: `${margin}-Point Game — 2:00 Warning (First Half)`,
        bullets: [`${scoreStr} — ${game.clock} remaining in Q2`],
      };
    }

    // Football: lead change in final 5 minutes (Q4 with < 5:00, or OT)
    if (leadChangesRecent > 0 && game.status === "inprogress" && game.period != null && game.period >= 4 && clockMins != null && clockMins <= 5) {
      return {
        alertType: "football_close_game",
        headline: "Lead Change — Final Minutes",
        bullets: [`${scoreStr} — ${game.clock} remaining`, "The lead just changed — tune in now"],
      };
    }

    return null;
  }

  // Basketball / default sports below

  // Overtime starts (basketball: period > 2 means OT; NBA: period > 4 means OT)
  const basketballOTPeriod = sport === "nba" ? 4 : 2;
  if (game.status === "inprogress" && game.period != null && game.period > basketballOTPeriod && clockMins != null && clockMins > 4) {
    return {
      alertType: "overtime",
      headline: "Overtime!",
      bullets: [`${scoreStr} — headed to OT${game.period > basketballOTPeriod + 1 ? game.period - basketballOTPeriod : ""}`],
    };
  }

  // 1-possession game under 2:00 (basketball)
  if (game.status === "inprogress" && game.period != null && game.period >= 2 && clockMins != null && clockMins < 2 && margin <= 3) {
    return {
      alertType: "close_game",
      headline: "1-Possession Game Under 2:00",
      bullets: [`${scoreStr} with ${game.clock} remaining`],
    };
  }

  // Star player 4th foul (starter who has scored at least 10 points)
  if (summary && game.status === "inprogress") {
    const allPlayers = [
      ...summary.home.players.map((p) => ({ ...p, side: "home" as const })),
      ...summary.away.players.map((p) => ({ ...p, side: "away" as const })),
    ];

    for (const p of allPlayers) {
      if (p.starter && p.points >= 10 && p.personal_fouls === 4 && !p.fouled_out) {
        const teamName = p.side === "home" ? homeName : awayName;
        return {
          alertType: "foul_trouble",
          headline: `${p.full_name} in Foul Trouble`,
          bullets: [
            `${p.full_name} (${teamName}) has 4 fouls`,
            `${p.points}pts, ${p.rebounds}reb, ${p.assists}ast on the game`,
          ],
        };
      }
    }
  }

  return null;
}

// --- Signal Extraction ---

export function extractSignals(
  game: GameState,
  summary: SummaryStats | null,
  userFollowsTeamIds: string[],
  userFollowsPlayerNames: string[],
  userWagers: UserWager[],
  hasPosition: boolean,
  leadChangesRecent: number = 0,
  parsedTargets: Array<WagerTarget | null> = [],
  sport?: string,
): SignalVector {
  const clockMins = parseClockMinutes(game.clock);
  const margin = Math.abs(game.home_score - game.away_score);
  const isFootball = sport === "nfl" || sport === "ncaaf";

  // Football: 4 quarters; "second half" = Q3 or Q4 (period >= 3); OT = period >= 5
  // Basketball (ncaam/nba): 2 halves; "second half" = period 2; OT = period > 2 (or > 4 for NBA)
  const inSecondHalf = isFootball
    ? (game.period != null && game.period >= 3)
    : (game.period != null && game.period >= 2);
  const isOT = isFootball
    ? (game.period != null && game.period >= 5)
    : (game.period != null && game.period > 2);

  // Check if any wager line is being crossed
  let wagerLineCrossed = false;
  for (const w of userWagers) {
    if (w.wager_type === "spread" && w.line != null && w.team_id) {
      const m = game.home_score - game.away_score;
      const currentMargin = w.team_id === game.home_team_id ? m : -m;
      const diff = currentMargin - w.line;
      if (Math.abs(diff) <= 4) wagerLineCrossed = true;
    }
  }

  // Check follows
  const followsTeam = userFollowsTeamIds.some(
    (tid) => tid === game.home_team_id || tid === game.away_team_id
  );

  let followsPlayerOnCourt = false;
  if (summary && userFollowsPlayerNames.length > 0) {
    const allPlayers = [...summary.home.players, ...summary.away.players];
    for (const name of userFollowsPlayerNames) {
      const nameL = name.toLowerCase();
      if (allPlayers.some((p) => p.on_court && p.full_name.toLowerCase().includes(nameL))) {
        followsPlayerOnCourt = true;
        break;
      }
    }
  }

  // Foul trouble
  const foulTrouble: SignalVector["foul_trouble"] = [];
  if (summary) {
    const check = (players: SummaryStats["home"]["players"], side: "home" | "away") => {
      for (const p of players) {
        if (p.personal_fouls >= 4 && !p.fouled_out) {
          foulTrouble.push({ player: p.full_name, fouls: p.personal_fouls, starter: p.starter, side });
        }
      }
    };
    check(summary.home.players, "home");
    check(summary.away.players, "away");
  }

  // Compute best proximity across all parsed targets (wagers + positions)
  let bestProximity: ProximityResult | null = null;
  const allTargets = [
    ...parsedTargets,
    ...userWagers.map((w) => w.parsed_target ?? parseWagerTarget(w.description)),
  ].filter(Boolean) as WagerTarget[];

  for (const target of allTargets) {
    if (target.target_type === "player_stat" || target.target_type === "game_total") {
      const result = computeProximity(target, game, summary);
      if (result) {
        if (!bestProximity || proximityRank(result.level) > proximityRank(bestProximity.level)) {
          bestProximity = result;
        }
      }
    }
  }

  // Football: "close game" = one-score margin (≤8) in Q3/Q4; final minutes = Q4 only
  // Basketball: "close game" = within 6 pts in 2nd half; final minutes = 2nd half only
  const closeGameMargin = isFootball ? 8 : 6;
  const isFinalMinutes = isFootball
    ? (game.period === 4 && clockMins != null && clockMins <= 5)
    : (inSecondHalf && clockMins != null && clockMins <= 5);
  const isFinalTwo = isFootball
    ? (game.period === 4 && clockMins != null && clockMins <= 2)
    : (inSecondHalf && clockMins != null && clockMins <= 2);

  return {
    margin,
    clock_minutes: clockMins,
    period: game.period,
    is_close_game: inSecondHalf && margin <= closeGameMargin,
    is_final_minutes: isFinalMinutes,
    is_final_two: isFinalTwo,
    is_overtime: isOT,
    is_closed: game.status === "closed",

    home_biggest_lead: summary?.home.biggest_lead ?? 0,
    away_biggest_lead: summary?.away.biggest_lead ?? 0,
    bench_points_delta: summary ? Math.abs(summary.home.bench_points - summary.away.bench_points) : 0,
    efg_delta: summary ? Math.abs(summary.home.effective_fg_pct - summary.away.effective_fg_pct) : 0,
    foul_trouble: foulTrouble,
    lead_changes_recent: leadChangesRecent,

    follows_team: followsTeam,
    follows_player_on_court: followsPlayerOnCourt,
    has_wager: userWagers.length > 0,
    wager_line_crossed: wagerLineCrossed,
    has_position: hasPosition,

    proximity_level: bestProximity?.level ?? null,
    proximity_result: bestProximity,
  };
}

function proximityRank(level: ProximityLevel): number {
  switch (level) {
    case "RESOLVED": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    case "LOW": return 1;
    case "NONE": return 0;
  }
}

// --- Weighted Scoring ---

export function computeScore(signals: SignalVector): number {
  let score = 0;

  if (signals.has_wager) score += WEIGHTS.has_wager;
  if (signals.wager_line_crossed) score += WEIGHTS.wager_line_crossed;
  if (signals.proximity_level === "HIGH") score += WEIGHTS.proximity_high;
  if (signals.proximity_level === "RESOLVED") score += WEIGHTS.proximity_resolved;
  if (signals.is_close_game) score += WEIGHTS.close_game;
  if (signals.follows_team) score += WEIGHTS.follows_team;
  if (signals.is_final_minutes) score += WEIGHTS.final_five_minutes;
  if (signals.lead_changes_recent > 0) score += WEIGHTS.lead_change_recent;
  if (signals.foul_trouble.length > 0) score += WEIGHTS.foul_trouble;
  if (signals.bench_points_delta >= 10) score += WEIGHTS.bench_swing;
  if (signals.efg_delta >= 10) score += WEIGHTS.efg_divergence;
  if (signals.follows_player_on_court) score += WEIGHTS.follows_player;

  return score;
}

export function meetsThreshold(score: number): boolean {
  return score >= SCORE_THRESHOLD;
}

// --- WhyNow Explanation ---

export interface WhyNow {
  headline: string;
  bullets: string[];
  stats_used: Record<string, number>;
  confidence: number;
  wager_impact?: {
    wager_id: number;
    wager_description: string;
    status: "covering" | "not_covering" | "at_risk" | "decided";
  };
}

export function buildWhyNow(
  game: GameState,
  signals: SignalVector,
  score: number,
  userWagers: UserWager[],
  mustNotify: MustNotifyResult | null,
): WhyNow {
  const homeName = game.home_team?.abbreviation ?? "Home";
  const awayName = game.away_team?.abbreviation ?? "Away";
  const periodLabel = signals.is_overtime ? `OT${(game.period ?? 3) - 2}` : "2nd half";

  // Headline
  let headline: string;
  if (mustNotify) {
    headline = mustNotify.headline;
  } else if (signals.proximity_level === "RESOLVED" && signals.proximity_result) {
    headline = "Bet Resolved";
  } else if (signals.proximity_level === "HIGH" && signals.proximity_result) {
    headline = "Your Bet Is Close";
  } else if (signals.wager_line_crossed) {
    headline = "Your Bet Is Live";
  } else if (signals.is_close_game && signals.is_final_minutes) {
    headline = "Close Game, Final Minutes";
  } else if (signals.is_close_game) {
    headline = "Close Game Alert";
  } else if (signals.follows_team) {
    headline = "Your Team Is Playing";
  } else {
    headline = "Tune In Now";
  }

  // Bullets
  const bullets: string[] = [];

  if (mustNotify) {
    bullets.push(...mustNotify.bullets);
  }

  if (signals.proximity_result && (signals.proximity_level === "HIGH" || signals.proximity_level === "RESOLVED")) {
    bullets.push(signals.proximity_result.description);
  }

  if (signals.is_close_game) {
    bullets.push(`${awayName} ${game.away_score}, ${homeName} ${game.home_score} — ${signals.margin}-point game${game.clock ? ` with ${game.clock} left` : ""}`);
  }

  if (signals.is_overtime) {
    bullets.push(`Game in ${periodLabel}`);
  }

  if (signals.foul_trouble.length > 0) {
    const p = signals.foul_trouble[0];
    bullets.push(`${p.player} has ${p.fouls} fouls${p.starter ? " (starter)" : ""}`);
  }

  // Comeback context
  const biggestLead = Math.max(signals.home_biggest_lead, signals.away_biggest_lead);
  if (biggestLead > signals.margin + 8) {
    const leadTeam = signals.home_biggest_lead > signals.away_biggest_lead ? homeName : awayName;
    bullets.push(`${leadTeam} led by as many as ${biggestLead}`);
  }

  if (signals.bench_points_delta >= 10) {
    bullets.push(`Bench points gap: ${signals.bench_points_delta}`);
  }

  // Stats used
  const stats_used: Record<string, number> = {
    margin: signals.margin,
    score: score,
  };
  if (signals.clock_minutes != null) stats_used.clock_minutes = signals.clock_minutes;
  if (signals.period != null) stats_used.period = signals.period;
  if (biggestLead > 0) stats_used.biggest_lead = biggestLead;
  if (signals.efg_delta > 0) stats_used.efg_delta = Math.round(signals.efg_delta * 10) / 10;
  if (signals.proximity_result) {
    stats_used.proximity_pct = Math.round(signals.proximity_result.pct_complete * 100);
    stats_used.proximity_current = signals.proximity_result.current_value;
    stats_used.proximity_target = signals.proximity_result.target_value;
  }

  // Confidence (0-1) based on score relative to threshold
  const confidence = Math.min(1, score / 100);

  // Wager impact
  let wager_impact: WhyNow["wager_impact"];
  if (userWagers.length > 0) {
    const w = userWagers[0]; // primary wager
    let status: "covering" | "not_covering" | "at_risk" | "decided" = "at_risk";

    if (game.status === "closed") {
      status = "decided";
    } else if (w.wager_type === "spread" && w.line != null && w.team_id) {
      const m = game.home_score - game.away_score;
      const currentMargin = w.team_id === game.home_team_id ? m : -m;
      status = currentMargin > w.line ? "covering" : "not_covering";
    } else if (w.wager_type === "moneyline" && w.team_id) {
      const betLeading = w.team_id === game.home_team_id
        ? game.home_score > game.away_score
        : game.away_score > game.home_score;
      status = betLeading ? "covering" : "not_covering";
    }

    wager_impact = {
      wager_id: w.id,
      wager_description: w.description,
      status,
    };
  }

  return {
    headline,
    bullets: bullets.slice(0, 4), // cap at 4 bullets
    stats_used,
    confidence,
    wager_impact,
  };
}

// --- Alert Type Determination ---

export function determineAlertType(
  signals: SignalVector,
  mustNotify: MustNotifyResult | null,
  userWagers: UserWager[],
): string {
  if (mustNotify) return mustNotify.alertType;

  // Wager-specific types (preserves v1 behavior for wager holders)
  if (userWagers.length > 0) {
    const w = userWagers[0];
    if (w.wager_type === "spread" && signals.wager_line_crossed) return "spread_alert";
    if (w.wager_type === "moneyline" && signals.is_close_game) return "moneyline_alert";
    if (w.wager_type === "over_under") return "total_alert";
    if (w.wager_type === "prop") return "prop_alert";
  }

  if (signals.has_position) return "position_alert";

  // Follow-based alert types
  if (signals.is_close_game && signals.is_final_two) return "close_game";
  if (signals.is_overtime) return "overtime";
  if (signals.foul_trouble.length > 0) return "foul_trouble";
  if (signals.is_close_game) return "close_game";

  return "follow_alert";
}

// --- Intent Score (P2-01) ---
// Normalized [0, 1] transform of the raw alert score + game-state premium signals.
// Used by evaluate-alerts to populate intent_moments.intent_score.
// Deterministic: same inputs always produce the same output.

export function computeIntentScore(score: number, signals: SignalVector): number {
  // Base: clamp raw alert score to [0, 0.9] — reserve headroom for game-state premiums
  let base = Math.min(Math.max(score, 0) / 100, 0.9);

  // Game-state premium signals (mirrors dynamic premium logic in pricing-engine.ts)
  if (signals.is_overtime)      base = Math.min(base + 0.08, 1.0); // highest intent signal
  if (signals.is_final_two)     base = Math.min(base + 0.05, 1.0);
  if (signals.is_close_game)    base = Math.min(base + 0.02, 1.0);
  if (signals.is_final_minutes) base = Math.min(base + 0.01, 1.0);

  return Math.round(base * 1000) / 1000; // 3 decimal precision
}

// --- Dedup Hash ---

export function computeDedupHash(
  userId: string,
  gameId: string,
  alertType: string,
  margin: number,
  period: number | null,
  proximityLevel?: string,
): string {
  const marginBucket = Math.floor(margin / 3);
  const proxPart = proximityLevel ?? "none";
  const raw = `${userId}:${gameId}:${alertType}:${marginBucket}:${period ?? 0}:${proxPart}`;
  // Simple hash — no crypto needed for dedup
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
