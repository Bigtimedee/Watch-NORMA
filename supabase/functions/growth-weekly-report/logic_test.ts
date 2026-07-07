import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildHtmlEmail, type GrowthMetrics } from "./logic.ts";

function makeMetrics(overrides: Partial<GrowthMetrics> = {}): GrowthMetrics {
  return {
    period_start: "2026-06-30",
    period_end: "2026-07-06",
    new_signups: 120,
    new_signups_prior: 100,
    avg_dau: 45,
    avg_dau_prior: 40,
    retention_cohort_week: "2026-06-22",
    retention_d1_pct: 62.5,
    retention_d7_pct: 28.0,
    alerts_delivered: 3200,
    alerts_delivered_prior: 2800,
    watch_taps: 890,
    watch_taps_prior: 750,
    share_events_count: 45,
    share_events_prior: 30,
    referral_signups: 18,
    referral_signups_prior: 12,
    rating_prompt_fires: 22,
    rating_prompt_prior: 15,
    intent_moments_total: 1400,
    intent_moments_prior: 1200,
    fill_rate_pct: 34.2,
    fill_rate_prior_pct: 30.1,
    avg_clearing_cents: 32,
    revenue_cents: 44800,
    revenue_prior_cents: 36000,
    active_advertiser_count: 3,
    moment_breakdown: [
      { moment_type: "spread_alert", count: 600, filled: 220, avg_clearing_cents: 32 },
      { moment_type: "close_game", count: 400, filled: 180, avg_clearing_cents: 38 },
    ],
    ...overrides,
  };
}

// ─── buildHtmlEmail ──────────────────────────────────────────────────────────

Deno.test("html: includes period dates", () => {
  const html = buildHtmlEmail(makeMetrics(), "https://getnorma.app");
  assertStringIncludes(html, "2026-06-30");
  assertStringIncludes(html, "2026-07-06");
});

Deno.test("html: includes signup count", () => {
  const html = buildHtmlEmail(makeMetrics({ new_signups: 77 }), "https://getnorma.app");
  assertStringIncludes(html, "77");
});

Deno.test("html: shows positive delta in green", () => {
  const html = buildHtmlEmail(makeMetrics({ new_signups: 120, new_signups_prior: 100 }), "https://getnorma.app");
  assertStringIncludes(html, "+20%");
  assertStringIncludes(html, "#34d399");
});

Deno.test("html: shows negative delta in red", () => {
  const html = buildHtmlEmail(makeMetrics({ alerts_delivered: 2000, alerts_delivered_prior: 3000 }), "https://getnorma.app");
  assertStringIncludes(html, "-33%");
  assertStringIncludes(html, "#f87171");
});

Deno.test("html: shows retention block when cohort week present", () => {
  const html = buildHtmlEmail(makeMetrics({ retention_cohort_week: "2026-06-22" }), "https://getnorma.app");
  assertStringIncludes(html, "2026-06-22");
  assertStringIncludes(html, "62.5%");
  assertStringIncludes(html, "28.0%");
});

Deno.test("html: omits retention block when cohort week is null", () => {
  const html = buildHtmlEmail(makeMetrics({ retention_cohort_week: null, retention_d1_pct: null, retention_d7_pct: null }), "https://getnorma.app");
  const retentionBlockCount = (html.match(/cohort week/gi) ?? []).length;
  assertEquals(retentionBlockCount, 0);
});

Deno.test("html: includes moment breakdown table when rows present", () => {
  const html = buildHtmlEmail(makeMetrics(), "https://getnorma.app");
  assertStringIncludes(html, "spread_alert");
  assertStringIncludes(html, "close_game");
  assertStringIncludes(html, "Moment Breakdown");
});

Deno.test("html: omits moment breakdown table when empty", () => {
  const html = buildHtmlEmail(makeMetrics({ moment_breakdown: [] }), "https://getnorma.app");
  const breakdownCount = (html.match(/Moment Breakdown/g) ?? []).length;
  assertEquals(breakdownCount, 0);
});

Deno.test("html: fill rate formatted as percentage", () => {
  const html = buildHtmlEmail(makeMetrics({ fill_rate_pct: 34.2 }), "https://getnorma.app");
  assertStringIncludes(html, "34.2%");
});

Deno.test("html: fill rate shown as dash when null", () => {
  const html = buildHtmlEmail(makeMetrics({ fill_rate_pct: null }), "https://getnorma.app");
  assertStringIncludes(html, ">—<");
});

Deno.test("html: avg clearing in dollars", () => {
  const html = buildHtmlEmail(makeMetrics({ avg_clearing_cents: 32 }), "https://getnorma.app");
  assertStringIncludes(html, "$0.32");
});

Deno.test("html: avg clearing dash when null", () => {
  const html = buildHtmlEmail(makeMetrics({ avg_clearing_cents: null }), "https://getnorma.app");
  assertStringIncludes(html, ">—<");
});

Deno.test("html: includes admin dashboard link", () => {
  const html = buildHtmlEmail(makeMetrics(), "https://getnorma.app");
  assertStringIncludes(html, "https://getnorma.app/admin/growth");
});

Deno.test("html: zero signups with zero prior shows em dash delta", () => {
  const html = buildHtmlEmail(makeMetrics({ new_signups: 0, new_signups_prior: 0 }), "https://getnorma.app");
  assertStringIncludes(html, ">—<");
});

Deno.test("html: new signups with zero prior shows 'new'", () => {
  const html = buildHtmlEmail(makeMetrics({ new_signups: 5, new_signups_prior: 0 }), "https://getnorma.app");
  assertStringIncludes(html, ">new<");
});

Deno.test("html: moment fill percentage computed correctly", () => {
  const html = buildHtmlEmail(
    makeMetrics({
      moment_breakdown: [{ moment_type: "overtime", count: 100, filled: 42, avg_clearing_cents: 41 }],
    }),
    "https://getnorma.app"
  );
  assertStringIncludes(html, "42%");
  assertStringIncludes(html, "$0.41");
});

Deno.test("html: moment fill zero count shows dash", () => {
  const html = buildHtmlEmail(
    makeMetrics({
      moment_breakdown: [{ moment_type: "foul_trouble", count: 0, filled: 0, avg_clearing_cents: null }],
    }),
    "https://getnorma.app"
  );
  assertStringIncludes(html, ">—<");
});

Deno.test("html: Watch NORMA branding present", () => {
  const html = buildHtmlEmail(makeMetrics(), "https://getnorma.app");
  assertStringIncludes(html, "Watch NORMA");
});
