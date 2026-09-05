/**
 * Consumer-app filters for screenshot / staging-only demo rows.
 *
 * Incident (2026-09-05): `demo-%` games and `DEMO SCREENSHOT` alerts were
 * inserted into production (`shijrazlzawjpobrpmnt`). Real ESPN ids such as
 * `espn-ncaaf-401856660` must never be treated as demo.
 */

export const DEMO_GAME_ID_PREFIX = "demo-";
export const DEMO_GAME_ID_LIKE = "demo-%";
export const DEMO_ALERT_TITLE_MARKER = "DEMO SCREENSHOT";
export const DEMO_ALERT_TITLE_ILIKE = "%DEMO SCREENSHOT%";

/** PostgREST `or()` clause: keep null game_id rows, drop demo-linked alerts. */
export const DEMO_ALERT_GAME_ID_OR =
  "game_id.is.null,game_id.not.ilike.demo-%";

/**
 * Bump this when the consumer demo filter changes. Included in React Query
 * keys so an OTA discards in-memory lists that still contain purged demo
 * rows. Users on the Games tab then refetch via the existing 30s poll
 * (or immediately on mount for the new key) — no force-quit required.
 */
export const DEMO_FILTER_VERSION = 2;

export const GAMES_QUERY_ROOT = "games-v2";
export const ALERTS_QUERY_ROOT = "alerts-v2";
export const FOLLOWED_GAMES_QUERY_ROOT = "followed-games-v2";
export const GAME_DETAIL_QUERY_ROOT = "game-v2";

export function gamesQueryKey(...parts: unknown[]) {
  return [GAMES_QUERY_ROOT, DEMO_FILTER_VERSION, ...parts] as const;
}

export function alertsQueryKey(...parts: unknown[]) {
  return [ALERTS_QUERY_ROOT, DEMO_FILTER_VERSION, ...parts] as const;
}

export function followedGamesQueryKey() {
  return [FOLLOWED_GAMES_QUERY_ROOT, DEMO_FILTER_VERSION] as const;
}

export function gameDetailQueryKey(gameId: string) {
  return [GAME_DETAIL_QUERY_ROOT, DEMO_FILTER_VERSION, gameId] as const;
}

export function isDemoGameId(id: string | null | undefined): boolean {
  if (typeof id !== "string" || id.length === 0) return false;
  return id.toLowerCase().startsWith(DEMO_GAME_ID_PREFIX);
}

export function isDemoAlertTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  return title.toUpperCase().includes(DEMO_ALERT_TITLE_MARKER);
}

export function isDemoAlert(row: {
  game_id?: string | null;
  title?: string | null;
}): boolean {
  return isDemoGameId(row.game_id) || isDemoAlertTitle(row.title);
}

export function excludeDemoGames<T extends { id?: string | null }>(
  rows: readonly T[]
): T[] {
  return rows.filter((row) => !isDemoGameId(row.id));
}

export function excludeDemoAlerts<
  T extends { game_id?: string | null; title?: string | null },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isDemoAlert(row));
}

/** Exclude `games.id` ILIKE `demo-%` on a PostgREST query. */
export function applyConsumerGameIdFilter<T>(query: T): T {
  const q = query as T & {
    not: (column: string, operator: string, value: string) => T;
  };
  return q.not("id", "ilike", DEMO_GAME_ID_LIKE);
}

/**
 * Exclude screenshot-seeded alerts: title ILIKE `%DEMO SCREENSHOT%`
 * or `game_id` ILIKE `demo-%`. Null `game_id` (e.g. email imports) is kept.
 */
export function applyConsumerAlertFilter<T>(query: T): T {
  const q = query as {
    not: (column: string, operator: string, value: string) => {
      or: (filters: string) => T;
    };
  };
  return q.not("title", "ilike", DEMO_ALERT_TITLE_ILIKE).or(
    DEMO_ALERT_GAME_ID_OR
  );
}
