// In-memory cache for market data (15-min TTL) and per-advertiser rate limiting

const TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

// Per-advertiser rate limiting: 60 req/min
const reportingRateLimits = new Map<number, { count: number; windowStart: number }>();

export function checkReportingRateLimit(advertiserId: number): boolean {
  const now = Date.now();
  const entry = reportingRateLimits.get(advertiserId);
  if (!entry || now - entry.windowStart > 60_000) {
    reportingRateLimits.set(advertiserId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}
