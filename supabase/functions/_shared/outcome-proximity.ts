// outcome-proximity.ts — Computes how close a wager/position is to resolving

import type { WagerTarget } from "./wager-target-parser.ts";
import type { GameState, SummaryStats } from "../evaluate-alerts/logic.ts";
import { parseClockMinutes } from "../evaluate-alerts/logic.ts";

export type ProximityLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "RESOLVED";

export interface ProximityResult {
  level: ProximityLevel;
  current_value: number;
  target_value: number;
  pct_complete: number;
  trend: "favorable" | "unfavorable" | "neutral";
  time_pressure: number;
  description: string;
}

interface PlayerStats {
  full_name: string;
  points: number;
  rebounds: number;
  assists: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  three_points_made?: number;
  on_court: boolean;
  fouled_out: boolean;
  starter: boolean;
  side: "home" | "away";
}

// Sport-specific clock geometry. Regulation is `regulationPeriods` periods of
// `periodMinutes` each; OT periods run `otMinutes`. Basketball halves (NCAAM)
// were the original hardcode — that made every football (15-min quarters ×4)
// prop-proximity score wrong (BL-7 in the 2026-08-23 audit).
interface SportClockCfg {
  periodMinutes: number;
  regulationPeriods: number;
  otMinutes: number;
}

const SPORT_CLOCK: Record<string, SportClockCfg> = {
  ncaam: { periodMinutes: 20, regulationPeriods: 2, otMinutes: 5 },
  nba:   { periodMinutes: 12, regulationPeriods: 4, otMinutes: 5 },
  nfl:   { periodMinutes: 15, regulationPeriods: 4, otMinutes: 10 },
  // NCAAF overtime is untimed (possession-based); treat each OT round as a
  // 15-minute period for pacing math so proximity trend doesn't spike.
  ncaaf: { periodMinutes: 15, regulationPeriods: 4, otMinutes: 15 },
};

function clockCfg(sport: string | null | undefined): SportClockCfg {
  return SPORT_CLOCK[sport ?? "ncaam"] ?? SPORT_CLOCK.ncaam;
}

function getMinutesElapsed(game: GameState): number {
  const clockMins = parseClockMinutes(game.clock);
  if (clockMins == null || game.period == null) return 0;
  const cfg = clockCfg(game.sport);

  // Regulation: (p-1) completed periods + (periodMinutes - clockMins) into current
  if (game.period <= cfg.regulationPeriods) {
    return game.period * cfg.periodMinutes - clockMins;
  }
  // Overtime: full regulation + previous OT periods + elapsed in current OT
  const regulation = cfg.regulationPeriods * cfg.periodMinutes;
  return regulation + (game.period - cfg.regulationPeriods) * cfg.otMinutes - clockMins;
}

function getTotalGameMinutes(game: GameState): number {
  const cfg = clockCfg(game.sport);
  const regulation = cfg.regulationPeriods * cfg.periodMinutes;
  if (game.period == null || game.period <= cfg.regulationPeriods) return regulation;
  return regulation + (game.period - cfg.regulationPeriods) * cfg.otMinutes;
}

function getTimePressure(game: GameState): number {
  const totalMins = getTotalGameMinutes(game);
  const elapsed = getMinutesElapsed(game);
  if (totalMins === 0) return 0;
  return Math.min(1, elapsed / totalMins);
}

function getStatValue(player: PlayerStats, stat_type: string): number | null {
  switch (stat_type) {
    case "points": return player.points;
    case "rebounds": return player.rebounds;
    case "assists": return player.assists;
    case "steals": return player.steals ?? null;
    case "blocks": return player.blocks ?? null;
    case "turnovers": return player.turnovers ?? null;
    case "three_pointers": return player.three_points_made ?? null;
    default: return null;
  }
}

function levelFromPctComplete(
  pct: number,
  gameInProgress: boolean,
  isClosed: boolean,
): ProximityLevel {
  if (isClosed || pct >= 1.0) return "RESOLVED";
  if (!gameInProgress) return "NONE";
  if (pct >= 0.85) return "HIGH";
  if (pct >= 0.65) return "MEDIUM";
  if (pct >= 0.40) return "LOW";
  return "NONE";
}

