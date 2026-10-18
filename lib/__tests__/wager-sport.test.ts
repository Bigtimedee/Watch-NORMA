import {
  sportFromGameId,
  resolveWagerSport,
  sportForGame,
} from "../wager-sport";

describe("sportFromGameId", () => {
  it("maps espn-ncaaf game ids to ncaaf (regression: wager 3, Ohio State moneyline)", () => {
    expect(sportFromGameId("espn-ncaaf-401858488")).toBe("ncaaf");
  });
  it("maps espn-nfl game ids to nfl", () => {
    expect(sportFromGameId("espn-nfl-401873000")).toBe("nfl");
  });
  it("maps espn-ncaam and espn-ncaab to ncaam", () => {
    expect(sportFromGameId("espn-ncaam-401716280")).toBe("ncaam");
    expect(sportFromGameId("espn-ncaab-401825563")).toBe("ncaam");
  });
  it("maps nba/mlb", () => {
    expect(sportFromGameId("espn-nba-1")).toBe("nba");
    expect(sportFromGameId("espn-mlb-1")).toBe("mlb");
  });
  it("returns null for unprefixed/unknown ids rather than guessing ncaam", () => {
    expect(sportFromGameId("espn-401825563")).toBeNull();
    expect(sportFromGameId("some-uuid")).toBeNull();
    expect(sportFromGameId(null)).toBeNull();
    expect(sportFromGameId(undefined)).toBeNull();
  });
});

describe("resolveWagerSport", () => {
  it("prefers the game's explicit sport over the id prefix", () => {
    expect(resolveWagerSport({ sport: "ncaaf", game_id: "espn-ncaam-1" })).toBe("ncaaf");
  });
  it("falls back to the game-id prefix when no explicit sport", () => {
    expect(resolveWagerSport({ game_id: "espn-ncaaf-401858488" })).toBe("ncaaf");
  });
  it("ignores invalid explicit sport values", () => {
    expect(resolveWagerSport({ sport: "football", game_id: "espn-nfl-1" })).toBe("nfl");
  });
  it("returns null when neither source knows the sport", () => {
    expect(resolveWagerSport({})).toBeNull();
    expect(resolveWagerSport({ game_id: "espn-123" })).toBeNull();
  });
});

describe("sportForGame", () => {
  it("uses game.sport when present (NCAAF game from Game Detail)", () => {
    expect(sportForGame({ id: "espn-ncaaf-401858488", sport: "ncaaf" })).toBe("ncaaf");
  });
  it("derives from the game id when sport is missing", () => {
    expect(sportForGame({ id: "espn-nfl-401873000" })).toBe("nfl");
  });
});
