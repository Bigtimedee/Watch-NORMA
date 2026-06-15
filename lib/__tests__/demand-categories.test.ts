/**
 * Tests for demand categories (P2-06).
 * Covers: category eligibility, CTA label per category, geo-filter bypass for
 * non-sportsbook campaigns, and attribution labeling per category.
 */

type DemandType = "sportsbook" | "streaming" | "commerce";

interface MockCampaign {
  demand_type: DemandType;
  allowed_jurisdictions: string[] | null;
}

// Mirror of CTA label resolution
function ctaLabel(demandType: DemandType): string {
  switch (demandType) {
    case "sportsbook": return "Bet Now";
    case "streaming":  return "Watch Now";
    case "commerce":   return "Shop Now";
  }
}

// Mirror of geo-filter eligibility (non-sportsbook bypasses geo check)
function isGeoEligible(campaign: MockCampaign, userState: string | null): boolean {
  if (campaign.demand_type !== "sportsbook") return true; // streaming/commerce unrestricted
  if (!campaign.allowed_jurisdictions || campaign.allowed_jurisdictions.length === 0) return true;
  if (!userState) return false; // unknown jurisdiction
  return campaign.allowed_jurisdictions.includes(userState);
}

// Mirror of auction eligibility gate (campaign must be active and demand type accepted)
function isAuctionEligible(campaign: MockCampaign & { status: string }): boolean {
  if (campaign.status !== "active") return false;
  return ["sportsbook", "streaming", "commerce"].includes(campaign.demand_type);
}

// Mirror of inferred attribution per category
const INFERRED_BY_CATEGORY: Record<DemandType, string[]> = {
  sportsbook: ["sportsbook_open", "wager_placed"],
  streaming:  ["stream_open"],
  commerce:   ["commerce_open"],
};

function isInferredForCategory(demandType: DemandType, conversionType: string): boolean {
  return INFERRED_BY_CATEGORY[demandType].includes(conversionType);
}

// -- CTA Label Tests --

describe("CTA label per demand category", () => {
  it("sportsbook → Bet Now", () => {
    expect(ctaLabel("sportsbook")).toBe("Bet Now");
  });

  it("streaming → Watch Now", () => {
    expect(ctaLabel("streaming")).toBe("Watch Now");
  });

  it("commerce → Shop Now", () => {
    expect(ctaLabel("commerce")).toBe("Shop Now");
  });
});

// -- Geo-filter Tests --

describe("Geo-filter bypass for non-sportsbook campaigns", () => {
  it("sportsbook campaign is geo-filtered when user state not in allowed list", () => {
    const campaign: MockCampaign = {
      demand_type: "sportsbook",
      allowed_jurisdictions: ["NJ", "CO", "PA"],
    };
    expect(isGeoEligible(campaign, "TX")).toBe(false);
  });

  it("sportsbook campaign passes geo-filter when user state is allowed", () => {
    const campaign: MockCampaign = {
      demand_type: "sportsbook",
      allowed_jurisdictions: ["NJ", "CO", "PA"],
    };
    expect(isGeoEligible(campaign, "NJ")).toBe(true);
  });

  it("streaming campaign bypasses geo-filter entirely", () => {
    const campaign: MockCampaign = {
      demand_type: "streaming",
      allowed_jurisdictions: null,
    };
    expect(isGeoEligible(campaign, null)).toBe(true);
    expect(isGeoEligible(campaign, "TX")).toBe(true);
  });

  it("commerce campaign bypasses geo-filter entirely", () => {
    const campaign: MockCampaign = {
      demand_type: "commerce",
      allowed_jurisdictions: null,
    };
    expect(isGeoEligible(campaign, null)).toBe(true);
    expect(isGeoEligible(campaign, "TX")).toBe(true);
  });

  it("sportsbook with unknown user state is blocked", () => {
    const campaign: MockCampaign = {
      demand_type: "sportsbook",
      allowed_jurisdictions: ["NJ"],
    };
    expect(isGeoEligible(campaign, null)).toBe(false);
  });

  it("sportsbook with null allowed_jurisdictions is unrestricted", () => {
    const campaign: MockCampaign = {
      demand_type: "sportsbook",
      allowed_jurisdictions: null,
    };
    expect(isGeoEligible(campaign, null)).toBe(true);
  });
});

// -- Auction Eligibility Tests --

describe("Auction eligibility by demand type", () => {
  it("active sportsbook campaign is auction-eligible", () => {
    expect(isAuctionEligible({ demand_type: "sportsbook", allowed_jurisdictions: null, status: "active" })).toBe(true);
  });

  it("active streaming campaign is auction-eligible", () => {
    expect(isAuctionEligible({ demand_type: "streaming", allowed_jurisdictions: null, status: "active" })).toBe(true);
  });

  it("active commerce campaign is auction-eligible", () => {
    expect(isAuctionEligible({ demand_type: "commerce", allowed_jurisdictions: null, status: "active" })).toBe(true);
  });

  it("draft campaign is not auction-eligible regardless of demand type", () => {
    expect(isAuctionEligible({ demand_type: "sportsbook", allowed_jurisdictions: null, status: "draft" })).toBe(false);
    expect(isAuctionEligible({ demand_type: "streaming", allowed_jurisdictions: null, status: "draft" })).toBe(false);
  });
});

// -- Attribution Honesty Tests --

describe("Attribution labeling per demand category", () => {
  it("sportsbook: sportsbook_open is inferred", () => {
    expect(isInferredForCategory("sportsbook", "sportsbook_open")).toBe(true);
  });

  it("sportsbook: wager_placed is inferred (email parse only)", () => {
    expect(isInferredForCategory("sportsbook", "wager_placed")).toBe(true);
  });

  it("streaming: stream_open is inferred", () => {
    expect(isInferredForCategory("streaming", "stream_open")).toBe(true);
  });

  it("commerce: commerce_open is inferred", () => {
    expect(isInferredForCategory("commerce", "commerce_open")).toBe(true);
  });

  it("cta_tap is never inferred for any category", () => {
    (["sportsbook", "streaming", "commerce"] as DemandType[]).forEach((dt) => {
      expect(isInferredForCategory(dt, "cta_tap")).toBe(false);
    });
  });

  it("app_return is never inferred for any category", () => {
    (["sportsbook", "streaming", "commerce"] as DemandType[]).forEach((dt) => {
      expect(isInferredForCategory(dt, "app_return")).toBe(false);
    });
  });
});
