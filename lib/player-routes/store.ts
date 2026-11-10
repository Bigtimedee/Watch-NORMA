import { isMappableFeedId } from "./canonical-feeds";
import {
  contractUsable,
  productionHandoffPermitted,
  type EncodingGate,
  type VerifiedEncodingContract,
} from "./encoding-gate";
import { attemptStrymTvHandoff, type HandoffResult } from "./handoff";
import { utf8ByteLength, validateStreamUrl } from "./url-validation";
import {
  isAccountId,
  type AccountIndex,
  type LoadedAccount,
  type StoredRouteMeta,
} from "./store-types";

export interface PlayerRouteSecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PlayerRouteMarkerStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export const INSTALL_MARKER_ASYNC_KEY = "norma.playerRoutes.installGeneration";
export const INSTALL_MARKER_SECURE_KEY = "pr.installGeneration";
export const ACCOUNT_REGISTRY_KEY = "pr.accounts";

const INDEX_MAX_BYTES = 20_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INDEX_KEYS = new Set([
  "schemaVersion",
  "accountId",
  "optIn",
  "attestedAt",
  "reinstallLock",
  "routes",
]);
const ROUTE_KEYS = new Set([
  "id",
  "player",
  "feedId",
  "label",
  "enabled",
  "createdAt",
  "attestedAt",
  "userConfirmedAt",
  "quarantined",
  "schemaVersion",
]);

export function indexKey(accountId: string): string {
  return `pr.index.${accountId}`;
}
export function urlKey(accountId: string, routeId: string): string {
  return `pr.url.${accountId}.${routeId}`;
}
export function urlIdsKey(accountId: string): string {
  return `pr.urlids.${accountId}`;
}

export function validateRouteLabel(label: string): { ok: true; label: string } | { ok: false } {
  if (typeof label !== "string") return { ok: false };
  const trimmed = label.trim();
  if (trimmed.length > 40 || utf8ByteLength(trimmed) > 120) return { ok: false };
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return { ok: false };
  if (/:\/\//.test(trimmed) || /https?:/i.test(trimmed)) return { ok: false };
  return { ok: true, label: trimmed };
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_RE.test(value);
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key)) && !JSON.stringify(value).includes("://");
}

function parseRoute(value: unknown): StoredRouteMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ROUTE_KEYS)) return null;
  if (record.schemaVersion !== 1 || record.player !== "strymtv") return null;
  if (typeof record.id !== "string" || !ID_RE.test(record.id)) return null;
  if (typeof record.feedId !== "string" || !isMappableFeedId(record.feedId)) return null;
  if (typeof record.label !== "string" || !validateRouteLabel(record.label).ok) return null;
  if (typeof record.enabled !== "boolean" || typeof record.quarantined !== "boolean") return null;
  if (!isIso(record.createdAt) || !isIso(record.attestedAt)) return null;
  if (record.userConfirmedAt != null && !isIso(record.userConfirmedAt)) return null;
  return {
    id: record.id,
    player: "strymtv",
    feedId: record.feedId,
    label: record.label,
    enabled: record.enabled,
    createdAt: record.createdAt,
    attestedAt: record.attestedAt,
    userConfirmedAt: record.userConfirmedAt ?? null,
    quarantined: record.quarantined,
    schemaVersion: 1,
  };
}

function parseIndex(raw: string, accountId: string): { ok: true; index: AccountIndex } | { ok: false; reason: "unsupported_schema" | "corrupt" } {
  if (utf8ByteLength(raw) > INDEX_MAX_BYTES) return { ok: false, reason: "corrupt" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "corrupt" };
  const record = parsed as Record<string, unknown>;
  if (!exactKeys(record, INDEX_KEYS)) return { ok: false, reason: "corrupt" };
  if (record.schemaVersion !== 1) return { ok: false, reason: "unsupported_schema" };
  if (record.accountId !== accountId || typeof record.optIn !== "boolean" || typeof record.reinstallLock !== "boolean") {
    return { ok: false, reason: "corrupt" };
  }
  if (record.attestedAt != null && !isIso(record.attestedAt)) return { ok: false, reason: "corrupt" };
  if (!Array.isArray(record.routes)) return { ok: false, reason: "corrupt" };
  const routes: StoredRouteMeta[] = [];
  for (const route of record.routes) {
    const parsedRoute = parseRoute(route);
    if (!parsedRoute) return { ok: false, reason: "corrupt" };
    routes.push(parsedRoute);
  }
  return {
    ok: true,
    index: {
      schemaVersion: 1,
      accountId,
      optIn: record.optIn,
      attestedAt: (record.attestedAt as string | null) ?? null,
      reinstallLock: record.reinstallLock,
      routes,
    },
  };
}

