/**
 * Player-route flags.
 *
 * Watch-NORMA has no remote feature-flag service. The shipped snapshot is an
 * explicit build-time off switch. `evaluatePlayerRouteFlags` also implements
 * the 15-minute freshness rule for a future remote snapshot. Nothing here
 * fetches or writes server config, and the build snapshot is not a server
 * kill switch.
 */

export const PLAYER_ROUTE_FLAG_FRESHNESS_MS = 15 * 60 * 1000;

export const PLAYER_ROUTE_REMOTE_CONTROL = {
  wired: false as const,
  freshnessMs: PLAYER_ROUTE_FLAG_FRESHNESS_MS,
  missingWork:
    "No remote feature-flag service exists. Cohort assignment, a server kill switch, and a 15-minute refresh are not wired. The pure evaluator fail-closes an unavailable or expired remote snapshot, but this build never loads one.",
};

export interface PlayerRouteFlagSnapshot {
  source: "build" | "remote" | "unavailable";
  /** Null for the build snapshot, which is not a timed remote fetch. */
  fetchedAtMs: number | null;
  globalEnabled: boolean;
  strymtvEnabled: boolean;
  /** When true, the optional action is off even if the other flags are on. */
  killSwitch: boolean;
  /** Empty means no cohort is admitted. */
  cohortAllowlist: readonly string[];
  cohortId: string | null;
}

/** Shipped defaults. Every enable is off. The kill switch itself is not engaged. */
export const SHIPPED_PLAYER_ROUTE_FLAGS: PlayerRouteFlagSnapshot = {
  source: "build",
  fetchedAtMs: null,
  globalEnabled: false,
  strymtvEnabled: false,
  killSwitch: false,
  cohortAllowlist: [],
  cohortId: null,
};

export type FlagBlockReason =
  | "config_unavailable"
  | "config_expired"
  | "kill_switch"
  | "global_disabled"
  | "player_disabled"
  | "cohort_not_admitted"
  | "allowed";

export interface FlagDecision {
  allowed: boolean;
  reason: FlagBlockReason;
}

export function evaluatePlayerRouteFlags(
  snapshot: PlayerRouteFlagSnapshot,
  nowMs: number,
  freshnessMs: number = PLAYER_ROUTE_FLAG_FRESHNESS_MS
): FlagDecision {
  if (snapshot.source === "unavailable") {
    return { allowed: false, reason: "config_unavailable" };
  }
  if (snapshot.source === "remote") {
    const fetched = snapshot.fetchedAtMs;
    if (
      fetched == null ||
      !Number.isFinite(fetched) ||
      nowMs < fetched ||
      nowMs - fetched > freshnessMs
    ) {
      return { allowed: false, reason: "config_expired" };
    }
  }
  if (snapshot.killSwitch) return { allowed: false, reason: "kill_switch" };
  if (!snapshot.globalEnabled) return { allowed: false, reason: "global_disabled" };
  if (!snapshot.strymtvEnabled) return { allowed: false, reason: "player_disabled" };
  const cohort = snapshot.cohortId;
  if (
    snapshot.cohortAllowlist.length === 0 ||
    cohort == null ||
    cohort.length === 0 ||
    !snapshot.cohortAllowlist.includes(cohort)
  ) {
    return { allowed: false, reason: "cohort_not_admitted" };
  }
  return { allowed: true, reason: "allowed" };
}

export function readShippedFlagSnapshot(): PlayerRouteFlagSnapshot {
  return SHIPPED_PLAYER_ROUTE_FLAGS;
}
