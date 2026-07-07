import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildHtmlEmail,
  computeDeltas,
  computeWeeklyMetrics,
  generateInsight,
  type ImpressionRow,
  type ConversionRow,
} from "./logic.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeImp(overrides: Partial<ImpressionRow> = {}): ImpressionRow {
  return {
    id: 1,
    clearing_price_cents: 40,
    tapped_at: null,
    moment_type: "close_game",
    creative_id: 10,
    variant_label: "variant_a",
    ...overrides,
  };
}

function makeConv(overrides: Partial<ConversionRow> = {}): ConversionRow {
  return { impression_id: 1, conversion_type: "cta_tap", ...overrides };
}

// ---------------------------------------------------------------------------
// computeWeeklyMetrics
// ---------------------------------------------------------------------------

Deno.test("computeWeeklyMetrics — empty inputs return zeroes", () => {
  const m = computeWeeklyMetrics([], []);
  assertEquals(m.impressions, 0);
  assertEquals(m.taps, 0);
  assertEquals(m.ctr, 0);
  assertEquals(m.spendCents, 0);
  assertEquals(m.avgClearingCents, 0);
  assertEquals(m.verifiedConversions, 0);
  assertEquals(m.inferredConversions, 0);
  assertEquals(m.totalConversions, 0);
  assertEquals(m.cpaCents, 0);
});

Deno.test("computeWeeklyMetrics — correct impression and spend totals", () => {
  const imps = [
    makeImp({ id: 1, clearing_price_cents: 50 }),
    makeImp({ id: 2, clearing_price_cents: 30 }),
    makeImp({ id: 3, clearing_price_cents: 20, tapped_at: "2026-07-01T10:00:00Z" }),
  ];
  const m = computeWeeklyMetrics(imps, []);
  assertEquals(m.impressions, 3);
  assertEquals(m.taps, 1);
  assertEquals(m.spendCents, 100);
  assertEquals(m.avgClearingCents, 33);
  // CTR = 1/3
  assertEquals(Math.round(m.ctr * 1000), 333);
});

Deno.test("computeWeeklyMetrics — splits verified vs inferred conversions", () => {
  const imps = [makeImp({ id: 1 }), makeImp({ id: 2 })];
  const convs: ConversionRow[] = [
    { impression_id: 1, conversion_type: "cta_tap" },       // verified
    { impression_id: 1, conversion_type: "app_return" },    // verified
    { impression_id: 2, conversion_type: "sportsbook_open" }, // inferred
    { impression_id: 2, conversion_type: "wager_placed" },  // inferred
  ];
  const m = computeWeeklyMetrics(imps, convs);
  assertEquals(m.verifiedConversions, 2);
  assertEquals(m.inferredConversions, 2);
  assertEquals(m.totalConversions, 4);
});

Deno.test("computeWeeklyMetrics — CPA is spend / total conversions", () => {
  const imps = [makeImp({ id: 1, clearing_price_cents: 500 })];
  const convs: ConversionRow[] = [
    { impression_id: 1, conversion_type: "cta_tap" },
    { impression_id: 1, conversion_type: "stream_open" },
  ];
  const m = computeWeeklyMetrics(imps, convs);
  assertEquals(m.cpaCents, 250); // 500 / 2
});

Deno.test("computeWeeklyMetrics — groups by moment type", () => {
  const imps = [
    makeImp({ id: 1, moment_type: "close_game", clearing_price_cents: 35, tapped_at: "2026-07-01T10:00:00Z" }),
    makeImp({ id: 2, moment_type: "close_game", clearing_price_cents: 35 }),
    makeImp({ id: 3, moment_type: "bet_resolved", clearing_price_cents: 50 }),
  ];
  const m = computeWeeklyMetrics(imps, []);
  assertEquals(m.byMoment["close_game"].impressions, 2);
  assertEquals(m.byMoment["close_game"].taps, 1);
  assertEquals(m.byMoment["close_game"].spendCents, 70);
  assertEquals(m.byMoment["bet_resolved"].impressions, 1);
});

Deno.test("computeWeeklyMetrics — groups by creative id", () => {
  const imps = [
    makeImp({ id: 1, creative_id: 10, variant_label: "variant_a" }),
    makeImp({ id: 2, creative_id: 10, variant_label: "variant_a", tapped_at: "t" }),
    makeImp({ id: 3, creative_id: 20, variant_label: "variant_b" }),
  ];
  const m = computeWeeklyMetrics(imps, []);
  assertEquals(m.byCreative["10"].impressions, 2);
  assertEquals(m.byCreative["10"].taps, 1);
  assertEquals(m.byCreative["10"].variantLabel, "variant_a");
  assertEquals(m.byCreative["20"].impressions, 1);
});

// ---------------------------------------------------------------------------
// computeDeltas
// ---------------------------------------------------------------------------

Deno.test("computeDeltas — zero prior week treated as 100% growth", () => {
  const cur = computeWeeklyMetrics([makeImp()], []);
  const prior = computeWeeklyMetrics([], []);
  const d = computeDeltas(cur, prior);
  assertEquals(d.impressionsPct, 100);
  assertEquals(d.impressionsDelta, 1);
});

Deno.test("computeDeltas — decline expressed as negative pct", () => {
  const cur = computeWeeklyMetrics([makeImp()], []);
  const prior = computeWeeklyMetrics([makeImp(), makeImp()], []);
  const d = computeDeltas(cur, prior);
  assertEquals(d.impressionsDelta, -1);
  assertEquals(d.impressionsPct, -50);
});

