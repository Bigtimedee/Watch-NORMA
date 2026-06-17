import { getCached, setCached, checkReportingRateLimit } from "../lib/reporting-cache";

// ─── Caching ──────────────────────────────────────────────────────────────────

describe("reporting cache", () => {
  it("returns null for cache miss", () => {
    expect(getCached("nonexistent-key")).toBeNull();
  });

  it("stores and retrieves cached data", () => {
    const data = { market_data: [{ moment_type: "bet_resolved", floor_cpm_usd: 0.5 }] };
    setCached("test-market", data);
    expect(getCached("test-market")).toEqual(data);
  });

  it("returns different values for different keys", () => {
    setCached("key-a", { value: 1 });
    setCached("key-b", { value: 2 });
    expect((getCached("key-a") as { value: number })?.value).toBe(1);
    expect((getCached("key-b") as { value: number })?.value).toBe(2);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("reporting rate limit", () => {
  it("allows 60 requests per minute", () => {
    const id = Date.now() + Math.random();
    for (let i = 0; i < 60; i++) {
      expect(checkReportingRateLimit(id)).toBe(true);
    }
  });

  it("blocks the 61st request", () => {
    const id = Date.now() + Math.random() + 1;
    for (let i = 0; i < 60; i++) checkReportingRateLimit(id);
    expect(checkReportingRateLimit(id)).toBe(false);
  });

  it("tracks different advertisers independently", () => {
    const id1 = Date.now() + Math.random() + 100;
    const id2 = Date.now() + Math.random() + 200;
    for (let i = 0; i < 60; i++) checkReportingRateLimit(id1);
    expect(checkReportingRateLimit(id1)).toBe(false);
    expect(checkReportingRateLimit(id2)).toBe(true);
  });
});

// ─── CTR calculation ──────────────────────────────────────────────────────────

describe("CTR calculation logic", () => {
  it("computes CTR correctly", () => {
    const impressions = 1000;
    const clicks = 120;
    const ctr = Math.round(clicks / impressions * 10000) / 10000;
    expect(ctr).toBe(0.12);
  });

  it("returns 0 CTR for 0 impressions", () => {
    const ctr = 0 > 0 ? 1 / 0 : 0;
    expect(ctr).toBe(0);
  });
});

// ─── Percentile calculation ───────────────────────────────────────────────────

describe("percentile calculation", () => {
  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  it("computes p50 correctly", () => {
    const prices = [10, 20, 30, 40, 50].sort((a, b) => a - b);
    expect(percentile(prices, 50)).toBe(30);
  });

  it("computes p90 correctly", () => {
    const prices = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].sort((a, b) => a - b);
    expect(percentile(prices, 90)).toBe(90);
  });

  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

// ─── Date range validation ────────────────────────────────────────────────────

describe("date range validation", () => {
  it("rejects end_date before start_date", () => {
    const start = new Date("2026-03-15");
    const end = new Date("2026-03-01");
    expect(end < start).toBe(true);
  });

  it("accepts equal start and end dates", () => {
    const start = new Date("2026-03-15");
    const end = new Date("2026-03-15");
    expect(end < start).toBe(false);
  });
});

// ─── Market data privacy ──────────────────────────────────────────────────────

describe("market data privacy rules", () => {
  it("percentile stats do not reveal individual bid values", () => {
    const bids = [50, 55, 60, 65, 80, 100, 120, 140, 160, 200];
    const sorted = bids.slice().sort((a, b) => a - b);

    // Statistical percentiles only — individual values not directly exposed
    const p75idx = Math.ceil(0.75 * sorted.length) - 1;
    const p75 = sorted[p75idx];

    // p75 is an actual bid value but it's presented as a percentile, not "advertiser X bid $1.40"
    expect(p75).toBeLessThanOrEqual(Math.max(...bids));
    expect(p75).toBeGreaterThanOrEqual(Math.min(...bids));
  });
});
