// wager-target-parser.ts — Extracts structured betting targets from free-text descriptions

export interface WagerTarget {
  target_type: "player_stat" | "team_stat" | "game_total" | "spread" | "moneyline";
  player_name?: string;
  stat_type?: string;
  line?: number;
  is_over: boolean;
  team_side?: "home" | "away";
}

// Canonical stat keywords mapped from various text patterns
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

// Match "Over" or "Under" indicators
const OVER_UNDER_REGEX = /\b(over|under|o|u)\b/i;

// Match a numeric line value like "27.5", "210", "+4.5", "-3.5"
const LINE_REGEX = /([+-]?\d+(?:\.\d+)?)/;

// Match "scores X+ points" pattern (Kalshi-style)
const KALSHI_SCORES_PATTERN = /^(.+?)\s+scores?\s+(\d+(?:\.\d+)?)\+?\s+(.+)$/i;

// Match "Player Name Over/Under X Stat" pattern
const PLAYER_OVER_UNDER_PATTERN = /^(.+?)\s+(over|under|o|u)\s+(\d+(?:\.\d+)?)\s+(.+)$/i;

// Match "Total Over/Under X" pattern
const TOTAL_PATTERN = /^total\s+(over|under|o|u)\s+(\d+(?:\.\d+)?)/i;

// Match "TeamName +/-X" spread pattern
const SPREAD_PATTERN = /^(.+?)\s+([+-]\d+(?:\.\d+)?)$/;

function findStatType(text: string): string | undefined {
  for (const { regex, stat_type } of STAT_PATTERNS) {
    if (regex.test(text)) return stat_type;
  }
  return undefined;
}

function isOverBet(text: string): boolean {
  const match = text.match(OVER_UNDER_REGEX);
  if (!match) return true; // Default to over if ambiguous (e.g. "scores 27+")
  return match[1].toLowerCase() === "over" || match[1].toLowerCase() === "o";
}

function cleanPlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function parseWagerTarget(description: string): WagerTarget | null {
  if (!description || description.trim().length === 0) return null;

  const desc = description.trim();

  // 1. Try "Total Over/Under X" (game total)
  const totalMatch = desc.match(TOTAL_PATTERN);
  if (totalMatch) {
    const is_over = totalMatch[1].toLowerCase() === "over" || totalMatch[1].toLowerCase() === "o";
    const line = parseFloat(totalMatch[2]);
    return {
      target_type: "game_total",
      line,
      is_over,
    };
  }

  // 2. Try Kalshi-style: "Anthony Edwards scores 27+ points"
  const kalshiMatch = desc.match(KALSHI_SCORES_PATTERN);
  if (kalshiMatch) {
    const player_name = cleanPlayerName(kalshiMatch[1]);
    const line = parseFloat(kalshiMatch[2]);
    const statText = kalshiMatch[3];
    const stat_type = findStatType(statText);

    if (stat_type) {
      return {
        target_type: "player_stat",
        player_name,
        stat_type,
        line,
        is_over: true, // "scores X+" always means over
      };
    }
  }

  // 3. Try "Player Over/Under X Stat" pattern
  const playerOUMatch = desc.match(PLAYER_OVER_UNDER_PATTERN);
  if (playerOUMatch) {
    const player_name = cleanPlayerName(playerOUMatch[1]);
    const is_over = playerOUMatch[2].toLowerCase() === "over" || playerOUMatch[2].toLowerCase() === "o";
    const line = parseFloat(playerOUMatch[3]);
    const statText = playerOUMatch[4];
    const stat_type = findStatType(statText);

    if (stat_type) {
      return {
        target_type: "player_stat",
        player_name,
        stat_type,
        line,
        is_over,
      };
    }
  }

  // 4. Try spread pattern: "Lakers -4.5" or "Duke +3.5"
  const spreadMatch = desc.match(SPREAD_PATTERN);
  if (spreadMatch) {
    const teamText = spreadMatch[1].trim();
    const line = parseFloat(spreadMatch[2]);

    // Don't match if the "team" part looks like a player stat description
    if (!findStatType(teamText) && !OVER_UNDER_REGEX.test(teamText)) {
      return {
        target_type: "spread",
        line,
        is_over: false, // Not applicable for spreads, but required by interface
      };
    }
  }

  // 5. Try loose player prop parsing:
  //    Look for a stat type keyword and a number in the description
  const stat_type = findStatType(desc);
  if (stat_type) {
    const lineMatch = desc.match(LINE_REGEX);
    if (lineMatch) {
      const line = parseFloat(lineMatch[1]);
      const is_over = isOverBet(desc);

      // Try to extract player name: everything before the first keyword match
      let player_name: string | undefined;
      for (const { regex } of STAT_PATTERNS) {
        const statMatch = desc.match(regex);
        if (statMatch && statMatch.index != null) {
          // Player name is everything before the line number or the over/under keyword
          const overMatch = desc.match(OVER_UNDER_REGEX);
          const lineNumMatch = desc.match(LINE_REGEX);

          // Find the earliest "boundary" — the over/under keyword or the line number
          let cutoff = statMatch.index;
          if (overMatch && overMatch.index != null && overMatch.index < cutoff) {
            cutoff = overMatch.index;
          }
          if (lineNumMatch && lineNumMatch.index != null && lineNumMatch.index < cutoff) {
            cutoff = lineNumMatch.index;
          }

          const namePart = desc.substring(0, cutoff).trim();
          if (namePart.length >= 2 && !/^\d/.test(namePart)) {
            player_name = cleanPlayerName(namePart);
          }
          break;
        }
      }

      if (player_name) {
        return {
          target_type: "player_stat",
          player_name,
          stat_type,
          line,
          is_over,
        };
      }
    }
  }

  // 6. If nothing matched, return null (unparseable)
  return null;
}
