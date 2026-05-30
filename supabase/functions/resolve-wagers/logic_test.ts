import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveWager, normalizeWagerType } from "./logic.ts";
import { makeResolveGame, makeResolveWager } from "../_shared/test-helpers.ts";

// ─── normalizeWagerType ───

Deno.test("normalizeWagerType: v1 names pass through", () => {
  assertEquals(normalizeWagerType("spread"), "spread");
  assertEquals(normalizeWagerType("moneyline"), "moneyline");
  assertEquals(normalizeWagerType("over_under"), "over_under");
});

Deno.test("normalizeWagerType: v2/email-parser names map correctly", () => {
  assertEquals(normalizeWagerType("total"), "over_under");
  assertEquals(normalizeWagerType("totals"), "over_under");
  assertEquals(normalizeWagerType("player_prop"), "player_prop");
  assertEquals(normalizeWagerType("futures"), "futures");
  assertEquals(normalizeWagerType("parlay"), "parlay");
  assertEquals(normalizeWagerType("ml"), "moneyline");
});

Deno.test("normalizeWagerType: falls back to market_type when wager_type is null", () => {
  assertEquals(normalizeWagerType(null, "total"), "over_under");
  assertEquals(normalizeWagerType(null, "spread"), "spread");
  assertEquals(normalizeWagerType(null, "moneyline"), "moneyline");
});

Deno.test("normalizeWagerType: unknown type returns null", () => {
  assertEquals(normalizeWagerType("exotic"), null);
  assertEquals(normalizeWagerType(null, null), null);
  assertEquals(normalizeWagerType(null, ""), null);
});

// ─── Spread ───

Deno.test("spread: home team covers → won", () => {
  // Home 75-70, spread -3.5, margin=5, coverMargin = 5 + (-3.5) = 1.5 > 0 → won
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "spread", team_id: "team-home", line: -3.5 });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("spread: home team misses → lost", () => {
  // Home 72-70, spread -3.5, margin=2, coverMargin = 2 + (-3.5) = -1.5 < 0 → lost
  const game = makeResolveGame({ home_score: 72, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "spread", team_id: "team-home", line: -3.5 });
  assertEquals(resolveWager(game, wager), "lost");
});

Deno.test("spread: exact spread → push", () => {
  // Home 73-70, spread -3, coverMargin = 3 + (-3) = 0 → push
  const game = makeResolveGame({ home_score: 73, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "spread", team_id: "team-home", line: -3 });
  assertEquals(resolveWager(game, wager), "push");
});

Deno.test("spread: away team covers → won", () => {
  // Home 70-75, away team +3.5, coverMargin = -(70-75) + 3.5 = 5 + 3.5 = 8.5 > 0 → won
  const game = makeResolveGame({ home_score: 70, away_score: 75 });
  const wager = makeResolveWager({ wager_type: "spread", team_id: "team-away", line: 3.5 });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("spread: away team misses → lost", () => {
  // Home 80-70, away +3.5, coverMargin = -(80-70) + 3.5 = -10 + 3.5 = -6.5 → lost
  const game = makeResolveGame({ home_score: 80, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "spread", team_id: "team-away", line: 3.5 });
  assertEquals(resolveWager(game, wager), "lost");
});

// ─── Moneyline ───

Deno.test("moneyline: home team wins → won", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "moneyline", team_id: "team-home", line: null });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("moneyline: home team loses → lost", () => {
  const game = makeResolveGame({ home_score: 70, away_score: 75 });
  const wager = makeResolveWager({ wager_type: "moneyline", team_id: "team-home", line: null });
  assertEquals(resolveWager(game, wager), "lost");
});

Deno.test("moneyline: away team wins → won", () => {
  const game = makeResolveGame({ home_score: 70, away_score: 75 });
  const wager = makeResolveWager({ wager_type: "moneyline", team_id: "team-away", line: null });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("moneyline: tie → push", () => {
  const game = makeResolveGame({ home_score: 70, away_score: 70 });
  const wager = makeResolveWager({ wager_type: "moneyline", team_id: "team-home", line: null });
  assertEquals(resolveWager(game, wager), "push");
});

// ─── Over/Under ───

Deno.test("over: total above line → won", () => {
  // Total = 145, line = 140
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("over: total below line → lost", () => {
  const game = makeResolveGame({ home_score: 65, away_score: 60 });
  const wager = makeResolveWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "lost");
});

Deno.test("under: total below line → won", () => {
  const game = makeResolveGame({ home_score: 65, away_score: 60 });
  const wager = makeResolveWager({
    wager_type: "over_under",
    line: 140,
    description: "Under 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("under: total above line → lost", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({
    wager_type: "over_under",
    line: 140,
    description: "Under 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "lost");
});

Deno.test("over/under: exact total → push", () => {
  const game = makeResolveGame({ home_score: 70, away_score: 70 });
  const wager = makeResolveWager({
    wager_type: "over_under",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "push");
});

// ─── Unknown type ───

Deno.test("unknown wager type → null", () => {
  const game = makeResolveGame();
  const wager = makeResolveWager({ wager_type: "exotic", line: null });
  assertEquals(resolveWager(game, wager), null);
});

// ─── v2 wager_type aliases (email parser compatibility) ───

Deno.test("wager_type 'total' (v2 alias) resolves over/under correctly", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 }); // total = 145
  const wager = makeResolveWager({
    wager_type: "total",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("market_type fallback when wager_type is null", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 }); // total = 145
  const wager = makeResolveWager({
    wager_type: null,
    market_type: "total",
    line: 140,
    description: "Over 140",
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("market_type 'moneyline' via alias 'ml'", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({
    wager_type: "ml",
    team_id: "team-home",
    line: null,
  });
  assertEquals(resolveWager(game, wager), "won");
});

Deno.test("player_prop wager returns null (not auto-resolvable)", () => {
  const game = makeResolveGame({ home_score: 75, away_score: 70 });
  const wager = makeResolveWager({
    wager_type: "player_prop",
    description: "LeBron James Over 25.5 points",
    line: 25.5,
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), null);
});

Deno.test("parlay wager returns null (not auto-resolvable)", () => {
  const game = makeResolveGame();
  const wager = makeResolveWager({
    wager_type: "parlay",
    description: "Parlay (3 legs)",
    line: null,
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), null);
});

Deno.test("futures wager returns null (not auto-resolvable)", () => {
  const game = makeResolveGame();
  const wager = makeResolveWager({
    wager_type: "futures",
    description: "Duke to win NCAA Tournament",
    line: null,
    team_id: null,
  });
  assertEquals(resolveWager(game, wager), null);
});
