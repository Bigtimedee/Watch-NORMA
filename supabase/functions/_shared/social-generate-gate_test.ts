// social-generate-gate_test.ts
// Thin-slate / stock-media generate harden (2026-09-16 overnight incident).

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  assessSlate,
  decideCalendarInsert,
  decideCalendarInserts,
  shouldGenerateBrandPosts,
  shouldSkipEmptySlateConsumerPosts,
  FOOTBALL_SLATE_HORIZON_HOURS,
  type CalendarInsertCandidate,
  type SlateAssessment,
} from "./social-generate-gate.ts";
import {
  isStockConsumerFilename,
  selectConsumerMediaUrl,
  STOCK_CONSUMER_FILENAMES,
} from "./social-media-select.ts";

const WED_OVERNIGHT = new Date("2026-09-16T09:00:00.000Z"); // ~4am CT
const THU_MORNING = new Date("2026-09-17T16:00:00.000Z"); // ~11am CT

const STOCK_WATCH =
  "https://cdn.example/social-images/norma-screenshots/game-detail-watch.png";
const STOCK_LIST =
  "https://cdn.example/social-images/norma-screenshots/games-list.png";
const FRESH_WHY_NOW =
  "https://cdn.example/social-images/norma-screenshots/lions-bills-why-now-20260917.png";

function brandPost(
  overrides: Partial<CalendarInsertCandidate> = {},
): CalendarInsertCandidate {
  return {
    body: "NORMA tells you when to tune in. #SportsBetting #NORMA",
    hashtags: ["SportsBetting", "NORMA"],
    content_type: "post",
    theme: "user_benefit_never_miss",
    partner_mention: null,
    mediaUrl: STOCK_WATCH,
    ...overrides,
  };
}

function thinSlate(): SlateAssessment {
  return assessSlate({ games: [], recentAlertCount: 0, now: WED_OVERNIGHT });
}

function tnfSlate(): SlateAssessment {
  return assessSlate({
    games: [
      {
        id: "espn-nfl-401772710",
        status: "scheduled",
        sport: "nfl",
        scheduled_at: "2026-09-18T00:15:00.000Z", // Thu 7:15pm CT
      },
    ],
    recentAlertCount: 0,
    now: THU_MORNING,
  });
}

Deno.test("STOCK_CONSUMER_FILENAMES includes seed game-detail and games-list", () => {
  assert(STOCK_CONSUMER_FILENAMES.has("game-detail-watch.png"));
  assert(STOCK_CONSUMER_FILENAMES.has("games-list.png"));
  assertEquals(isStockConsumerFilename(STOCK_WATCH), true);
  assertEquals(isStockConsumerFilename(STOCK_LIST), true);
  assertEquals(isStockConsumerFilename(FRESH_WHY_NOW), false);
});

Deno.test("Wednesday overnight with empty Alerts is a thin slate", () => {
  const slate = thinSlate();
  assertEquals(slate.hasStrongMoment, false);
  assertEquals(slate.liveCount, 0);
  assertEquals(slate.footballUpcomingCount, 0);
  assertEquals(slate.recentAlertCount, 0);
  assertEquals(shouldGenerateBrandPosts(slate), false);
});

Deno.test("Wednesday MLB scheduled games without alerts are still thin", () => {
  const slate = assessSlate({
    games: [
      {
        id: "espn-mlb-1",
        status: "scheduled",
        sport: "mlb",
        scheduled_at: "2026-09-16T23:00:00.000Z",
      },
    ],
    recentAlertCount: 0,
    now: WED_OVERNIGHT,
  });
  assertEquals(slate.hasStrongMoment, false);
  assertEquals(shouldGenerateBrandPosts(slate), false);
});

