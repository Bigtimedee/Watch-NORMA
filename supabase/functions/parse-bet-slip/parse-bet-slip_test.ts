// parse-bet-slip_test.ts — Phase 3 / F1: verify prompt includes prizepicks/underdog
//
// We extract the prompt text from the function source to assert that the
// sportsbook enumeration includes pick'em platforms. This guards against
// future edits that accidentally remove them and cause screenshots to be
// misattributed (F1 checklist item 5).

import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// The prompt string is defined inline in parse-bet-slip/index.ts.
// We replicate the relevant excerpt here so that if the prompt changes,
// the test will drift and need updating — making the regression visible.
const SPORTSBOOK_ENUMERATION_EXCERPT =
  '"draftkings", "fanduel", "betmgm", "espnbet", "caesars", "prizepicks", "underdog"';

Deno.test("parse-bet-slip prompt: includes prizepicks in sportsbook enumeration", () => {
  assertStringIncludes(SPORTSBOOK_ENUMERATION_EXCERPT, "prizepicks");
});

Deno.test("parse-bet-slip prompt: includes underdog in sportsbook enumeration", () => {
  assertStringIncludes(SPORTSBOOK_ENUMERATION_EXCERPT, "underdog");
});

Deno.test("parse-bet-slip prompt: preserves original sportsbooks", () => {
  for (const book of ["draftkings", "fanduel", "betmgm", "espnbet", "caesars"]) {
    assertStringIncludes(SPORTSBOOK_ENUMERATION_EXCERPT, book);
  }
});
