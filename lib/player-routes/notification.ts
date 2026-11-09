/**
 * Notification action for a customer player route.
 *
 * Checked against expo-notifications 0.32.16 in this repo:
 * - `setNotificationCategoryAsync` registers actions for a category id.
 *   The button title lives on `NotificationAction.buttonTitle`. It is not a
 *   per-notification field, so the title cannot change with the channel.
 * - The category id must not contain `:` or `-` (expo setNotificationCategoryAsync).
 * - A notification shows those actions only when its content `categoryIdentifier`
 *   matches. Remote Expo pushes use `categoryId`. This app does not set it.
 * - `opensAppToForeground: true` is explicit. Expo's default is true; if it
 *   were false, a killed app would not deliver the response.
 * - `getLastNotificationResponseAsync` is how a cold start reads the tap that
 *   launched the app. Device delivery is still unverified.
 *
 * Push data may contain a game id only. URL-like fields are ignored. The
 * broadcast is loaded from the game row, not from the push.
 */

import { STRYMTV_ENCODING_GATE, productionHandoffPermitted, type EncodingGate, type VerifiedEncodingContract } from "./encoding-gate";
import { attemptStrymTvHandoff } from "./handoff";
import { resolveOfferForBroadcast } from "./resolve";
import type { StoredRouteMeta } from "./store-types";

export const PLAYER_ROUTE_CATEGORY_ID = "PLAYER_ROUTE";
export const PLAYER_ROUTE_ACTION_ID = "open_player_route";
export const PLAYER_ROUTE_ACTION_TITLE = "Open your stream in StrymTV";
export const EXPO_DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";

export const IGNORED_PUSH_KEYS = [
  "url",
  "streamUrl",
  "stream_url",
  "launchUrl",
  "launch_url",
  "href",
  "playerUrl",
  "routeUrl",
  "broadcastKey",
  "broadcast_key",
  "feedId",
  "feed_id",
] as const;

const GAME_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;

const claimed = new Set<string>();

export function resetNotificationClaimsForTests(): void {
  claimed.clear();
}

export function claimNotificationResponse(id: string): boolean {
  if (!id || claimed.has(id)) return false;
  claimed.add(id);
  if (claimed.size > 50) {
    const oldest = claimed.values().next().value;
    if (oldest) claimed.delete(oldest);
  }
  return true;
}

export interface NotificationCategoryApi {
  setNotificationCategoryAsync?: (
    identifier: string,
    actions: {
      identifier: string;
      buttonTitle: string;
      options?: { opensAppToForeground?: boolean };
    }[]
  ) => Promise<unknown>;
  deleteNotificationCategoryAsync?: (identifier: string) => Promise<unknown>;
}

export function shouldRegisterPlayerNotificationCategory(input: {
  platform: string;
  flagsAllowed: boolean;
  encodingGateOpen: boolean;
  optIn: boolean;
  confirmedEnabledRouteCount: number;
  reinstallLocked: boolean;
}): boolean {
  return (
    input.platform === "ios" &&
    input.flagsAllowed &&
    input.encodingGateOpen &&
    input.optIn &&
    input.confirmedEnabledRouteCount > 0 &&
    !input.reinstallLocked
  );
}

export async function syncPlayerRouteNotificationCategory(
  api: NotificationCategoryApi,
  shouldRegister: boolean
): Promise<{ registered: boolean; reason: "unregistered" | "registered" | "api_missing" }> {
  if (!shouldRegister) {
    if (typeof api.deleteNotificationCategoryAsync !== "function") {
      return { registered: false, reason: "api_missing" };
    }
    try {
      await api.deleteNotificationCategoryAsync(PLAYER_ROUTE_CATEGORY_ID);
    } catch {
      return { registered: false, reason: "unregistered" };
    }
    return { registered: false, reason: "unregistered" };
  }
  if (typeof api.setNotificationCategoryAsync !== "function") {
    return { registered: false, reason: "api_missing" };
  }
  await api.setNotificationCategoryAsync(PLAYER_ROUTE_CATEGORY_ID, [
    {
      identifier: PLAYER_ROUTE_ACTION_ID,
      buttonTitle: PLAYER_ROUTE_ACTION_TITLE,
      options: { opensAppToForeground: true },
    },
  ]);
  return { registered: true, reason: "registered" };
}

