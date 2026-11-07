/**
 * Android build readiness (2026-11-07): platform-aware store fallbacks, the
 * Android deep-link chain, and config parity between app.json, the Android
 * <queries> plugin, and the web App Links / AASA files.
 */
let mockOS = "android";
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockOS;
    },
  },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));
jest.mock("../supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      insert: async () => ({}),
    }),
  },
}));

import * as fs from "fs";
import * as path from "path";
import { buildLinkCandidates } from "../deep-links";
import { appStoreUrlFor, detectInstalledApps } from "../installed-apps";
import { playStoreUrlFor, providerStoreUrl, storeName } from "../store-links";
import type { StreamingProvider } from "../types";

const root = path.join(__dirname, "..", "..");
const appJson = require("../../app.json");
const { applyQueries, normalize } = require("../../plugins/withAndroidPackageVisibility");

const P = (o: Partial<StreamingProvider> = {}): StreamingProvider =>
  ({
    key: "paramount_plus", name: "Paramount+", provider_type: "streaming", logo_url: null,
    ios_scheme: "paramountplus://", ios_app_store_url: "https://apps.apple.com/us/app/id530168168",
    android_package: "com.cbs.app", android_deep_link: "paramountplus://", web_url: "https://www.paramountplus.com",
    active: true, universal_link: null, fallback_store_url: "https://apps.apple.com/us/app/id530168168", ...o,
  }) as StreamingProvider;

afterEach(() => {
  mockOS = "android";
});

describe("store-links", () => {
  it("builds Play Store URLs only from valid package names", () => {
    expect(playStoreUrlFor("com.cbs.app")).toBe("https://play.google.com/store/apps/details?id=com.cbs.app");
    expect(playStoreUrlFor(null)).toBeNull();
    expect(playStoreUrlFor("not a package")).toBeNull();
    expect(playStoreUrlFor("single")).toBeNull();
  });
  it("Android never falls back to an Apple store link", () => {
    expect(providerStoreUrl(P(), "android")).toBe("https://play.google.com/store/apps/details?id=com.cbs.app");
    expect(providerStoreUrl(P({ android_package: null }), "android")).toBeNull();
    expect(
      providerStoreUrl(P({ android_package: null, fallback_store_url: "https://play.google.com/store/apps/details?id=x.y" }), "android")
    ).toBe("https://play.google.com/store/apps/details?id=x.y");
  });
  it("iOS keeps fallback_store_url then ios_app_store_url (unchanged)", () => {
    expect(providerStoreUrl(P({ fallback_store_url: "https://apps.apple.com/a" }), "ios")).toBe("https://apps.apple.com/a");
    expect(providerStoreUrl(P({ fallback_store_url: null }), "ios")).toBe("https://apps.apple.com/us/app/id530168168");
  });
  it("names the right store", () => {
    expect(storeName("android")).toBe("Google Play");
    expect(storeName("ios")).toBe("App Store");
  });
  it("Get <Provider> on Android opens Play, then the provider website", () => {
    expect(appStoreUrlFor(P(), "android")).toBe("https://play.google.com/store/apps/details?id=com.cbs.app");
    expect(appStoreUrlFor(P({ android_package: null }), "android")).toBe("https://www.paramountplus.com");
    expect(appStoreUrlFor(P(), "ios")).toBe("https://apps.apple.com/us/app/id530168168");
  });
});

describe("Android deep-link chain", () => {
  it("uses android_deep_link, not ios_scheme, and ends at Google Play", async () => {
    const urls = (await buildLinkCandidates(P({ ios_scheme: "ios-only://" }), null)).map((c) => c.url);
    expect(urls).toContain("paramountplus://");
    expect(urls).not.toContain("ios-only://");
    expect(urls[urls.length - 1]).toBe("https://play.google.com/store/apps/details?id=com.cbs.app");
    expect(urls.some((u) => u.includes("apps.apple.com"))).toBe(false);
  });
  it("iOS chain is unchanged: ios_scheme then App Store", async () => {
    mockOS = "ios";
    const urls = (await buildLinkCandidates(P(), null)).map((c) => c.url);
    expect(urls).toEqual(["paramountplus://", "https://apps.apple.com/us/app/id530168168"]);
  });
  it("installed-app detection stays off on Android (all unknown)", async () => {
    const can = jest.fn();
    expect(await detectInstalledApps([P()], can, "android")).toEqual({});
    expect(can).not.toHaveBeenCalled();
  });
});