Deno.test("computeDeltas — CTR delta in percentage points", () => {
  const cur = computeWeeklyMetrics(
    [makeImp({ id: 1, tapped_at: "t" }), makeImp({ id: 2 })],
    [],
  ); // CTR = 0.5
  const prior = computeWeeklyMetrics(
    [makeImp({ id: 3 })],
    [],
  ); // CTR = 0
  const d = computeDeltas(cur, prior);
  // 0.5 - 0 = 0.5, expressed as pp = 50
  assertEquals(d.ctrDeltaPp, 50);
});

// ---------------------------------------------------------------------------
// generateInsight
// ---------------------------------------------------------------------------

Deno.test("generateInsight — no impressions triggers campaign-health message", () => {
  const m = computeWeeklyMetrics([], []);
  const insight = generateInsight(m, 50);
  assertStringIncludes(insight, "No impressions");
});

Deno.test("generateInsight — clearing below 80% of max bid triggers headroom message", () => {
  // avg clearing = 30 cents, max bid = 50 cents → ratio = 0.6 → below 0.8 threshold
  const imps = [
    makeImp({ clearing_price_cents: 30 }),
    makeImp({ clearing_price_cents: 30 }),
  ];
  const m = computeWeeklyMetrics(imps, []);
  const insight = generateInsight(m, 50);
  assertStringIncludes(insight, "below your max bid");
});

Deno.test("generateInsight — impressions but zero conversions triggers CTA message", () => {
  // clearing = 40 cents, maxBid = 40 cents → ratio = 1.0 → Rule 1 does not fire
  const imps = Array.from({ length: 12 }, (_, i) => makeImp({ id: i }));
  const m = computeWeeklyMetrics(imps, []);
  const insight = generateInsight(m, 40);
  assertStringIncludes(insight, "no recorded conversions");
});

Deno.test("generateInsight — high CTR with only inferred conversions triggers webhook message", () => {
  // 6 out of 10 tapped → CTR = 0.6 > 0.05 threshold
  // clearing = 50 cents, maxBid = 50 cents → ratio = 1.0 → Rule 1 does not fire
  const imps = Array.from({ length: 10 }, (_, i) =>
    makeImp({ id: i, tapped_at: i < 6 ? "t" : null, clearing_price_cents: 50 }),
  );
  const convs: ConversionRow[] = [
    { impression_id: 0, conversion_type: "sportsbook_open" },
  ];
  const m = computeWeeklyMetrics(imps, convs);
  const insight = generateInsight(m, 50);
  assertStringIncludes(insight, "inferred");
  assertStringIncludes(insight, "postback webhook");
});

// ---------------------------------------------------------------------------
// buildHtmlEmail
// ---------------------------------------------------------------------------

Deno.test("buildHtmlEmail — contains advertiser name and period", () => {
  const m = computeWeeklyMetrics([], []);
  const html = buildHtmlEmail({
    advertiserName: "TestCo",
    periodStart: "2026-06-30",
    periodEnd: "2026-07-06",
    current: m,
    prior: m,
    deltas: computeDeltas(m, m),
    insight: "Test insight.",
    billingUrl: "https://getnorma.app/billing",
  });
  assertStringIncludes(html, "TestCo");
  assertStringIncludes(html, "2026-06-30");
  assertStringIncludes(html, "2026-07-06");
});

Deno.test("buildHtmlEmail — always includes attribution note with 'inferred' label", () => {
  const m = computeWeeklyMetrics([], []);
  const html = buildHtmlEmail({
    advertiserName: "DraftKings",
    periodStart: "2026-06-30",
    periodEnd: "2026-07-06",
    current: m,
    prior: m,
    deltas: computeDeltas(m, m),
    insight: "N/A",
    billingUrl: "https://getnorma.app/billing",
  });
  assertStringIncludes(html, "inferred");
  assertStringIncludes(html, "Attribution note");
});

Deno.test("buildHtmlEmail — billing CTA link is present", () => {
  const m = computeWeeklyMetrics([], []);
  const html = buildHtmlEmail({
    advertiserName: "Acme",
    periodStart: "2026-06-30",
    periodEnd: "2026-07-06",
    current: m,
    prior: m,
    deltas: computeDeltas(m, m),
    insight: "N/A",
    billingUrl: "https://getnorma.app/billing",
  });
  assertStringIncludes(html, "https://getnorma.app/billing");
  assertStringIncludes(html, "Deposit");
});

Deno.test("buildHtmlEmail — shows first-week label when prior has zero impressions", () => {
  const cur = computeWeeklyMetrics([makeImp()], []);
  const prior = computeWeeklyMetrics([], []);
  const html = buildHtmlEmail({
    advertiserName: "Acme",
    periodStart: "2026-06-30",
    periodEnd: "2026-07-06",
    current: cur,
    prior,
    deltas: computeDeltas(cur, prior),
    insight: "N/A",
    billingUrl: "https://getnorma.app/billing",
  });
  assertStringIncludes(html, "First week");
});

Deno.test("buildHtmlEmail — verified and inferred conversion counts are rendered", () => {
  const imps = [makeImp({ id: 1 }), makeImp({ id: 2 })];
  const convs: ConversionRow[] = [
    { impression_id: 1, conversion_type: "cta_tap" },
    { impression_id: 2, conversion_type: "stream_open" },
  ];
  const m = computeWeeklyMetrics(imps, convs);
  const html = buildHtmlEmail({
    advertiserName: "Acme",
    periodStart: "2026-06-30",
    periodEnd: "2026-07-06",
    current: m,
    prior: computeWeeklyMetrics([], []),
    deltas: computeDeltas(m, computeWeeklyMetrics([], [])),
    insight: "N/A",
    billingUrl: "https://getnorma.app/billing",
  });
  assertStringIncludes(html, "1 verified");
  assertStringIncludes(html, "1 inferred");
});
