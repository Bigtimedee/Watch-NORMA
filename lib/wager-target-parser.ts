// wager-target-parser.ts — Client-side version for React Native
// Mirrors supabase/functions/_shared/wager-target-parser.ts

export interface WagerTarget {
  target_type: "player_stat" | "team_stat" | "game_total" | "spread" | "moneyline";
  player_name?: string;
  stat_type?: string;
  line?: number;
  is_over: boolean;
  team_side?: "home" | "away";
}

const STAT_PATTERNS: Array<{ regex: RegExp; stat_type: string }> = [
  { regex: /\bthree[- _]?pointers?\b|\bthrees\b|\b3[- ]?pointers?\b|\b3[- ]?pt(?:s|m)?\b|\b3pm\b/i, stat_type: "three_pointers" },
  { regex: /\bpoints?\b|\bpts?\b/i, stat_type: "points" },
  { regex: /\brebounds?\b|\brebs?\b/i, stat_type: "rebounds" },
  { regex: /\bassists?\b|\bast\b/i, stat_type: "assists" },
  { regex: /\bsteals?\b|\bstl\b/i, stat_type: "steals" },
  { regex: /\bblocks?\b|\bblk\b/i, stat_type: "blocks" },
  { regex: /\bturnovers?\b|\bto\b/i, stat_type: "turnovers" },
  { regex: /\btriple[- _]?double\b/i, stat_type: "triple_double" },
  { regex: /\bdouble[- _]?double\b/i, stat_type: "double_double" },
];

const OVER_UNDER_REGEX = /\b(over|under|o|u)\b/i;
const LINE_REGEX = /([+-]?\d+(?:\.\d+)?)/;
const KALSHI_SCORES_PATTERN = /^(.+?)\s+scores?\s+(\d+(?:\.\d+)?)\+?\s+(.+)$/i;
const PLAYER_OVER_UNDER_PATTERN = /^(.+?)\s+(over|under|o|u)\s+(\d+(?:\.\d+)?)\s+(.+)$/i;
const TOTAL_PATTERN = /^total\s+(over|under|o|u)\s+(\d+(?:\.\d+)?)/i;
const SPREAD_PATTERN = /^(.+?)\s+([+-]\d+(?:\.\d+)?)$/;

function findStatType(text: string): string | undefined {
  for (const { regex, stat_type } of STAT_PATTERNS) {
    if (regex.test(text)) return stat_type;
  }
  return undefined;
}

function isOverBet(text: string): boolean {
  const match = text.match(OVER_UNDER_REGEX);
  if (!match) return true;
  return match[1].toLowerCase() === "over" || match[1].toLowerCase() === "o";
}

function cleanPlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function parseWagerTarget(description: string): WagerTarget | null {
  if (!description || description.trim().length === 0) return null;

  const desc = description.trim();

  const totalMatch = desc.match(TOTAL_PATTERN);
  if (totalMatch) {
    const is_over = totalMatch[1].toLowerCase() === "over" || totalMatch[1].toLowerCase() === "o";
    return { target_type: "game_total", line: parseFloat(totalMatch[2]), is_over };
  }

  const kalshiMatch = desc.match(KALSHI_SCORES_PATTERN);
  if (kalshiMatch) {
    const stat_type = findStatType(kalshiMatch[3]);
    if (stat_type) {
      return {
        target_type: "player_stat",
        player_name: cleanPlayerName(kalshiMatch[1]),
        stat_type,
        line: parseFloat(kalshiMatch[2]),
        is_over: true,
      };
    }
  }

  const playerOUMatch = desc.match(PLAYER_OVER_UNDER_PATTERN);
  if (playerOUMatch) {
    const stat_type = findStatType(playerOUMatch[4]);
    if (stat_type) {
      return {
        target_type: "player_stat",
        player_name: cleanPlayerName(playerOUMatch[1]),
        stat_type,
        line: parseFloat(playerOUMatch[3]),
        is_over: playerOUMatch[2].toLowerCase() === "over" || playerOUMatch[2].toLowerCase() === "o",
      };
    }
  }

  const spreadMatch = desc.match(SPREAD_PATTERN);
  if (spreadMatch) {
    const teamText = spreadMatch[1].trim();
    if (!findStatType(teamText) && !OVER_UNDER_REGEX.test(teamText)) {
      return { target_type: "spread", line: parseFloat(spreadMatch[2]), is_over: false };
    }
  }

  const stat_type = findStatType(desc);
  if (stat_type) {
    const lineMatch = desc.match(LINE_REGEX);
    if (lineMatch) {
      const line = parseFloat(lineMatch[1]);
      const is_over = isOverBet(desc);

      let player_name: string | undefined;
      for (const { regex } of STAT_PATTERNS) {
        const statMatch = desc.match(regex);
        if (statMatch && statMatch.index != null) {
          let cutoff = statMatch.index;
          const overMatch = desc.match(OVER_UNDER_REGEX);
          const lineNumMatch = desc.match(LINE_REGEX);
          if (overMatch && overMatch.index != null && overMatch.index < cutoff) cutoff = overMatch.index;
          if (lineNumMatch && lineNumMatch.index != null && lineNumMatch.index < cutoff) cutoff = lineNumMatch.index;
          const namePart = desc.substring(0, cutoff).trim();
          if (namePart.length >= 2 && !/^\d/.test(namePart)) {
            player_name = cleanPlayerName(namePart);
          }
          break;
        }
      }

      if (player_name) {
        return { target_type: "player_stat", player_name, stat_type, line, is_over };
      }
    }
  }

  return null;
}
