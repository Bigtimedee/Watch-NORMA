/**
 * Phase 1 game-level deep links: resolution order, derived ESPN/MLB links,
 * Prime affiliate tagging (only when configured), and link_level logging.
 */
import { Linking } from "react-native";
import type { StreamingProvider } from "../types";

const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn((table: string) => {
  if (table === "game_watch_links") {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: mockMaybeSingle,
    };
    return q;
  }
  return { insert: mockInsert };
});

jest.mock("../supabase", () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
    },
  },
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { openURL: jest.fn() },
}));

import {
  openStreamingApp,
  resolveDeepLinkUrl,
  deriveGameLink,
  buildLinkCandidates,
  toWatchGameContext,
  __clearStoredGameLinkCache,
} from "../deep-links";

const mockOpenURL = Linking.openURL as jest.Mock;

function provider(o: Partial<StreamingProvider> = {}): StreamingProvider {
  return {
    key: "espn_plus",
    name: "ESPN",
    provider_type: "streaming" as any,
    logo_url: null,
    ios_scheme: "sportscenter://",
    ios_app_store_url: "https://apps.apple.com/app/espn/id317469184",
    android_package: null,
    android_deep_link: null,
    web_url: null,
    active: true,
    universal_link: null,
    fallback_store_url: null,
    affiliate_tag: null,
    app_universal_link: null,
    ...o,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  __clearStoredGameLinkCache();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("deriveGameLink", () => {
  it.each([
    ["nfl", "https://www.espn.com/nfl/game/_/gameId/401872995"],
    ["ncaaf", "https://www.espn.com/college-football/game/_/gameId/401872995"],
    ["nba", "https://www.espn.com/nba/game/_/gameId/401872995"],
    ["ncaam", "https://www.espn.com/mens-college-basketball/game/_/gameId/401872995"],
    ["mlb", "https://www.espn.com/mlb/game/_/gameId/401872995"],
  ])("ESPN-family %s game → espn.com game URL", (sport, url) => {
    expect(deriveGameLink({ key: "espn_plus" }, { espnEventId: "401872995", sport: sport as any })).toBe(url);
  });

  it("returns null without an espn id or for non-numeric ids", () => {
    expect(deriveGameLink({ key: "espn_plus" }, { sport: "nfl" })).toBeNull();
    expect(deriveGameLink({ key: "espn_plus" }, { espnEventId: "abc/../x", sport: "nfl" })).toBeNull();
  });

  it("MLB.TV uses gamePk only when available", () => {
    expect(deriveGameLink({ key: "mlb_tv" }, { mlbGamePk: 776543, sport: "mlb" })).toBe("https://www.mlb.com/tv/g776543");
    expect(deriveGameLink({ key: "mlb_tv" }, { espnEventId: "1", sport: "mlb" })).toBeNull();
  });

  it("non-derivable providers return null", () => {
    expect(deriveGameLink({ key: "peacock" }, { espnEventId: "1", sport: "nfl" })).toBeNull();
  });

  it("toWatchGameContext maps a Game row", () => {
    expect(toWatchGameContext({ espn_id: "9", sport: "nfl" })).toEqual({ espnEventId: "9", sport: "nfl", mlbGamePk: null });
    expect(toWatchGameContext(null)).toBeNull();
  });

  it("toWatchGameContext parses the ESPN id from prod-style game ids", () => {
    expect(toWatchGameContext({ id: "espn-nfl-401872995", espn_id: null, sport: "nfl" })?.espnEventId).toBe("401872995");
    expect(toWatchGameContext({ id: "sdio-123", espn_id: null, sport: "nfl" })?.espnEventId).toBeNull();
  });
});

describe("resolution order", () => {
  const game = { espnEventId: "401872995", sport: "nfl" as const };

  it("stored game link beats derived, app UL, scheme, store", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { url: "https://www.espn.com/watch/x" }, error: null });
    const c = await buildLinkCandidates(provider({ app_universal_link: "https://www.espn.com/" }), game);
    expect(c.map((x) => x.level)).toEqual(["stored_game", "derived_game", "app_universal", "scheme", "app_store"]);
  });

  it("without a stored link, the derived ESPN game URL is first", async () => {
    const r = await resolveDeepLinkUrl(provider(), game);
    expect(r).toEqual({ url: "https://www.espn.com/nfl/game/_/gameId/401872995", method: "game_link", level: "derived_game" });
  });

  it("no game context keeps legacy order (scheme first)", async () => {
    const r = await resolveDeepLinkUrl(provider());
    expect(r?.level).toBe("scheme");
    expect(r?.url).toBe("sportscenter://");
  });

  it("app universal link precedes scheme when no game link", async () => {
    const r = await resolveDeepLinkUrl(provider({ key: "netflix", app_universal_link: "https://www.netflix.com/browse" }), game);
    expect(r?.level).toBe("app_universal");
  });

  it("ignores non-https stored links", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { url: "javascript:alert(1)" }, error: null });
    const r = await resolveDeepLinkUrl(provider(), game);
    expect(r?.level).toBe("derived_game");
  });

  it("a failing lookup never blocks resolution", async () => {
    mockMaybeSingle.mockRejectedValue(new Error("offline"));
    const r = await resolveDeepLinkUrl(provider(), game);
    expect(r?.level).toBe("derived_game");
  });
});

