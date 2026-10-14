/**
 * Netflix provider: catalog row (migration) + deep-link chain + CTA selection.
 */
import * as fs from "fs";
import * as path from "path";
import { Linking } from "react-native";
import {
  openStreamingApp,
  resolveDeepLinkUrl,
  getBestWatchProvider,
  getBroadcastProviderKeys,
} from "../deep-links";
import type { StreamingProvider } from "../types";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));
const mockOpenURL = Linking.openURL as jest.Mock;

const STORE = "https://apps.apple.com/app/netflix/id363590051";
const NETFLIX = {
  key: "netflix", name: "Netflix", provider_type: "streaming", logo_url: null,
  ios_scheme: "nflx://", ios_app_store_url: STORE,
  android_package: "com.netflix.mediaclient", android_deep_link: null,
  web_url: "https://www.netflix.com", active: true,
  universal_link: "https://www.netflix.com/", fallback_store_url: STORE,
  auth_mode: "deep_link_only", category: "streaming", affiliate_tag: null,
} as unknown as StreamingProvider;
const YTTV = { ...NETFLIX, key: "youtube_tv", name: "YouTube TV", ios_scheme: "youtube-tv://" } as StreamingProvider;

beforeEach(() => jest.clearAllMocks());

describe("Netflix deep link chain", () => {
  it("opens the Netflix app via nflx:// when installed", async () => {
    mockOpenURL.mockResolvedValue(undefined);
    const r = await openStreamingApp(NETFLIX);
    expect(r).toEqual({ opened: true, fallback: false, method: "native_app" });
    expect(mockOpenURL).toHaveBeenCalledWith("nflx://");
  });
  it("falls back to the netflix.com universal link when the app is missing", async () => {
    mockOpenURL.mockRejectedValueOnce(new Error("no handler")).mockResolvedValueOnce(undefined);
    const r = await openStreamingApp(NETFLIX);
    expect(r.method).toBe("universal_link");
    expect(mockOpenURL).toHaveBeenLastCalledWith("https://www.netflix.com/");
  });
  it("falls back to the App Store (id363590051) last", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("no handler"))
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(undefined);
    const r = await openStreamingApp(NETFLIX);
    expect(r.method).toBe("app_store");
    expect(mockOpenURL).toHaveBeenLastCalledWith(STORE);
  });
  it("resolveDeepLinkUrl prefers the native scheme", async () => {
    expect(await resolveDeepLinkUrl(NETFLIX)).toEqual({ url: "nflx://", method: "native_app" });
  });
});

describe("Watch on Netflix CTA selection", () => {
  it("Netflix broadcast maps to netflix only", () => {
    expect(getBroadcastProviderKeys("Netflix")).toEqual(["netflix"]);
  });
  it("connected Netflix user gets Netflix", () => {
    expect(getBestWatchProvider("Netflix", ["youtube_tv", "netflix"], [YTTV, NETFLIX])?.name).toBe("Netflix");
  });
  it("YouTube TV-only user does not get a YouTube TV CTA for Netflix games", () => {
    expect(getBestWatchProvider("Netflix", ["youtube_tv"], [YTTV, NETFLIX])).toBeNull();
  });
});

describe("Netflix config", () => {
  const root = path.resolve(__dirname, "../..");
  it("app.json queries the nflx scheme", () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
    expect(app.expo.ios.infoPlist.LSApplicationQueriesSchemes).toContain("nflx");
  });
  it("migration seeds an active streaming netflix row", () => {
    const dir = path.join(root, "supabase/migrations");
    const f = fs.readdirSync(dir).find((n) => n.includes("add_netflix_provider"));
    expect(f).toBeDefined();
    const sql = fs.readFileSync(path.join(dir, f!), "utf8");
    for (const s of ["'netflix'", "'nflx://'", "id363590051", "'https://www.netflix.com/'", "'streaming'"]) {
      expect(sql).toContain(s);
    }
  });
});