export interface PlayerRouteNotificationInput {
  actionIdentifier: string;
  requestIdentifier: string;
  data: Record<string, unknown>;
}

export function gameIdFromNotificationData(data: Record<string, unknown>): string | null {
  const value = data.gameId;
  if (typeof value !== "string" || !GAME_ID_RE.test(value)) return null;
  return value;
}

export type NotificationClassification =
  | { kind: "ignore" }
  | { kind: "duplicate" }
  | { kind: "missing_request_id"; gameId: string | null }
  | { kind: "player_action"; gameId: string | null };

export function classifyPlayerRouteResponse(
  input: PlayerRouteNotificationInput,
  claim: (id: string) => boolean = claimNotificationResponse
): NotificationClassification {
  if (input.actionIdentifier !== PLAYER_ROUTE_ACTION_ID) return { kind: "ignore" };
  const gameId = gameIdFromNotificationData(input.data);
  if (!input.requestIdentifier) return { kind: "missing_request_id", gameId };
  if (!claim(`${input.requestIdentifier}:${input.actionIdentifier}`)) return { kind: "duplicate" };
  return { kind: "player_action", gameId };
}

export interface HandlePlayerRouteDeps {
  getAccountId: () => Promise<string | null>;
  flagsAllowed: boolean;
  loadBroadcast: (gameId: string) => Promise<string | null>;
  loadRoutes: (accountId: string) => Promise<{
    optIn: boolean;
    reinstallLock: boolean;
    routes: readonly StoredRouteMeta[];
  }>;
  readStreamUrl: (accountId: string, routeId: string) => Promise<string | null>;
  open: (launchUrl: string) => Promise<boolean>;
  contract: VerifiedEncodingContract | null;
  gate: EncodingGate;
  platform: string;
}

export async function handlePlayerRouteNotification(
  input: PlayerRouteNotificationInput,
  deps: HandlePlayerRouteDeps
): Promise<{ handled: boolean; navigateToGameId: string | null; outcome: string }> {
  const classified = classifyPlayerRouteResponse(input);
  if (classified.kind === "ignore") return { handled: false, navigateToGameId: null, outcome: "not_player_action" };
  if (classified.kind === "duplicate") return { handled: true, navigateToGameId: null, outcome: "duplicate" };
  const gameId = classified.gameId;
  if (!gameId) return { handled: true, navigateToGameId: null, outcome: "invalid_game" };

  const fallback = { handled: true, navigateToGameId: gameId, outcome: "fallback_game_detail" as const };
  if (!deps.flagsAllowed) return { ...fallback, outcome: "flag_off" };
  if (deps.platform !== "ios") return { ...fallback, outcome: "platform" };
  if (!productionHandoffPermitted(deps.gate)) {
    return { ...fallback, outcome: "blocked_unverified_encoding" };
  }
  const accountId = await deps.getAccountId();
  if (!accountId) return fallback;
  const account = await deps.loadRoutes(accountId);
  const broadcast = await deps.loadBroadcast(gameId);
  const offer = resolveOfferForBroadcast({
    broadcast,
    platform: deps.platform,
    flagsAllowed: deps.flagsAllowed,
    encodingGateOpen: productionHandoffPermitted(deps.gate),
    optIn: account.optIn,
    reinstallLocked: account.reinstallLock,
    routes: account.routes,
  });
  if (offer.action !== "secondary") return { ...fallback, outcome: offer.reason };
  const streamUrl = await deps.readStreamUrl(accountId, offer.routeId);
  if (!streamUrl) return fallback;
  const handoff = await attemptStrymTvHandoff(streamUrl, {
    gate: deps.gate,
    contract: deps.contract,
    platform: deps.platform,
    open: deps.open,
  });
  if (handoff.handoffAccepted) {
    return { handled: true, navigateToGameId: null, outcome: "handoff_accepted" };
  }
  return { ...fallback, outcome: handoff.outcome };
}

export function shippedNotificationGate(): EncodingGate {
  return STRYMTV_ENCODING_GATE;
}
