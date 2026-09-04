/**
 * Player-follow matching for fantasy roster imports.
 * Follows store entity_id as a lowercased player name (see lib/roster-import.ts).
 * Alert candidate generation uses these helpers to decide whether a followed
 * player is in the current game — without inventing a live DFS API.
 */

import type { SummaryStats } from "../evaluate-alerts/logic.ts";

export function normalizePlayerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** True when a roster-imported name refers to a boxscore/summary player. */
export function playerNameMatches(followName: string, rosterName: string): boolean {
  const a = normalizePlayerName(followName);
  const b = normalizePlayerName(rosterName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;

  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  if (aParts.length === 0 || bParts.length < 2) return false;

  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];
  if (aLast !== bLast) return false;

  // "j jefferson" / "justin jefferson" — first-initial + last name
  if (aParts.length === 1) return false;
  return aParts[0][0] === bParts[0][0];
}

export function extractSummaryPlayerNames(summary: SummaryStats | null): string[] {
  if (!summary) return [];
  return [...summary.home.players, ...summary.away.players]
    .map((p) => p.full_name)
    .filter((n) => typeof n === "string" && n.trim().length > 0);
}

/**
 * Best-effort ESPN boxscore athlete names. ESPN payload shapes vary
 * (flattened `players` vs nested `boxscore.players` + statistics[].athletes).
 */
export function extractEspnPlayerNames(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const teams = (root.players ??
    (root.boxscore as Record<string, unknown> | undefined)?.players ??
    []) as unknown[];

  const names: string[] = [];
  if (!Array.isArray(teams)) return names;

  for (const team of teams) {
    if (!team || typeof team !== "object") continue;
    const stats = (team as Record<string, unknown>).statistics ?? [];
    if (!Array.isArray(stats)) continue;
    for (const stat of stats) {
      if (!stat || typeof stat !== "object") continue;
      const athletes = (stat as Record<string, unknown>).athletes ?? [];
      if (!Array.isArray(athletes)) continue;
      for (const row of athletes) {
        if (!row || typeof row !== "object") continue;
        const athlete = (row as Record<string, unknown>).athlete as
          | Record<string, unknown>
          | undefined;
        const name =
          (typeof athlete?.displayName === "string" && athlete.displayName) ||
          (typeof athlete?.fullName === "string" && athlete.fullName) ||
          (typeof (row as Record<string, unknown>).displayName === "string" &&
            ((row as Record<string, unknown>).displayName as string)) ||
          "";
        if (name.trim()) names.push(name.trim());
      }
    }
  }
  return names;
}

export function collectGamePlayerNames(
  summary: SummaryStats | null,
  espnPayload?: unknown,
): string[] {
  const set = new Set<string>();
  for (const n of extractSummaryPlayerNames(summary)) set.add(n);
  for (const n of extractEspnPlayerNames(espnPayload)) set.add(n);
  return [...set];
}

export function followMatchesGamePlayers(
  followEntityId: string,
  gamePlayerNames: string[],
): boolean {
  return gamePlayerNames.some((rosterName) =>
    playerNameMatches(followEntityId, rosterName)
  );
}
