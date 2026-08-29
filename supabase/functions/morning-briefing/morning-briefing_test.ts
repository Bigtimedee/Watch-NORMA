// Tests for morning-briefing F4 edition routing.
// Run via: deno test --allow-env --allow-net=none supabase/functions/morning-briefing/morning-briefing_test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEditionMessage, localDayOfWeek } from "./logic.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGame(
  id: string,
  sport: string,
  home: string,
  away: string,
  opts: { home_rank?: number | null; away_rank?: number | null; scheduled_at?: string } = {},
) {
  return {
    id,
    home_team: home,
    away_team: away,
    sport,
    scheduled_at: opts.scheduled_at ?? "2026-09-14T18:00:00Z",
    home_rank: opts.home_rank ?? null,
    away_rank: opts.away_rank ?? null,
  };
}

const NO_PERSONAL = () => false;

// ─── localDayOfWeek ──────────────────────────────────────────────────────────

Deno.test("localDayOfWeek: Saturday in America/New_York", () => {
  // 2026-09-12 is a Saturday (UTC). 13:00 UTC = 09:00 ET.
  const t = new Date("2026-09-12T13:00:00Z");
  assertEquals(localDayOfWeek(t, "America/New_York"), 6);
});

Deno.test("localDayOfWeek: Thursday in America/Chicago", () => {
  // 2026-09-10 is a Thursday (NFL Kickoff). 20:00 UTC = 15:00 CT.
  const t = new Date("2026-09-10T20:00:00Z");
  assertEquals(localDayOfWeek(t, "America/Chicago"), 4);
});

Deno.test("localDayOfWeek: Sunday in America/Los_Angeles", () => {
  // 2026-09-13 is a Sunday. 18:00 UTC = 11:00 PT.
  const t = new Date("2026-09-13T18:00:00Z");
  assertEquals(localDayOfWeek(t, "America/Los_Angeles"), 0);
});

Deno.test("localDayOfWeek: null timezone falls back to UTC", () => {
  // 2026-09-13 is a Sunday UTC.
  const t = new Date("2026-09-13T12:00:00Z");
  assertEquals(localDayOfWeek(t, null), 0);
});

Deno.test("localDayOfWeek: invalid timezone falls back to UTC", () => {
  const t = new Date("2026-09-13T12:00:00Z");
  assertEquals(localDayOfWeek(t, "Not/AZone"), 0);
});

// ─── NCAAF Saturday edition ──────────────────────────────────────────────────

Deno.test("NCAAF Saturday: personal game leads, ranked fills tail", () => {
  const personalGame = makeGame("g1", "ncaaf", "Alabama", "Georgia", { home_rank: 1, away_rank: 3 });
  const rankedGame   = makeGame("g2", "ncaaf", "Ohio State", "Michigan", { home_rank: 2, away_rank: 5 });
  const unranked     = makeGame("g3", "ncaaf", "Kansas", "Iowa State");
  const games = [personalGame, rankedGame, unranked];
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage(games, dayCtx, 6, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "NCAAF slate");
  // personal game first
  assertEquals(msg!.featuredIds[0], "g1");
  // ranked game fills tail
  assertEquals(msg!.featuredIds.includes("g2"), true);
  // unranked non-personal excluded
  assertEquals(msg!.featuredIds.includes("g3"), false);
});

Deno.test("NCAAF Saturday: no personal games → ranked matchups appear", () => {
  const ranked1 = makeGame("g1", "ncaaf", "Alabama", "Georgia", { home_rank: 1 });
  const ranked2 = makeGame("g2", "ncaaf", "Ohio State", "Michigan", { away_rank: 5 });
  const unranked = makeGame("g3", "ncaaf", "UMass", "Akron");
  const games = [ranked1, ranked2, unranked];
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage(games, dayCtx, 6, NO_PERSONAL);

  assertEquals(msg !== null, true);
  assertEquals(msg!.featuredIds.includes("g1"), true);
  assertEquals(msg!.featuredIds.includes("g2"), true);
  // unranked non-personal excluded when ranked games exist
  assertEquals(msg!.featuredIds.includes("g3"), false);
});

