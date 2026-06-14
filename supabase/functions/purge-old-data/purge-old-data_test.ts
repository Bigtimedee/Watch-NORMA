// Unit tests for purge-old-data retention constants and cutoff logic.
// No network, no DB — pure invariant checks.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Mirrors constants from index.ts
const RETENTION = {
  game_snapshots: 30,
  deep_link_events: 90,
  delivery_log: 180,
  impressions: 397, // 13 months
} as const;

function cutoff(nowMs: number, days: number): Date {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000);
}

Deno.test("retention: game_snapshots cutoff is exactly 30 days before now", () => {
  const now = new Date("2026-06-14T09:00:00Z").getTime();
  const c = cutoff(now, RETENTION.game_snapshots);
  const expected = new Date("2026-05-15T09:00:00Z");
  assertEquals(c.toISOString(), expected.toISOString());
});

Deno.test("retention: deep_link_events cutoff is 90 days", () => {
  const now = new Date("2026-06-14T09:00:00Z").getTime();
  const c = cutoff(now, RETENTION.deep_link_events);
  const diffDays = (now - c.getTime()) / (24 * 60 * 60 * 1000);
  assertEquals(diffDays, 90);
});

Deno.test("retention: delivery_log cutoff is 180 days", () => {
  const now = Date.now();
  const c = cutoff(now, RETENTION.delivery_log);
  const diffDays = (now - c.getTime()) / (24 * 60 * 60 * 1000);
  assertEquals(diffDays, 180);
});

Deno.test("retention: impressions cutoff is ≥ 13 calendar months (397 days)", () => {
  const now = new Date("2026-06-14T09:00:00Z").getTime();
  const c = cutoff(now, RETENTION.impressions);
  const diffDays = (now - c.getTime()) / (24 * 60 * 60 * 1000);
  assertEquals(diffDays, 397);
  // 397 days covers full YoY comparison (longest 13-month span is 396 days in non-leap year)
  assert(diffDays >= 396, "impressions retention must cover at least 13 calendar months");
});

Deno.test("retention: impressions retention is longer than all other windows", () => {
  assert(
    RETENTION.impressions > RETENTION.delivery_log,
    "impressions must outlive delivery_log (ad billing needs YoY)",
  );
  assert(
    RETENTION.impressions > RETENTION.deep_link_events,
    "impressions must outlive deep_link_events",
  );
  assert(
    RETENTION.impressions > RETENTION.game_snapshots,
    "impressions must outlive game_snapshots",
  );
});

Deno.test("retention: a row created now is NOT within any cutoff window", () => {
  const now = Date.now();
  const row = new Date(now); // just created
  for (const [table, days] of Object.entries(RETENTION)) {
    const c = cutoff(now, days);
    assert(
      row > c,
      `${table}: a fresh row should NOT be marked for deletion`,
    );
  }
});

Deno.test("retention: a row created at retention+1 days IS within cutoff window", () => {
  const now = Date.now();
  for (const [table, days] of Object.entries(RETENTION)) {
    const old = new Date(now - (days + 1) * 24 * 60 * 60 * 1000);
    const c = cutoff(now, days);
    assert(
      old < c,
      `${table}: a row ${days + 1} days old should be marked for deletion`,
    );
  }
});

Deno.test("retention: conversions cascade — no explicit entry needed", () => {
  // conversions is NOT in the RETENTION map; it cascades with impressions
  const keys = Object.keys(RETENTION);
  assert(!keys.includes("conversions"), "conversions should not have its own retention window");
});
