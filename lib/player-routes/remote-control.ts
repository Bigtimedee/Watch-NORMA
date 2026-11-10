/**
 * Remote StrymTV kill switch.
 *
 * The client reads one non-secret row from public.player_route_control.
 * A missing, malformed, future-dated, or failed read disables only the
 * optional StrymTV action. YouTube TV is not part of this module.
 *
 * Trust window is 60 seconds, and never longer than the server TTL or 15
 * minutes. A handoff refreshes immediately before open. A device that is
 * offline cannot complete a handoff. Disable is not pushed instantly to a
 * phone that is not refreshing.
 */

import {
  evaluatePlayerRouteFlags,
  PLAYER_ROUTE_MAX_TRUST_MS,
  type FlagDecision,
  type PlayerRouteFlagSnapshot,
} from "./flags";

export const PLAYER_ROUTE_FUTURE_SKEW_MS = 2 * 60 * 1000;

const PAYLOAD_KEYS = [
  "schema_version",
  "killed",
  "strymtv_enabled",
  "cohort_allowlist",
  "ttl_seconds",
  "updated_at",
] as const;

const COHORT_TOKEN = /^[a-z0-9][a-z0-9_-]{0,32}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface RemoteControlRecord {
  schemaVersion: 1;
  killed: boolean;
  strymtvEnabled: boolean;
  cohortAllowlist: string[];
  ttlSeconds: number;
  updatedAt: string;
}

export type ParseResult =
  | { ok: true; record: RemoteControlRecord }
  | { ok: false; reason: "malformed" };

export function parseRemoteControlPayload(input: unknown, nowMs: number): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "malformed" };
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PAYLOAD_KEYS.length || PAYLOAD_KEYS.some((key) => !keys.includes(key))) {
    return { ok: false, reason: "malformed" };
  }
  if (record.schema_version !== 1) return { ok: false, reason: "malformed" };
  if (typeof record.killed !== "boolean" || typeof record.strymtv_enabled !== "boolean") {
    return { ok: false, reason: "malformed" };
  }
  if (!Number.isInteger(record.ttl_seconds) || (record.ttl_seconds as number) < 15 || (record.ttl_seconds as number) > 900) {
    return { ok: false, reason: "malformed" };
  }
  if (typeof record.updated_at !== "string" || !ISO_RE.test(record.updated_at)) {
    return { ok: false, reason: "malformed" };
  }
  const updatedMs = Date.parse(record.updated_at);
  if (!Number.isFinite(updatedMs) || updatedMs > nowMs + PLAYER_ROUTE_FUTURE_SKEW_MS) {
    return { ok: false, reason: "malformed" };
  }
  if (!Array.isArray(record.cohort_allowlist) || record.cohort_allowlist.length > 20) {
    return { ok: false, reason: "malformed" };
  }
  const cohortAllowlist: string[] = [];
  for (const token of record.cohort_allowlist) {
    if (typeof token !== "string" || !COHORT_TOKEN.test(token)) return { ok: false, reason: "malformed" };
    cohortAllowlist.push(token);
  }
  const serialized = JSON.stringify(record);
  if (serialized.includes("://") || serialized.includes("@")) return { ok: false, reason: "malformed" };
  return {
    ok: true,
    record: {
      schemaVersion: 1,
      killed: record.killed,
      strymtvEnabled: record.strymtv_enabled,
      cohortAllowlist,
      ttlSeconds: record.ttl_seconds as number,
      updatedAt: record.updated_at,
    },
  };
}

function trustMs(ttlSeconds: number): number {
  return Math.min(ttlSeconds * 1000, PLAYER_ROUTE_MAX_TRUST_MS);
}

function snapshotFor(record: RemoteControlRecord, fetchedAtMs: number, cohortId: string | null): PlayerRouteFlagSnapshot {
  return {
    source: "remote",
    fetchedAtMs,
    globalEnabled: record.strymtvEnabled,
    strymtvEnabled: record.strymtvEnabled,
    killSwitch: record.killed,
    cohortAllowlist: record.cohortAllowlist,
    cohortId,
  };
}

const UNAVAILABLE: FlagDecision = { allowed: false, reason: "config_unavailable" };
const KILL: FlagDecision = { allowed: false, reason: "kill_switch" };

export interface PlayerRouteControl {
  refresh(): Promise<FlagDecision>;
  beforeHandoff(): Promise<FlagDecision>;
  current(nowMs?: number): FlagDecision;
  isKilled(): boolean;
}

export function createPlayerRouteControl(options: {
  fetchPayload: () => Promise<unknown>;
  now?: () => number;
  cohortId?: () => string | null;
}): PlayerRouteControl {
  const now = options.now ?? (() => Date.now());
  const cohortId = options.cohortId ?? (() => null);
  let generation = 0;
  let stickyKillAt: string | null = null;
  let applied: { record: RemoteControlRecord; fetchedAtMs: number } | null = null;

  function current(at = now()): FlagDecision {
    if (stickyKillAt) return KILL;
    if (!applied) return UNAVAILABLE;
    return evaluatePlayerRouteFlags(
      snapshotFor(applied.record, applied.fetchedAtMs, cohortId()),
      at,
      trustMs(applied.record.ttlSeconds)
    );
  }

  async function refresh(): Promise<FlagDecision> {
    const gen = ++generation;
    let payload: unknown;
    try {
      payload = await options.fetchPayload();
    } catch {
      if (gen !== generation) return current();
      if (!stickyKillAt) applied = null;
      return stickyKillAt ? KILL : UNAVAILABLE;
    }
    const parsed = parseRemoteControlPayload(payload, now());
    const stale = gen !== generation;
    if (!parsed.ok) {
      if (stale) return current();
      if (!stickyKillAt) applied = null;
      return stickyKillAt ? KILL : UNAVAILABLE;
    }
    const record = parsed.record;
    if (stale) {
      if (record.killed && (stickyKillAt == null || record.updatedAt >= stickyKillAt)) {
        stickyKillAt = record.updatedAt;
        applied = { record, fetchedAtMs: now() };
      }
      return current();
    }
    if (stickyKillAt && !record.killed && record.updatedAt <= stickyKillAt) {
      return KILL;
    }
    stickyKillAt = record.killed ? record.updatedAt : null;
    applied = { record, fetchedAtMs: now() };
    return current();
  }

  return {
    refresh,
    beforeHandoff: refresh,
    current,
    isKilled: () => stickyKillAt != null || applied?.record.killed === true,
  };
}
