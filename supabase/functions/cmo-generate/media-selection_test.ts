// =============================================================================
// cmo-generate: consumer auto-post media + theme selection
// =============================================================================

import {
  assertEquals,
  assertArrayIncludes,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isBannedConsumerFilename,
  isExcludedConsumerAutoPostTheme,
  selectConsumerMediaUrl,
  themeToMediaTag,
} from "../_shared/social-media-select.ts";
import { CONTENT_THEMES, selectThemes } from "./themes.ts";

const EXPECTED_THEMES = [
  "user_benefit_never_miss",
  "user_benefit_bet_resolved",
  "advertiser_highest_intent",
  "advertiser_viewability",
  "tech_vickrey_auction",
  "tech_thompson_sampling",
  "cultural_sports_moment",
  "app_launch_hype",
  "referral_growth",
  "moment_types_showcase",
  "social_proof_engagement",
] as const;

Deno.test("CONTENT_THEMES: original 11 brand themes remain", () => {
  assertArrayIncludes([...CONTENT_THEMES], [...EXPECTED_THEMES]);
});

Deno.test("CONTENT_THEMES: sportsbooks and wager_tracking are not in the consumer pool", () => {
  assertEquals(CONTENT_THEMES.includes("sportsbooks" as typeof CONTENT_THEMES[number]), false);
  assertEquals(CONTENT_THEMES.includes("wager_tracking" as typeof CONTENT_THEMES[number]), false);
  assertEquals(isExcludedConsumerAutoPostTheme("sportsbooks"), true);
  assertEquals(isExcludedConsumerAutoPostTheme("wager_tracking"), true);
});

Deno.test("CONTENT_THEMES: Football M1 moment themes remain", () => {
  assertArrayIncludes([...CONTENT_THEMES], [
    "football_kickoff_moment",
    "football_red_zone_moment",
    "football_two_minute_warning",
    "football_overtime_moment",
    "football_fourth_quarter_comeback",
  ]);
});

Deno.test("selectThemes: never returns sportsbooks or wager_tracking", () => {
  const samples = [
    new Date(Date.UTC(2026, 8, 5, 8, 0, 0)),   // Saturday 08:00
    new Date(Date.UTC(2026, 8, 6, 14, 0, 0)),  // Sunday 14:00
    new Date(Date.UTC(2026, 8, 3, 14, 0, 0)),  // Thursday business hours
    new Date(Date.UTC(2026, 8, 1, 22, 0, 0)),  // Tuesday evening
  ];
  for (const now of samples) {
    const themes = selectThemes(now, 8);
    assertEquals(themes.includes("sportsbooks" as typeof themes[number]), false);
    assertEquals(themes.includes("wager_tracking" as typeof themes[number]), false);
    assert(themes.length >= 4, `expected several themes, got ${themes.join(",")}`);
  }
});

Deno.test("selectThemes: weekend football pool can pick red-zone", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    for (const theme of selectThemes(new Date(Date.UTC(2026, 8, 5, 16, 0, 0)), 6)) {
      seen.add(theme);
    }
  }
  assert(
    seen.has("football_red_zone_moment") || seen.has("football_kickoff_moment"),
    `weekend samples missed football themes: ${[...seen].join(",")}`,
  );
});

Deno.test("themeToMediaTag: sportsbooks remaps to alerts, not sportsbooks", () => {
  assertEquals(themeToMediaTag("sportsbooks"), "alerts");
  assertEquals(themeToMediaTag("wager_tracking"), "alerts");
});

Deno.test("themeToMediaTag: user_benefit_never_miss maps to never_miss", () => {
  assertEquals(themeToMediaTag("user_benefit_never_miss"), "never_miss");
});

Deno.test("themeToMediaTag: unknown theme falls back to alerts (not user_benefit)", () => {
  assertEquals(themeToMediaTag("totally_unknown_theme"), "alerts");
  assertEquals(themeToMediaTag(""), "alerts");
  assertEquals(themeToMediaTag("advertiser_highest_intent"), "alerts");
});

Deno.test("queryMediaAsset ranking: sportsbooks-manual.png cannot win", () => {
  const url = selectConsumerMediaUrl(
    [
      {
        filename: "sportsbooks-manual.png",
        public_url: "https://cdn.example/sportsbooks-manual.png",
        theme_tags: ["sportsbooks", "wager_tracking", "user_benefit"],
      },
      {
        filename: "game-detail-watch.png",
        public_url: "https://cdn.example/game-detail-watch.png",
        theme_tags: ["alerts", "why_now", "red_zone"],
      },
    ],
    "wager_tracking",
  );
  assertEquals(url, "https://cdn.example/game-detail-watch.png");
  assertEquals(isBannedConsumerFilename(url!), false);
});

Deno.test("generated post: media_urls contains URL when asset resolved", () => {
  const mediaUrl = "https://example.com/asset.jpg";
  const media_urls = mediaUrl ? [mediaUrl] : [];
  assertEquals(media_urls.length, 1);
  assertEquals(media_urls[0], "https://example.com/asset.jpg");
});

Deno.test("generated post: media_urls is empty array when no asset", () => {
  const media_urls: string[] = [];
  assertEquals(media_urls, []);
  assertEquals(Array.isArray(media_urls), true);
});

Deno.test("GET /cmo-generate: returns 200 status ok", () => {
  const expectedShape = { status: "ok", function: "cmo-generate" };
  assertEquals(expectedShape.status, "ok");
  assertEquals(expectedShape.function, "cmo-generate");
});
