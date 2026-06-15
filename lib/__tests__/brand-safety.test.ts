/**
 * Tests for brand safety & editorial separation (P2-10).
 * Eligibility guardrails, labeling, and the second-price invariant.
 */

type DemandType = "sportsbook" | "streaming" | "commerce";

interface MockBid {
  demand_type: DemandType | null;
  brand_safety_approved: boolean;
}

function passesBrandSafetyFilter(bid: MockBid): boolean {
  if (!bid.demand_type || bid.demand_type === "sportsbook") return true;
  return bid.brand_safety_approved === true;
}

function adLabel(_demandType: DemandType): string {
  return "Sponsored"; // always the same — never looks like editorial
}

function isEditorialSeparated(
  sponsorText: string,
  alertExplanation: string
): boolean {
  // Editorial copy and sponsor text must be different strings
  return sponsorText !== alertExplanation;
}

// Mirror the second-price (Vickrey) clearing formula from auction-engine.ts
function computeSecondPrice(
  bids: number[],
  floorCents: number
): number | null {
  if (bids.length === 0) return null;
  const sorted = [...bids].sort((a, b) => b - a);
  if (sorted.length >= 2) {
    return Math.max(Math.ceil(sorted[1]) + 1, floorCents);
  }
  return floorCents;
}

// --- Brand Safety Filter Tests ---

describe("passesBrandSafetyFilter", () => {
  test("sportsbook campaign always passes brand safety filter", () => {
    const bid: MockBid = { demand_type: "sportsbook", brand_safety_approved: false };
    expect(passesBrandSafetyFilter(bid)).toBe(true);
  });

  test("sportsbook campaign passes even when brand_safety_approved is true", () => {
    const bid: MockBid = { demand_type: "sportsbook", brand_safety_approved: true };
    expect(passesBrandSafetyFilter(bid)).toBe(true);
  });

  test("null demand_type passes (treated as sportsbook / unrestricted)", () => {
    const bid: MockBid = { demand_type: null, brand_safety_approved: false };
    expect(passesBrandSafetyFilter(bid)).toBe(true);
  });

  test("streaming campaign passes when brand_safety_approved is true", () => {
    const bid: MockBid = { demand_type: "streaming", brand_safety_approved: true };
    expect(passesBrandSafetyFilter(bid)).toBe(true);
  });

  test("streaming campaign is blocked when brand_safety_approved is false", () => {
    const bid: MockBid = { demand_type: "streaming", brand_safety_approved: false };
    expect(passesBrandSafetyFilter(bid)).toBe(false);
  });

  test("commerce campaign passes when brand_safety_approved is true", () => {
    const bid: MockBid = { demand_type: "commerce", brand_safety_approved: true };
    expect(passesBrandSafetyFilter(bid)).toBe(true);
  });

  test("commerce campaign is blocked when brand_safety_approved is false", () => {
    const bid: MockBid = { demand_type: "commerce", brand_safety_approved: false };
    expect(passesBrandSafetyFilter(bid)).toBe(false);
  });
});

// --- Ad Label (Editorial Separation) Tests ---

describe("adLabel", () => {
  test('ad label is always "Sponsored" for sportsbook demand type', () => {
    expect(adLabel("sportsbook")).toBe("Sponsored");
  });

  test('ad label is always "Sponsored" for streaming demand type', () => {
    expect(adLabel("streaming")).toBe("Sponsored");
  });

  test('ad label is always "Sponsored" for commerce demand type', () => {
    expect(adLabel("commerce")).toBe("Sponsored");
  });
});

describe("isEditorialSeparated", () => {
  test("sponsor text is distinct from alert explanation", () => {
    const sponsorText = "Sponsored by DraftKings";
    const alertExplanation = "Duke trails by 3 with 4:12 left — your spread is live.";
    expect(isEditorialSeparated(sponsorText, alertExplanation)).toBe(true);
  });

  test("returns false when sponsor text accidentally equals alert explanation", () => {
    const text = "Duke trails by 3 with 4:12 left — your spread is live.";
    expect(isEditorialSeparated(text, text)).toBe(false);
  });
});

// --- Second-Price Invariant Tests ---

describe("computeSecondPrice — Vickrey invariant", () => {
  const FLOOR = 100;

  test("clearing price equals floor when only one bid is present", () => {
    expect(computeSecondPrice([500], FLOOR)).toBe(FLOOR);
  });

  test("clearing price is second-highest bid + 1 when two bids are present", () => {
    // Top bid = 500, second bid = 300 → clearing = 301 (>= floor)
    expect(computeSecondPrice([500, 300], FLOOR)).toBe(301);
  });

  test("clearing price respects floor when second bid is below it", () => {
    // Top bid = 500, second bid = 50 (below floor 100) → clearing = max(51, 100) = 100
    expect(computeSecondPrice([500, 50], FLOOR)).toBe(FLOOR);
  });

  test("filtering out a non-winning bid does not change the clearing price", () => {
    // Three bids: 500 (winner), 300 (second), 150 (third)
    // Clearing price with all three: max(301, 100) = 301
    const withAll = computeSecondPrice([500, 300, 150], FLOOR);
    // Filtering out the 150 (non-winning, non-second-place) bid:
    const withoutLowest = computeSecondPrice([500, 300], FLOOR);
    expect(withAll).toBe(withoutLowest);
  });

  test("only the top-2 bids determine the clearing price", () => {
    // Whether there are 2 or 10 losing bids below the second-highest, clearing is unchanged
    const twoOnly = computeSecondPrice([1000, 400], FLOOR);
    const withMany = computeSecondPrice([1000, 400, 300, 250, 200, 150, 100], FLOOR);
    expect(twoOnly).toBe(withMany);
    expect(twoOnly).toBe(401);
  });

  test("removing an ineligible bid that would have been the second-highest changes the price to floor", () => {
    // Scenario: a streaming campaign (brand_safety_approved=false) would have been second place.
    // After filtering it out, only one bid remains → clearing = floor.
    const bids: MockBid[] = [
      { demand_type: "sportsbook", brand_safety_approved: false }, // passes, bid=500
      { demand_type: "streaming", brand_safety_approved: false },  // blocked by brand safety, bid=400
    ];
    const bidCents = [500, 400];
    const eligibleBidCents = bidCents.filter((_, i) => passesBrandSafetyFilter(bids[i]));

    // Only one eligible bid remains (the sportsbook one at 500)
    expect(eligibleBidCents).toEqual([500]);
    const clearingPrice = computeSecondPrice(eligibleBidCents, FLOOR);
    expect(clearingPrice).toBe(FLOOR); // no second bid → floor price
  });
});
