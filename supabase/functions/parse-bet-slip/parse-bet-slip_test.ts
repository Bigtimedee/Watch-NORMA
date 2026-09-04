// parse-bet-slip_test.ts — assert the live prompt (not a copied excerpt)
// recognizes PrizePicks / Underdog pick'em slips.

import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("parse-bet-slip prompt: includes prizepicks in sportsbook enumeration", () => {
  assertStringIncludes(src, "prizepicks");
});

Deno.test("parse-bet-slip prompt: includes underdog in sportsbook enumeration", () => {
  assertStringIncludes(src, "underdog");
});

Deno.test("parse-bet-slip prompt: preserves original sportsbooks", () => {
  for (const book of ["draftkings", "fanduel", "betmgm", "espnbet", "caesars"]) {
    assertStringIncludes(src, book);
  }
});

Deno.test("parse-bet-slip prompt: asks for pick'em legs and entry fee", () => {
  assertStringIncludes(src, "entry_fee");
  assertStringIncludes(src, "payout_multiplier");
  assertStringIncludes(src, "legs");
  assertStringIncludes(src, "player_name");
});
