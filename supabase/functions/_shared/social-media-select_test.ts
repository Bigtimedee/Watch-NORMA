// social-media-select_test.ts
// Consumer auto-post media denylist + theme remapping.

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  CONSUMER_AUTO_POST_BANNED_FILENAMES,
  CONSUMER_AUTO_POST_FALLBACK_FILENAME,
  isBannedConsumerFilename,
  isExcludedConsumerAutoPostTheme,
  pickConsumerScreenshotFilename,
  selectConsumerMediaUrl,
  themeToMediaTag,
  preferredTagsForTheme,
} from "./social-media-select.ts";

const BANNED = [
  "sportsbooks-manual.png",
  "sportsbooks-email.png",
  "tv-providers.png",
  "prediction-markets.png",
  "streaming-services.png",
];

Deno.test("denylist includes every settings / Tier-C screenshot", () => {
  for (const name of BANNED) {
    assert(CONSUMER_AUTO_POST_BANNED_FILENAMES.has(name), `missing ${name}`);
    assertEquals(isBannedConsumerFilename(name), true);
  }
});

Deno.test("isBannedConsumerFilename matches storage URLs", () => {
  const url =
    "https://example.supabase.co/storage/v1/object/public/social-images/norma-screenshots/sportsbooks-manual.png";
  assertEquals(isBannedConsumerFilename(url), true);
});

Deno.test("sportsbooks / wager_tracking themes are excluded from consumer pool", () => {
  assertEquals(isExcludedConsumerAutoPostTheme("sportsbooks"), true);
  assertEquals(isExcludedConsumerAutoPostTheme("wager_tracking"), true);
  assertEquals(isExcludedConsumerAutoPostTheme("football_red_zone_moment"), false);
  assertEquals(isExcludedConsumerAutoPostTheme("user_benefit_never_miss"), false);
});

Deno.test("themeToMediaTag: sportsbooks/wager_tracking never map to sportsbooks", () => {
  assertEquals(themeToMediaTag("sportsbooks"), "alerts");
  assertEquals(themeToMediaTag("wager_tracking"), "alerts");
  assertEquals(themeToMediaTag("sportsbooks", { sport: "ncaaf" }), "red_zone");
  assertEquals(themeToMediaTag("wager_tracking", { sport: "nfl" }), "red_zone");
});

Deno.test("themeToMediaTag: football themes prefer red_zone / alerts", () => {
  assertEquals(themeToMediaTag("football_red_zone_moment"), "red_zone");
  assertEquals(themeToMediaTag("football_kickoff_moment"), "red_zone");
  assertEquals(themeToMediaTag("football_two_minute_warning"), "red_zone");
  assertEquals(themeToMediaTag("alert_called_it"), "why_now");
  assertEquals(themeToMediaTag("user_benefit_never_miss"), "never_miss");
});

Deno.test("themeToMediaTag: unknown / advertiser themes do not fall back to user_benefit", () => {
  // user_benefit is attached to settings chrome in media_assets
  assertEquals(themeToMediaTag("advertiser_highest_intent"), "alerts");
  assertEquals(themeToMediaTag("totally_unknown_theme"), "alerts");
  assertEquals(themeToMediaTag(""), "alerts");
  assertEquals(themeToMediaTag("streaming"), "never_miss");
  assertEquals(themeToMediaTag("prediction_markets"), "never_miss");
});

Deno.test("pickConsumerScreenshotFilename: app_promo never returns sportsbooks-manual.png", () => {
  for (let i = 0; i < 6; i++) {
    const filename = pickConsumerScreenshotFilename("app_promo", i);
    assertEquals(isBannedConsumerFilename(filename), false);
    assert(filename !== "sportsbooks-manual.png");
  }
});

Deno.test("pickConsumerScreenshotFilename: app_promo slide 0 is an alert/watch asset", () => {
  assertEquals(pickConsumerScreenshotFilename("app_promo", 0), "game-detail-watch.png");
});