describe("app.json Android config", () => {
  const android = appJson.expo.android;
  it("uses the iOS bundle id as the Android package", () => {
    expect(android.package).toBe("com.norma.app");
    expect(android.package).toBe(appJson.expo.ios.bundleIdentifier);
  });
  it("requests POST_NOTIFICATIONS and blocks Play-restricted media permissions", () => {
    expect(android.permissions).toContain("POST_NOTIFICATIONS");
    expect(android.permissions).not.toContain("READ_MEDIA_IMAGES");
    expect(android.blockedPermissions).toEqual(
      expect.arrayContaining(["android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO"])
    );
  });
  it("verifies App Links for exactly the AASA paths on both hosts", () => {
    const aasa = JSON.parse(fs.readFileSync(path.join(root, "web/public/.well-known/apple-app-site-association"), "utf8"));
    const aasaPrefixes = aasa.applinks.details[0].paths.map((p: string) => p.replace(/\*$/, "")).sort();
    const iosHosts = appJson.expo.ios.associatedDomains.map((d: string) => d.replace(/^applinks:/, "")).sort();
    const filters = android.intentFilters.filter((f: any) => f.autoVerify);
    const hosts = [...new Set(filters.flatMap((f: any) => f.data.map((d: any) => d.host)))].sort();
    expect(hosts).toEqual(iosHosts);
    for (const host of hosts) {
      const prefixes = filters
        .flatMap((f: any) => f.data)
        .filter((d: any) => d.host === host)
        .map((d: any) => d.pathPrefix)
        .sort();
      expect(prefixes).toEqual(aasaPrefixes);
    }
  });
  it("routes pushes without a channelId to game-alerts", () => {
    const notif = appJson.expo.plugins.find((p: any) => Array.isArray(p) && p[0] === "expo-notifications");
    expect(notif[1].defaultChannel).toBe("game-alerts");
    expect(fs.existsSync(path.join(root, notif[1].icon))).toBe(true);
  });
  it("Android <queries> mirror LSApplicationQueriesSchemes", () => {
    const plugin = appJson.expo.plugins.find(
      (p: any) => Array.isArray(p) && p[0] === "./plugins/withAndroidPackageVisibility"
    );
    expect(plugin[1].schemes).toEqual(appJson.expo.ios.infoPlist.LSApplicationQueriesSchemes);
  });
});

describe("withAndroidPackageVisibility", () => {
  const schemesIn = (m: any) =>
    m.manifest.queries.flatMap((q: any) => q.intent || []).flatMap((i: any) => i.data || []).map((d: any) => d.$["android:scheme"]);
  it("adds one VIEW intent per scheme plus https, idempotently", () => {
    const m: any = { manifest: { queries: [{ intent: [{ action: [{ $: { "android:name": "android.media.action.IMAGE_CAPTURE" } }] }] }] } };
    applyQueries(m, ["nflx", "nflx://", "hulu"]);
    applyQueries(m, ["nflx", "hulu"]);
    expect(schemesIn(m).sort()).toEqual(["https", "hulu", "nflx"]);
    expect(m.manifest.queries[0].intent[0].action[0].$["android:name"]).toBe("android.media.action.IMAGE_CAPTURE");
  });
  it("normalizes schemes", () => {
    expect(normalize(["a://", "a:", " b ", "", null])).toEqual(["a", "b"]);
  });
});

describe("assetlinks.json", () => {
  const links = JSON.parse(fs.readFileSync(path.join(root, "web/public/.well-known/assetlinks.json"), "utf8"));
  it("targets the Android package with the App Links relation", () => {
    expect(links[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(links[0].target.namespace).toBe("android_app");
    expect(links[0].target.package_name).toBe(appJson.expo.android.package);
  });
  it("fingerprint is either the marked TODO placeholder or a real SHA-256", () => {
    for (const fp of links[0].target.sha256_cert_fingerprints) {
      expect(fp.startsWith("TODO:") || /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp)).toBe(true);
    }
  });
});
