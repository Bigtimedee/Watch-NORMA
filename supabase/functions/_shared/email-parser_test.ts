import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectSportsbook, parseEmailWagers } from "./email-parser.ts";

Deno.test("detectSportsbook: prizepicks.com → prizepicks", () => {
  assertEquals(detectSportsbook("PrizePicks <noreply@prizepicks.com>"), "prizepicks");
});

Deno.test("detectSportsbook: underdogfantasy.com → underdog", () => {
  assertEquals(
    detectSportsbook("Underdog <hello@underdogfantasy.com>"),
    "underdog",
  );
});

Deno.test("detectSportsbook: underdog.com → underdog", () => {
  assertEquals(detectSportsbook("alerts@underdog.com"), "underdog");
});

Deno.test("detectSportsbook: betrivers.com → betrivers (BetRivers regression)", () => {
  assertEquals(detectSportsbook("hello@betrivers.com"), "betrivers");
  assertEquals(detectSportsbook("BetRivers <noreply@betrivers.com>"), "betrivers");
  assertEquals(detectSportsbook("alerts@sports.betrivers.com"), "betrivers");
});

Deno.test("detectSportsbook: Betr Picks sender is unmapped until a fixture exists", () => {
  // Do not invent betr.app. A bare "betr" token must not steal BetRivers.
  assertEquals(detectSportsbook("noreply@betr.app"), null);
  assertEquals(detectSportsbook("support@betr.app"), null);
  assertEquals(detectSportsbook("Betr Picks <hello@betr.app>"), null);
  assertEquals(detectSportsbook("betr"), null);
});

const PRIZEPICKS_FIXTURE = `
Your PrizePicks entry is locked.

Justin Jefferson  More  89.5  Receiving Yards
CeeDee Lamb  Less  6.5  Receptions
Lamar Jackson  More  224.5  Passing Yards

Entry: $20
Payout: $130
`;

Deno.test("parseEmailWagers: PrizePicks fixture extracts player_prop legs", async () => {
  const wagers = await parseEmailWagers(
    "noreply@prizepicks.com",
    "Your PrizePicks entry is in",
    PRIZEPICKS_FIXTURE,
  );
  assertEquals(wagers.length >= 1, true);
  assertEquals(wagers[0].provider_key, "prizepicks");
  assertEquals(wagers[0].market_type, "player_prop");
  assertEquals((wagers[0].legs?.length ?? 0) >= 3, true);
  assertEquals(wagers[0].stake, 20);
});

const UNDERDOG_FIXTURE = `
Your picks are locked.

Ja'Marr Chase  More  82.5  Receiving Yards
Saquon Barkley  Over  78.5  Rushing Yards

Entry: $10
Potential: $50
`;

Deno.test("parseEmailWagers: Underdog fixture extracts player_prop legs", async () => {
  const wagers = await parseEmailWagers(
    "hello@underdogfantasy.com",
    "Your picks are locked",
    UNDERDOG_FIXTURE,
  );
  assertEquals(wagers.length >= 1, true);
  assertEquals(wagers[0].provider_key, "underdog");
  assertEquals(wagers[0].market_type, "player_prop");
  assertEquals((wagers[0].legs?.length ?? 0) >= 2, true);
});
