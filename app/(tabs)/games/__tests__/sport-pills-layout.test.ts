/**
 * Regression test for the collapsed sport-pill row (build 26, 2026-08-20).
 *
 * The pill row is a horizontal ScrollView inside a column layout. React Native
 * lets such a ScrollView stretch into leftover vertical space and then squeezes
 * it when a sibling claims that space. With the games list empty the pills
 * rendered oversized; the moment the list filled — which only became possible
 * once the Hermes date bug was fixed — the row collapsed and clipped every
 * label, so the pills appeared as blank rectangles.
 *
 * Two properties prevent it, and both are asserted here against the source:
 *   1. the ScrollView must not flex (flexGrow: 0, flexShrink: 0)
 *   2. the pill must carry an explicit height, so the row's content height is
 *      unambiguous — the arrangement components/DatePicker.tsx already uses.
 *
 * These are source assertions rather than render assertions on purpose: the
 * failure is a native flexbox outcome that jsdom does not reproduce, so a
 * react-test-renderer tree would pass while the device still clipped the text.
 */

import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "index.tsx"), "utf8");

const styleBlock = (name: string): string => {
  const m = source.match(new RegExp(`\\b${name}\\s*:\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
};

describe("sport pill row layout", () => {
  it("the pill ScrollView is pinned to its content height", () => {
    // Must pass a style (not only contentContainerStyle) that disables flexing.
    expect(source).toMatch(/<ScrollView[\s\S]{0,220}?style=\{s\.sportScroll\}/);

    const scroll = styleBlock("sportScroll");
    expect(scroll).toMatch(/flexGrow:\s*0/);
    expect(scroll).toMatch(/flexShrink:\s*0/);
  });

  it("the pill has an explicit height so its labels cannot be clipped", () => {
    const pill = styleBlock("sportPill");
    expect(pill).toMatch(/height:\s*\d+/);
  });

  it("every pill still has a non-empty label to render", () => {
    const labels = [...source.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(
      expect.arrayContaining(["All Sports", "NCAA", "NBA", "MLB", "NCAAF", "NFL"])
    );
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
  });

  it("pill label text keeps an explicit color in both states", () => {
    // A missing colour would also render as a blank pill, for a different reason.
    expect(styleBlock("sportPillTextActive")).toMatch(/color:\s*"#/);
    expect(styleBlock("sportPillTextInactive")).toMatch(/color:\s*"#/);
  });

  it("football is prioritized when currentMonth is Aug-Feb (H-12)", () => {
    // Source assertion: the seasonal branch must place NFL/NCAAF first for football months.
    expect(source).toMatch(/isFootballSeason[\s\S]{0,200}?\["nfl",\s*"ncaaf"/);
  });

  it("MLB is prioritized when currentMonth is Mar-Oct (H-12)", () => {
    expect(source).toMatch(/isMlbSeason[\s\S]{0,200}?\["mlb"/);
  });
});
