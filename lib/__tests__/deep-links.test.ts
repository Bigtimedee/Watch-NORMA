/**
 * Regression tests for the YouTube TV deep-link bug.
 *
 * Root cause summary:
 *   - The old code (getWatchUrl) mapped youtube_tv -> https://tv.youtube.com/live
 *   - openStreamingApp / resolveDeepLinkUrl both fell back to that URL when
 *     the native scheme was not installed AND universal_link was NULL
 *   - https://tv.youtube.com/live is a subscriber-only URL that silently
 *     redirects unauthenticated mobile browsers to a free-trial sign-up page
 *
 * Fix:
 *   - universal_link is now NULL in the DB for all TV/streaming providers
 *     whose web experience requires authentication
 *   - When universal_link is NULL and native scheme fails, the code falls
 *     through directly to the App Store — never opens a subscriber-only URL
 *   - resolveDeepLinkUrl (used by useTapToStream) follows the same chain
 */

import { Platform, Linking } from "react-native";
import {
  openStreamingApp,
  resolveDeepLinkUrl,
} from "../deep-links";
import type { StreamingProvider } from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<StreamingProvider> = {}): StreamingProvider {
  return {
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
    ...overrides,
  };
}

// Subscriber-only URLs that must NEVER be opened as a fallback.
// These are sign-up/welcome pages for unauthenticated users.
const SUBSCRIBER_ONLY_URL_PREFIXES = [
  "https://tv.youtube.com/live",
  "https://tv.youtube.com/welcome",
  "https://www.hulu.com/live-tv",
  "https://watch.sling.com",
  "https://www.fubo.tv/welcome",
  "https://stream.directv.com/watchnow",
];

function isSubscriberOnlyUrl(url: string): boolean {
  return SUBSCRIBER_ONLY_URL_PREFIXES.some((blocked) => url.startsWith(blocked));
}

// ─── Mock setup ─────────────────────────────────────────────────────────────

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
}));

const mockOpenURL = Linking.openURL as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── openStreamingApp — happy path ──────────────────────────────────────────

describe("openStreamingApp — happy path: native scheme installed", () => {
  it("opens the native app scheme when openURL succeeds on the first attempt", async () => {
    // openURL resolves cleanly → app opened
    mockOpenURL.mockResolvedValue(undefined);
    const provider = makeProvider();

    const result = await openStreamingApp(provider);

    expect(result.method).toBe("native_app");
    expect(result.opened).toBe(true);
    expect(result.fallback).toBe(false);
    expect(mockOpenURL).toHaveBeenCalledWith("youtube-tv://");
  });
});

// ─── openStreamingApp — App Store fallback (universal_link = NULL) ───────────

describe("openStreamingApp — App Store fallback when universal_link is NULL", () => {
  it("opens fallback_store_url when native scheme throws and universal_link is NULL", async () => {
    // First call (native scheme) throws — app not installed
    mockOpenURL
      .mockRejectedValueOnce(new Error("No registered handler for URL scheme"))
      .mockResolvedValueOnce(undefined); // second call (App Store) succeeds

    const provider = makeProvider({
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
    });

    const result = await openStreamingApp(provider);

    expect(result.method).toBe("app_store");
    expect(result.opened).toBe(true);

    const allOpenedUrls: string[] = mockOpenURL.mock.calls.map((c) => c[0] as string);
    const lastUrl = allOpenedUrls[allOpenedUrls.length - 1];
    expect(lastUrl).toBe("https://apps.apple.com/app/youtube-tv/id1193350206");
  });

  it(
    "should NOT open a subscriber-only web URL when native app scheme is unavailable",
    async () => {
      // This is the exact regression: youtube-tv:// throws (not installed),
      // universal_link is NULL, but the old getWatchUrl() fallback would have
      // opened https://tv.youtube.com/live (a subscriber-only page).
      // The fix: universal_link=NULL causes a skip straight to App Store.
      mockOpenURL
        .mockRejectedValueOnce(new Error("No registered handler for URL scheme"))
        .mockResolvedValueOnce(undefined);

      const provider = makeProvider({
        universal_link: null,
        fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
      });

      await openStreamingApp(provider);

      const openedUrls: string[] = mockOpenURL.mock.calls.map((c) => c[0] as string);
      openedUrls.forEach((url) => {
        expect(isSubscriberOnlyUrl(url)).toBe(false);
      });
    }
  );

  it("uses ios_app_store_url as fallback when fallback_store_url is not set", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("No registered handler"))
      .mockResolvedValueOnce(undefined);

    const provider = makeProvider({
      universal_link: null,
      fallback_store_url: undefined,
      ios_app_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
    });

    const result = await openStreamingApp(provider);

    expect(result.method).toBe("app_store");
    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/youtube-tv/id1193350206"
    );
  });

  it("returns opened=false when no store URL is configured", async () => {
    mockOpenURL.mockRejectedValue(new Error("No registered handler"));

    const provider = makeProvider({
      universal_link: null,
      fallback_store_url: undefined,
      ios_app_store_url: null,
    });

    const result = await openStreamingApp(provider);

    expect(result.opened).toBe(false);
    expect(result.method).toBe("none");
  });
});

