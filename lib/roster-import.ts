/**
 * FF-01 — Fantasy Roster Import
 * Pure utility functions for parsing and normalising roster input.
 * Kept separate from the UI component so they can be unit-tested
 * without loading React Native / Expo modules.
 */

import type { FantasyPlatform } from "./fantasy-platforms";

/** Split a multi-line player name blob into a cleaned list of names. */
export function parseRosterInput(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface RosterFollowRow {
  user_id: string;
  follow_type: string;
  entity_type: string;
  entity_id: string;
  source: string;
  fantasy_source: string | null;
}

/** Build the follows table rows from a list of player names. */
export function buildRosterFollowRows(
  playerNames: string[],
  userId: string,
  platform?: FantasyPlatform | string | null,
): RosterFollowRow[] {
  const fantasy_source =
    platform && platform !== "other" ? String(platform) : platform === "other" ? "other" : null;

  return playerNames.map((name) => ({
    user_id: userId,
    follow_type: "player",
    entity_type: "player",
    entity_id: name.toLowerCase().trim(),
    source: "fantasy",
    fantasy_source,
  }));
}
