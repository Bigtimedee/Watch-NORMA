/**
 * FF-01 — Fantasy Roster Import
 * Unit tests for parseRosterInput and the resulting follow shapes.
 */

import { parseRosterInput, buildRosterFollowRows } from "../roster-import";

// ─── parseRosterInput ───────────────────────────────────────────────────────

describe("parseRosterInput", () => {
  it("returns an empty array for empty input", () => {
    expect(parseRosterInput("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(parseRosterInput("   \n  \n  ")).toEqual([]);
  });

  it("parses a single player name", () => {
    expect(parseRosterInput("Jaylen Brown")).toEqual(["Jaylen Brown"]);
  });

  it("parses five player names from newline-delimited input", () => {
    const input = "Jaylen Brown\nDerrick White\nJayson Tatum\nAl Horford\nPayton Pritchard";
    const result = parseRosterInput(input);
    expect(result).toHaveLength(5);
    expect(result).toEqual([
      "Jaylen Brown",
      "Derrick White",
      "Jayson Tatum",
      "Al Horford",
      "Payton Pritchard",
    ]);
  });

  it("trims leading and trailing whitespace from each name", () => {
    const input = "  Jaylen Brown  \n  Derrick White\nJayson Tatum  ";
    const result = parseRosterInput(input);
    expect(result).toEqual(["Jaylen Brown", "Derrick White", "Jayson Tatum"]);
  });

  it("skips blank lines between players", () => {
    const input = "Jaylen Brown\n\nDerrick White\n\n\nJayson Tatum";
    const result = parseRosterInput(input);
    expect(result).toHaveLength(3);
  });
});

// ─── buildRosterFollowRows ──────────────────────────────────────────────────

describe("buildRosterFollowRows (roster import follow shapes)", () => {
  const USER_ID = "test-user-uuid";

  it("produces one follow row per player name", () => {
    const names = parseRosterInput(
      "Jaylen Brown\nDerrick White\nJayson Tatum\nAl Horford\nPayton Pritchard"
    );
    const rows = buildRosterFollowRows(names, USER_ID);
    expect(rows).toHaveLength(5);
  });

  it("sets entity_type to 'player' for all rows", () => {
    const names = parseRosterInput("Jaylen Brown\nDerrick White\nJayson Tatum");
    const rows = buildRosterFollowRows(names, USER_ID);
    for (const row of rows) {
      expect(row.entity_type).toBe("player");
    }
  });

  it("sets follow_type to 'player' for all rows", () => {
    const names = parseRosterInput("Jaylen Brown\nDerrick White");
    const rows = buildRosterFollowRows(names, USER_ID);
    for (const row of rows) {
      expect(row.follow_type).toBe("player");
    }
  });

  it("lowercases and trims entity_id for each player", () => {
    const names = parseRosterInput("Jaylen Brown\nJayson Tatum");
    const rows = buildRosterFollowRows(names, USER_ID);
    expect(rows[0].entity_id).toBe("jaylen brown");
    expect(rows[1].entity_id).toBe("jayson tatum");
  });

  it("sets source to 'fantasy' on every row", () => {
    const names = parseRosterInput(
      "Jaylen Brown\nDerrick White\nJayson Tatum\nAl Horford\nPayton Pritchard"
    );
    const rows = buildRosterFollowRows(names, USER_ID);
    for (const row of rows) {
      expect(row.source).toBe("fantasy");
    }
  });

  it("attaches the correct user_id to every row", () => {
    const names = parseRosterInput("Jaylen Brown");
    const rows = buildRosterFollowRows(names, USER_ID);
    expect(rows[0].user_id).toBe(USER_ID);
  });
});
