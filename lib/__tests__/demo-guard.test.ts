import {
  ALERTS_QUERY_ROOT,
  alertsQueryKey,
  applyConsumerAlertFilter,
  applyConsumerGameIdFilter,
  DEMO_ALERT_GAME_ID_OR,
  DEMO_ALERT_TITLE_ILIKE,
  DEMO_FILTER_VERSION,
  DEMO_GAME_ID_LIKE,
  excludeDemoAlerts,
  excludeDemoGames,
  followedGamesQueryKey,
  FOLLOWED_GAMES_QUERY_ROOT,
  gameDetailQueryKey,
  GAME_DETAIL_QUERY_ROOT,
  gamesQueryKey,
  GAMES_QUERY_ROOT,
  isDemoAlert,
  isDemoAlertTitle,
  isDemoGameId,
} from "../demo-guard";

describe("isDemoGameId", () => {
  it("matches screenshot-seeded ids from the 2026-09-05 incident", () => {
    expect(isDemoGameId("demo-ncaaf-clem-lsu-20260905")).toBe(true);
    expect(isDemoGameId("demo-nfl-sf-lar-20260910")).toBe(true);
    expect(isDemoGameId("demo-ncaaf-slate-20260905")).toBe(true);
  });

  it("is case-insensitive on the demo- prefix", () => {
    expect(isDemoGameId("DEMO-ncaaf-clem-lsu-20260905")).toBe(true);
    expect(isDemoGameId("Demo-NFL-sf-lar")).toBe(true);
  });

  it("does not treat real ESPN games as demo", () => {
    expect(isDemoGameId("espn-ncaaf-401856660")).toBe(false);
    expect(isDemoGameId("espn-nfl-401772829")).toBe(false);
    expect(isDemoGameId("espn-ncaam-401716280")).toBe(false);
  });

  it("does not match local seed.sql ids or other prefixes", () => {
    expect(isDemoGameId("game-1")).toBe(false);
    expect(isDemoGameId("sdio-10001")).toBe(false);
    expect(isDemoGameId("not-demo-game")).toBe(false);
    expect(isDemoGameId("xdemo-ncaaf")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isDemoGameId(null)).toBe(false);
    expect(isDemoGameId(undefined)).toBe(false);
    expect(isDemoGameId("")).toBe(false);
  });
});

describe("isDemoAlert / isDemoAlertTitle", () => {
  it("matches DEMO SCREENSHOT titles from the incident", () => {
    expect(isDemoAlertTitle("DEMO SCREENSHOT — Clemson vs LSU")).toBe(true);
    expect(isDemoAlertTitle("demo screenshot — live look")).toBe(true);
    expect(
      isDemoAlert({
        game_id: "espn-ncaaf-401856660",
        title: "DEMO SCREENSHOT — tune in",
      })
    ).toBe(true);
  });

  it("matches alerts linked to a demo game id even without the title marker", () => {
    expect(
      isDemoAlert({
        game_id: "demo-ncaaf-clem-lsu-20260905",
        title: "Clemson / LSU is live",
      })
    ).toBe(true);
  });

  it("keeps real consumer alerts", () => {
    expect(
      isDemoAlert({
        game_id: "espn-ncaaf-401856660",
        title: "Your spread is live",
      })
    ).toBe(false);
    expect(
      isDemoAlert({
        game_id: null,
        title: "Wager imported from email",
      })
    ).toBe(false);
  });
});

describe("excludeDemoGames / excludeDemoAlerts", () => {
  it("drops demo games and keeps ESPN rows", () => {
    const kept = excludeDemoGames([
      { id: "espn-ncaaf-401856660" },
      { id: "demo-ncaaf-clem-lsu-20260905" },
      { id: "espn-nfl-401772829" },
    ]);
    expect(kept.map((g) => g.id)).toEqual([
      "espn-ncaaf-401856660",
      "espn-nfl-401772829",
    ]);
  });

  it("drops demo-linked and screenshot-titled alerts", () => {
    const kept = excludeDemoAlerts([
      { game_id: "espn-ncaaf-401856660", title: "Close game" },
      { game_id: "demo-nfl-sf-lar-20260910", title: "Red zone" },
      { game_id: "espn-nfl-1", title: "DEMO SCREENSHOT — fake" },
      { game_id: null, title: "Wager imported" },
    ]);
    expect(kept).toEqual([
      { game_id: "espn-ncaaf-401856660", title: "Close game" },
      { game_id: null, title: "Wager imported" },
    ]);
  });
});

describe("applyConsumerGameIdFilter / applyConsumerAlertFilter", () => {
  it("applies PostgREST exclusion for demo game ids", () => {
    const query = {
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
    };
    applyConsumerGameIdFilter(query);
    expect(query.not).toHaveBeenCalledWith("id", "ilike", DEMO_GAME_ID_LIKE);
    expect(query.or).not.toHaveBeenCalled();
  });

  it("applies title + game_id exclusion for alerts", () => {
    const query = {
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
    };
    applyConsumerAlertFilter(query);
    expect(query.not).toHaveBeenCalledWith(
      "title",
      "ilike",
      DEMO_ALERT_TITLE_ILIKE
    );
    expect(query.or).toHaveBeenCalledWith(DEMO_ALERT_GAME_ID_OR);
  });
});

describe("React Query key bust (OTA / 30s poll)", () => {
  it("versions games and alerts keys so pre-filter caches are discarded", () => {
    expect(DEMO_FILTER_VERSION).toBe(2);
    expect(GAMES_QUERY_ROOT).toBe("games-v2");
    expect(ALERTS_QUERY_ROOT).toBe("alerts-v2");
    expect(gamesQueryKey("2026-09-05", "ncaaf")).toEqual([
      "games-v2",
      2,
      "2026-09-05",
      "ncaaf",
    ]);
    expect(alertsQueryKey("all")).toEqual(["alerts-v2", 2, "all"]);
    expect(alertsQueryKey("unread-count")).toEqual([
      "alerts-v2",
      2,
      "unread-count",
    ]);
    expect(followedGamesQueryKey()).toEqual([FOLLOWED_GAMES_QUERY_ROOT, 2]);
    expect(gameDetailQueryKey("espn-ncaaf-401856660")).toEqual([
      GAME_DETAIL_QUERY_ROOT,
      2,
      "espn-ncaaf-401856660",
    ]);
  });

  it("does not collide with pre-incident keys", () => {
    expect(gamesQueryKey("2026-09-05", "all")[0]).not.toBe("games");
    expect(alertsQueryKey("all")[0]).not.toBe("alerts");
    expect(followedGamesQueryKey()[0]).not.toBe("followed-games");
    expect(gameDetailQueryKey("espn-ncaaf-401856660")[0]).not.toBe("game");
  });
});
