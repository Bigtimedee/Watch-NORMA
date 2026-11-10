import { Platform, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../supabase";
import { SHIPPED_STRYMTV_CONTRACT, STRYMTV_ENCODING_GATE, productionHandoffPermitted } from "./encoding-gate";
import { type FlagDecision } from "./flags";
import { publishShippedPlayerRouteDiagnostic } from "./diagnostics";
import { createPlayerRouteControl } from "./remote-control";
import {
  handlePlayerRouteNotification,
  shouldRegisterPlayerNotificationCategory,
  syncPlayerRouteNotificationCategory,
  type PlayerRouteNotificationInput,
} from "./notification";
import { resolveOfferForBroadcast, type PlayerRouteSecondaryOffer } from "./resolve";
import { createAsyncInstallMarker, createExpoSecureStorage } from "./secure-storage";
import { createPlayerRouteRepository, type PlayerRouteRepository } from "./store";
import { isAccountId } from "./store-types";

const playerRouteControl = createPlayerRouteControl({
  fetchPayload: fetchPlayerRouteControlPayload,
  cohortId: () => null,
});

async function fetchPlayerRouteControlPayload(): Promise<unknown> {
  const { data, error } = await supabase
    .from("player_route_control")
    .select("schema_version,killed,strymtv_enabled,cohort_allowlist,ttl_seconds,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    throw new Error("Player route control is unavailable.");
  }
  return data;
}

export function refreshPlayerRouteControl(): Promise<FlagDecision> {
  return playerRouteControl.refresh();
}

export async function confirmStrymHandoffAllowed(): Promise<boolean> {
  const decision = await playerRouteControl.beforeHandoff();
  return decision.allowed && !playerRouteControl.isKilled();
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/** Foreground refresh. The interval is 60 seconds and does not run a handoff. */
export function notePlayerRouteControlForeground(): void {
  void playerRouteControl.refresh();
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void playerRouteControl.refresh();
  }, 60_000);
}

let repository: PlayerRouteRepository | null = null;

function createDeviceLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Player route storage is unavailable on this device.");
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function openExternal(url: string): Promise<boolean> {
  if (Platform.OS !== "ios") return Promise.resolve(false);
  return Linking.openURL(url).then(
    () => true,
    () => false
  );
}

export function shippedPlayerRouteRepository(): PlayerRouteRepository {
  if (!repository) {
    repository = createPlayerRouteRepository({
      secure: createExpoSecureStorage(),
      marker: createAsyncInstallMarker(),
      gate: STRYMTV_ENCODING_GATE,
      contract: SHIPPED_STRYMTV_CONTRACT,
      now: () => new Date().toISOString(),
      newId: createDeviceLocalId,
      platform: () => Platform.OS,
      open: openExternal,
      confirmAllowed: confirmStrymHandoffAllowed,
    });
  }
  return repository;
}

export function shouldShowPlayerRouteSettingsEntry(args: {
  configurationAllowed: boolean;
  hasRecords: boolean;
  reinstallLocked: boolean;
}): boolean {
  return args.configurationAllowed || args.hasRecords || args.reinstallLocked;
}

export async function wipePlayerRoutesForAccount(accountId: string | null): Promise<{ ok: boolean }> {
  if (!accountId || !isAccountId(accountId)) return { ok: true };
  return shippedPlayerRouteRepository().wipeAccount(accountId);
}

export async function loadGameBroadcast(gameId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("games").select("broadcast").eq("id", gameId).maybeSingle();
    if (error || !data) return null;
    const broadcast = (data as { broadcast?: unknown }).broadcast;
    return typeof broadcast === "string" ? broadcast : null;
  } catch {
    return null;
  }
}

export async function loadPlayerRouteSecondaryOffer(
  broadcast: string | null,
  accountId: string | null
): Promise<PlayerRouteSecondaryOffer | null> {
  const decision = await refreshPlayerRouteControl();
  const encodingGateOpen = productionHandoffPermitted(STRYMTV_ENCODING_GATE);
  if (!accountId || !decision.allowed || !encodingGateOpen) return null;
  const loaded = await shippedPlayerRouteRepository().load(accountId);
  const offer = resolveOfferForBroadcast({
    broadcast,
    platform: Platform.OS,
    flagsAllowed: decision.allowed,
    encodingGateOpen,
    optIn: loaded.optIn,
    reinstallLocked: loaded.reinstallLock,
    routes: loaded.routes,
  });
  return offer.action === "secondary" ? offer : null;
}

export async function syncShippedPlayerRouteRuntime(accountId: string): Promise<void> {
  const unregister = () => syncPlayerRouteNotificationCategory(Notifications, false);
  try {
    if (!isAccountId(accountId)) {
      await unregister();
      return;
    }
    await shippedPlayerRouteRepository().reconcileInstall();
    const decision = await refreshPlayerRouteControl();
    const loaded = await shippedPlayerRouteRepository().load(accountId);
    const confirmed = loaded.routes.filter(
      (route) => route.enabled && route.userConfirmedAt && !route.quarantined && !loaded.reinstallLock
    ).length;
    await syncPlayerRouteNotificationCategory(
      Notifications,
      shouldRegisterPlayerNotificationCategory({
        platform: Platform.OS,
        flagsAllowed: decision.allowed,
        encodingGateOpen: productionHandoffPermitted(STRYMTV_ENCODING_GATE),
        optIn: loaded.optIn,
        confirmedEnabledRouteCount: confirmed,
        reinstallLocked: loaded.reinstallLock,
      })
    );
  } catch {
    try {
      await unregister();
    } catch {
      // Category registration is best-effort. The handler still fail-closes.
    }
  }
}

export async function consumeShippedNotificationResponse(
  input: PlayerRouteNotificationInput,
  accountId: string | null
): Promise<{ handled: boolean; navigateToGameId: string | null; outcome: string }> {
  const decision = await refreshPlayerRouteControl();
  const repo = shippedPlayerRouteRepository();
  const result = await handlePlayerRouteNotification(input, {
    getAccountId: async () => accountId,
    flagsAllowed: decision.allowed,
    loadBroadcast: loadGameBroadcast,
    loadRoutes: async (id) => repo.load(id),
    readStreamUrl: (id, routeId) => repo.readStreamUrl(id, routeId),
    open: openExternal,
    confirmAllowed: confirmStrymHandoffAllowed,
    contract: SHIPPED_STRYMTV_CONTRACT,
    gate: STRYMTV_ENCODING_GATE,
    platform: Platform.OS,
  });
  publishShippedPlayerRouteDiagnostic({
    surface: "notification_action",
    result: result.outcome === "handoff_accepted" ? "handoff_accepted" : "fallback_game_detail",
    player: "strymtv",
  });
  return result;
}

export function shippedNotificationInput(response: {
  actionIdentifier?: string;
  notification?: { request?: { identifier?: string; content?: { data?: unknown } } };
}): PlayerRouteNotificationInput {
  const data = response.notification?.request?.content?.data;
  return {
    actionIdentifier: response.actionIdentifier ?? "",
    requestIdentifier: response.notification?.request?.identifier ?? "",
    data: data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
  };
}