Deno.test("NCAAF Saturday: no personal & no ranked → count-summary fallback", () => {
  const games = [
    makeGame("g1", "ncaaf", "Team A", "Team B"),
    makeGame("g2", "ncaaf", "Team C", "Team D"),
  ];
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage(games, dayCtx, 6, NO_PERSONAL);

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "NCAAF Saturday");
  assertStringIncludes(msg!.body, "college football");
});

Deno.test("NCAAF Saturday: ranked label injected into body when rank is set", () => {
  const game = makeGame("g1", "ncaaf", "Alabama", "Georgia", { home_rank: 1, away_rank: 3 });
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage([game], dayCtx, 6, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.body, "#1");
  assertStringIncludes(msg!.body, "#3");
});

Deno.test("NCAAF Saturday: non-NCAAF games ignored", () => {
  const ncaaf = makeGame("g1", "ncaaf", "Bama", "Auburn");
  const nfl   = makeGame("g2", "nfl",   "Chiefs", "Raiders");
  const nba   = makeGame("g3", "nba",   "Lakers", "Celtics");
  const dayCtx = { hasNcaaf: true, hasNfl: true, utcDayOfWeek: 6 };

  const msg = buildEditionMessage([ncaaf, nfl, nba], dayCtx, 6, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertEquals(msg!.featuredIds.includes("g2"), false);
  assertEquals(msg!.featuredIds.includes("g3"), false);
});

Deno.test("NCAAF Saturday: no NCAAF games → falls through to default edition", () => {
  const nflGame = makeGame("g1", "nfl", "Chiefs", "Ravens");
  // dayCtx.hasNcaaf is false even though it is Saturday → default edition
  const dayCtx = { hasNcaaf: false, hasNfl: true, utcDayOfWeek: 6 };

  const msg = buildEditionMessage([nflGame], dayCtx, 6, NO_PERSONAL);

  // Default edition returns null when no personal games.
  assertEquals(msg, null);
});

// ─── NFL Thursday edition ─────────────────────────────────────────────────────

Deno.test("NFL Thursday: personal game leads, primetime fills tail", () => {
  const earlyGame     = makeGame("g1", "nfl", "Bills", "Dolphins",  { scheduled_at: "2026-09-10T17:00:00Z" });
  const primetimeGame = makeGame("g2", "nfl", "Chiefs", "Ravens",   { scheduled_at: "2026-09-10T23:30:00Z" });
  const games = [earlyGame, primetimeGame];
  const dayCtx = { hasNcaaf: false, hasNfl: true, utcDayOfWeek: 4 };

  // User follows the early game.
  const msg = buildEditionMessage(games, dayCtx, 4, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "NFL Thursday");
  assertEquals(msg!.featuredIds[0], "g1");           // personal first
  assertEquals(msg!.featuredIds.includes("g2"), true); // primetime fills
});

Deno.test("NFL Thursday: no personal → primetime is the lead", () => {
  const earlyGame     = makeGame("g1", "nfl", "Bills", "Dolphins",  { scheduled_at: "2026-09-10T17:00:00Z" });
  const primetimeGame = makeGame("g2", "nfl", "Chiefs", "Ravens",   { scheduled_at: "2026-09-10T23:30:00Z" });
  const dayCtx = { hasNcaaf: false, hasNfl: true, utcDayOfWeek: 4 };

  const msg = buildEditionMessage([earlyGame, primetimeGame], dayCtx, 4, NO_PERSONAL);

  assertEquals(msg !== null, true);
  // Primetime game (latest scheduled_at) must appear.
  assertEquals(msg!.featuredIds.includes("g2"), true);
  // Title should NOT mention "your games" since there are no personal games.
  assertEquals(msg!.title.includes("your"), false);
});

Deno.test("NFL Thursday: no NFL games today → null", () => {
  const ncaaf = makeGame("g1", "ncaaf", "Bama", "Auburn");
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 4 };

  const msg = buildEditionMessage([ncaaf], dayCtx, 4, NO_PERSONAL);

  // No NFL games → default edition; no personal → null.
  assertEquals(msg, null);
});

