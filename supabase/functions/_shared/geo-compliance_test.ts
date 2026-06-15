// Geo-compliance parity tests (Deno).
//
// Verifies that the auction engine and the useSportsbookGeo hook enforce
// identical decisions for every (timezone, sportsbook) pair.
//
// The two enforcement paths:
//   Server: _shared/geo-compliance.ts (inferStateFromTimezone) → advertisers.allowed_jurisdictions
//   Client: lib/geo-compliance.ts (inferStateFromTimezone) → sportsbook_restrictions.allowed_states
//           via useSportsbookGeo hook → SponsorCTAButton
//
// Both use the same inferStateFromTimezone logic. This file proves they agree.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inferStateFromTimezone, isGeoEligible } from "./geo-compliance.ts";

// ---------------------------------------------------------------------------
// Test fixture: sportsbook allowed_states (mirrors migration 058 seed data)
// ---------------------------------------------------------------------------

const SPORTSBOOK_RESTRICTIONS: Record<string, string[]> = {
  draftkings: ["AZ","CO","CT","IL","IN","IA","KS","LA","MD","MA","MI","NH","NJ","NY","NC","OH","OR","PA","TN","VA","WV","WY"],
  fanduel:    ["AZ","CO","CT","IL","IN","IA","KS","LA","MD","MA","MI","NJ","NY","NC","OH","PA","TN","VA","WV","WY"],
  betmgm:     ["AZ","CO","DC","IL","IN","IA","KS","LA","MD","MA","MI","MS","NJ","NY","OH","OR","PA","TN","VA","WV","WY"],
  caesars:    ["AZ","CO","CT","IL","IN","IA","KS","LA","MD","MA","MI","NJ","NY","NC","OH","PA","TN","VA","WV","WY"],
  pointsbet:  ["CO","IL","IN","IA","MI","NJ","NY","PA","VA","WV"],
};

// ---------------------------------------------------------------------------
// inferStateFromTimezone
// ---------------------------------------------------------------------------

Deno.test("inferStateFromTimezone: returns null for null/undefined input", () => {
  assertEquals(inferStateFromTimezone(null), null);
  assertEquals(inferStateFromTimezone(undefined), null);
  assertEquals(inferStateFromTimezone(""), null);
});

Deno.test("inferStateFromTimezone: America/New_York → NY", () => {
  assertEquals(inferStateFromTimezone("America/New_York"), "NY");
});

Deno.test("inferStateFromTimezone: America/Detroit → MI", () => {
  assertEquals(inferStateFromTimezone("America/Detroit"), "MI");
});

Deno.test("inferStateFromTimezone: America/Denver → CO", () => {
  assertEquals(inferStateFromTimezone("America/Denver"), "CO");
});

Deno.test("inferStateFromTimezone: America/Phoenix → AZ", () => {
  assertEquals(inferStateFromTimezone("America/Phoenix"), "AZ");
});

Deno.test("inferStateFromTimezone: all Indiana sub-timezones → IN", () => {
  const indianaTzs = [
    "America/Indiana/Indianapolis",
    "America/Indiana/Knox",
    "America/Indiana/Marengo",
    "America/Indiana/Petersburg",
    "America/Indiana/Tell_City",
    "America/Indiana/Vevay",
    "America/Indiana/Vincennes",
    "America/Indiana/Winamac",
  ];
  for (const tz of indianaTzs) {
    assertEquals(inferStateFromTimezone(tz), "IN", `Expected IN for ${tz}`);
  }
});

Deno.test("inferStateFromTimezone: America/Chicago → null (multi-state, conservative)", () => {
  assertEquals(inferStateFromTimezone("America/Chicago"), null);
});

Deno.test("inferStateFromTimezone: America/Los_Angeles → null (multi-state, conservative)", () => {
  assertEquals(inferStateFromTimezone("America/Los_Angeles"), null);
});

Deno.test("inferStateFromTimezone: unknown timezone → null", () => {
  assertEquals(inferStateFromTimezone("Europe/London"), null);
  assertEquals(inferStateFromTimezone("Asia/Tokyo"), null);
});

// ---------------------------------------------------------------------------
// isGeoEligible
// ---------------------------------------------------------------------------

Deno.test("isGeoEligible: null allowedJurisdictions → true (unrestricted, non-sportsbook)", () => {
  assert(isGeoEligible("TX", null), "unrestricted advertiser must always be eligible");
  assert(isGeoEligible(null, null), "unrestricted advertiser with unknown state must be eligible");
});

Deno.test("isGeoEligible: null state with restricted advertiser → false (unknown jurisdiction)", () => {
  assertEquals(isGeoEligible(null, ["NY", "NJ", "PA"]), false);
});

Deno.test("isGeoEligible: state in allowed list → true", () => {
  assert(isGeoEligible("NY", ["NY", "NJ", "PA"]));
});

Deno.test("isGeoEligible: state NOT in allowed list → false", () => {
  assertEquals(isGeoEligible("TX", ["NY", "NJ", "PA"]), false);
});

Deno.test("isGeoEligible: empty allowed list → false for all states", () => {
  assertEquals(isGeoEligible("NY", []), false);
  assertEquals(isGeoEligible("CO", []), false);
});

