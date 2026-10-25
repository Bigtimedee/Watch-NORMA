jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));
jest.mock("../supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }), insert: async () => ({}) }),
  },
}));
import { Linking } from "react-native";
import { getBroadcastProviderKeys, isCarriedOnYouTubeTV, buildLinkCandidates, openStreamingApp } from "../deep-links";
import { resolveWatchChoice, detectInstalledApps } from "../installed-apps";
import type { StreamingProvider } from "../types";

const P = (key: string, ios_scheme: string, extra: Partial<StreamingProvider> = {}): StreamingProvider =>
  ({ key, name: key, provider_type: "tv", logo_url: null, ios_scheme, ios_app_store_url: `https://apps.apple.com/${key}`,
     android_package: null, android_deep_link: null, web_url: null, active: true, universal_link: null,
     fallback_store_url: `https://apps.apple.com/${key}`, auth_mode: "deep_link_only", category: "tv", ...extra } as StreamingProvider);
const yttv = P("youtube_tv", "youtube-tv://");
const all = [P("paramount_plus", "paramountplus://"), P("cbs_sports", "cbssports://"), P("fox_sports", "foxsports://"),
  P("espn_plus", "sportscenter://"), P("peacock", "peacocktv://"), P("nfl_network", "nfl://"), P("prime_video", "aiv://"), yttv];
const connected = all.map((p) => p.key);

describe("YouTube TV is the default when it carries the network", () => {
  it.each(["CBS", "FOX", "NBC", "ABC", "ESPN", "ESPN2", "FS1", "NFL Network", "NFLN", "NFL Net", "CBSSN", "ESPNU", "ABC/ESPN", "ESPN/ESPN+"])(
    "%s -> youtube_tv first", (b) => {
      expect(isCarriedOnYouTubeTV(b)).toBe(true);
      expect(getBroadcastProviderKeys(b)[0]).toBe("youtube_tv");
      expect(resolveWatchChoice(b, connected, all, {})).toEqual({ mode: "watch", provider: yttv });
    });
  it.each(["Prime Video", "Peacock", "Netflix", "ESPN+", "Bally Sports Detroit"])("%s -> not YouTube TV", (b) => {
    expect(isCarriedOnYouTubeTV(b)).toBe(false);
    expect(getBroadcastProviderKeys(b)).not.toContain("youtube_tv");
  });
  it("falls back to network app when user has no YouTube TV", () => {
    const choice = resolveWatchChoice("CBS", connected.filter((k) => k !== "youtube_tv"), all, {});
    expect(choice?.provider.key).toBe("paramount_plus");
  });
  it("a false probe for YouTube TV is treated as unknown, not 'not installed'", async () => {
    const m = await detectInstalledApps(all, async () => false, "ios");
    expect(m.youtube_tv).toBeUndefined();
    expect(m.paramount_plus).toBe(false);
    expect(resolveWatchChoice("CBS", connected, all, m)).toEqual({ mode: "watch", provider: yttv });
  });
});

describe("YouTube TV deep link", () => {
  it("tries youtubetv:// first, then tv.youtube.com, then App Store", async () => {
    const urls = (await buildLinkCandidates(yttv, null)).map((c) => c.url);
    expect(urls[0]).toBe("youtubetv://");
    expect(urls.indexOf("https://tv.youtube.com/")).toBeGreaterThan(0);
    expect(urls.indexOf("https://tv.youtube.com/")).toBeLessThan(urls.indexOf("https://apps.apple.com/youtube_tv"));
  });
  it("falls back to tv.youtube.com when the app scheme fails", async () => {
    (Linking.openURL as jest.Mock).mockReset()
      .mockRejectedValueOnce(new Error("no handler"))
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValue(undefined);
    const r = await openStreamingApp(yttv);
    expect(r.opened).toBe(true);
    expect((Linking.openURL as jest.Mock).mock.calls.map((c) => c[0])).toEqual(["youtubetv://", "youtube-tv://", "https://tv.youtube.com/"]);
  });
});