async function readJsonIds(secure: PlayerRouteSecureStorage, key: string): Promise<string[]> {
  const raw = await secure.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && ID_RE.test(id));
  } catch {
    return [];
  }
}

export interface PlayerRouteRepository {
  load(accountId: string): Promise<LoadedAccount>;
  summary(accountId: string): Promise<{ hasDeletableData: boolean; reinstallLock: boolean }>;
  setOptIn(accountId: string, optedIn: boolean, decisionAllowed: boolean): Promise<{ ok: boolean; reason?: string }>;
  saveRoute(
    accountId: string,
    input: { feedId: string; label: string; streamUrl: string },
    decisionAllowed: boolean
  ): Promise<{ ok: boolean; reason?: string; routeId?: string }>;
  setRouteEnabled(accountId: string, routeId: string, enabled: boolean): Promise<{ ok: boolean; reason?: string }>;
  deleteRoute(accountId: string, routeId: string): Promise<{ ok: boolean }>;
  deleteAll(accountId: string): Promise<{ ok: boolean }>;
  wipeAccount(accountId: string): Promise<{ ok: boolean }>;
  reconcileInstall(): Promise<"fresh" | "same_install" | "reinstall_quarantined">;
  acknowledgeReinstall(accountId: string): Promise<{ ok: boolean }>;
  confirmRoute(accountId: string, routeId: string): Promise<{ ok: boolean; reason?: string }>;
  testRoute(accountId: string, routeId: string): Promise<HandoffResult>;
  readStreamUrl(accountId: string, routeId: string): Promise<string | null>;
}

function emptyLoaded(reason: LoadedAccount["unavailableReason"], hasDeletableData: boolean): LoadedAccount {
  return {
    optIn: false,
    attestedAt: null,
    reinstallLock: false,
    routes: [],
    unavailableReason: reason,
    hasDeletableData,
  };
}

