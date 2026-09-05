// social-content-engine_test.ts
// Deno test suite for Phase 5 M1 football-awareness changes.
//
// Tests cover:
//   1. resolveSubreddit — sport-conditional routing
//   2. buildSystemPrompt — sport label in output
//   3. getDailyPostCount — day-of-week cadence weighting
//   4. GameData.sport field type check (compile-time via assignment)

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  resolveSubreddit,
  buildSystemPrompt,
  getDailyPostCount,
  selectScreenshotUrl,
  SPORT_SUBREDDITS,
  DEFAULT_SUBREDDIT,
  type GameData,
} from "./social-content-engine.ts";
import { isBannedConsumerFilename } from "./social-media-select.ts";

// ---------------------------------------------------------------------------
// 1. resolveSubreddit
// ---------------------------------------------------------------------------

Deno.test("resolveSubreddit: ncaaf → r/CFB", () => {
  assertEquals(resolveSubreddit("ncaaf", "game_preview"), "CFB");
});

Deno.test("resolveSubreddit: nfl → r/sportsbook (self-promo ban)", () => {
  assertEquals(resolveSubreddit("nfl", "game_preview"), "sportsbook");
});

Deno.test("resolveSubreddit: ncaam → r/CollegeBasketball", () => {
  assertEquals(resolveSubreddit("ncaam", "game_preview"), "CollegeBasketball");
});

Deno.test("resolveSubreddit: nba → r/sportsbook", () => {
  assertEquals(resolveSubreddit("nba", "game_preview"), "sportsbook");
});

Deno.test("resolveSubreddit: mlb → r/sportsbook", () => {
  assertEquals(resolveSubreddit("mlb", "recap"), "sportsbook");
});

Deno.test("resolveSubreddit: unknown sport falls back to post_type map", () => {
  // ncaam via post_type map
  assertEquals(resolveSubreddit(null, "game_preview"), "CollegeBasketball");
});

Deno.test("resolveSubreddit: null sport + unknown post_type → DEFAULT_SUBREDDIT", () => {
  assertEquals(resolveSubreddit(null, "unknown_type"), DEFAULT_SUBREDDIT);
});

Deno.test("resolveSubreddit: undefined sport + app_promo → sportsbetting", () => {
  assertEquals(resolveSubreddit(undefined, "app_promo"), "sportsbetting");
});

// ---------------------------------------------------------------------------
// 2. buildSystemPrompt — sport-conditional labels
// ---------------------------------------------------------------------------

Deno.test("buildSystemPrompt: ncaaf sport → 'NCAA Football' in output", () => {
  const prompt = buildSystemPrompt("x", "standard", [], "ncaaf");
  assertStringIncludes(prompt, "NCAA Football");
});

Deno.test("buildSystemPrompt: nfl sport → 'NFL Football' in output", () => {
  const prompt = buildSystemPrompt("x", "standard", [], "nfl");
  assertStringIncludes(prompt, "NFL Football");
});

Deno.test("buildSystemPrompt: nba sport → 'NBA Basketball' in output", () => {
  const prompt = buildSystemPrompt("x", "standard", [], "nba");
  assertStringIncludes(prompt, "NBA Basketball");
});

Deno.test("buildSystemPrompt: mlb sport → 'MLB Baseball' in output", () => {
  const prompt = buildSystemPrompt("x", "standard", [], "mlb");
  assertStringIncludes(prompt, "MLB Baseball");
});

Deno.test("buildSystemPrompt: ncaam sport → 'NCAA Basketball' in output", () => {
  const prompt = buildSystemPrompt("x", "standard", [], "ncaam");
  assertStringIncludes(prompt, "NCAA Basketball");
});

Deno.test("buildSystemPrompt: no sport → system prompt still mentions NCAA football and NFL", () => {
  const prompt = buildSystemPrompt("x", "standard", [], null);
  // The system prompt header always lists all sports now
  assertStringIncludes(prompt, "NCAA football, NFL");
});

Deno.test("buildSystemPrompt: ncaaf includes football vocabulary", () => {
  const prompt = buildSystemPrompt("reddit", "standard", [], "ncaaf");
  assertStringIncludes(prompt, "backdoor cover");
  assertStringIncludes(prompt, "red-zone stand");
  assertStringIncludes(prompt, "covers the spread");
});

Deno.test("buildSystemPrompt: updated system prompt no longer says 'a sports prediction app for NCAA basketball, NBA, and MLB'", () => {
  const prompt = buildSystemPrompt("x", "standard", []);
  // Old hardcoded string must be gone
  const oldString = "a sports prediction app for NCAA basketball, NBA, and MLB";
  assertEquals(prompt.includes(oldString), false);
});

