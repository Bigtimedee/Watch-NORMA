import { getBestWatchProvider, isCarriedOnYouTubeTV } from "../../deep-links";
import type { StreamingProvider } from "../../types";
import { resolveOfferForBroadcast } from "../resolve";
import {
  claimNotificationResponse,
  handlePlayerRouteNotification,
  PLAYER_ROUTE_ACTION_ID,
  PLAYER_ROUTE_ACTION_TITLE,
  resetNotificationClaimsForTests,
  shouldRegisterPlayerNotificationCategory,
  syncPlayerRouteNotificationCategory,
} from "../notification";
import { STRYMTV_ENCODING_GATE, type EncodingGate } from "../encoding-gate";
import type { StoredRouteMeta } from "../store-types";

const YTTV: StreamingProvider = {
  key: "youtube_tv",
  name: "YouTube TV",
  provider_type: "tv",
  logo_url: null,
  ios_scheme: "youtube-tv://",
  ios_app_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
  android_package: null,
  android_deep_link: null,
  web_url: "https://tv.youtube.com",
  active: true,
  universal_link: null,
  fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
  auth_mode: "deep_link_only",
  category: "tv",
};

function route(feedId: string, overrides: Partial<StoredRouteMeta> = {}): StoredRouteMeta {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    player: "strymtv",
    feedId,
    label: "Home",
    enabled: true,
    createdAt: "2026-11-09T18:00:00.000Z",
    attestedAt: "2026-11-09T18:00:00.000Z",
    userConfirmedAt: "2026-11-09T18:05:00.000Z",
    quarantined: false,
    schemaVersion: 1,
    ...overrides,
  };
}

const openGate: EncodingGate = {
  status: "open",
  verified: true,
  contractId: "not-a-device-trial",
  blockedReason: "test double",
};

describe("YouTube TV stays the default", () => {
  it("does not change provider selection when a player route exists", () => {
    expect(isCarriedOnYouTubeTV("ESPN")).toBe(true);
    expect(getBestWatchProvider("ESPN", ["youtube_tv"], [YTTV])?.key).toBe("youtube_tv");
    const offer = resolveOfferForBroadcast({
      broadcast: "ESPN",
      platform: "ios",
      flagsAllowed: true,
      encodingGateOpen: true,
      optIn: true,
      reinstallLocked: false,
      routes: [route("us.national.espn")],
    });
    expect(offer.action).toBe("secondary");
    expect(offer.youtubeTvRemainsDefault).toBe(true);
    expect(offer).not.toHaveProperty("preferOverCarriedProvider");
  });

  it("hides the optional action for exclusives, ambiguity, and the shipped gate", () => {
    const base = {
      platform: "ios",
      flagsAllowed: true,
      encodingGateOpen: true,
      optIn: true,
      reinstallLocked: false,
      routes: [route("us.national.espn")],
    };
    const reason = (result: { action: string; reason?: string }) => {
      expect(result.action).toBe("hidden");
      return result.reason;
    };
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: "Prime Video" }))).toBe("streaming_exclusive");
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: "NBC, Peacock" }))).toBe("ambiguous_broadcast");
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: null }))).toBe("unresolved_broadcast");
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: "ESPN", flagsAllowed: false }))).toBe("flag_off");
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: "ESPN", encodingGateOpen: false }))).toBe("encoding_gate");
    expect(reason(resolveOfferForBroadcast({ ...base, broadcast: "ESPN", platform: "android" }))).toBe("platform");
    expect(reason(resolveOfferForBroadcast({
      ...base,
      broadcast: "ESPN",
      routes: [route("us.national.espn", { userConfirmedAt: null })],
    }))).toBe("route_not_confirmed");
  });

  it("does not pick between two confirmed routes", () => {
    const result = resolveOfferForBroadcast({
      broadcast: "ESPN",
      platform: "ios",
      flagsAllowed: true,
      encodingGateOpen: true,
      optIn: true,
      reinstallLocked: false,
      routes: [
        route("us.national.espn"),
        route("us.national.espn", { id: "00000000-0000-4000-8000-000000000002" }),
      ],
    });
    expect(result).toMatchObject({ action: "hidden", reason: "ambiguous_routes" });
  });
});

