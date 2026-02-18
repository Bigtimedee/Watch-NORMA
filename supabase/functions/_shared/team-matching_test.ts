import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchTeamName, matchGame } from "./team-matching.ts";

const DB_TEAMS = [
  { id: "t1", name: "Connecticut Huskies", market: "Connecticut", abbreviation: "CONN" },
  { id: "t2", name: "North Carolina Tar Heels", market: "North Carolina", abbreviation: "UNC" },
  { id: "t3", name: "Mississippi Rebels", market: "Mississippi", abbreviation: "MISS" },
  { id: "t4", name: "St. John's Red Storm", market: "St. John's", abbreviation: "SJU" },
  { id: "t5", name: "Duke Blue Devils", market: "Duke", abbreviation: "DUKE" },
  { id: "t6", name: "Brigham Young Cougars", market: "Brigham Young", abbreviation: "BYU" },
];

// ─── Direct match ───

Deno.test("matchTeamName: direct name match", () => {
  const result = matchTeamName("Duke Blue Devils", DB_TEAMS);
  assertEquals(result?.id, "t5");
});

Deno.test("matchTeamName: abbreviation match", () => {
  const result = matchTeamName("DUKE", DB_TEAMS);
  assertEquals(result?.id, "t5");
});

Deno.test("matchTeamName: market match", () => {
  const result = matchTeamName("Duke", DB_TEAMS);
  assertEquals(result?.id, "t5");
});

// ─── Alias match ───

Deno.test("matchTeamName: UConn → Connecticut", () => {
  const result = matchTeamName("UConn", DB_TEAMS);
  assertEquals(result?.id, "t1");
});

Deno.test("matchTeamName: Ole Miss → Mississippi", () => {
  const result = matchTeamName("Ole Miss", DB_TEAMS);
  assertEquals(result?.id, "t3");
});

Deno.test("matchTeamName: UNC → North Carolina", () => {
  const result = matchTeamName("UNC", DB_TEAMS);
  assertEquals(result?.id, "t2");
});

Deno.test("matchTeamName: BYU → Brigham Young", () => {
  const result = matchTeamName("BYU", DB_TEAMS);
  assertEquals(result?.id, "t6");
});

// ─── St./Saint normalization ───

Deno.test("matchTeamName: Saint John's → St. John's", () => {
  const result = matchTeamName("Saint John's", DB_TEAMS);
  assertEquals(result?.id, "t4");
});

// ─── Market substring match ───

Deno.test("matchTeamName: Sportradar format 'Connecticut Huskies' match", () => {
  const result = matchTeamName("Connecticut Huskies", DB_TEAMS);
  assertEquals(result?.id, "t1");
});

// ─── Unknown team ───

Deno.test("matchTeamName: unknown team → null", () => {
  const result = matchTeamName("Atlantis Dolphins", DB_TEAMS);
  assertEquals(result, null);
});

// ─── matchGame ───

Deno.test("matchGame: finds game by team pair", () => {
  const games = [
    { id: "g1", home_team_id: "t5", away_team_id: "t2", status: "inprogress" },
  ];
  const result = matchGame("Duke", "North Carolina", DB_TEAMS, games);
  assertEquals(result, "g1");
});

Deno.test("matchGame: no match when teams not found", () => {
  const games = [
    { id: "g1", home_team_id: "t5", away_team_id: "t2", status: "inprogress" },
  ];
  const result = matchGame("Atlantis", "Narnia", DB_TEAMS, games);
  assertEquals(result, null);
});