function computeTrend(
  currentValue: number,
  targetValue: number,
  minutesElapsed: number,
  totalMinutes: number,
  isOver: boolean,
): "favorable" | "unfavorable" | "neutral" {
  if (minutesElapsed < 5 || totalMinutes === 0) return "neutral";

  const currentRate = currentValue / minutesElapsed;
  const minutesRemaining = totalMinutes - minutesElapsed;
  const needed = targetValue - currentValue;

  if (needed <= 0) {
    // Already at or past target
    return isOver ? "favorable" : "unfavorable";
  }

  if (minutesRemaining <= 0) return "neutral";

  const requiredRate = needed / minutesRemaining;

  if (currentRate > requiredRate * 1.2) return isOver ? "favorable" : "unfavorable";
  if (currentRate < requiredRate * 0.8) return isOver ? "unfavorable" : "favorable";
  return "neutral";
}

function findPlayerInSummary(
  playerName: string,
  summary: SummaryStats,
): PlayerStats | null {
  const nameL = playerName.toLowerCase();

  const allPlayers: PlayerStats[] = [
    ...summary.home.players.map((p) => ({ ...p, side: "home" as const, steals: undefined, blocks: undefined, turnovers: undefined, three_points_made: undefined })),
    ...summary.away.players.map((p) => ({ ...p, side: "away" as const, steals: undefined, blocks: undefined, turnovers: undefined, three_points_made: undefined })),
  ];

  // Exact full name match first
  const exact = allPlayers.find((p) => p.full_name.toLowerCase() === nameL);
  if (exact) return exact;

  // Partial match (last name or contains)
  const partial = allPlayers.find((p) => {
    const fullL = p.full_name.toLowerCase();
    const lastName = fullL.split(" ").pop() ?? "";
    return fullL.includes(nameL) || nameL.includes(lastName);
  });

  return partial ?? null;
}

export function computeProximity(
  target: WagerTarget,
  game: GameState,
  summary: SummaryStats | null,
): ProximityResult | null {
  const inProgress = game.status === "inprogress" || game.status === "halftime";
  const isClosed = game.status === "closed";
  const minutesElapsed = getMinutesElapsed(game);
  const totalMinutes = getTotalGameMinutes(game);
  const timePressure = getTimePressure(game);

  if (target.target_type === "player_stat") {
    if (!summary || !target.player_name || !target.stat_type || target.line == null) {
      return null;
    }

    const player = findPlayerInSummary(target.player_name, summary);
    if (!player) return null;

    const currentValue = getStatValue(player, target.stat_type);
    if (currentValue == null) return null;

    const targetValue = target.line;
    const pct = targetValue > 0 ? currentValue / targetValue : (currentValue > 0 ? 1 : 0);
    const remaining = Math.max(0, targetValue - currentValue);

    const level = levelFromPctComplete(pct, inProgress, isClosed);
    const trend = computeTrend(currentValue, targetValue, minutesElapsed, totalMinutes, target.is_over);

    const statLabel = target.stat_type.replace(/_/g, " ");
    let description: string;
    if (pct >= 1.0 || isClosed) {
      description = `${player.full_name} has ${currentValue} ${statLabel} (hit ${targetValue} target)`;
    } else {
      description = `${player.full_name} has ${currentValue} ${statLabel} (${remaining} away from ${targetValue})`;
    }

    return {
      level,
      current_value: currentValue,
      target_value: targetValue,
      pct_complete: Math.min(1, pct),
      trend,
      time_pressure: timePressure,
      description,
    };
  }

  if (target.target_type === "game_total") {
    if (target.line == null) return null;

    const total = game.home_score + game.away_score;
    const targetValue = target.line;
    const pct = targetValue > 0 ? total / targetValue : (total > 0 ? 1 : 0);

    const level = levelFromPctComplete(pct, inProgress, isClosed);
    const trend = computeTrend(total, targetValue, minutesElapsed, totalMinutes, target.is_over);

    const remaining = Math.max(0, Math.ceil(targetValue - total));
    let description: string;
    if (pct >= 1.0 || isClosed) {
      description = `Total is ${total} (${target.is_over ? "over" : "under"} ${targetValue} ${pct >= 1.0 ? "hit" : "final"})`;
    } else {
      description = `Total is ${total} (${remaining} from ${targetValue})`;
    }

    return {
      level,
      current_value: total,
      target_value: targetValue,
      pct_complete: Math.min(1, pct),
      trend,
      time_pressure: timePressure,
      description,
    };
  }

  // spread and moneyline targets are handled well by existing logic — return null
  // to let the existing evaluateSpread/evaluateMoneyline handle them
  return null;
}