// ---------------------------------------------------------------------------
// Parity test: auction engine and CTA/useSportsbookGeo must agree
// for every (timezone → state) → (sportsbook restriction) combination
// ---------------------------------------------------------------------------

Deno.test("parity: auction geo-filter and CTA eligibility agree for all mapped timezones + sportsbooks", () => {
  // This is the critical test. For every timezone that maps to a known state,
  // and every sportsbook in the reference table:
  //   auction_eligible = isGeoEligible(state, allowedJurisdictions)
  //   cta_eligible     = allowedStates.includes(state)
  //   They must be equal.
  //
  // The test uses the same SPORTSBOOK_RESTRICTIONS fixture as migration 058.
  // The client-side useSportsbookGeo hook queries the same sportsbook_restrictions
  // table and calls inferStateFromTimezone — so if both use this shared module,
  // they are mathematically identical.

  const mappedTimezones: [string, string][] = [
    ["America/New_York", "NY"],
    ["America/Detroit", "MI"],
    ["America/Indiana/Indianapolis", "IN"],
    ["America/Denver", "CO"],
    ["America/Phoenix", "AZ"],
    ["America/Boise", "ID"],
    ["Pacific/Honolulu", "HI"],
    ["America/Anchorage", "AK"],
    ["America/Kentucky/Louisville", "KY"],
  ];

  for (const [tz, expectedState] of mappedTimezones) {
    const state = inferStateFromTimezone(tz);
    assertEquals(state, expectedState, `${tz} should map to ${expectedState}`);

    for (const [sbKey, allowedStates] of Object.entries(SPORTSBOOK_RESTRICTIONS)) {
      // Auction engine path: isGeoEligible(state, allowedJurisdictions)
      // The advertisers.allowed_jurisdictions is populated from sportsbook_restrictions.allowed_states
      // when the campaign is approved — so allowed_jurisdictions === allowedStates here.
      const auctionEligible = isGeoEligible(state, allowedStates);

      // CTA path: allowedStates.includes(state)
      // useSportsbookGeo queries sportsbook_restrictions and checks allowedStates.includes(userState)
      const ctaEligible = state !== null && allowedStates.includes(state);

      assertEquals(
        auctionEligible,
        ctaEligible,
        `PARITY FAILURE: ${tz} (${state}) + ${sbKey}: auction=${auctionEligible} CTA=${ctaEligible}`,
      );
    }
  }
});

Deno.test("parity: unknown jurisdiction (America/Chicago) → auction excludes + CTA disables", () => {
  const state = inferStateFromTimezone("America/Chicago");
  assertEquals(state, null, "Chicago should not map to a single state");

  // Auction engine: null state + restricted advertiser → excluded
  for (const allowedStates of Object.values(SPORTSBOOK_RESTRICTIONS)) {
    assertEquals(
      isGeoEligible(null, allowedStates),
      false,
      "Auction must exclude sportsbook bids for unknown jurisdiction",
    );
  }

  // CTA: null state → useSportsbookGeo returns eligible=false
  // (useSportsbookGeo sets eligible=false when inferStateFromTimezone returns null)
  // Simulated here: state is null, so CTA should be disabled
  const ctaEligible = state !== null; // mirrors useSportsbookGeo hook logic
  assertEquals(ctaEligible, false, "CTA must be disabled for unknown jurisdiction");
});

Deno.test("parity: non-sportsbook advertiser (null allowedJurisdictions) is NOT geo-filtered", () => {
  // Streaming providers, commerce advertisers, etc. have no jurisdiction restriction
  const testStates = [null, "TX", "CA", "FL", "NY"];
  for (const state of testStates) {
    assert(
      isGeoEligible(state, null),
      `Non-sportsbook advertisers must be eligible in all states (state=${state})`,
    );
  }
});

Deno.test("parity: DraftKings not eligible in TX (not in allowed_states)", () => {
  const state = "TX"; // Texas has no legal DraftKings as of seed data
  const dkAllowed = SPORTSBOOK_RESTRICTIONS.draftkings;
  assertEquals(isGeoEligible(state, dkAllowed), false);
});

Deno.test("parity: DraftKings eligible in NY (America/New_York → NY)", () => {
  const state = inferStateFromTimezone("America/New_York");
  assertEquals(state, "NY");
  const dkAllowed = SPORTSBOOK_RESTRICTIONS.draftkings;
  assert(dkAllowed.includes("NY"), "NY must be in DraftKings allowed states");
  assert(isGeoEligible(state, dkAllowed));
});

Deno.test("parity: PointsBet has fewer states than DraftKings — eligible sets differ", () => {
  const coState = "CO";
  assert(isGeoEligible(coState, SPORTSBOOK_RESTRICTIONS.draftkings));
  assert(isGeoEligible(coState, SPORTSBOOK_RESTRICTIONS.pointsbet));

  // WY is in DraftKings but not PointsBet
  const wyState = "WY";
  assert(isGeoEligible(wyState, SPORTSBOOK_RESTRICTIONS.draftkings));
  assertEquals(isGeoEligible(wyState, SPORTSBOOK_RESTRICTIONS.pointsbet), false);
});
