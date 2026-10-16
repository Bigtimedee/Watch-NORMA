import {
  appStoreUrlFor,
  detectInstalledApps,
  resolveWatchChoice,
  schemeUrlFor,
  suggestInstalledProviders,
} from "../installed-apps";
import type { StreamingProvider } from "../types";
const appJson = require("../../app.json");

const P = (key: string, name: string, ios_scheme: string | null, extra: Partial<StreamingProvider> = {}) =>
  ({
    key, name, provider_type: "streaming", logo_url: null, ios_scheme,
    ios_app_store_url: `https://apps.apple.com/app/${key}`, android_package: null,
    android_deep_link: null, web_url: `https://${key}.com`, active: true, ...extra,
  }) as StreamingProvider;

const PRIME = P("prime_video", "Prime Video", "aiv://");
const YTTV = P("youtube_tv", "YouTube TV", "youtube-tv://", { provider_type: "tv" });
const HULU = P("hulu_live", "Hulu + Live TV", "hulu://", { provider_type: "tv" });
const ESPN = P("espn_plus", "ESPN+", "sportscenter://");
const ESPNF = P("espn_fantasy", "ESPN Fantasy", "sportscenter://");
const ALL = [PRIME, YTTV, HULU, ESPN, ESPNF];

describe("schemeUrlFor", () => {
  it("normalises bare schemes and nulls", () => {
    expect(schemeUrlFor({ ios_scheme: "nflx" })).toBe("nflx://");
    expect(schemeUrlFor({ ios_scheme: "nflx://" })).toBe("nflx://");
    expect(schemeUrlFor({ ios_scheme: null })).toBeNull();
  });
});

describe("detectInstalledApps", () => {
  it("returns {} on android and web without probing", async () => {
    const can = jest.fn();
    expect(await detectInstalledApps(ALL, can, "android")).toEqual({});
    expect(await detectInstalledApps(ALL, can, "web")).toEqual({});
    expect(can).not.toHaveBeenCalled();
  });

  it("probes each scheme once on iOS and maps by provider key", async () => {
    const can = jest.fn(async (u: string) => u === "aiv://" || u === "sportscenter://");
    const map = await detectInstalledApps(ALL, can, "ios");
    expect(map).toEqual({ prime_video: true, youtube_tv: false, hulu_live: false, espn_plus: true, espn_fantasy: true });
    expect(can).toHaveBeenCalledTimes(4);
  });

  it("treats a throwing probe as unknown (omitted)", async () => {
    const can = jest.fn(async (u: string) => { if (u === "hulu://") throw new Error("not whitelisted"); return true; });
    const map = await detectInstalledApps([HULU, PRIME], can, "ios");
    expect(map).toEqual({ prime_video: true });
  });
});

describe("resolveWatchChoice", () => {
  it("watch: connected + installed", () => {
    expect(resolveWatchChoice("Prime Video", ["prime_video"], ALL, { prime_video: true }))
      .toEqual({ mode: "watch", provider: PRIME });
  });
  it("watch: unknown install state (android/web) behaves as before", () => {
    expect(resolveWatchChoice("Prime Video", ["prime_video"], ALL, {}))
      .toEqual({ mode: "watch", provider: PRIME });
  });
  it("falls back to the next connected AND installed provider", () => {
    expect(resolveWatchChoice("FOX", ["youtube_tv", "hulu_live"], ALL, { youtube_tv: false, hulu_live: true }))
      .toEqual({ mode: "watch", provider: HULU });
  });
  it("get: only connected provider isn't installed", () => {
    expect(resolveWatchChoice("Prime Video", ["prime_video"], ALL, { prime_video: false }))
      .toEqual({ mode: "get", provider: PRIME });
  });
  it("null when nothing connected", () => {
    expect(resolveWatchChoice("Prime Video", [], ALL, { prime_video: true })).toBeNull();
  });
});

describe("suggestInstalledProviders", () => {
  it("lists installed providers not yet toggled on", () => {
    const s = suggestInstalledProviders(ALL, ["prime_video"], { prime_video: true, espn_plus: true, hulu_live: false });
    expect(s.map((p) => p.key)).toEqual(["espn_plus"]);
  });
});

it("appStoreUrlFor prefers ios_app_store_url", () => {
  expect(appStoreUrlFor(PRIME)).toBe("https://apps.apple.com/app/prime_video");
  expect(appStoreUrlFor(P("x", "X", null, { ios_app_store_url: null, fallback_store_url: "f" }))).toBe("f");
});

describe("app.json LSApplicationQueriesSchemes", () => {
  const schemes: string[] = appJson.expo.ios.infoPlist.LSApplicationQueriesSchemes;
  // Snapshot of prod streaming_providers.ios_scheme (2026-10-15)
  const PROD = ["videos","betmgm","caesarssportsbook","cbssports","dazn","directvstream","draftkings",
    "sportscenter","fanduel","foxsports","fubo","hulu","hbomax","mlbatbat","nba","nflx","nfl","nhl",
    "paramountplus","peacocktv","aiv","prizepicks","sleeper","slingtv","spectrumtv","tbs","tntdrama",
    "trutv","underdog","xfinitystream","yahoosports","youtube","youtube-tv"];
  it("whitelists every prod provider scheme", () => {
    for (const s of PROD) expect(schemes).toContain(s);
  });
  it("stays under the iOS ~50 scheme cap and has no duplicates", () => {
    expect(schemes.length).toBeLessThanOrEqual(50);
    expect(new Set(schemes).size).toBe(schemes.length);
  });
});
