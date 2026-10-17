import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeOpenPnl,
  kalshiCurrentPrice,
  matchMarketTitleToGame,
} from "./prediction-market.ts";

const TEAMS = [
  { id: "espn-ncaaf-osu", name: "Ohio State Buckeyes", market: "Ohio State", abbreviation: "OSU" },
  { id: "espn-ncaaf-iu", name: "Indiana Hoosiers", market: "Indiana", abbreviation: "IU" },
  { id: "espn-nfl-no", name: "New Orleans Saints", market: "New Orleans", abbreviation: "NO" },
  { id: "espn-nfl-nyg", name: "New York Giants", market: "New York", abbreviation: "NYG" },
  { id: "espn-nfl-nyj", name: "New York Jets", market: "New York", abbreviation: "NYJ" },
];
const GAMES = [
  { id: "espn-ncaaf-401858488", home_team_id: "espn-ncaaf-iu", away_team_id: "espn-ncaaf-osu", status: "scheduled" },
  { id: "espn-nfl-401873000", home_team_id: "espn-nfl-nyg", away_team_id: "espn-nfl-no", status: "scheduled" },
];

Deno.test("match: 'Ohio St. vs Indiana' resolves via St.->State expansion", () => {
  assertEquals(matchMarketTitleToGame("Ohio St. vs Indiana", TEAMS, GAMES), "espn-ncaaf-401858488");
});
Deno.test("match: 'Ohio State at Indiana' (at separator, full name)", () => {
  assertEquals(matchMarketTitleToGame("Ohio State at Indiana", TEAMS, GAMES), "espn-ncaaf-401858488");
});
Deno.test("match: 'NOLA Saints vs NY Giants' resolves, not NY Jets", () => {
  assertEquals(matchMarketTitleToGame("NOLA Saints vs NY Giants", TEAMS, GAMES), "espn-nfl-401873000");
});
Deno.test("match: cross-sport duplicate picks soonest scheduled game", () => {
  const teams = [
    ...TEAMS,
    { id: "espn-ncaab-osu", name: "Ohio State Buckeyes", market: "Ohio State", abbreviation: "OSU" },
    { id: "espn-ncaab-iu", name: "Indiana Hoosiers", market: "Indiana", abbreviation: "IU" },
  ];
  const games = [
    { id: "espn-401825563", home_team_id: "espn-ncaab-osu", away_team_id: "espn-ncaab-iu", status: "scheduled", scheduled_at: "2026-11-20T00:00:00Z" },
    { id: "espn-ncaaf-401858488", home_team_id: "espn-ncaaf-iu", away_team_id: "espn-ncaaf-osu", status: "scheduled", scheduled_at: "2026-10-17T19:00:00Z" },
  ];
  assertEquals(matchMarketTitleToGame("Ohio St. vs Indiana", teams, games), "espn-ncaaf-401858488");
});
Deno.test("match: non-game event title -> null", () => {
  assertEquals(matchMarketTitleToGame("Big East Regular Season: Top 2 Finishers", TEAMS, GAMES), null);
});
Deno.test("match: unknown teams -> null", () => {
  assertEquals(matchMarketTitleToGame("Atlantis vs Narnia", TEAMS, GAMES), null);
});

const MARKET = {
  ticker: "KXNCAAFGAME-26OCT17OSUIND-OSU",
  last_price_dollars: "0.5800",
  yes_bid_dollars: "0.5700",
  yes_ask_dollars: "0.5800",
  no_bid_dollars: "0.4200",
  no_ask_dollars: "0.4300",
};
Deno.test("price: yes side uses bid-ask midpoint over last trade", () => {
  assertEquals(kalshiCurrentPrice(MARKET, "yes"), 0.575);
});
Deno.test("price: no side uses NO book", () => {
  assertEquals(kalshiCurrentPrice(MARKET, "no"), 0.425);
});
Deno.test("price: falls back to last trade when no book", () => {
  assertEquals(kalshiCurrentPrice({ last_price_dollars: "0.51" }, "yes"), 0.51);
  assertEquals(kalshiCurrentPrice({ last_price_dollars: "0.51" }, "no"), 0.49);
});
Deno.test("price: null market -> null", () => {
  assertEquals(kalshiCurrentPrice(null, "yes"), null);
});
Deno.test("pnl: unrealized from live price plus realized", () => {
  assertEquals(computeOpenPnl({ quantity: 2, avgPrice: 0.43, currentPrice: 0.575, realizedPnl: 0 }), 0.29);
});
Deno.test("pnl: no live price keeps realized", () => {
  assertEquals(computeOpenPnl({ quantity: 2, avgPrice: 0.43, currentPrice: null, realizedPnl: 1.5 }), 1.5);
});