export function createPlayerRouteRepository(deps: {
  secure: PlayerRouteSecureStorage;
  marker: PlayerRouteMarkerStore;
  gate: EncodingGate;
  contract: VerifiedEncodingContract | null;
  now: () => string;
  newId: () => string;
  platform: () => string;
  open: (launchUrl: string) => Promise<boolean>;
  confirmAllowed?: () => Promise<boolean>;
}): PlayerRouteRepository {
  const { secure } = deps;

  async function registry(): Promise<string[]> {
    return readJsonIds(secure, ACCOUNT_REGISTRY_KEY);
  }

  async function writeRegistry(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.filter(isAccountId))];
    await secure.set(ACCOUNT_REGISTRY_KEY, JSON.stringify(unique));
  }

  async function rememberAccount(accountId: string): Promise<void> {
    const ids = await registry();
    if (!ids.includes(accountId)) await writeRegistry([...ids, accountId]);
  }

  async function forgetAccount(accountId: string): Promise<void> {
    const ids = await registry();
    await writeRegistry(ids.filter((id) => id !== accountId));
  }

  async function readIndex(accountId: string): Promise<
    { ok: true; index: AccountIndex } | { ok: false; reason: "missing" | "unsupported_schema" | "corrupt" | "storage_unavailable" }
  > {
    let raw: string | null;
    try {
      raw = await secure.get(indexKey(accountId));
    } catch {
      return { ok: false, reason: "storage_unavailable" };
    }
    if (!raw) return { ok: false, reason: "missing" };
    return parseIndex(raw, accountId);
  }

  async function writeIndex(index: AccountIndex): Promise<void> {
    const payload = JSON.stringify(index);
    if (payload.includes("://") || utf8ByteLength(payload) > INDEX_MAX_BYTES) {
      throw new Error("Player route storage is unavailable on this device.");
    }
    await secure.set(indexKey(index.accountId), payload);
  }

  async function blankIndex(accountId: string): Promise<AccountIndex> {
    return {
      schemaVersion: 1,
      accountId,
      optIn: false,
      attestedAt: null,
      reinstallLock: false,
      routes: [],
    };
  }

  async function hasIds(accountId: string): Promise<boolean> {
    const ids = await readJsonIds(secure, urlIdsKey(accountId));
    return ids.length > 0;
  }

  return {
    async load(accountId) {
      if (!isAccountId(accountId)) return emptyLoaded("corrupt", false);
      const parsed = await readIndex(accountId);
      const deletable = await hasIds(accountId).catch(() => false);
      if (!parsed.ok) {
        if (parsed.reason === "missing") return emptyLoaded(null, deletable);
        const reason = parsed.reason === "unsupported_schema" ? "unsupported_schema" : parsed.reason === "storage_unavailable" ? "storage_unavailable" : "corrupt";
        return emptyLoaded(reason, deletable);
      }
      return {
        optIn: parsed.index.optIn,
        attestedAt: parsed.index.attestedAt,
        reinstallLock: parsed.index.reinstallLock,
        routes: parsed.index.routes,
        unavailableReason: null,
        hasDeletableData: deletable || parsed.index.routes.length > 0,
      };
    },

    async summary(accountId) {
      const loaded = await this.load(accountId);
      return { hasDeletableData: loaded.hasDeletableData, reinstallLock: loaded.reinstallLock };
    },

    async setOptIn(accountId, optedIn, decisionAllowed) {
      if (!isAccountId(accountId)) return { ok: false, reason: "account" };
      if (optedIn && !decisionAllowed) return { ok: false, reason: "feature_unavailable" };
      const parsed = await readIndex(accountId);
      const index = parsed.ok ? parsed.index : await blankIndex(accountId);
      if (!parsed.ok && parsed.reason !== "missing") return { ok: false, reason: parsed.reason };
      if (optedIn) {
        index.optIn = true;
        index.attestedAt = deps.now();
      } else {
        index.optIn = false;
        index.routes = index.routes.map((route) => ({ ...route, userConfirmedAt: null, enabled: false }));
      }
      try {
        await writeIndex(index);
        await rememberAccount(accountId);
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
      return { ok: true };
    },

    async saveRoute(accountId, input, decisionAllowed) {
      if (!decisionAllowed) return { ok: false, reason: "feature_unavailable" };
      if (!isAccountId(accountId)) return { ok: false, reason: "account" };
      if (!isMappableFeedId(input.feedId)) return { ok: false, reason: "feed" };
      const label = validateRouteLabel(input.label);
      if (!label.ok) return { ok: false, reason: "label" };
      const validated = validateStreamUrl(input.streamUrl);
      if (!validated.ok) return { ok: false, reason: validated.reason };
      const parsed = await readIndex(accountId);
      if (!parsed.ok && parsed.reason !== "missing") return { ok: false, reason: parsed.reason };
      const index = parsed.ok ? parsed.index : await blankIndex(accountId);
      if (!index.optIn || !index.attestedAt) return { ok: false, reason: "attestation_required" };
      if (index.reinstallLock) return { ok: false, reason: "reinstall_lock" };
      const existing = index.routes.find((route) => route.feedId === input.feedId);
      const routeId = existing?.id ?? deps.newId();
      if (!ID_RE.test(routeId)) return { ok: false, reason: "storage_unavailable" };
      const next: StoredRouteMeta = {
        id: routeId,
        player: "strymtv",
        feedId: input.feedId,
        label: label.label,
        enabled: true,
        createdAt: existing?.createdAt ?? deps.now(),
        attestedAt: index.attestedAt,
        userConfirmedAt: null,
        quarantined: false,
        schemaVersion: 1,
      };
      const routes = index.routes.filter((route) => route.feedId !== input.feedId);
      if (routes.length >= 24) return { ok: false, reason: "too_many" };
      index.routes = [...routes, next];
      try {
        await secure.set(urlKey(accountId, routeId), validated.url);
        const ids = new Set(await readJsonIds(secure, urlIdsKey(accountId)));
        ids.add(routeId);
        await secure.set(urlIdsKey(accountId), JSON.stringify([...ids]));
        await writeIndex(index);
        await rememberAccount(accountId);
      } catch {
        try {
          await secure.remove(urlKey(accountId, routeId));
        } catch {
          // The saved address could not be stored with its route. Delete-all still uses the id list.
        }
        return { ok: false, reason: "storage_unavailable" };
      }
      return { ok: true, routeId };
    },

    async setRouteEnabled(accountId, routeId, enabled) {
      const parsed = await readIndex(accountId);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      const route = parsed.index.routes.find((item) => item.id === routeId);
      if (!route) return { ok: false, reason: "missing" };
      route.enabled = enabled;
      if (!enabled) route.userConfirmedAt = null;
      try {
        await writeIndex(parsed.index);
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
      return { ok: true };
    },

    async deleteRoute(accountId, routeId) {
      const parsed = await readIndex(accountId);
      if (parsed.ok) {
        parsed.index.routes = parsed.index.routes.filter((route) => route.id !== routeId);
        try {
          await writeIndex(parsed.index);
        } catch {
          return { ok: false };
        }
      }
      try {
        await secure.remove(urlKey(accountId, routeId));
        const ids = (await readJsonIds(secure, urlIdsKey(accountId))).filter((id) => id !== routeId);
        await secure.set(urlIdsKey(accountId), JSON.stringify(ids));
      } catch {
        return { ok: false };
      }
      return { ok: true };
    },

    async deleteAll(accountId) {
      return this.wipeAccount(accountId);
    },

    async wipeAccount(accountId) {
      if (!isAccountId(accountId)) return { ok: false };
      const removeIfPresent = async (key: string): Promise<boolean> => {
        try {
          await secure.remove(key);
          return true;
        } catch {
          try {
            return (await secure.get(key)) == null;
          } catch {
            return false;
          }
        }
      };
      try {
        const ids = await readJsonIds(secure, urlIdsKey(accountId));
        for (const id of ids) {
          if (!(await removeIfPresent(urlKey(accountId, id)))) return { ok: false };
        }
        if (!(await removeIfPresent(urlIdsKey(accountId)))) return { ok: false };
        if (!(await removeIfPresent(indexKey(accountId)))) return { ok: false };
        await forgetAccount(accountId);
      } catch {
        return { ok: false };
      }
      return { ok: true };
    },

    async reconcileInstall() {
      let asyncGen: string | null = null;
      let secureGen: string | null = null;
      try {
        asyncGen = await deps.marker.get();
        secureGen = await secure.get(INSTALL_MARKER_SECURE_KEY);
      } catch {
        return "same_install";
      }
      if (!asyncGen && !secureGen) {
        const id = deps.newId();
        await deps.marker.set(id);
        await secure.set(INSTALL_MARKER_SECURE_KEY, id);
        return "fresh";
      }
      if (secureGen && asyncGen === secureGen) return "same_install";
      const next = deps.newId();
      await deps.marker.set(next);
      await secure.set(INSTALL_MARKER_SECURE_KEY, next);
      const accounts = await registry();
      for (const accountId of accounts) {
        const parsed = await readIndex(accountId);
        if (!parsed.ok) continue;
        parsed.index.reinstallLock = true;
        parsed.index.routes = parsed.index.routes.map((route) => ({
          ...route,
          quarantined: true,
          userConfirmedAt: null,
          enabled: false,
        }));
        await writeIndex(parsed.index);
      }
      return "reinstall_quarantined";
    },

    async acknowledgeReinstall(accountId) {
      const parsed = await readIndex(accountId);
      if (!parsed.ok) return { ok: false };
      parsed.index.reinstallLock = false;
      parsed.index.routes = parsed.index.routes.map((route) => ({
        ...route,
        quarantined: false,
        userConfirmedAt: null,
        enabled: false,
      }));
      try {
        await writeIndex(parsed.index);
      } catch {
        return { ok: false };
      }
      return { ok: true };
    },

    async confirmRoute(accountId, routeId) {
      if (!productionHandoffPermitted(deps.gate) || !contractUsable(deps.contract)) {
        return { ok: false, reason: "encoding_gate" };
      }
      const parsed = await readIndex(accountId);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      const route = parsed.index.routes.find((item) => item.id === routeId);
      if (!route || route.quarantined || parsed.index.reinstallLock) return { ok: false, reason: "unavailable" };
      route.userConfirmedAt = deps.now();
      try {
        await writeIndex(parsed.index);
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
      return { ok: true };
    },

    async testRoute(accountId, routeId) {
      const url = await this.readStreamUrl(accountId, routeId);
      if (!url) return { outcome: "invalid_stream", handoffAccepted: false };
      return attemptStrymTvHandoff(url, {
        gate: deps.gate,
        contract: deps.contract,
        platform: deps.platform(),
        open: deps.open,
        confirmAllowed: deps.confirmAllowed,
      });
    },

    async readStreamUrl(accountId, routeId) {
      if (!isAccountId(accountId) || !ID_RE.test(routeId)) return null;
      let raw: string | null;
      try {
        raw = await secure.get(urlKey(accountId, routeId));
      } catch {
        return null;
      }
      if (!raw) return null;
      const validated = validateStreamUrl(raw);
      return validated.ok ? validated.url : null;
    },
  };
}
