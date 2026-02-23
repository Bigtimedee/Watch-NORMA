import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseWagerTarget } from "./wager-target-parser.ts";

// ─── Player Over/Under Pattern ───

Deno.test("parser: 'Anthony Edwards Over 27.5 Points'", () => {
  const result = parseWagerTarget("Anthony Edwards Over 27.5 Points");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.player_name, "Anthony Edwards");
  assertEquals(result?.stat_type, "points");
  assertEquals(result?.line, 27.5);
  assertEquals(result?.is_over, true);
});

Deno.test("parser: 'Donovan Clingan Under 8.5 Rebounds'", () => {
  const result = parseWagerTarget("Donovan Clingan Under 8.5 Rebounds");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.player_name, "Donovan Clingan");
  assertEquals(result?.stat_type, "rebounds");
  assertEquals(result?.line, 8.5);
  assertEquals(result?.is_over, false);
});

Deno.test("parser: 'RJ Davis Over 5.5 Assists'", () => {
  const result = parseWagerTarget("RJ Davis Over 5.5 Assists");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.player_name, "RJ Davis");
  assertEquals(result?.stat_type, "assists");
  assertEquals(result?.line, 5.5);
  assertEquals(result?.is_over, true);
});

Deno.test("parser: 'Jared McCain Over 2.5 3-Pointers'", () => {
  const result = parseWagerTarget("Jared McCain Over 2.5 3-Pointers");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.stat_type, "three_pointers");
  assertEquals(result?.line, 2.5);
});

Deno.test("parser: 'Zach Edey Over 1.5 Blocks'", () => {
  const result = parseWagerTarget("Zach Edey Over 1.5 Blocks");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.stat_type, "blocks");
  assertEquals(result?.line, 1.5);
});

// ─── Kalshi-Style Pattern ───

Deno.test("parser: Kalshi 'Anthony Edwards scores 27+ points'", () => {
  const result = parseWagerTarget("Anthony Edwards scores 27+ points");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.player_name, "Anthony Edwards");
  assertEquals(result?.stat_type, "points");
  assertEquals(result?.line, 27);
  assertEquals(result?.is_over, true);
});

Deno.test("parser: Kalshi 'RJ Davis scores 20 points'", () => {
  const result = parseWagerTarget("RJ Davis scores 20 points");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.player_name, "RJ Davis");
  assertEquals(result?.line, 20);
});

// ─── Game Total Pattern ───

Deno.test("parser: 'Total Over 145.5'", () => {
  const result = parseWagerTarget("Total Over 145.5");
  assertEquals(result?.target_type, "game_total");
  assertEquals(result?.line, 145.5);
  assertEquals(result?.is_over, true);
});

Deno.test("parser: 'Total Under 138'", () => {
  const result = parseWagerTarget("Total Under 138");
  assertEquals(result?.target_type, "game_total");
  assertEquals(result?.line, 138);
  assertEquals(result?.is_over, false);
});

// ─── Spread Pattern ───

Deno.test("parser: 'Duke -3.5'", () => {
  const result = parseWagerTarget("Duke -3.5");
  assertEquals(result?.target_type, "spread");
  assertEquals(result?.line, -3.5);
});

Deno.test("parser: 'UNC +5.5'", () => {
  const result = parseWagerTarget("UNC +5.5");
  assertEquals(result?.target_type, "spread");
  assertEquals(result?.line, 5.5);
});

// ─── Null / Unparseable ───

Deno.test("parser: returns null for empty string", () => {
  assertEquals(parseWagerTarget(""), null);
});

Deno.test("parser: returns null for unparseable description", () => {
  assertEquals(parseWagerTarget("Go Blue Devils!"), null);
});

Deno.test("parser: returns null for just a team name", () => {
  assertEquals(parseWagerTarget("Duke"), null);
});

// ─── Abbreviated stat keywords ───

Deno.test("parser: 'Clingan Over 15.5 pts'", () => {
  const result = parseWagerTarget("Clingan Over 15.5 pts");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.stat_type, "points");
  assertEquals(result?.line, 15.5);
});

Deno.test("parser: 'Davis O 5.5 reb'", () => {
  const result = parseWagerTarget("Davis O 5.5 reb");
  assertEquals(result?.target_type, "player_stat");
  assertEquals(result?.stat_type, "rebounds");
  assertEquals(result?.is_over, true);
});
