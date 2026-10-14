/**
 * Streaming-exclusive broadcasts must not fall back to live TV bundles.
 * Regression: SEA@DEN TNF (espn-nfl-401872995, Prime Video) showed
 * "Watch on YouTube TV" on Game Detail (Design QA 2026-10-14).
 */
import {
  getBestWatchProvider,
  getBroadcastProviderKeys,
  isStreamingExclusiveBroadcast,
} from "../deep-links";
import type { StreamingProvider } from "../types";

const p = (key: string, name: string): StreamingProvider =>
  ({
    key, name, provider_type: "streaming", logo_url: null, ios_scheme: null,
    ios_app_store_url: null, android_package: null, android_deep_link: null,
    web_url: `https://${key}.example`, active: true, universal_link: null,
    fallback_store_url: null, auth_mode: "deep_link_only", category: "streaming",
  }) as unknown as StreamingProvider;

const ALL = [
  p("youtube_tv", "YouTube TV"), p("prime_video", "Prime Video"),
  p("peacock", "Peacock"), p("espn_plus", "ESPN+"), p("netflix", "Netflix"),
  p("hulu_live", "Hulu + Live TV"), p("fox_sports", "FOX Sports"),
];
const LIVE_TV = ["youtube_tv", "hulu_live", "fubo", "sling", "directv_stream"];

describe.each(["Prime Video", "Amazon Prime Video", "Prime", "TNF"])(
  "Prime Video exclusive (%s)",
  (b) => {
    it("is streaming-exclusive and maps only to prime_video", () => {
      expect(isStreamingExclusiveBroadcast(b)).toBe(true);
      const keys = getBroadcastProviderKeys(b);
      expect(keys).toContain("prime_video");
      for (const k of LIVE_TV) expect(keys).not.toContain(k);
    });
    it("never picks YouTube TV even when it is the user's only connection", () => {
      expect(getBestWatchProvider(b, ["youtube_tv"], ALL)).toBeNull();
    });
    it("picks Prime Video when connected alongside YouTube TV", () => {
      expect(getBestWatchProvider(b, ["youtube_tv", "prime_video"], ALL)?.key).toBe("prime_video");
    });
  },
);

it.each([
  ["Peacock", "peacock"],
  ["Netflix", "netflix"],
  ["ESPN+", "espn_plus"],
])("%s exclusive maps to %s without live TV", (b, key) => {
  expect(isStreamingExclusiveBroadcast(b)).toBe(true);
  const keys = getBroadcastProviderKeys(b);
  expect(keys[0]).toBe(key);
  for (const k of LIVE_TV) expect(keys).not.toContain(k);
});

it.each(["ESPN", "FOX", "NBC", "CBS", "ESPN/ABC", "NBC/Peacock", "ESPN, ESPN+"])(
  "linear broadcast %s still allows live TV bundles",
  (b) => {
    expect(isStreamingExclusiveBroadcast(b)).toBe(false);
    expect(getBroadcastProviderKeys(b)).toContain("youtube_tv");
  },
);

it("null broadcast is not exclusive", () => {
  expect(isStreamingExclusiveBroadcast(null)).toBe(false);
});
