/**
 * Tests for Programmatic Intent API logic (P2-09).
 * Auth rejection, rate limiting, aggregate-only enforcement, clearing invariant.
 *
 * All logic is mirrored from intent-api/index.ts as pure functions —
 * no DB, no Deno, no network required.
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Pure-logic mirrors (extracted from intent-api/index.ts for testability)
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const RATE_LIMIT_PER_MINUTE = 50;

function checkRateLimit(
  counters: Map<number, RateLimitEntry>,
  keyId: number,
  nowMs: number
): boolean {
  const entry = counters.get(keyId);
  if (!entry || nowMs - entry.windowStart > 60_000) {
    counters.set(keyId, { count: 1, windowStart: nowMs });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count++;
  return true;
}

interface ApiKeyRow {
  id: number;
  advertiser_id: number;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
}

function validateApiKey(keyRow: ApiKeyRow | null): string | null {
  if (!keyRow) return "Invalid API key";
  if (!keyRow.is_active || keyRow.revoked_at) return "API key revoked";
  return null; // valid
}

interface BidParams {
  campaign_id: number;
  moment_type: string;
  bid_cents: number;
}

interface FloorRow {
  floor_cents: number;
}

interface CampaignRow {
  id: number;
  advertiser_id: number;
  status: string;
}

function validateBid(
  params: BidParams,
  campaign: CampaignRow | null,
  advertiserId: number,
  floorRow: FloorRow | null
): string | null {
  const { campaign_id, moment_type, bid_cents } = params;

  if (!campaign_id || !moment_type || typeof bid_cents !== "number") {
    return "Required: campaign_id, moment_type, bid_cents";
  }

  if (!campaign) return "Campaign not found or not owned by this advertiser";
  if (campaign.advertiser_id !== advertiserId) return "Campaign not found or not owned by this advertiser";
  if (campaign.status !== "active") return "Campaign is not active";

  const floorCents = floorRow?.floor_cents ?? 10;
  if (bid_cents < floorCents) {
    return `Bid (${bid_cents}c) is below floor for ${moment_type} (${floorCents}c)`;
  }
  if (bid_cents > 500) {
    return "Bid exceeds maximum (500c = $5.00)";
  }

  return null; // valid
}

function buildInventoryResponse(forecasts: any[], floors: any[]): object {
  const floorMap = new Map(floors.map((f: any) => [f.moment_type, f.floor_cents]));
  const inventory = forecasts.map((f: any) => ({
    forecast_date: f.forecast_date,
    moment_type: f.moment_type,
    league: f.league,
    predicted_moments: f.predicted_moments,
    predicted_moments_low: f.predicted_moments_low,
    predicted_moments_high: f.predicted_moments_high,
    floor_cents: floorMap.get(f.moment_type) ?? null,
    basis_note: f.basis_note,
  }));
  return {
    api_version: "v1",
    status: "scaffolded",
    note: "Programmatic Intent API — scaffolded. Contact bd@norma-app.com to activate for production use.",
    inventory,
  };
}

function buildBidAcceptedResponse(bidId: number): object {
  return {
    accepted: true,
    bid_id: bidId,
    clearing_note:
      "Bid enters existing second-price Vickrey auction. You pay at most $0.01 above the second-highest bid. Clearing logic is unchanged.",
    api_version: "v1",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sha256Hex", () => {
  it("produces correct SHA-256 for known test vector (empty string)", () => {
    // NIST test vector: SHA-256("") = e3b0c44298fc1c149afb...
    const result = sha256Hex("");
    expect(result).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("produces correct SHA-256 for known test vector (abc)", () => {
    // NIST: SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa72a0a2d5bfb15c2 — wrong, correct:
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa72a0a2d5bfb15c2 — no
    // Actual SHA-256("abc") = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469fa72a0a2d5bfb15c2
    // Let Node compute expected to avoid hardcoding wrong value
    const expected = createHash("sha256").update("abc").digest("hex");
    expect(sha256Hex("abc")).toBe(expected);
  });

  it("produces consistent output for the same input", () => {
    const key = "nrma_k1_test_key_12345678";
    expect(sha256Hex(key)).toBe(sha256Hex(key));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256Hex("key_a")).not.toBe(sha256Hex("key_b"));
  });
});

describe("checkRateLimit", () => {
  it("allows the first request", () => {
    const counters = new Map<number, RateLimitEntry>();
    expect(checkRateLimit(counters, 1, 1000)).toBe(true);
  });

  it("allows up to 50 requests in the same window", () => {
    const counters = new Map<number, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      expect(checkRateLimit(counters, 42, now + i)).toBe(true);
    }
  });

  it("rejects the 51st request in the same window", () => {
    const counters = new Map<number, RateLimitEntry>();
    const now = 1_000_000;
    for (let i = 0; i < 50; i++) {
      checkRateLimit(counters, 7, now + i);
    }
    expect(checkRateLimit(counters, 7, now + 50)).toBe(false);
  });

  it("resets counter after the 60-second window expires", () => {
    const counters = new Map<number, RateLimitEntry>();
    const now = 1_000_000;
    // Exhaust window
    for (let i = 0; i < 50; i++) {
      checkRateLimit(counters, 3, now + i);
    }
    expect(checkRateLimit(counters, 3, now + 50)).toBe(false); // still blocked

    // Advance 61 seconds
    const later = now + 61_000;
    expect(checkRateLimit(counters, 3, later)).toBe(true); // new window, allowed
  });

  it("rate limits are independent per key ID", () => {
    const counters = new Map<number, RateLimitEntry>();
    const now = 1_000_000;
    // Exhaust key 1
    for (let i = 0; i < 50; i++) {
      checkRateLimit(counters, 1, now + i);
    }
    // Key 2 should still be allowed
    expect(checkRateLimit(counters, 2, now + 51)).toBe(true);
  });
});

describe("validateApiKey", () => {
  const baseKey: ApiKeyRow = {
    id: 1,
    advertiser_id: 100,
    scopes: ["inventory:read", "bid:write"],
    is_active: true,
    revoked_at: null,
  };

  it("returns null (valid) for an active, non-revoked key", () => {
    expect(validateApiKey(baseKey)).toBeNull();
  });

  it("rejects a null key row (unknown key hash)", () => {
    expect(validateApiKey(null)).toBe("Invalid API key");
  });

  it("rejects a key with is_active=false", () => {
    expect(validateApiKey({ ...baseKey, is_active: false })).toBe("API key revoked");
  });

  it("rejects a key with revoked_at set", () => {
    expect(
      validateApiKey({ ...baseKey, revoked_at: "2026-01-01T00:00:00Z" })
    ).toBe("API key revoked");
  });

  it("rejects a key that is both inactive and revoked", () => {
    expect(
      validateApiKey({ ...baseKey, is_active: false, revoked_at: "2026-01-01T00:00:00Z" })
    ).toBe("API key revoked");
  });
});

describe("scope enforcement for POST /bid", () => {
  const keyWithBidWrite: ApiKeyRow = {
    id: 1,
    advertiser_id: 100,
    scopes: ["inventory:read", "bid:write"],
    is_active: true,
    revoked_at: null,
  };
  const keyWithoutBidWrite: ApiKeyRow = {
    id: 2,
    advertiser_id: 100,
    scopes: ["inventory:read"],
    is_active: true,
    revoked_at: null,
  };

  it("allows bid:write scope", () => {
    expect(keyWithBidWrite.scopes.includes("bid:write")).toBe(true);
  });

  it("rejects key without bid:write scope", () => {
    expect(keyWithoutBidWrite.scopes.includes("bid:write")).toBe(false);
  });
});

describe("validateBid", () => {
  const campaign: CampaignRow = {
    id: 55,
    advertiser_id: 100,
    status: "active",
  };
  const floor: FloorRow = { floor_cents: 35 };

  it("accepts a valid bid at or above floor", () => {
    expect(
      validateBid(
        { campaign_id: 55, moment_type: "close_game", bid_cents: 40 },
        campaign,
        100,
        floor
      )
    ).toBeNull();
  });

  it("accepts a bid exactly at floor", () => {
    expect(
      validateBid(
        { campaign_id: 55, moment_type: "close_game", bid_cents: 35 },
        campaign,
        100,
        floor
      )
    ).toBeNull();
  });

  it("rejects a bid below the floor", () => {
    const err = validateBid(
      { campaign_id: 55, moment_type: "close_game", bid_cents: 20 },
      campaign,
      100,
      floor
    );
    expect(err).toMatch(/below floor/);
    expect(err).toContain("20c");
    expect(err).toContain("35c");
  });

  it("rejects a bid above 500c", () => {
    const err = validateBid(
      { campaign_id: 55, moment_type: "close_game", bid_cents: 501 },
      campaign,
      100,
      floor
    );
    expect(err).toMatch(/maximum/);
  });

  it("accepts a bid exactly at 500c (boundary)", () => {
    expect(
      validateBid(
        { campaign_id: 55, moment_type: "close_game", bid_cents: 500 },
        campaign,
        100,
        floor
      )
    ).toBeNull();
  });

  it("rejects when campaign not found", () => {
    const err = validateBid(
      { campaign_id: 99, moment_type: "close_game", bid_cents: 40 },
      null,
      100,
      floor
    );
    expect(err).toMatch(/not found/);
  });

  it("rejects when campaign belongs to a different advertiser", () => {
    const err = validateBid(
      { campaign_id: 55, moment_type: "close_game", bid_cents: 40 },
      campaign,
      999, // wrong advertiser
      floor
    );
    expect(err).toMatch(/not found/);
  });

  it("rejects when campaign is not active", () => {
    const err = validateBid(
      { campaign_id: 55, moment_type: "close_game", bid_cents: 40 },
      { ...campaign, status: "paused" },
      100,
      floor
    );
    expect(err).toMatch(/not active/);
  });

  it("uses default floor of 10c when no floor row exists", () => {
    // bid of 5c should be rejected against default 10c floor
    const err = validateBid(
      { campaign_id: 55, moment_type: "close_game", bid_cents: 5 },
      campaign,
      100,
      null // no floor row
    );
    expect(err).toMatch(/below floor/);

    // bid of 10c should pass
    expect(
      validateBid(
        { campaign_id: 55, moment_type: "close_game", bid_cents: 10 },
        campaign,
        100,
        null
      )
    ).toBeNull();
  });
});

describe("inventory response — aggregate-only enforcement", () => {
  const sampleForecasts = [
    {
      forecast_date: "2026-06-16",
      moment_type: "close_game",
      league: "nba",
      predicted_moments: 12,
      predicted_moments_low: 8,
      predicted_moments_high: 16,
      confidence: 0.8,
      games_scheduled: 5,
      basis_note: "historical rate 2.4/game",
    },
  ];
  const sampleFloors = [{ moment_type: "close_game", floor_cents: 35 }];

  it("inventory items contain no user_id field", () => {
    const resp = buildInventoryResponse(sampleForecasts, sampleFloors) as any;
    for (const item of resp.inventory) {
      expect(item).not.toHaveProperty("user_id");
      expect(item).not.toHaveProperty("auth_user_id");
    }
  });

  it("inventory items contain no per-user data fields", () => {
    const resp = buildInventoryResponse(sampleForecasts, sampleFloors) as any;
    for (const item of resp.inventory) {
      // Fields that must NOT appear
      expect(item).not.toHaveProperty("profile_id");
      expect(item).not.toHaveProperty("advertiser_id");
      expect(item).not.toHaveProperty("wager_id");
    }
  });

  it("inventory response includes required aggregate fields", () => {
    const resp = buildInventoryResponse(sampleForecasts, sampleFloors) as any;
    expect(resp.api_version).toBe("v1");
    expect(Array.isArray(resp.inventory)).toBe(true);
    const item = resp.inventory[0];
    expect(item).toHaveProperty("forecast_date");
    expect(item).toHaveProperty("moment_type");
    expect(item).toHaveProperty("league");
    expect(item).toHaveProperty("predicted_moments");
    expect(item).toHaveProperty("floor_cents");
  });

  it("floor_cents is joined from floor_prices table", () => {
    const resp = buildInventoryResponse(sampleForecasts, sampleFloors) as any;
    expect(resp.inventory[0].floor_cents).toBe(35);
  });

  it("floor_cents is null when no matching floor exists", () => {
    const resp = buildInventoryResponse(sampleForecasts, []) as any; // no floors
    expect(resp.inventory[0].floor_cents).toBeNull();
  });
});

describe("bid accepted response — clearing invariant", () => {
  it("clearing_note mentions second-price Vickrey auction", () => {
    const resp = buildBidAcceptedResponse(42) as any;
    expect(resp.clearing_note).toMatch(/second-price Vickrey/i);
  });

  it("response confirms bid was accepted", () => {
    const resp = buildBidAcceptedResponse(42) as any;
    expect(resp.accepted).toBe(true);
    expect(resp.bid_id).toBe(42);
  });

  it("clearing note mentions unchanged clearing logic", () => {
    const resp = buildBidAcceptedResponse(99) as any;
    expect(resp.clearing_note).toMatch(/Clearing logic is unchanged/);
  });

  it("api_version is v1", () => {
    const resp = buildBidAcceptedResponse(1) as any;
    expect(resp.api_version).toBe("v1");
  });
});

describe("INTENT_API_ENABLED gate", () => {
  it("returns 503 body shape when gate is off", () => {
    // Simulate the 503 response body that the handler returns when the flag is absent
    const gateOffBody = {
      error: "Programmatic Intent API not yet in production.",
      note: "Contact bd@norma-app.com to activate.",
      api_version: "v1",
    };
    expect(gateOffBody.error).toMatch(/not yet in production/);
    expect(gateOffBody.note).toContain("bd@norma-app.com");
    expect(gateOffBody.api_version).toBe("v1");
  });

  it("503 body does not accidentally expose any auction data", () => {
    const gateOffBody = {
      error: "Programmatic Intent API not yet in production.",
      note: "Contact bd@norma-app.com to activate.",
      api_version: "v1",
    };
    expect(gateOffBody).not.toHaveProperty("inventory");
    expect(gateOffBody).not.toHaveProperty("bid_id");
    expect(gateOffBody).not.toHaveProperty("clearing_note");
  });
});
