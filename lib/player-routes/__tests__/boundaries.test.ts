import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import appJson from "../../../app.json";
import { PLAYER_ROUTE_SECURE_OPTIONS } from "../secure-storage";
import * as SecureStore from "expo-secure-store";
import { sanitizePlayerRouteDiagnostic, PLAYER_ROUTE_DIAGNOSTIC_SINK_STATUS, createDiagnosticPublisher, publishShippedPlayerRouteDiagnostic } from "../diagnostics";
import { handoffFailureCopy } from "../copy";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js)$/.test(name)) out.push(path);
  }
  return out;
}

describe("player route boundaries", () => {
  it("does not import the encoding harness from app or component code", () => {
    const roots = [join(__dirname, "../../../app"), join(__dirname, "../../../components")];
    const offenders = roots.flatMap((root) => walk(root)).filter((file) =>
      readFileSync(file, "utf8").includes("encoding-harness")
    );
    expect(offenders).toEqual([]);
  });

  it("does not log or send diagnostics from the player-route modules", () => {
    const files = walk(join(__dirname, "..")).filter((file) => !file.includes("__tests__"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/console\./);
      if (!file.endsWith("runtime.ts")) {
        expect(source).not.toMatch(/from ["'].*analytics["']/);
        expect(source).not.toMatch(/deep_link_events/);
      }
    }
    expect(readFileSync(join(__dirname, "../diagnostics.ts"), "utf8")).not.toMatch(/supabase/);
    expect(PLAYER_ROUTE_DIAGNOSTIC_SINK_STATUS).toBe("not_wired_pending_privacy_review");
    const sink = jest.fn();
    publishShippedPlayerRouteDiagnostic({ surface: "game_detail", result: "flag_off", player: "strymtv" });
    expect(sink).not.toHaveBeenCalled();
    const publisher = createDiagnosticPublisher(sink);
    publisher({ surface: "game_detail", result: "flag_off", player: "strymtv", url: "https://cdn.example.com/a.m3u8" });
    expect(sink).not.toHaveBeenCalled();
    publisher({ surface: "game_detail", result: "flag_off", player: "strymtv" });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sanitizePlayerRouteDiagnostic({
      surface: "game_detail",
      result: "flag_off",
      player: "strymtv",
      url: "https://cdn.example.com/a.m3u8",
    })).toBeNull();
  });

  it("stores with this-device-only accessibility and does not query strymtv", () => {
    expect(PLAYER_ROUTE_SECURE_OPTIONS).toEqual({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    const schemes: string[] = appJson.expo.ios.infoPlist.LSApplicationQueriesSchemes;
    expect(schemes).toHaveLength(35);
    expect(schemes).not.toContain("strymtv");
    const plugin = appJson.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === "./plugins/withAndroidPackageVisibility"
    ) as [string, { schemes: string[] }] | undefined;
    expect(plugin?.[1].schemes).not.toContain("strymtv");
  });

  it("failure copy does not claim the app is missing or that playback started", () => {
    const copy = handoffFailureCopy("YouTube TV");
    expect(copy.title).toBe("StrymTV could not be opened");
    expect(copy.body).not.toMatch(/installed/i);
    expect(copy.body).not.toMatch(/now playing/i);
    expect(copy.body).toContain("Watch on YouTube TV");
    expect(copy.showAppStore).toBe(true);
  });
});
