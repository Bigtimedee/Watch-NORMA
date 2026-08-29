import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchTeamName, matchGame, ambiguousAliases } from "./team-matching.ts";

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

// ---------------------------------------------------------------------------
// NBA team matching
// ---------------------------------------------------------------------------

const NBA_TEAMS = [
  { id: "n1", name: "Los Angeles Lakers", market: "Los Angeles", abbreviation: "LAL" },
  { id: "n2", name: "Los Angeles Clippers", market: "Los Angeles", abbreviation: "LAC" },
  { id: "n3", name: "Golden State Warriors", market: "Golden State", abbreviation: "GSW" },
  { id: "n4", name: "Indiana Pacers", market: "Indiana", abbreviation: "IND" },
  { id: "n5", name: "Portland Trail Blazers", market: "Portland", abbreviation: "POR" },
  { id: "n6", name: "Philadelphia 76ers", market: "Philadelphia", abbreviation: "PHI" },
  { id: "n7", name: "Oklahoma City Thunder", market: "Oklahoma City", abbreviation: "OKC" },
];

Deno.test("NBA: exact full-name match (Tier 100) — Lakers vs Clippers no collision", () => {
  assertEquals(matchTeamName("Los Angeles Lakers", NBA_TEAMS)?.id, "n1");
  assertEquals(matchTeamName("Los Angeles Clippers", NBA_TEAMS)?.id, "n2");
});

Deno.test("NBA: Golden State Warriors direct match", () => {
  assertEquals(matchTeamName("Golden State Warriors", NBA_TEAMS)?.id, "n3");
});

Deno.test("NBA: Portland Trail Blazers direct match", () => {
  assertEquals(matchTeamName("Portland Trail Blazers", NBA_TEAMS)?.id, "n5");
});

Deno.test("NBA alias: Sixers → Philadelphia 76ers", () => {
  assertEquals(matchTeamName("Sixers", NBA_TEAMS)?.id, "n6");
});

// "Blazers" is now flagged ambiguous (UAB Blazers vs Portland Trail Blazers)
// by the collision-detection two-pass build. Cross-sport dbTeams filtering
// happens at the caller layer (poll-odds passes NBA teams only), so bare
// "Blazers" is expected to no longer resolve via aliasMap. The unique form
// "Trail Blazers" still does, which is what odds feeds actually emit.
Deno.test("NBA alias: Trail Blazers → Portland Trail Blazers", () => {
  assertEquals(matchTeamName("Trail Blazers", NBA_TEAMS)?.id, "n5");
});

Deno.test("NBA alias: OKC → Oklahoma City Thunder", () => {
  assertEquals(matchTeamName("OKC", NBA_TEAMS)?.id, "n7");
});

Deno.test("cross-sport: Indiana Pacers wins over Indiana Hoosiers in mixed list", () => {
  // Both NBA Pacers and NCAAB Hoosiers share market "Indiana".
  // When both are in the list, Tier 100 exact match should win.
  const mixed = [
    ...NBA_TEAMS,
    { id: "ncaa_in", name: "Indiana Hoosiers", market: "Indiana", abbreviation: "IU" },
  ];
  assertEquals(matchTeamName("Indiana Pacers", mixed)?.id, "n4");
});

Deno.test("cross-sport: Indiana Hoosiers wins over Indiana Pacers in mixed list", () => {
  const mixed = [
    ...NBA_TEAMS,
    { id: "ncaa_in", name: "Indiana Hoosiers", market: "Indiana", abbreviation: "IU" },
  ];
  assertEquals(matchTeamName("Indiana Hoosiers", mixed)?.id, "ncaa_in");
});

// ---------------------------------------------------------------------------
// MLB team matching
// ---------------------------------------------------------------------------