// ---------------------------------------------------------------------------
// 3. getDailyPostCount — day-of-week weighting
// ---------------------------------------------------------------------------

// All-sports active list for football season
const footballSeasonSports = ["ncaaf", "nfl", "ncaam", "nba", "mlb"];
const basketballOnlySports = ["ncaam", "nba", "mlb"];

Deno.test("getDailyPostCount: NCAAF Saturday (day=6) → 8 posts", () => {
  assertEquals(getDailyPostCount(6, footballSeasonSports), 8);
});

Deno.test("getDailyPostCount: NFL Sunday (day=0) → 8 posts", () => {
  assertEquals(getDailyPostCount(0, footballSeasonSports), 8);
});

Deno.test("getDailyPostCount: Thursday Night Football (day=4) → 6 posts", () => {
  assertEquals(getDailyPostCount(4, footballSeasonSports), 6);
});

Deno.test("getDailyPostCount: Monday Night Football (day=1) → 6 posts", () => {
  assertEquals(getDailyPostCount(1, footballSeasonSports), 6);
});

Deno.test("getDailyPostCount: Tuesday (no football) with basketball → 6 posts", () => {
  assertEquals(getDailyPostCount(2, basketballOnlySports), 6);
});

Deno.test("getDailyPostCount: Wednesday (no football) with basketball → 6 posts", () => {
  assertEquals(getDailyPostCount(3, basketballOnlySports), 6);
});

Deno.test("getDailyPostCount: empty sport list → 4 posts (default minimum)", () => {
  assertEquals(getDailyPostCount(2, []), 4);
});

Deno.test("getDailyPostCount: Tuesday football season (with basketball) → 6 posts", () => {
  // Football season sports list includes ncaam/nba, so basketball branch fires on Tue (day=2).
  assertEquals(getDailyPostCount(2, footballSeasonSports), 6);
});

Deno.test("getDailyPostCount: Tuesday football-only (no basketball) → 4 posts (light day)", () => {
  // When only football sports are active and it is not a game day, return the minimum.
  assertEquals(getDailyPostCount(2, ["ncaaf", "nfl"]), 4);
});

// ---------------------------------------------------------------------------
// 4. GameData.sport field is part of the interface (type check via assignment)
// ---------------------------------------------------------------------------

Deno.test("GameData accepts sport field without TypeScript error", () => {
  const g: GameData = {
    id: "test-game-1",
    home_team: "Alabama",
    away_team: "Georgia",
    sport: "ncaaf",
  };
  assertEquals(g.sport, "ncaaf");
});

Deno.test("GameData sport field can be null (backward-compat with old rows)", () => {
  const g: GameData = {
    id: "test-game-2",
    home_team: "Lakers",
    away_team: "Celtics",
    sport: null,
  };
  assertEquals(g.sport, null);
});

Deno.test("GameData sport field can be omitted (backward-compat)", () => {
  const g: GameData = {
    id: "test-game-3",
    home_team: "Yankees",
    away_team: "Red Sox",
  };
  assertEquals(g.sport, undefined);
});

// ---------------------------------------------------------------------------
// 5. SPORT_SUBREDDITS map contains all five sport keys
// ---------------------------------------------------------------------------

Deno.test("SPORT_SUBREDDITS has all five sport keys", () => {
  for (const key of ["ncaaf", "nfl", "ncaam", "nba", "mlb"]) {
    assertEquals(
      typeof SPORT_SUBREDDITS[key],
      "string",
      `Missing subreddit entry for sport: ${key}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. selectScreenshotUrl — consumer auto-post denylist (2026-09-05)
// ---------------------------------------------------------------------------

Deno.test("selectScreenshotUrl: app_promo never returns sportsbooks-manual.png", () => {
  const url = selectScreenshotUrl("https://example.supabase.co", "app_promo", 0);
  assertEquals(url.includes("sportsbooks-manual.png"), false);
  assertEquals(isBannedConsumerFilename(url), false);
  assertStringIncludes(url, "game-detail-watch.png");
});

Deno.test("selectScreenshotUrl: football game_preview prefers alert/watch asset", () => {
  const url = selectScreenshotUrl("https://example.supabase.co", "game_preview", 0, {
    sport: "ncaaf",
  });
  assertStringIncludes(url, "/storage/v1/object/public/social-images/");
  assertStringIncludes(url, "game-detail-watch.png");
});

Deno.test("selectScreenshotUrl: carousel slides stay off settings chrome", () => {
  for (let i = 0; i < 4; i++) {
    const url = selectScreenshotUrl("https://example.supabase.co", "app_promo", i);
    assertEquals(isBannedConsumerFilename(url), false, `slide ${i}: ${url}`);
  }
});