describe("notification action", () => {
  beforeEach(() => resetNotificationClaimsForTests());

  it("registers one category-level title only when every gate is open", async () => {
    const api = {
      setNotificationCategoryAsync: jest.fn(async () => ({})),
      deleteNotificationCategoryAsync: jest.fn(async () => true),
    };
    expect(shouldRegisterPlayerNotificationCategory({
      platform: "ios",
      flagsAllowed: false,
      encodingGateOpen: false,
      optIn: false,
      confirmedEnabledRouteCount: 0,
      reinstallLocked: false,
    })).toBe(false);
    await syncPlayerRouteNotificationCategory(api, false);
    expect(api.setNotificationCategoryAsync).not.toHaveBeenCalled();
    expect(api.deleteNotificationCategoryAsync).toHaveBeenCalledWith("PLAYER_ROUTE");

    await syncPlayerRouteNotificationCategory(api, true);
    expect(api.setNotificationCategoryAsync).toHaveBeenCalledWith("PLAYER_ROUTE", [
      {
        identifier: "open_player_route",
        buttonTitle: PLAYER_ROUTE_ACTION_TITLE,
        options: { opensAppToForeground: true },
      },
    ]);
    expect(PLAYER_ROUTE_ACTION_TITLE).toBe("Open your stream in StrymTV");
  });

  it("ignores push urls, dedupes callbacks, and fail-closes the shipped gate", async () => {
    const secret = "https://evil.example/live/a.m3u8?token=nope";
    const open = jest.fn(async () => true);
    const loadBroadcast = jest.fn(async (gameId: string) => {
      expect(gameId).toBe("espn-nfl-401");
      return "ESPN";
    });
    const input = {
      actionIdentifier: PLAYER_ROUTE_ACTION_ID,
      requestIdentifier: "req-1",
      data: { gameId: "espn-nfl-401", streamUrl: secret, url: `strymtv://player/${secret}`, broadcastKey: "FOX" },
    };
    const first = await handlePlayerRouteNotification(input, {
      getAccountId: async () => "11111111-1111-4111-8111-111111111111",
      flagsAllowed: false,
      loadBroadcast,
      loadRoutes: async () => ({ optIn: true, reinstallLock: false, routes: [route("us.national.espn")] }),
      readStreamUrl: async () => secret,
      open,
      contract: null,
      gate: STRYMTV_ENCODING_GATE,
      platform: "ios",
    });
    expect(first.outcome).toBe("flag_off");
    expect(first.navigateToGameId).toBe("espn-nfl-401");
    expect(loadBroadcast).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    const openGateResult = await handlePlayerRouteNotification(
      { ...input, requestIdentifier: "req-2" },
      {
        getAccountId: async () => "11111111-1111-4111-8111-111111111111",
        flagsAllowed: true,
        loadBroadcast,
        loadRoutes: async () => ({ optIn: true, reinstallLock: false, routes: [route("us.national.espn")] }),
        readStreamUrl: async () => secret,
        open,
        contract: { id: "unit-only", embed: "percent-encoded", deviceVerified: true },
        gate: openGate,
        platform: "ios",
      }
    );
    expect(openGateResult.outcome).toBe("invalid_stream");
    expect(open).not.toHaveBeenCalled();
    expect(loadBroadcast).toHaveBeenCalledTimes(1);

    const duplicate = await handlePlayerRouteNotification(
      { ...input, requestIdentifier: "req-2" },
      {
        getAccountId: async () => "11111111-1111-4111-8111-111111111111",
        flagsAllowed: true,
        loadBroadcast,
        loadRoutes: async () => ({ optIn: true, reinstallLock: false, routes: [] }),
        readStreamUrl: async () => null,
        open,
        contract: null,
        gate: STRYMTV_ENCODING_GATE,
        platform: "ios",
      }
    );
    expect(duplicate.outcome).toBe("duplicate");
    expect(duplicate.navigateToGameId).toBeNull();
    expect(claimNotificationResponse("req-2:open_player_route")).toBe(false);
  });

  it("does not treat a body tap as the player action", async () => {
    const result = await handlePlayerRouteNotification(
      {
        actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
        requestIdentifier: "req-body",
        data: { gameId: "espn-nfl-401", streamUrl: "https://evil.example/a.m3u8" },
      },
      {
        getAccountId: async () => null,
        flagsAllowed: true,
        loadBroadcast: async () => "ESPN",
        loadRoutes: async () => ({ optIn: true, reinstallLock: false, routes: [] }),
        readStreamUrl: async () => null,
        open: async () => true,
        contract: null,
        gate: openGate,
        platform: "ios",
      }
    );
    expect(result.handled).toBe(false);
  });
});