// ─── NFL Sunday edition ───────────────────────────────────────────────────────

Deno.test("NFL Sunday: personal games lead, count summary in body", () => {
  const personal = makeGame("g1", "nfl", "Chiefs", "Raiders");
  const others = [
    makeGame("g2", "nfl", "Bills", "Dolphins"),
    makeGame("g3", "nfl", "Eagles", "Cowboys"),
    makeGame("g4", "nfl", "Rams", "49ers"),
  ];
  const dayCtx = { hasNcaaf: false, hasNfl: true, utcDayOfWeek: 0 };

  const msg = buildEditionMessage([personal, ...others], dayCtx, 0, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "NFL Sunday");
  assertStringIncludes(msg!.body, "more NFL game");
  assertEquals(msg!.featuredIds[0], "g1");
});

Deno.test("NFL Sunday: no personal games → full-slate summary", () => {
  const games = [
    makeGame("g1", "nfl", "Bills", "Dolphins"),
    makeGame("g2", "nfl", "Chiefs", "Raiders"),
    makeGame("g3", "nfl", "Eagles", "Cowboys"),
  ];
  const dayCtx = { hasNcaaf: false, hasNfl: true, utcDayOfWeek: 0 };

  const msg = buildEditionMessage(games, dayCtx, 0, NO_PERSONAL);

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "NFL Sunday");
  assertStringIncludes(msg!.body, "3 NFL games today");
});

Deno.test("NFL Sunday: no NFL games → null", () => {
  const ncaaf = makeGame("g1", "ncaaf", "Bama", "Auburn");
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 0 };

  const msg = buildEditionMessage([ncaaf], dayCtx, 0, NO_PERSONAL);

  assertEquals(msg, null);
});

// ─── Default edition (Mon/Tue/Wed/Fri) ───────────────────────────────────────

Deno.test("default edition (Monday): personal games only", () => {
  const personal = makeGame("g1", "ncaam", "Duke", "UNC");
  const other    = makeGame("g2", "ncaam", "Kansas", "Kentucky");
  const dayCtx = { hasNcaaf: false, hasNfl: false, utcDayOfWeek: 1 };

  const msg = buildEditionMessage([personal, other], dayCtx, 1, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  assertStringIncludes(msg!.title, "Tonight");
  assertEquals(msg!.featuredIds, ["g1"]);
});

Deno.test("default edition: no personal games → null", () => {
  const games = [makeGame("g1", "ncaam", "Duke", "UNC")];
  const dayCtx = { hasNcaaf: false, hasNfl: false, utcDayOfWeek: 1 };

  const msg = buildEditionMessage(games, dayCtx, 1, NO_PERSONAL);

  assertEquals(msg, null);
});

// ─── Dedup / cap ─────────────────────────────────────────────────────────────

Deno.test("NCAAF Saturday: personal game that is also ranked not duplicated", () => {
  const game = makeGame("g1", "ncaaf", "Alabama", "Georgia", { home_rank: 1 });
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage([game], dayCtx, 6, (g) => g.id === "g1");

  assertEquals(msg !== null, true);
  // Game appears exactly once in featuredIds.
  assertEquals(msg!.featuredIds.filter((id) => id === "g1").length, 1);
});

Deno.test("NCAAF Saturday: capped at 5 featured games", () => {
  const games = Array.from({ length: 8 }, (_, i) =>
    makeGame(`g${i}`, "ncaaf", `Home${i}`, `Away${i}`, { home_rank: i + 1 })
  );
  const dayCtx = { hasNcaaf: true, hasNfl: false, utcDayOfWeek: 6 };

  const msg = buildEditionMessage(games, dayCtx, 6, NO_PERSONAL);

  assertEquals(msg !== null, true);
  assertEquals(msg!.featuredIds.length <= 5, true);
});
