/**
 * FF-01 — Fantasy Roster Import
 * Pure utility functions for parsing and normalising roster input.
 * Kept separate from the UI component so they can be unit-tested
 * without loading React Native / Expo modules.
 */

/** Split a multi-line player name blob into a cleaned list of names. */
export function parseRosterInput(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Build the follows table rows from a list of player names. */
export function buildRosterFollowRows(
  playerNames: string[],
  userId: string
): Array<{
  user_id: string;
  follow_type: string;
  entity_type: string;
  entity_id: string;
  source: string;
}> {
  return playerNames.map((name) => ({
    user_id: userId,
    follow_type: "player",
    entity_type: "player",
    entity_id: name.toLowerCase().trim(),
    source: "fantasy",
  }));
}
