// Wager sport derivation.
//
// Bug: manual wagers were saved with sport='ncaam' for every game —
// useAddWager never sent a sport, so the wagers.sport DB default
// ('ncaam', migration 049) won. An NCAAF Ohio State moneyline wager
// (game espn-ncaaf-401858488) was therefore tagged 'ncaam'.
//
// The game's own sport is authoritative; the ESPN game-id prefix
// (espn-<sport>-<eventId>, see poll-schedule) is the fallback so any
// caller that only knows game_id still saves the right sport.

import type { SportKey } from "./types";

const SPORT_KEYS: readonly SportKey[] = ["ncaam", "nba", "mlb", "ncaaf", "nfl"];

const GAME_ID_SPORT: Record<string, SportKey> = {
  ncaaf: "ncaaf",
  nfl: "nfl",
  nba: "nba",
  mlb: "mlb",
  ncaam: "ncaam",
  // ESPN also writes college basketball team/game ids with 'ncaab'
  ncaab: "ncaam",
};

export function isSportKey(value: string | null | undefined): value is SportKey {
  return !!value && (SPORT_KEYS as readonly string[]).includes(value);
}

/** Sport encoded in an ESPN game id like "espn-ncaaf-401858488", else null. */
export function sportFromGameId(gameId: string | null | undefined): SportKey | null {
  if (!gameId) return null;
  const parts = gameId.split("-");
  // espn-<sport>-<eventId>
  if (parts[0] === "espn" && parts[1]) {
    return GAME_ID_SPORT[parts[1].toLowerCase()] ?? null;
  }
  // Bare "<sport>-..." ids
  return GAME_ID_SPORT[(parts[0] ?? "").toLowerCase()] ?? null;
}

/**
 * Resolve the sport to save on a wager: explicit sport (from the game
 * object) wins, then the game-id prefix. Null when neither is known —
 * callers then omit sport and the legacy DB default applies, rather
 * than guessing.
 */
export function resolveWagerSport(input: {
  sport?: string | null;
  game_id?: string | null;
}): SportKey | null {
  if (isSportKey(input.sport)) return input.sport;
  return sportFromGameId(input.game_id);
}

/** Sport for a game object (AddWagerSheet): game.sport, else its id. */
export function sportForGame(game: {
  id?: string | null;
  sport?: string | null;
}): SportKey | null {
  return resolveWagerSport({ sport: game.sport, game_id: game.id });
}