const MLB_TEAMS = [
  { id: "m1", name: "New York Yankees", market: "New York", abbreviation: "NYY" },
  { id: "m2", name: "New York Mets", market: "New York", abbreviation: "NYM" },
  { id: "m3", name: "Arizona Diamondbacks", market: "Arizona", abbreviation: "ARI" },
  { id: "m4", name: "Boston Red Sox", market: "Boston", abbreviation: "BOS" },
  { id: "m5", name: "Los Angeles Dodgers", market: "Los Angeles", abbreviation: "LAD" },
  { id: "m6", name: "Los Angeles Angels", market: "Los Angeles", abbreviation: "LAA" },
  { id: "m7", name: "St. Louis Cardinals", market: "St. Louis", abbreviation: "STL" },
];

Deno.test("MLB: New York Yankees vs Mets — no collision (Tier 100)", () => {
  assertEquals(matchTeamName("New York Yankees", MLB_TEAMS)?.id, "m1");
  assertEquals(matchTeamName("New York Mets", MLB_TEAMS)?.id, "m2");
});

Deno.test("MLB: Los Angeles Dodgers vs Angels — no collision (Tier 100)", () => {
  assertEquals(matchTeamName("Los Angeles Dodgers", MLB_TEAMS)?.id, "m5");
  assertEquals(matchTeamName("Los Angeles Angels", MLB_TEAMS)?.id, "m6");
});

Deno.test("MLB: Boston Red Sox direct match", () => {
  assertEquals(matchTeamName("Boston Red Sox", MLB_TEAMS)?.id, "m4");
});

Deno.test("MLB alias: D-backs → Arizona Diamondbacks", () => {
  assertEquals(matchTeamName("D-backs", MLB_TEAMS)?.id, "m3");
});

Deno.test("MLB alias: St Louis Cardinals → St. Louis Cardinals", () => {
  assertEquals(matchTeamName("St Louis Cardinals", MLB_TEAMS)?.id, "m7");
});

Deno.test("MLB alias: LA Dodgers → Los Angeles Dodgers", () => {
  assertEquals(matchTeamName("LA Dodgers", MLB_TEAMS)?.id, "m5");
});

// ─── FX5a: NCAAF ambiguous-mascot regression suite (H-4) ────────────────────
// TEAM_ALIASES lists mascots ("Tigers", "Bulldogs", "Cougars", "Spartans")
// against multiple canonical schools. Prior to FX5a the alias map was
// last-write-wins, so an odds event that said "Tigers" resolved to whichever
// school happened to appear latest in the source file. The two-pass build
// now detects these collisions and refuses to auto-resolve — the scored
// matching path uses school/market names to disambiguate.

Deno.test("ambiguous-alias detection: 'Bulldogs' is flagged (LSU, UNC Asheville, Fresno State, Miss State)", () => {
  assertEquals(ambiguousAliases.has("bulldogs"), true);
});

Deno.test("ambiguous-alias detection: 'Cougars' is flagged (BYU, Washington State)", () => {
  assertEquals(ambiguousAliases.has("cougars"), true);
});

Deno.test("ambiguous-alias detection: 'Spartans' is flagged (Michigan State, UNC Greensboro)", () => {
  assertEquals(ambiguousAliases.has("spartans"), true);
});

Deno.test("unique alias still resolves (Ole Miss 'Rebels' — only Mississippi)", () => {
  const teams = [
    { id: "u1", name: "Mississippi Rebels", market: "Mississippi", abbreviation: "MISS" },
    { id: "u2", name: "Louisiana State Tigers", market: "Louisiana State", abbreviation: "LSU" },
  ];
  assertEquals(matchTeamName("Rebels", teams)?.id, "u1");
});

Deno.test("scored match still finds LSU when full name is given, even though 'Tigers' alone is ambiguous", () => {
  const teams = [
    { id: "u1", name: "Louisiana State Tigers", market: "Louisiana State", abbreviation: "LSU" },
    { id: "u2", name: "Auburn Tigers", market: "Auburn", abbreviation: "AUB" },
  ];
  assertEquals(matchTeamName("Louisiana State", teams)?.id, "u1");
  assertEquals(matchTeamName("LSU", teams)?.id, "u1");
});
