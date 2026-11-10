import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLiveMomentText,
  buildPlatformCaptions,
  buildTodaysGames,
  detectLiveMoments,
  etDate,
  etDayBounds,
  gamePagePath,
  isNationallyRelevant,
  type LmGame,
  liveMomentUrl,
  momentKey,
  parseLmRunOptions,
  pickTodaysSport,
  planLiveMoments,
  todaysGamesHead,
  todaysGamesKey,
  todaysGamesUrl,
} from "./logic.ts";
import { LIVE_MOMENT_HOURLY_CAP } from "../_shared/social-formats.ts";
import { guardCopyForPlatform } from "../_shared/social-copy-guard.ts";
import { tweetTextLength, X_TARGET_TWEET_LENGTH } from "../cmo-publish/logic.ts";

const BUF = { name: "Buffalo Bills", abbreviation: "BUF", slug: "buffalo-bills" };
const KC = { name: "Kansas City Chiefs", abbreviation: "KC", slug: "kansas-city-chiefs" };

function game(o: Partial<LmGame> = {}): LmGame {
  return {
    id: "espn-nfl-401772001",
    sport: "nfl",
    status: "inprogress",
    clock: "1:45",
    period: 4,
    home_score: 24,
    away_score: 21,
    broadcast: "CBS",
    scheduled_at: "2026-11-08T21:25:00Z", // 4:25 PM ET Sunday
    home_rank: null,
    away_rank: null,
    espn_id: "401772001",
    home: KC,
    away: BUF,
    ...o,
  };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

Deno.test("NFL one-score game under 2:00 in Q4 -> two_minute (from football_two_minute must-notify)", () => {
  const m = detectLiveMoments(game());
  assertEquals(m.map((x) => x.type), ["two_minute"]);
  assertEquals(m[0].source, "football_two_minute");
});

Deno.test("NFL two-minute warning in Q2 is NOT a live moment", () => {
  assertEquals(detectLiveMoments(game({ period: 2 })), []);
});

Deno.test("football: 9-point game, 5:00 left, or blowout -> nothing", () => {
  assertEquals(detectLiveMoments(game({ home_score: 30, away_score: 21 })), []);
  assertEquals(detectLiveMoments(game({ clock: "5:00" })), []);
  assertEquals(detectLiveMoments(game({ home_score: 45, away_score: 3, clock: "0:40" })), []);
});

Deno.test("NFL overtime start -> overtime first", () => {
  const m = detectLiveMoments(game({ period: 5, clock: "10:00", home_score: 27, away_score: 27 }));
  assertEquals(m[0].type, "overtime");
});

Deno.test("college football OT with no clock still detected (period check)", () => {
  const m = detectLiveMoments(game({ sport: "ncaaf", period: 5, clock: null, home_score: 31, away_score: 31 }));
  assertEquals(m.map((x) => x.type), ["overtime"]);
  assertEquals(m[0].source, "period_check");
});

Deno.test("NBA one-possession finish in the 4th -> close_finish; same in Q2 -> nothing", () => {
  const nba = game({ sport: "nba", clock: "1:30", home_score: 101, away_score: 99, broadcast: "ESPN" });
  assertEquals(detectLiveMoments(nba).map((x) => x.type), ["close_finish"]);
  assertEquals(detectLiveMoments({ ...nba, period: 2 }), []);
});

Deno.test("NCAAM one-possession finish in the 2nd half -> close_finish", () => {
  const g = game({ sport: "ncaam", period: 2, clock: "0:58", home_score: 70, away_score: 68, broadcast: "CBS" });
  assertEquals(detectLiveMoments(g).map((x) => x.type), ["close_finish"]);
});

Deno.test("basketball OT that is also a one-possession finish yields overtime then close_finish", () => {
  const g = game({ sport: "nba", period: 5, clock: "0:50", home_score: 110, away_score: 109, broadcast: "TNT" });
  assertEquals(detectLiveMoments(g).map((x) => x.type), ["overtime", "close_finish"]);
});

Deno.test("only inprogress games qualify (closed/halftime/scheduled -> nothing, rule 6)", () => {
  for (const status of ["closed", "halftime", "scheduled"]) {
    assertEquals(detectLiveMoments(game({ status })), [], status);
  }
});

Deno.test("national relevance: NFL/NBA always; college needs ranked team or national TV", () => {
  assert(isNationallyRelevant(game()));
  assert(isNationallyRelevant(game({ sport: "nba", broadcast: "League Pass" })));
  const cbb = game({ sport: "ncaam", period: 2, broadcast: "ESPN+" });
  assertEquals(isNationallyRelevant(cbb), false, "ESPN+ only, unranked");
  assert(isNationallyRelevant({ ...cbb, home_rank: 12 }), "ranked home");
  assert(isNationallyRelevant({ ...cbb, broadcast: "CBS" }), "national TV");
  assertEquals(isNationallyRelevant({ ...cbb, away_rank: 30 }), false, "rank > 25");
  assertEquals(isNationallyRelevant(game({ sport: "mlb" })), false, "MLB not in scope");
});

// ---------------------------------------------------------------------------
// Idempotency + rate caps
// ---------------------------------------------------------------------------

Deno.test("idempotent per game + moment type: a posted key is never queued again", () => {
  const g = game();
  const first = planLiveMoments([g], new Set(), { twitter: 0 });
  assertEquals(first.queue.map((c) => c.key), [momentKey(g.id, "two_minute")]);
  const again = planLiveMoments([g], new Set([momentKey(g.id, "two_minute")]), { twitter: 1 });
  assertEquals(again.queue, []);
  assertEquals(again.capped, []);
});

Deno.test("a game with overtime already posted can still post its close_finish", () => {
  const g = game({ sport: "nba", period: 5, clock: "0:50", home_score: 110, away_score: 109, broadcast: "TNT" });
  const r = planLiveMoments([g], new Set([momentKey(g.id, "overtime")]), { twitter: 1 });
  assertEquals(r.queue.map((c) => c.moment.type), ["close_finish"]);
});

Deno.test("at most one new moment per game per run", () => {
  const g = game({ sport: "nba", period: 5, clock: "0:50", home_score: 110, away_score: 109, broadcast: "TNT" });
  const r = planLiveMoments([g], new Set(), { twitter: 0 });
  assertEquals(r.queue.map((c) => c.moment.type), ["overtime"]);
});

Deno.test("hourly caps: 3/h on X, 1/h on IG/FB/TikTok (configurable constants)", () => {
  assertEquals(LIVE_MOMENT_HOURLY_CAP.twitter, 3);
  assertEquals(LIVE_MOMENT_HOURLY_CAP.instagram, 1);
  assertEquals(LIVE_MOMENT_HOURLY_CAP.facebook, 1);
  assertEquals(LIVE_MOMENT_HOURLY_CAP.tiktok, 1);
});

Deno.test("rate cap fills the remaining X budget by priority (OT first) and caps the rest", () => {
  const games = [
    game({ id: "g1" }),
    game({ id: "g2", home_score: 20, away_score: 20 }),
    game({ id: "g3", period: 5, clock: "10:00", home_score: 27, away_score: 27 }),
    game({ id: "g4", sport: "nba", clock: "1:00", home_score: 100, away_score: 99 }),
    game({ id: "g5", sport: "ncaam", period: 2, clock: "1:00", home_score: 60, away_score: 59, home_rank: 3 }),
  ];
  const r = planLiveMoments(games, new Set(), { twitter: 1 });
  assertEquals(r.budget, 2);
  assertEquals(r.queue.length, 2);
  assertEquals(r.queue[0].key, momentKey("g3", "overtime"));
  assertEquals(r.queue[1].game.id, "g2", "tied NFL game beats 3-point NFL game");
  assertEquals(r.capped.length, 3);

  const full = planLiveMoments(games, new Set(), { twitter: 3 });
  assertEquals(full.budget, 0);
  assertEquals(full.queue, []);
  assertEquals(full.capped.length, 5);
});

Deno.test("custom caps / multiple text platforms: the tightest platform budget wins", () => {
  const games = [game({ id: "a" }), game({ id: "b" })];
  const r = planLiveMoments(games, new Set(), { twitter: 0, instagram: 0 }, { twitter: 3, instagram: 1 }, ["twitter", "instagram"]);
  assertEquals(r.budget, 1);
  assertEquals(r.queue.length, 1);
});

Deno.test("demo and nationally irrelevant games never queue", () => {
  const r = planLiveMoments([
    game({ id: "demo-nfl-1" }),
    game({ id: "c1", sport: "ncaam", period: 2, clock: "1:00", home_score: 60, away_score: 59, broadcast: "ESPN+" }),
  ], new Set(), { twitter: 0 });
  assertEquals(r.queue, []);
});

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

Deno.test("Live Moment URL: game page path + utm_source=<platform> + utm_campaign=live_moment", () => {
  const g = game();
  assertEquals(gamePagePath(g), "/games/nfl/2026-11-08/buffalo-bills-at-kansas-city-chiefs");
  const x = new URL(liveMomentUrl(g, "twitter", "two_minute")!);
  assertEquals(x.origin, "https://getnorma.app");
  assertEquals(x.pathname, "/games/nfl/2026-11-08/buffalo-bills-at-kansas-city-chiefs");
  assertEquals(x.searchParams.get("utm_source"), "x");
  assertEquals(x.searchParams.get("utm_campaign"), "live_moment");
  assertEquals(x.searchParams.get("utm_content"), "two_minute");
  for (const [p, src] of [["instagram", "instagram"], ["ig", "instagram"], ["facebook", "facebook"], ["fb", "facebook"], ["tiktok", "tiktok"]]) {
    assertEquals(new URL(liveMomentUrl(g, p, "overtime")!).searchParams.get("utm_source"), src);
  }
});

Deno.test("game page date is the ET date (a 8:20 PM ET kickoff is 01:20Z the next UTC day)", () => {
  assertEquals(etDate("2026-11-10T01:20:00Z"), "2026-11-09");
  assertEquals(gamePagePath(game({ scheduled_at: "2026-11-10T01:20:00Z" })), "/games/nfl/2026-11-09/buffalo-bills-at-kansas-city-chiefs");
});

Deno.test("no game page (missing slug or no broadcast) -> no URL and no post", () => {
  assertEquals(gamePagePath(game({ home: { ...KC, slug: null } })), null);
  assertEquals(gamePagePath(game({ broadcast: "" })), null);
  assertEquals(liveMomentUrl(game({ broadcast: null }), "twitter", "overtime"), null);
  assertEquals(buildLiveMomentText(game({ broadcast: null }), "two_minute", "twitter"), null);
});

Deno.test("Today's Games URL: /schedule/<sport>/today with utm_campaign=todays_games", () => {
  const u = new URL(todaysGamesUrl("nfl", "twitter"));
  assertEquals(u.pathname, "/schedule/nfl/today");
  assertEquals(u.searchParams.get("utm_source"), "x");
  assertEquals(u.searchParams.get("utm_campaign"), "todays_games");
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

Deno.test("Live Moment copy: score, clock, channel, stream and link; fits X 270 target", () => {
  const t = buildLiveMomentText(game(), "two_minute", "twitter", { streams: ["Paramount+"] })!;
  assertStringIncludes(t, "Two-minute drill.");
  assertStringIncludes(t, "Kansas City Chiefs up 3, 1:45 left in the 4th");
  assertStringIncludes(t, "Buffalo Bills 21, Kansas City Chiefs 24");
  assertStringIncludes(t, "Watch: CBS | Stream: Paramount+");
  assertStringIncludes(t, "utm_campaign=live_moment");
  assert(tweetTextLength(t) <= X_TARGET_TWEET_LENGTH);
  assert(guardCopyForPlatform("twitter", t).ok);
});

Deno.test("Live Moment copy: overtime + basketball labels", () => {
  const ot = buildLiveMomentText(game({ period: 5, clock: "10:00", home_score: 27, away_score: 27 }), "overtime", "twitter")!;
  assert(ot.startsWith("OVERTIME: Buffalo Bills 27, Kansas City Chiefs 27."), ot);
  const ot2 = buildLiveMomentText(game({ sport: "nba", period: 6, clock: "5:00", broadcast: "TNT" }), "overtime", "twitter")!;
  assert(ot2.startsWith("2OT:"), ot2);
  const cbb = buildLiveMomentText(
    game({ sport: "ncaam", period: 2, clock: "0:58", home_score: 70, away_score: 68, home_rank: 4 }),
    "close_finish",
    "twitter",
  )!;
  assertStringIncludes(cbb, "One-possession game. Buffalo Bills 68, #4 Kansas City Chiefs 70, 0:58 left (2nd half).");
});

Deno.test("Live Moment copy falls back to abbreviations when long names do not fit", () => {
  const long = { name: "The Extremely Long Named University of Somewhere Fighting Mascots", abbreviation: "EXT", slug: "ext" };
  const t = buildLiveMomentText(
    game({ home: long, away: { ...long, abbreviation: "LNG", slug: "lng" } }),
    "two_minute",
    "twitter",
    { streams: ["Some Very Long Streaming Service Name", "Another Long Streaming Name"] },
  )!;
  assert(tweetTextLength(t) <= X_TARGET_TWEET_LENGTH, `${tweetTextLength(t)}: ${t}`);
  assertStringIncludes(t, "LNG 21, EXT 24");
});

Deno.test("platform-split captions: per-platform utm, all pass the utility-only guard", () => {
  const g = game();
  const { captions, blocked } = buildPlatformCaptions((p) => buildLiveMomentText(g, "two_minute", p, { streams: ["Paramount+"] }));
  assertEquals(Object.keys(captions).sort(), ["fb", "ig", "tiktok"]);
  assertEquals(blocked, {});
  assertStringIncludes(captions.ig, "utm_source=instagram");
  assertStringIncludes(captions.fb, "utm_source=facebook");
  assertStringIncludes(captions.tiktok, "utm_source=tiktok");
  for (const [p, c] of Object.entries(captions)) assert(guardCopyForPlatform(p, c).ok, p);
});

Deno.test("platform-split captions: a caption with betting terms is dropped for that platform", () => {
  const { captions, blocked } = buildPlatformCaptions((p) => p === "tiktok" ? "Your parlay is alive" : "Tune in now");
  assertEquals(Object.keys(captions).sort(), ["fb", "ig"]);
  assertEquals(blocked.tiktok, ["parlay"]);
});

// ---------------------------------------------------------------------------
// Today's Games
// ---------------------------------------------------------------------------

function sched(id: string, sport: string, iso: string, broadcast: string, o: Partial<LmGame> = {}): LmGame {
  return game({ id, sport, status: "scheduled", clock: null, period: null, home_score: null, away_score: null, scheduled_at: iso, broadcast, ...o });
}

const SUNDAY = new Date("2026-11-08T13:30:00Z"); // 7:30 AM CST
const SATURDAY = new Date("2026-11-07T13:30:00Z");
const TUESDAY = new Date("2026-11-10T13:30:00Z");

Deno.test("weekday sport choice: NFL on Sunday, NCAAF on Saturday, NBA on Tuesday", () => {
  const slate = [
    sched("n1", "nfl", "2026-11-08T18:00:00Z", "FOX"),
    sched("b1", "nba", "2026-11-09T00:30:00Z", "ESPN"),
    sched("f1", "ncaaf", "2026-11-07T17:00:00Z", "ABC"),
  ];
  assertEquals(pickTodaysSport(slate, SUNDAY), "nfl");
  assertEquals(pickTodaysSport(slate, SATURDAY), "ncaaf");
  assertEquals(pickTodaysSport(slate, TUESDAY), "nba");
  assertEquals(pickTodaysSport([], SUNDAY), null);
});

Deno.test("Today's Games: ET + CT times, channel, schedule link, fits 270, start-time order", () => {
  const slate = [
    sched("n3", "nfl", "2026-11-09T01:20:00Z", "NBC"), // 8:20p ET SNF
    sched("n1", "nfl", "2026-11-08T18:00:00Z", "FOX"), // 1p ET
    sched("n2", "nfl", "2026-11-08T21:25:00Z", "CBS"), // 4:25p ET
    sched("n4", "nfl", "2026-11-08T18:00:00Z", "", {}), // no broadcast -> excluded
    sched("demo-nfl-9", "nfl", "2026-11-08T18:00:00Z", "CBS"),
    sched("n5", "nfl", "2026-11-08T18:00:00Z", "CBS", { status: "closed" }),
  ];
  const plan = buildTodaysGames(slate, SUNDAY, "twitter")!;
  assertEquals(plan.sport, "nfl");
  assertEquals(plan.games.map((g) => g.id), ["n1", "n2", "n3"]);
  assertStringIncludes(plan.text, "NFL today: what channel + start time");
  assertStringIncludes(plan.text, "BUF @ KC 1p ET/12p CT, FOX");
  assertStringIncludes(plan.text, "BUF @ KC 4:25p ET/3:25p CT, CBS");
  assertStringIncludes(plan.text, "BUF @ KC 8:20p ET/7:20p CT, NBC");
  assertStringIncludes(plan.text, "https://getnorma.app/schedule/nfl/today?utm_source=x&utm_campaign=todays_games");
  assert(tweetTextLength(plan.text) <= X_TARGET_TWEET_LENGTH);
  assert(guardCopyForPlatform("tiktok", buildTodaysGames(slate, SUNDAY, "tiktok")!.text).ok);
});

Deno.test("Today's Games trims to fit: national TV / ranked games win the slots", () => {
  const slate = Array.from({ length: 14 }, (_, i) =>
    sched(`c${i}`, "ncaaf", `2026-11-07T${String(16 + (i % 8)).padStart(2, "0")}:00:00Z`, i === 13 ? "ABC" : "ESPN+", i === 12 ? { home_rank: 2 } : {})
  );
  const plan = buildTodaysGames(slate, SATURDAY, "twitter")!;
  assert(plan.games.length >= 2 && plan.games.length < 14);
  const ids = plan.games.map((g) => g.id);
  assert(ids.includes("c13"), "national TV game kept");
  assert(ids.includes("c12"), "top-10 ranked game kept");
  assert(tweetTextLength(plan.text) <= X_TARGET_TWEET_LENGTH);
});

Deno.test("Today's Games: no listable games -> null", () => {
  assertEquals(buildTodaysGames([sched("x", "nfl", "2026-11-08T18:00:00Z", "")], SUNDAY, "twitter"), null);
});

Deno.test("todays_games key is per ET day; ET day bounds are DST-correct", () => {
  const b = etDayBounds(SUNDAY);
  assertEquals(b.day, "2026-11-08");
  assertEquals(todaysGamesKey(b.day), "todays_games:2026-11-08");
  assertEquals(b.from.toISOString(), "2026-11-08T05:00:00.000Z");
  assertEquals(b.to.toISOString(), "2026-11-09T05:00:00.000Z");
  const dst = etDayBounds(new Date("2026-03-08T15:00:00Z")); // spring forward day
  assertEquals(dst.from.toISOString(), "2026-03-08T05:00:00.000Z");
  assertEquals(dst.to.toISOString(), "2026-03-09T04:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Run options (dry run)
// ---------------------------------------------------------------------------

Deno.test("run options: mode, dry_run, as_of honoured only in dry runs", () => {
  const now = new Date("2026-11-08T20:00:00Z");
  assertEquals(parseLmRunOptions({}, now), { mode: "live", dryRun: false, asOf: now });
  assertEquals(parseLmRunOptions({ mode: "todays_games" }, now).mode, "todays_games");
  assertEquals(parseLmRunOptions({ as_of: "2026-11-01T00:00:00Z" }, now).asOf, now);
  const dry = parseLmRunOptions({ dry_run: true, as_of: "2026-11-01T00:00:00Z" }, now);
  assertEquals(dry.dryRun, true);
  assertEquals(dry.asOf.toISOString(), "2026-11-01T00:00:00.000Z");
  assertEquals(parseLmRunOptions({ dry_run: "true" }, now).dryRun, true);
});

Deno.test("holiday slates: Thanksgiving + Black Friday lead with football, Rivalry Saturday headline", () => {
  const THANKSGIVING = new Date("2026-11-26T13:30:00Z"); // 7:30 AM CST
  const BLACK_FRIDAY = new Date("2026-11-27T13:30:00Z");
  const RIVALRY_SAT = new Date("2026-11-28T13:30:00Z");
  const slate = [
    sched("t1", "nfl", "2026-11-26T17:30:00Z", "CBS"),
    sched("t2", "nba", "2026-11-27T00:30:00Z", "ESPN"),
    sched("bf1", "nfl", "2026-11-27T20:00:00Z", "Prime Video"),
    sched("bf2", "nba", "2026-11-28T00:30:00Z", "NBA TV"),
    sched("r1", "ncaaf", "2026-11-28T17:00:00Z", "FOX"),
  ];
  assertEquals(pickTodaysSport(slate, THANKSGIVING), "nfl");
  assertEquals(pickTodaysSport(slate, BLACK_FRIDAY), "nfl");
  assertEquals(pickTodaysSport(slate, RIVALRY_SAT), "ncaaf");
  assertStringIncludes(buildTodaysGames(slate, THANKSGIVING, "twitter")!.text, "Thanksgiving NFL: what channel + start time");
  assertStringIncludes(buildTodaysGames(slate, RIVALRY_SAT, "twitter")!.text, "Rivalry Saturday: what channel + start time");
  // Black Friday with no football listed: falls back to NBA and the plain headline.
  const noFootball = slate.filter((g) => g.sport === "nba");
  assertEquals(pickTodaysSport(noFootball, BLACK_FRIDAY), "nba");
  assertEquals(todaysGamesHead("nba", BLACK_FRIDAY), "NBA today: what channel + start time");
  // An ordinary day keeps the weekday order and plain headline.
  assertEquals(todaysGamesHead("nba", TUESDAY), "NBA today: what channel + start time");
  for (const p of ["tiktok", "ig", "fb"]) {
    assert(guardCopyForPlatform(p, buildTodaysGames(slate, THANKSGIVING, p)!.text).ok);
  }
});
