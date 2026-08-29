import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSportsbookLink,
  buildPickEmLink,
  isSportsbookUrl,
  type GameContext,
  type PickEmContext,
} from "./sportsbook-links.ts";

// Sport-aware sportsbook deep links — regression suite for BL-6 in the
// 2026-08-23 season-readiness audit. Every PROVIDER_TEMPLATES entry used
// to hardcode ncaab/college-basketball paths, so a "Bet Now" tap on any
// football or NFL game routed the user to the sportsbook's basketball
// section. Each test below asserts that the league identifier in both the
// native scheme and the universal link matches the game's sport.

function game(sport: string): GameContext {
  return {
    home_team: "Home Squad",
    away_team: "Away Squad",
    scheduled_at: "2026-08-30T18:00:00Z",
    sport,
    game_id: "g-test",
  };
}

// ─── DraftKings ───

Deno.test("DK: NCAAF game routes to /cfb/", () => {
  const link = buildSportsbookLink("draftkings", game("ncaaf"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/cfb/game/");
  assertStringIncludes(link.universal_link, "/leagues/cfb/event/");
});

Deno.test("DK: NFL game routes to /nfl/", () => {
  const link = buildSportsbookLink("draftkings", game("nfl"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/nfl/game/");
  assertStringIncludes(link.universal_link, "/leagues/nfl/event/");
});

Deno.test("DK: NCAAM basketball (default sport) preserves ncaab", () => {
  const link = buildSportsbookLink("draftkings", game("ncaam"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/ncaab/game/");
  assertStringIncludes(link.universal_link, "/leagues/ncaab/event/");
});

Deno.test("DK: unknown/missing sport falls back to ncaab", () => {
  const link = buildSportsbookLink("draftkings", { ...game("ncaam"), sport: undefined }, 1);
  assertStringIncludes(link.native_scheme, "sportsbook/ncaab/game/");
});

// ─── FanDuel ───

Deno.test("FD: NCAAF game routes to /college-football/", () => {
  const link = buildSportsbookLink("fanduel", game("ncaaf"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/college-football/");
  assertStringIncludes(link.universal_link, "sportsbook.fanduel.com/college-football/");
});

Deno.test("FD: NFL game routes to /nfl/", () => {
  const link = buildSportsbookLink("fanduel", game("nfl"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/nfl/");
  assertStringIncludes(link.universal_link, "sportsbook.fanduel.com/nfl/");
});

Deno.test("FD: NCAAM preserves college-basketball", () => {
  const link = buildSportsbookLink("fanduel", game("ncaam"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/college-basketball/");
});

// ─── BetMGM ───

Deno.test("MGM: NCAAF game routes to football/college", () => {
  const link = buildSportsbookLink("betmgm", game("ncaaf"), 1);
  assertStringIncludes(link.native_scheme, "sports/cfb/");
  assertStringIncludes(link.universal_link, "/sports/football/college/");
});

Deno.test("MGM: NFL game routes to football/nfl", () => {
  const link = buildSportsbookLink("betmgm", game("nfl"), 1);
  assertStringIncludes(link.native_scheme, "sports/nfl/");
  assertStringIncludes(link.universal_link, "/sports/football/nfl/");
});

Deno.test("MGM: MLB game routes to baseball/mlb", () => {
  const link = buildSportsbookLink("betmgm", game("mlb"), 1);
  assertStringIncludes(link.universal_link, "/sports/baseball/mlb/");
});

// ─── Caesars ───

Deno.test("Caesars: NCAAF game routes to /college-football/", () => {
  const link = buildSportsbookLink("caesars", game("ncaaf"), 1);
  assertStringIncludes(link.native_scheme, "sports/college-football/");
  assertStringIncludes(link.universal_link, "/college-football/");
});

Deno.test("Caesars: NFL game routes to /nfl/", () => {
  const link = buildSportsbookLink("caesars", game("nfl"), 1);
  assertStringIncludes(link.native_scheme, "sports/nfl/");
  assertStringIncludes(link.universal_link, "/nfl/");
});

// ─── ESPN BET ───

Deno.test("ESPN BET: NCAAF game — scheme uses cfb, web umbrella is football", () => {
  const link = buildSportsbookLink("espnbet", game("ncaaf"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/cfb/");
  assertStringIncludes(link.universal_link, "espnbet.com/sport/football/");
});

Deno.test("ESPN BET: NFL game — scheme uses nfl, web umbrella is football", () => {
  const link = buildSportsbookLink("espnbet", game("nfl"), 1);
  assertStringIncludes(link.native_scheme, "sportsbook/nfl/");
  assertStringIncludes(link.universal_link, "espnbet.com/sport/football/");
});

Deno.test("ESPN BET: NBA game — web umbrella is basketball", () => {
  const link = buildSportsbookLink("espnbet", game("nba"), 1);
  assertStringIncludes(link.universal_link, "espnbet.com/sport/basketball/");
});

// ─── Cross-cutting ───

Deno.test("unknown provider returns empty link (safe fallback)", () => {
  const link = buildSportsbookLink("bogusbook", game("nfl"), 1);
  assertEquals(link.native_scheme, "");
  assertEquals(link.universal_link, "");
});

Deno.test("affiliate params still appended after sport-aware paths", () => {
  const link = buildSportsbookLink("draftkings", game("nfl"), 42, {
    affiliate_id: "AFF-1",
    referral_code: "PROMO",
    attribution_window_minutes: 5,
  });
  assertStringIncludes(link.universal_link, "ref=NORMA&campaign=42");
  assertStringIncludes(link.universal_link, "aff_id=AFF-1");
  assertStringIncludes(link.universal_link, "promo=PROMO");
});

Deno.test("isSportsbookUrl matches known providers", () => {
  assertEquals(isSportsbookUrl("https://sportsbook.draftkings.com/anything"), "draftkings");
  assertEquals(isSportsbookUrl("https://www.fanduel.com/x"), "fanduel");
  assertEquals(isSportsbookUrl("https://example.com/no-match"), null);
});

// ─── PrizePicks pick'em links (F1 item 3) ────────────────────────────────────

function pickEmCtx(sport?: string): PickEmContext {
  return { sport };
}

Deno.test("PrizePicks: NFL board link contains NFL sport slug", () => {
  const link = buildPickEmLink("prizepicks", pickEmCtx("nfl"), 1);
  assertStringIncludes(link.native_scheme, "prizepicks://lobby");
  assertStringIncludes(link.universal_link, "prizepicks.com");
  assertStringIncludes(link.universal_link, "NFL");
});

Deno.test("PrizePicks: NCAAF board link contains CFB slug", () => {
  const link = buildPickEmLink("prizepicks", pickEmCtx("ncaaf"), 1);
  assertStringIncludes(link.universal_link, "CFB");
});

Deno.test("PrizePicks: no sport opens main lobby", () => {
  const link = buildPickEmLink("prizepicks", pickEmCtx(), 1);
  assertStringIncludes(link.native_scheme, "prizepicks://lobby");
  assertStringIncludes(link.universal_link, "prizepicks.com");
});

Deno.test("Underdog: NFL board link contains nfl slug", () => {
  const link = buildPickEmLink("underdog", pickEmCtx("nfl"), 1);
  assertStringIncludes(link.native_scheme, "underdog://picks");
  assertStringIncludes(link.universal_link, "underdogfantasy.com");
  assertStringIncludes(link.universal_link, "nfl");
});

Deno.test("Underdog: NCAAF board link contains college_football slug", () => {
  const link = buildPickEmLink("underdog", pickEmCtx("ncaaf"), 1);
  assertStringIncludes(link.universal_link, "college_football");
});

Deno.test("buildPickEmLink: unknown provider returns empty link (safe fallback)", () => {
  const link = buildPickEmLink("bogus_pickem", pickEmCtx("nfl"), 1);
  assertEquals(link.native_scheme, "");
  assertEquals(link.universal_link, "");
});