// ─── openStreamingApp — universal_link present and valid ────────────────────

describe("openStreamingApp — universal_link present and valid", () => {
  it("opens universal_link when native scheme throws and universal_link is set", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("No registered handler"))
      .mockResolvedValueOnce(undefined);

    const provider = makeProvider({
      universal_link: "https://tv.youtube.com",
    });

    const result = await openStreamingApp(provider);

    expect(result.method).toBe("universal_link");
    expect(result.opened).toBe(true);

    const calls = mockOpenURL.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain("https://tv.youtube.com");
  });
});

// ─── openStreamingApp — no subscriber-only URLs across live-TV providers ────

describe("openStreamingApp — no subscriber-only URLs across all live-TV providers", () => {
  const livetvProviders: StreamingProvider[] = [
    makeProvider({
      key: "youtube_tv",
      ios_scheme: "youtube-tv://",
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
    }),
    makeProvider({
      key: "hulu_live",
      name: "Hulu + Live TV",
      ios_scheme: "hulu://",
      web_url: "https://www.hulu.com",
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/hulu/id376510438",
    }),
    makeProvider({
      key: "fubo",
      name: "FuboTV",
      ios_scheme: "fubo://",
      web_url: "https://www.fubo.tv",
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/fubotv/id905401994",
    }),
    makeProvider({
      key: "sling",
      name: "Sling TV",
      ios_scheme: "sling://",
      web_url: "https://watch.sling.com",
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/sling-tv/id945040516",
    }),
    makeProvider({
      key: "directv_stream",
      name: "DIRECTV STREAM",
      ios_scheme: "directv://",
      web_url: "https://stream.directv.com",
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/directv/id307386350",
    }),
  ];

  it.each(livetvProviders)(
    "provider '$key' never opens a subscriber-only URL when native scheme is unavailable",
    async (provider) => {
      jest.clearAllMocks();
      // Native scheme throws (not installed); App Store opens cleanly
      mockOpenURL
        .mockRejectedValueOnce(new Error("No registered handler"))
        .mockResolvedValueOnce(undefined);

      await openStreamingApp(provider);

      const openedUrls: string[] = mockOpenURL.mock.calls.map((c) => c[0] as string);
      openedUrls.forEach((url) => {
        expect(isSubscriberOnlyUrl(url)).toBe(false);
      });
    }
  );
});

// ─── resolveDeepLinkUrl ──────────────────────────────────────────────────────

describe("resolveDeepLinkUrl", () => {
  it("returns native scheme URL on iOS when ios_scheme is set", async () => {
    // resolveDeepLinkUrl returns ios_scheme immediately on iOS without calling
    // openURL — it does not gate on canOpenURL in the fixed version
    const provider = makeProvider();

    const result = await resolveDeepLinkUrl(provider);

    expect(result).not.toBeNull();
    expect(result!.url).toBe("youtube-tv://");
    expect(result!.method).toBe("native_app");
    // openURL should NOT have been called — this is a resolution step only
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("returns the App Store URL when ios_scheme is null and universal_link is NULL", async () => {
    const provider = makeProvider({
      ios_scheme: null,
      universal_link: null,
      fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
    });

    const result = await resolveDeepLinkUrl(provider);

    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://apps.apple.com/app/youtube-tv/id1193350206");
    expect(result!.method).toBe("app_store");
  });

  it(
    "resolved URL must NOT be a subscriber-only web URL when universal_link is NULL",
    async () => {
      // Regression: before the fix, resolveDeepLinkUrl would return
      // { url: 'https://tv.youtube.com/live', method: 'web_url' }
      // because getWatchUrl('youtube_tv', ...) was in the fallback chain.
      const provider = makeProvider({
        ios_scheme: null,
        universal_link: null,
        fallback_store_url: "https://apps.apple.com/app/youtube-tv/id1193350206",
      });

      const result = await resolveDeepLinkUrl(provider);

      if (result) {
        expect(isSubscriberOnlyUrl(result.url)).toBe(false);
      }
      // Either null (nothing available) or App Store URL — never a subscriber web URL
    }
  );

  it("returns universal_link when ios_scheme is null and universal_link is set", async () => {
    const provider = makeProvider({
      ios_scheme: null,
      universal_link: "https://tv.youtube.com",
    });

    const result = await resolveDeepLinkUrl(provider);

    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://tv.youtube.com");
    expect(result!.method).toBe("universal_link");
  });

  it("returns null when no scheme, no universal link, and no store URL", async () => {
    const provider = makeProvider({
      ios_scheme: null,
      universal_link: null,
      fallback_store_url: undefined,
      ios_app_store_url: null,
    });

    const result = await resolveDeepLinkUrl(provider);

    expect(result).toBeNull();
  });
});
