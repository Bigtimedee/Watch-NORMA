/**
 * Regression tests for provider selection logic (getBestWatchProvider /
 * getBroadcastProviderKeys) as it relates to the YouTube TV deep-link bug.
 *
 * Part of the fix required that YouTube TV has provider_type='tv' in the DB.
 * These tests verify that getBestWatchProvider correctly identifies YouTube TV
 * as an option for any broadcast, that it requires the user to have it
 * connected, and that the provider object carries the correct ios_scheme.
 */

import {
  getBestWatchProvider,
  getBroadcastProviderKeys,
} from "../deep-links";
import type { StreamingProvider } from "../types";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const YOUTUBE_TV_PROVIDER: StreamingProvider = {
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

const ESPN_PLUS_PROVIDER: StreamingProvider = {
  key: "espn_plus",
  name: "ESPN+",
  provider_type: "streaming",
  logo_url: null,
  ios_scheme: "sportscenter://",
  ios_app_store_url: "https://apps.apple.com/app/espn/id317469184",
  android_package: null,
  android_deep_link: null,
  web_url: "https://plus.espn.com",
  active: true,
  universal_link: null,
  fallback_store_url: "https://apps.apple.com/app/espn/id317469184",
  auth_mode: "deep_link_only",
  category: "streaming",
};

const PEACOCK_PROVIDER: StreamingProvider = {
  key: "peacock",
  name: "Peacock",
  provider_type: "streaming",
  logo_url: null,
  ios_scheme: "peacocktv://",
  ios_app_store_url: "https://apps.apple.com/app/peacock-tv/id1508186374",
  android_package: null,
  android_deep_link: null,
  web_url: "https://www.peacocktv.com",
  active: true,
  universal_link: null,
  fallback_store_url: "https://apps.apple.com/app/peacock-tv/id1508186374",
  auth_mode: "deep_link_only",
  category: "streaming",
};

const ALL_PROVIDERS: StreamingProvider[] = [
  YOUTUBE_TV_PROVIDER,
  ESPN_PLUS_PROVIDER,
  PEACOCK_PROVIDER,
];

// ─── getBroadcastProviderKeys ────────────────────────────────────────────────

describe("getBroadcastProviderKeys", () => {
  it("includes youtube_tv for any broadcast (live TV provider)", () => {
    expect(getBroadcastProviderKeys("ESPN")).toContain("youtube_tv");
    expect(getBroadcastProviderKeys("CBS")).toContain("youtube_tv");
    expect(getBroadcastProviderKeys("NBC")).toContain("youtube_tv");
    expect(getBroadcastProviderKeys("TNT")).toContain("youtube_tv");
  });

  it("also includes espn_plus for ESPN broadcasts", () => {
    const keys = getBroadcastProviderKeys("ESPN");
    expect(keys).toContain("espn_plus");
  });

  it("returns empty array for null broadcast", () => {
    expect(getBroadcastProviderKeys(null)).toEqual([]);
  });
});

// ─── getBestWatchProvider — YouTube TV selected when connected ───────────────

describe("getBestWatchProvider — YouTube TV selected when connected", () => {
  it("returns YouTube TV provider when user has youtube_tv connected and broadcast is ESPN", () => {
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("youtube_tv");
  });

  it("returns YouTube TV provider when user has youtube_tv connected and broadcast is CBS", () => {
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("CBS", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("youtube_tv");
  });

  it("returns YouTube TV provider when user has youtube_tv connected and broadcast is NBC (Peacock)", () => {
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("NBC", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("youtube_tv");
  });
});

describe("getBestWatchProvider — YouTube TV NOT returned when not connected", () => {
  it("does not return YouTube TV when user has no connections", () => {
    const result = getBestWatchProvider("ESPN", [], ALL_PROVIDERS);
    expect(result).toBeNull();
  });

  it("does not return YouTube TV when user only has espn_plus connected", () => {
    // espn_plus comes before youtube_tv in the broadcast key list for ESPN,
    // so we get espn_plus — but even if we only check: youtube_tv is not returned
    const connectedKeys = ["espn_plus"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    if (result !== null) {
      expect(result.key).not.toBe("youtube_tv");
    }
  });

  it("returns null when user has connections but none match the broadcast", () => {
    // User has peacock, broadcast is on a channel peacock doesn't serve directly
    // (and peacock is only returned for NBC/Peacock broadcasts)
    const connectedKeys = ["peacock"];
    // Use a broadcast that only resolves to channels the user doesn't have
    // "TBS" maps to tbs + max, but user only has peacock
    const result = getBestWatchProvider("TBS", ["peacock"], ALL_PROVIDERS);

    expect(result).toBeNull();
  });
});

describe("getBestWatchProvider — returned YouTube TV provider has correct scheme", () => {
  it("selected YouTube TV provider has ios_scheme = 'youtube-tv://'", () => {
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.ios_scheme).toBe("youtube-tv://");
  });

  it("selected YouTube TV provider has provider_type = 'tv' (not 'streaming')", () => {
    // Regression: seed.sql previously had provider_type='streaming'.
    // The provider object in allProviders must reflect the corrected type='tv'.
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.provider_type).toBe("tv");
  });

  it("selected YouTube TV provider has universal_link = null (not a subscriber-only web URL)", () => {
    // Regression: the old provider row had universal_link = 'https://tv.youtube.com/live'
    // The fix sets universal_link to NULL, forcing the App Store fallback path.
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.universal_link ?? null).toBeNull();
  });

  it("selected YouTube TV provider has fallback_store_url pointing to the App Store", () => {
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.fallback_store_url).toMatch(
      /apps\.apple\.com\/app\/youtube-tv/
    );
  });
});

describe("getBestWatchProvider — priority ordering", () => {
  it("prefers a more specific streaming provider over a live-TV bundle when both are connected", () => {
    // For an ESPN broadcast, espn_plus appears before youtube_tv in the key list.
    // If user has both, espn_plus should win.
    const connectedKeys = ["espn_plus", "youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("espn_plus");
  });

  it("falls through to youtube_tv when the specific provider is not connected", () => {
    // espn_plus is in the list for ESPN, but user only has youtube_tv
    const connectedKeys = ["youtube_tv"];
    const result = getBestWatchProvider("ESPN", connectedKeys, ALL_PROVIDERS);

    expect(result).not.toBeNull();
    expect(result!.key).toBe("youtube_tv");
  });
});
