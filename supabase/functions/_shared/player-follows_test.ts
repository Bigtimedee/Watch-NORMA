import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collectGamePlayerNames,
  extractEspnPlayerNames,
  followMatchesGamePlayers,
  normalizePlayerName,
  playerNameMatches,
} from "./player-follows.ts";
import { makeSummaryStats } from "./test-helpers.ts";

Deno.test("normalizePlayerName: lowercases and collapses space", () => {
  assertEquals(normalizePlayerName("  Justin   Jefferson "), "justin jefferson");
});

Deno.test("playerNameMatches: exact lowercase follow vs roster display name", () => {
  assertEquals(playerNameMatches("justin jefferson", "Justin Jefferson"), true);
});

Deno.test("playerNameMatches: first-initial + last name", () => {
  assertEquals(playerNameMatches("j jefferson", "Justin Jefferson"), true);
});

Deno.test("playerNameMatches: rejects different last names", () => {
  assertEquals(playerNameMatches("justin jefferson", "CeeDee Lamb"), false);
});

Deno.test("followMatchesGamePlayers: roster import name hits summary player", () => {
  const names = ["Donovan Clingan", "RJ Davis"];
  assertEquals(followMatchesGamePlayers("donovan clingan", names), true);
  assertEquals(followMatchesGamePlayers("lamar jackson", names), false);
});

Deno.test("extractEspnPlayerNames: reads nested athletes.displayName", () => {
  const payload = {
    players: [
      {
        statistics: [
          {
            athletes: [
              { athlete: { displayName: "Justin Jefferson" } },
              { athlete: { fullName: "CeeDee Lamb" } },
            ],
          },
        ],
      },
    ],
  };
  const names = extractEspnPlayerNames(payload);
  assertEquals(names.includes("Justin Jefferson"), true);
  assertEquals(names.includes("CeeDee Lamb"), true);
});

Deno.test("collectGamePlayerNames: unions summary + ESPN names", () => {
  const summary = makeSummaryStats();
  const espn = {
    players: [
      {
        statistics: [
          { athletes: [{ athlete: { displayName: "Lamar Jackson" } }] },
        ],
      },
    ],
  };
  const names = collectGamePlayerNames(summary, espn);
  assertEquals(names.some((n) => n.includes("Clingan")), true);
  assertEquals(names.includes("Lamar Jackson"), true);
});
