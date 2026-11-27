/**
 * Locks the Games-pilot contrast fixes. These are source assertions, same
 * approach as sport-pills-layout.test.ts: the failure is a painted color,
 * and the StyleSheet values are the contract.
 *
 * Ratios are the measured pairs from the 2026-11-07 Games screenshots.
 * Normal text must stay at or above 4.5:1. This file does not change copy.
 */

import { readFileSync } from "fs";
import { join } from "path";

const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8");

const games = read("..", "index.tsx");
const picker = read("..", "..", "..", "..", "components", "DatePicker.tsx");
const card = read("..", "..", "..", "..", "components", "GameCard.tsx");
const guest = read("..", "..", "..", "..", "components", "GuestBanner.tsx");

function styleBlock(source: string, name: string): string {
  const m = source.match(new RegExp(`\\b${name}\\s*:\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
}

describe("Games pilot contrast colors", () => {
  it("selected orange controls use slate text instead of white", () => {
    expect(styleBlock(games, "sportPillTextActive")).toMatch(/color:\s*"#0f172a"/);
    expect(styleBlock(games, "tabTextActive")).toMatch(/color:\s*"#0f172a"/);
    expect(styleBlock(games, "retryText")).toMatch(/color:\s*"#0f172a"/);
    expect(styleBlock(guest, "btnText")).toMatch(/color:\s*"#0f172a"/);
    expect(styleBlock(picker, "textOnOrange")).toMatch(/color:\s*"#0f172a"/);
  });

  it("keeps the brand orange fill on those controls", () => {
    expect(styleBlock(games, "sportPillActive")).toMatch(/backgroundColor:\s*"#f97316"/);
    expect(styleBlock(games, "tabActive")).toMatch(/backgroundColor:\s*"#f97316"/);
    expect(styleBlock(games, "retryButton")).toMatch(/backgroundColor:\s*"#f97316"/);
    expect(styleBlock(guest, "btn")).toMatch(/backgroundColor:\s*"#f97316"/);
    expect(styleBlock(picker, "pillTodaySelected")).toMatch(/backgroundColor:\s*"#f97316"/);
  });

  it("lifts the date-strip text that failed 4.5:1", () => {
    expect(styleBlock(picker, "labelPast")).toMatch(/color:\s*"#94a3b8"/);
    expect(styleBlock(picker, "textPastDate")).toMatch(/color:\s*"#94a3b8"/);
    expect(styleBlock(picker, "textPastDateSelected")).toMatch(/color:\s*"#cbd5e1"/);
    expect(styleBlock(picker, "textFutureDate")).toMatch(/color:\s*"#3b82f6"/);
    expect(picker).not.toMatch(/rgba\(234,\s*88,\s*12,\s*0\.60\)/);
    expect(picker).not.toMatch(/rgba\(59,\s*130,\s*246,\s*0\.60\)/);
    expect(picker).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.67\)/);
  });

  it("lifts venue and live-status text without dropping the red live cue", () => {
    expect(styleBlock(card, "venue")).toMatch(/color:\s*"#94a3b8"/);
    expect(styleBlock(card, "statusTextLive")).toMatch(/color:\s*"#fca5a5"/);
    expect(styleBlock(card, "statusLive")).toMatch(/rgba\(239,\s*68,\s*68,\s*0\.2\)/);
  });
});
