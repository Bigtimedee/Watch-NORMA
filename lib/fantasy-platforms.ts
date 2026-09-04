/**
 * Canonical fantasy / DFS pick'em platform list.
 * ImportRosterSheet, connections, name maps, and tests all read from here
 * so a platform cannot exist in the UI picker without a testable constant.
 */

export const FANTASY_PLATFORMS = [
  { value: "draftkings_dfs", label: "DraftKings DFS" },
  { value: "yahoo_fantasy", label: "Yahoo Fantasy" },
  { value: "sleeper", label: "Sleeper" },
  { value: "espn_fantasy", label: "ESPN Fantasy" },
  { value: "prizepicks", label: "PrizePicks" },
  { value: "underdog", label: "Underdog" },
  { value: "other", label: "Other" },
] as const;

export type FantasyPlatform = (typeof FANTASY_PLATFORMS)[number]["value"];

/** Pick'em operators — category = dfs_pickem in provider_registry. */
export const PICKEM_PROVIDER_KEYS = ["prizepicks", "underdog"] as const;
export type PickEmProviderKey = (typeof PICKEM_PROVIDER_KEYS)[number];

/** Season-long fantasy apps — category = fantasy. No live roster API. */
export const FANTASY_PROVIDER_KEYS = [
  "sleeper",
  "yahoo_fantasy",
  "espn_fantasy",
] as const;

export function isPickEmProvider(key: string | null | undefined): boolean {
  return !!key && (PICKEM_PROVIDER_KEYS as readonly string[]).includes(key);
}

export function isFantasyPlatform(key: string | null | undefined): boolean {
  return !!key && FANTASY_PLATFORMS.some((p) => p.value === key);
}