Deno.test("pickConsumerScreenshotFilename: every consumer post type stays off settings chrome", () => {
  for (const postType of ["game_preview", "norma_knew", "recap", "app_promo", "unknown"]) {
    for (let i = 0; i < 3; i++) {
      const filename = pickConsumerScreenshotFilename(postType, i, { sport: "ncaaf" });
      assertEquals(
        isBannedConsumerFilename(filename),
        false,
        `${postType} slide ${i} picked banned ${filename}`,
      );
    }
  }
});

Deno.test("pickConsumerScreenshotFilename: football prefers alert/watch over games-list", () => {
  assertEquals(
    pickConsumerScreenshotFilename("game_preview", 0, { sport: "nfl" }),
    "game-detail-watch.png",
  );
  assertEquals(
    pickConsumerScreenshotFilename("app_promo", 0, { sport: "ncaaf" }),
    "game-detail-watch.png",
  );
});

Deno.test("selectConsumerMediaUrl: hard-excludes sportsbooks-manual even when tagged user_benefit", () => {
  const rows = [
    {
      filename: "sportsbooks-manual.png",
      public_url: "https://cdn.example/sportsbooks-manual.png",
      theme_tags: ["sportsbooks", "wager_tracking", "user_benefit"],
    },
    {
      filename: "sportsbooks-email.png",
      public_url: "https://cdn.example/sportsbooks-email.png",
      theme_tags: ["sportsbooks", "wager_tracking", "user_benefit"],
    },
    {
      filename: "tv-providers.png",
      public_url: "https://cdn.example/tv-providers.png",
      theme_tags: ["streaming", "user_benefit"],
    },
    {
      filename: "game-detail-watch.png",
      public_url: "https://cdn.example/game-detail-watch.png",
      theme_tags: ["alerts", "why_now", "red_zone", "never_miss"],
    },
  ];

  const url = selectConsumerMediaUrl(rows, "sportsbooks");
  assertEquals(url, "https://cdn.example/game-detail-watch.png");
});

Deno.test("selectConsumerMediaUrl: football theme prefers red_zone asset when present", () => {
  const rows = [
    {
      filename: "games-list.png",
      public_url: "https://cdn.example/games-list.png",
      theme_tags: ["never_miss", "live_games", "user_benefit"],
    },
    {
      filename: "game-detail-watch.png",
      public_url: "https://cdn.example/game-detail-watch.png",
      theme_tags: ["alerts", "why_now", "red_zone", "never_miss"],
    },
    {
      filename: "sportsbooks-manual.png",
      public_url: "https://cdn.example/sportsbooks-manual.png",
      theme_tags: ["sportsbooks", "red_zone"],
    },
  ];

  const url = selectConsumerMediaUrl(rows, "football_red_zone_moment", { sport: "ncaaf" });
  assertEquals(url, "https://cdn.example/game-detail-watch.png");
});

Deno.test("selectConsumerMediaUrl: returns null when only banned assets exist", () => {
  const rows = [
    {
      filename: "sportsbooks-manual.png",
      public_url: "https://cdn.example/sportsbooks-manual.png",
      theme_tags: ["user_benefit"],
    },
  ];
  assertEquals(selectConsumerMediaUrl(rows, "user_benefit_never_miss"), null);
});

Deno.test("preferredTagsForTheme: football leads with red_zone", () => {
  const tags = preferredTagsForTheme("football_red_zone_moment", { sport: "nfl" });
  assertEquals(tags[0], "red_zone");
  assert(tags.includes("why_now"));
  assert(tags.includes("alerts"));
});

Deno.test("fallback filename is the watch/alert screenshot, not settings chrome", () => {
  assertEquals(CONSUMER_AUTO_POST_FALLBACK_FILENAME, "game-detail-watch.png");
  assertEquals(isBannedConsumerFilename(CONSUMER_AUTO_POST_FALLBACK_FILENAME), false);
});
