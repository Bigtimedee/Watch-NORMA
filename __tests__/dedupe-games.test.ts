import { dedupeGames, isSameGame } from "../lib/dedupe-games";

// Regression for P0 2026-11-03: the same NCAAM game ingested by the SportsDataIO
// path (sdio-*) and the ESPN fallback path (espn-*) showed twice on the Games tab.
const sdio = {
  id: "sdio-73530", sport: "ncaam", status: "scheduled", scheduled_at: "2026-11-03T23:00:00Z",
  updated_at: "2026-10-29T04:00:25Z", home_team_id: "sdio-277", away_team_id: "sdio-285",
  home_team: { name: "Tennessee Volunteers", market: "Tennessee" }, away_team: { name: "Wofford Terriers", market: "Wofford" },
};
const espn = {
  ...sdio, id: "espn-401906848", updated_at: "2026-11-03T19:30:02Z", home_team_id: "espn-ncaaf-tenn",
};

describe("dedupeGames", () => {
  it("collapses the same game ingested twice from both sources to one", () => {
    const out = dedupeGames([sdio, espn, { ...sdio }, { ...espn }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("espn-401906848"); // freshest row wins
  });

  it("matches when only one side's team name agrees (UNCG vs UNC Greensboro)", () => {
    const a = { ...sdio, id: "sdio-78331", home_team_id: "x", away_team_id: "m1", home_team: { name: "UNCG Spartans" }, away_team: { name: "Milligan Buffaloes" } };
    const b = { ...a, id: "espn-401926180", home_team_id: "y", away_team_id: "m2", home_team: { name: "UNC Greensboro Spartans" } };
    expect(dedupeGames([a, b])).toHaveLength(1);
  });

  it("never merges two rows from the same source (MLB doubleheader, shared opponent)", () => {
    const g1 = { ...espn, id: "espn-mlb-1", sport: "mlb" };
    const g2 = { ...espn, id: "espn-mlb-2", sport: "mlb" };
    expect(isSameGame(g1, g2)).toBe(false);
    expect(dedupeGames([g1, g2])).toHaveLength(2);
  });

  it("keeps different games at the same time apart", () => {
    const other = { ...espn, id: "espn-1", home_team_id: "a", away_team_id: "b", home_team: { name: "Kentucky Wildcats", market: "Kentucky" }, away_team: { name: "Manhattan Jaspers" } };
    expect(dedupeGames([sdio, other])).toHaveLength(2);
  });
});