Deno.test("demo-* games never create a strong moment", () => {
  const slate = assessSlate({
    games: [
      {
        id: "demo-nfl-sf-lar-20260910",
        status: "inprogress",
        sport: "nfl",
        scheduled_at: WED_OVERNIGHT.toISOString(),
      },
    ],
    recentAlertCount: 0,
    now: WED_OVERNIGHT,
  });
  assertEquals(slate.hasStrongMoment, false);
});

Deno.test("live inprogress game is a strong moment", () => {
  const slate = assessSlate({
    games: [
      {
        id: "espn-nfl-401772700",
        status: "inprogress",
        sport: "nfl",
        scheduled_at: WED_OVERNIGHT.toISOString(),
      },
    ],
    recentAlertCount: 0,
    now: WED_OVERNIGHT,
  });
  assertEquals(slate.hasStrongMoment, true);
  assertEquals(slate.liveCount, 1);
  assertEquals(shouldGenerateBrandPosts(slate), true);
});

Deno.test("recent Why Now alerts are a strong moment even without live games", () => {
  const slate = assessSlate({
    games: [],
    recentAlertCount: 3,
    now: WED_OVERNIGHT,
  });
  assertEquals(slate.hasStrongMoment, true);
});

Deno.test("TNF scheduled inside the football horizon is a strong moment", () => {
  const slate = tnfSlate();
  assertEquals(slate.hasStrongMoment, true);
  assertEquals(slate.footballUpcomingCount, 1);
  assert(FOOTBALL_SLATE_HORIZON_HOURS >= 12);
});

Deno.test("TNF beyond the football horizon does not open Wednesday overnight generate", () => {
  const slate = assessSlate({
    games: [
      {
        id: "espn-nfl-401772710",
        status: "scheduled",
        sport: "nfl",
        scheduled_at: "2026-09-18T00:15:00.000Z",
      },
    ],
    recentAlertCount: 0,
    now: WED_OVERNIGHT,
  });
  assertEquals(slate.hasStrongMoment, false);
});

Deno.test("thin slate + stock game-detail does not emit draft+stock", () => {
  const decision = decideCalendarInsert(brandPost(), thinSlate());
  assertEquals(decision.action, "skip");
  assertEquals(decision.reason, "thin_slate");
});

Deno.test("thin slate + fresh media still skips Claude brand posts", () => {
  const decision = decideCalendarInsert(
    brandPost({ mediaUrl: FRESH_WHY_NOW }),
    thinSlate(),
  );
  assertEquals(decision.action, "skip");
  assertEquals(decision.reason, "thin_slate");
});

Deno.test("strong slate + stock game-detail still refuses the catalog fallback", () => {
  const decision = decideCalendarInsert(brandPost(), tnfSlate());
  assertEquals(decision.action, "skip");
  assertEquals(decision.reason, "stock_media");
});

Deno.test("strong slate + missing media skips rather than inserting an empty-media draft", () => {
  const decision = decideCalendarInsert(
    brandPost({ mediaUrl: null }),
    tnfSlate(),
  );
  assertEquals(decision.action, "skip");
  assertEquals(decision.reason, "missing_media");
});

Deno.test("strong slate + fresh Why Now media still drafts", () => {
  const decision = decideCalendarInsert(
    brandPost({
      theme: "football_red_zone_moment",
      mediaUrl: FRESH_WHY_NOW,
    }),
    tnfSlate(),
  );
  assertEquals(decision.action, "insert_draft");
  assertEquals(decision.reason, undefined);
});

Deno.test("alert_called_it with fresh media drafts even on a thin calendar day", () => {
  const decision = decideCalendarInsert(
    brandPost({
      content_type: "alert_called_it",
      theme: "alert_called_it",
      mediaUrl: FRESH_WHY_NOW,
    }),
    thinSlate(),
  );
  assertEquals(decision.action, "insert_draft");
});

Deno.test("alert_called_it with stock game-detail does not draft", () => {
  const decision = decideCalendarInsert(
    brandPost({
      content_type: "alert_called_it",
      theme: "alert_called_it",
      mediaUrl: STOCK_WATCH,
    }),
    thinSlate(),
  );
  assertEquals(decision.action, "skip");
  assertEquals(decision.reason, "stock_media");
});

