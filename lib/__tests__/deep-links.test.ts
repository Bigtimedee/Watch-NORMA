/**
 * Regression tests for lib/deep-links.ts
 *
 * Critical invariant: resolveDeepLinkUrl is used by useTapToStream to
 * pre-select a SINGLE URL that is opened with no fallback chain. It MUST
 * return the App Store URL when the native app is not installed, otherwise
 * users who don't have the app are left with a silent failure and no recovery.
 *
 * Regression: commit ccc9de5 removed the canOpenURL gate and returned
 * ios_scheme unconditionally, making the App Store fallback unreachable.
 * This test would have caught that regression immediately.
 */

import { Platform, Linking } from "react-native";
import { resolveDeepLinkUrl, openStreamingApp } from "../deep-links";
import type { StreamingProvider } from "../types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const youTubeTv: StreamingProvider = {
  key: "youtube_tv",
  name: "YouTube TV",
  provider_type: "tv",
  ios_scheme: "youtube-tv://",
  ios_app_store_url:
    "https://apps.apple.com/app/youtube-tv/id1193350206",
  fallback_store_url:
    "https://apps.apple.com/app/youtube-tv/id1193350206",
  android_package: "com.google.android.apps.youtube.unplugged",
  android_deep_link: null,
  web_url: "https://tv.youtube.com",
  universal_link: null, // cleared by migration 036
  category: "tv",
};

const espnPlus: StreamingProvider = {
  key: "espn_plus",
  name: "ESPN+",
  provider_type: "streaming",
  ios_scheme: "sportscenter://",
  ios_app_store_url:
    "https://apps.apple.com/app/espn-live-sports-scores/id317469184",
  fallback_store_url: null,
  android_package: "com.espn.score_center",
  android_deep_link: null,
  web_url: "https://plus.espn.com",
  universal_link: null,
  category: "streaming",
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
}));

const mockCanOpenURL = Linking.canOpenURL as jest.MockedFunction<
  typeof Linking.canOpenURL
>;
const mockOpenURL = Linking.openURL as jest.MockedFunction<
  typeof Linking.openURL
>;

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as unknown as { OS: string }).OS = "ios";
});

// ---------------------------------------------------------------------------
// resolveDeepLinkUrl — the core regression case
// ---------------------------------------------------------------------------

describe("resolveDeepLinkUrl", () => {
  describe("iOS — YouTube TV (tv provider)", () => {
    it("returns ios_scheme when YouTube TV app is installed", async () => {
      mockCanOpenURL.mockResolvedValue(true);

      const result = await resolveDeepLinkUrl(youTubeTv);

      expect(result).toEqual({ url: "youtube-tv://", method: "native_app" });
      expect(mockCanOpenURL).toHaveBeenCalledWith("youtube-tv://");
    });

    it("returns App Store URL when YouTube TV app is NOT installed", async () => {
      // REGRESSION TEST: commit ccc9de5 removed canOpenURL gating, making this
      // path unreachable. useTapToStream would then call Linking.openURL with
      // 'youtube-tv://', which silently does nothing on iOS when the app is
      // absent (no throw, no App Store redirect — just a dead end).
      mockCanOpenURL.mockResolvedValue(false);

      const result = await resolveDeepLinkUrl(youTubeTv);

      expect(result).not.toBeNull();
      expect(result!.method).toBe("app_store");
      expect(result!.url).toBe(
        "https://apps.apple.com/app/youtube-tv/id1193350206"
      );
    });

    it("falls through to App Store when canOpenURL throws (first-install edge case)", async () => {
      mockCanOpenURL.mockRejectedValue(new Error("canOpenURL failed"));

      const result = await resolveDeepLinkUrl(youTubeTv);

      expect(result).not.toBeNull();
      expect(result!.method).toBe("app_store");
    });

    it("ios_scheme is never returned when app is not installed — App Store fallback is reachable", async () => {
      // Specifically verify that the ios_scheme is NOT returned when the app
      // is absent. If this assertion fails, the silent-fail regression is back.
      mockCanOpenURL.mockResolvedValue(false);

      const result = await resolveDeepLinkUrl(youTubeTv);

      expect(result?.url).not.toBe("youtube-tv://");
    });
  });

  describe("iOS — streaming provider (ESPN+)", () => {
    it("returns ios_scheme when ESPN+ app is installed", async () => {
      mockCanOpenURL.mockResolvedValue(true);

      const result = await resolveDeepLinkUrl(espnPlus);

      expect(result).toEqual({ url: "sportscenter://", method: "native_app" });
    });

    it("falls through to web_url when ESPN+ app is not installed", async () => {
      mockCanOpenURL.mockResolvedValue(false);

      const result = await resolveDeepLinkUrl(espnPlus);

      // Streaming providers (not TV) fall through to web URL at Step 2
      expect(result?.method).toMatch(/universal_link|web_url/);
    });
  });

  describe("iOS — returns null when nothing is available", () => {
    it("returns null when no scheme, no web url, no store url", async () => {
      const bare: StreamingProvider = {
        key: "bare",
        name: "Bare",
        provider_type: "streaming",
        ios_scheme: null,
        ios_app_store_url: null,
        fallback_store_url: null,
        android_package: null,
        android_deep_link: null,
        web_url: null,
        universal_link: null,
      };

      const result = await resolveDeepLinkUrl(bare);
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// openStreamingApp — verify TV provider skips web fallback
// ---------------------------------------------------------------------------

describe("openStreamingApp", () => {
  it("opens YouTube TV native app when installed", async () => {
    mockOpenURL.mockResolvedValue(undefined);

    const result = await openStreamingApp(youTubeTv);

    expect(result).toEqual({ opened: true, fallback: false, method: "native_app" });
    expect(mockOpenURL).toHaveBeenCalledWith("youtube-tv://");
  });

  it("falls through to App Store for TV provider when native app throws", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("Cannot open URL")) // scheme fails
      .mockResolvedValueOnce(undefined); // App Store succeeds

    const result = await openStreamingApp(youTubeTv);

    expect(result).toEqual({ opened: true, fallback: true, method: "app_store" });
    expect(mockOpenURL).toHaveBeenCalledTimes(2);
    expect(mockOpenURL).toHaveBeenLastCalledWith(
      "https://apps.apple.com/app/youtube-tv/id1193350206"
    );
  });

  it("does NOT attempt web fallback for TV providers", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("Cannot open URL")) // scheme fails
      .mockResolvedValueOnce(undefined);

    await openStreamingApp(youTubeTv);

    // Only two calls: scheme + App Store. Never the web URL (tv.youtube.com).
    expect(mockOpenURL).toHaveBeenCalledTimes(2);
    const calls = mockOpenURL.mock.calls.map(([url]) => url);
    expect(calls.every((url) => !url.includes("tv.youtube.com"))).toBe(true);
  });
});
