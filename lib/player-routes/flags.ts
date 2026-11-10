/**
 * Player-route flag decisions.
 *
 * The live switch is public.player_route_control, read by
 * lib/player-routes/remote-control.ts. This module only evaluates a snapshot.
 * A kill is applied before freshness, cohort, and the enable flags.
 */

/** Absolute ceiling accepted from the server TTL. Clients trust less than this. */
export const PLAYER_ROUTE_MAX_TTL_MS = 15 * 60 * 1000;

/**
 * Longest a successful allow may be reused. Handoff does not reuse it:
 * it refreshes again immediately before open. This is not an instant
 * offline disable.
 */
export const PLAYER_ROUTE_MAX_TRUST_MS = 60 * 1000;

export const PLAYER_ROUTE_FLAG_FRESHNESS_MS = PLAYER_ROUTE_MAX_TRUST_MS;

export const PLAYER_ROUTE_REMOTE_CONTROL = {
  wired: true as const,
  table: "player_route_control",
  trustMs: PLAYER_ROUTE_MAX_TRUST_MS,
  maxTtlMs: PLAYER_ROUTE_MAX_TTL_MS,
  propagation:
    "Disable applies on the next foreground, the 60-second foreground refresh, or the refresh immediately before a handoff. An offline device cannot open StrymTV. Already-open screens are not pushed a disable until one of those refreshes.",
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
  if (snapshot.killSwitch) return { allowed: false, reason: "kill_switch" };
  if (snapshot.source === "remote") {
    const fetched = snapshot.fetchedAtMs;
    const windowMs = Math.min(freshnessMs, PLAYER_ROUTE_MAX_TTL_MS);
    if (
      fetched == null ||
      !Number.isFinite(fetched) ||
      nowMs < fetched ||
      nowMs - fetched > windowMs
    ) {
      return { allowed: false, reason: "config_expired" };
    }
  }
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