Deno.test("decideCalendarInserts: Wed-like run emits zero draft+stock rows", () => {
  const { inserts, skipped } = decideCalendarInserts(
    [
      brandPost({ theme: "user_benefit_never_miss" }),
      brandPost({ theme: "cultural_sports_moment", mediaUrl: STOCK_LIST }),
      brandPost({
        content_type: "norma_in_numbers",
        theme: "norma_in_numbers",
      }),
    ],
    thinSlate(),
  );
  assertEquals(inserts.length, 0);
  assertEquals(skipped.length, 3);
  assert(skipped.every((s) => s.reason === "thin_slate"));
});

Deno.test("decideCalendarInserts: live slate with fresh media still drafts", () => {
  const live = assessSlate({
    games: [
      {
        id: "espn-ncaaf-401856660",
        status: "inprogress",
        sport: "ncaaf",
        scheduled_at: THU_MORNING.toISOString(),
      },
    ],
    recentAlertCount: 2,
    now: THU_MORNING,
  });
  const { inserts, skipped } = decideCalendarInserts(
    [
      brandPost({
        theme: "football_red_zone_moment",
        mediaUrl: FRESH_WHY_NOW,
      }),
      brandPost({ theme: "user_benefit_never_miss", mediaUrl: STOCK_WATCH }),
    ],
    live,
  );
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].theme, "football_red_zone_moment");
  assertEquals(skipped.length, 1);
  assertEquals(skipped[0].reason, "stock_media");
});

Deno.test("shouldSkipEmptySlateConsumerPosts: no games → skip app_promo", () => {
  assertEquals(shouldSkipEmptySlateConsumerPosts(0), true);
  assertEquals(shouldSkipEmptySlateConsumerPosts(3), false);
});

Deno.test("generate-social-content skips thin-slate app_promo before Claude", async () => {
  const src = await Deno.readTextFile(
    new URL("../generate-social-content/index.ts", import.meta.url),
  );
  assert(src.includes("shouldSkipEmptySlateConsumerPosts"));
  assert(src.includes("skipped_thin_slate"));
  const skipAt = src.indexOf("shouldSkipEmptySlateConsumerPosts(games.length)");
  const claudeAt = src.indexOf("await generatePostContent(");
  assert(skipAt >= 0 && claudeAt > skipAt);
});

Deno.test("selectConsumerMediaUrl: stock game-detail cannot win without allowStockFallback", () => {
  const rows = [
    {
      filename: "game-detail-watch.png",
      public_url: STOCK_WATCH,
      theme_tags: ["alerts", "why_now", "red_zone", "never_miss"],
    },
    {
      filename: "lions-bills-why-now-20260917.png",
      public_url: FRESH_WHY_NOW,
      theme_tags: ["alerts", "why_now", "red_zone"],
    },
  ];
  assertEquals(
    selectConsumerMediaUrl(rows, "football_red_zone_moment", { sport: "nfl" }),
    FRESH_WHY_NOW,
  );
});

Deno.test("selectConsumerMediaUrl: only stock assets → null (refuse fallback)", () => {
  const rows = [
    {
      filename: "game-detail-watch.png",
      public_url: STOCK_WATCH,
      theme_tags: ["alerts", "why_now", "red_zone"],
    },
    {
      filename: "games-list.png",
      public_url: STOCK_LIST,
      theme_tags: ["never_miss", "live_games"],
    },
  ];
  assertEquals(selectConsumerMediaUrl(rows, "user_benefit_never_miss"), null);
  const stockFallback = selectConsumerMediaUrl(rows, "user_benefit_never_miss", {
    allowStockFallback: true,
  });
  assertEquals(isStockConsumerFilename(stockFallback ?? ""), true);
});