describe("Prime affiliate tag", () => {
  const prime = (tag: string | null) =>
    provider({ key: "prime_video", ios_scheme: "aiv://", affiliate_tag: tag });

  it("adds ?tag= to a stored Prime game link when configured", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { url: "https://app.primevideo.com/detail/0FGHAFOD3S5T3D6O1Z6TD6NFF3" }, error: null });
    const r = await resolveDeepLinkUrl(prime("norma-20"), { espnEventId: "401872995", sport: "nfl" });
    expect(r?.url).toBe("https://app.primevideo.com/detail/0FGHAFOD3S5T3D6O1Z6TD6NFF3?tag=norma-20");
  });

  it("does not invent a tag when none is configured", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { url: "https://app.primevideo.com/detail/0FGHAFOD3S5T3D6O1Z6TD6NFF3" }, error: null });
    const r = await resolveDeepLinkUrl(prime(null), { espnEventId: "401872995", sport: "nfl" });
    expect(r?.url).toBe("https://app.primevideo.com/detail/0FGHAFOD3S5T3D6O1Z6TD6NFF3");
  });

  it("never tags the custom scheme", async () => {
    const r = await resolveDeepLinkUrl(prime("norma-20"));
    expect(r?.url).toBe("aiv://");
  });
});

describe("openStreamingApp logs link_level", () => {
  it("logs derived_game on an ESPN game tap", async () => {
    mockOpenURL.mockResolvedValue(true);
    const res = await openStreamingApp(provider(), { espnEventId: "401872995", sport: "nfl" });
    expect(res).toMatchObject({ opened: true, level: "derived_game", fallback: false });
    expect(mockOpenURL).toHaveBeenCalledWith("https://www.espn.com/nfl/game/_/gameId/401872995");
    await flush();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ link_level: "derived_game", method: "universal_link", success: true, user_id: "u1", url_scheme: "https://www.espn.com" })
    );
  });

  it("falls through to scheme and logs it with fallback_triggered", async () => {
    mockOpenURL.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(true);
    const res = await openStreamingApp(provider(), { espnEventId: "401872995", sport: "nfl" });
    expect(res.level).toBe("scheme");
    await flush();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link_level: "scheme", method: "native_scheme", fallback_triggered: true }));
  });

  it("logs none when everything fails", async () => {
    mockOpenURL.mockRejectedValue(new Error("x"));
    const res = await openStreamingApp(provider({ ios_app_store_url: null }));
    expect(res).toMatchObject({ opened: false, level: "none" });
    await flush();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link_level: "none", method: "no_fallback", success: false }));
  });

  it("still accepts a legacy game-title string", async () => {
    mockOpenURL.mockResolvedValue(true);
    const res = await openStreamingApp(provider(), "Seahawks at Broncos");
    expect(res.level).toBe("scheme");
  });
});
