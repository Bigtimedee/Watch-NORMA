// Unit tests for monitor-health alert-building logic.
// Pure-function tests — no network, no DB.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Inline the pure logic under test (mirrors index.ts constants + buildAlerts)
// ---------------------------------------------------------------------------

const STALE_WATCHER_THRESHOLD = 2;
const RATE_BUDGET_LOW_THRESHOLD = 5;
const ALERT_FAIL_RATE_THRESHOLD = 0.25;

interface HealthCheckResult {
  status: string;
  watchers: { stale_count: number; active_count: number };
  rate_budget: { sportradar_budget_remaining: number };
  alert_pipeline: { last_hour: { delivered: number; failed: number } };
}

interface DeepLinkHealthResult {
  status: string;
  no_fallback_events_1h: number;
  providers: Array<{ provider_key: string; alert_level: string; fallback_rate_pct: number; method: string }>;
}

interface AlertPayload {
  fingerprint: string;
  severity: "warning" | "critical";
  title: string;
  body: string;
}

function buildAlerts(hc: HealthCheckResult, dlhc: DeepLinkHealthResult): AlertPayload[] {
  const alerts: AlertPayload[] = [];

  if (hc.watchers.stale_count >= STALE_WATCHER_THRESHOLD) {
    alerts.push({
      fingerprint: `stale_watchers_${hc.watchers.stale_count >= 5 ? "high" : "low"}`,
      severity: hc.watchers.stale_count >= 5 ? "critical" : "warning",
      title: `${hc.watchers.stale_count} stale watcher(s) detected`,
      body: `${hc.watchers.stale_count} of ${hc.watchers.active_count} active games have watchers more than 5 min overdue. The orchestrator may be stuck.`,
    });
  }

  if (hc.rate_budget.sportradar_budget_remaining <= RATE_BUDGET_LOW_THRESHOLD) {
    alerts.push({
      fingerprint: "sportradar_budget_low",
      severity: "warning",
      title: `Sportradar rate budget critically low`,
      body: `Only ${hc.rate_budget.sportradar_budget_remaining} calls remaining this minute. PBP polling may be throttled.`,
    });
  }

  const totalDelivery = hc.alert_pipeline.last_hour.delivered + hc.alert_pipeline.last_hour.failed;
  if (totalDelivery > 10) {
    const failRate = hc.alert_pipeline.last_hour.failed / totalDelivery;
    if (failRate >= ALERT_FAIL_RATE_THRESHOLD) {
      alerts.push({
        fingerprint: "alert_pipeline_fail_rate_high",
        severity: "warning",
        title: `Alert delivery failure rate ${(failRate * 100).toFixed(0)}%`,
        body: `${hc.alert_pipeline.last_hour.failed} of ${totalDelivery} alert deliveries failed in the last hour.`,
      });
    }
  }

  if (dlhc.status === "critical" || dlhc.no_fallback_events_1h > 0) {
    alerts.push({
      fingerprint: "deep_link_no_fallback",
      severity: "critical",
      title: `Deep link failure: ${dlhc.no_fallback_events_1h} user(s) could not open any provider`,
      body: `At least one deep link attempt resulted in no URL being opened at all. Users are unable to watch.`,
    });
  }

  const degradedProviders = dlhc.providers.filter((p) => p.alert_level !== "ok");
  if (degradedProviders.length > 0) {
    const names = degradedProviders.map((p) => `${p.provider_key} (${p.alert_level})`).join(", ");
    alerts.push({
      fingerprint: `degraded_providers_${degradedProviders.map((p) => p.provider_key).sort().join("_")}`,
      severity: degradedProviders.some((p) => p.alert_level === "critical") ? "critical" : "warning",
      title: `Provider deep links degraded: ${names}`,
      body: `${degradedProviders.length} streaming provider(s) have elevated fallback rates. Users may be unable to open their preferred app.`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const healthyHC: HealthCheckResult = {
  status: "healthy",
  watchers: { stale_count: 0, active_count: 10 },
  rate_budget: { sportradar_budget_remaining: 20 },
  alert_pipeline: { last_hour: { delivered: 50, failed: 1 } },
};

const healthyDLHC: DeepLinkHealthResult = {
  status: "healthy",
  no_fallback_events_1h: 0,
  providers: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("buildAlerts: healthy system produces no alerts", () => {
  const alerts = buildAlerts(healthyHC, healthyDLHC);
  assertEquals(alerts.length, 0);
});

Deno.test("buildAlerts: stale watchers below threshold produces no alert", () => {
  const hc = { ...healthyHC, watchers: { stale_count: 1, active_count: 10 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 0);
});

Deno.test("buildAlerts: stale watchers at threshold (2) → warning", () => {
  const hc = { ...healthyHC, watchers: { stale_count: 2, active_count: 10 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].severity, "warning");
  assertEquals(alerts[0].fingerprint, "stale_watchers_low");
});

Deno.test("buildAlerts: stale watchers ≥ 5 → critical", () => {
  const hc = { ...healthyHC, watchers: { stale_count: 5, active_count: 10 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].severity, "critical");
  assertEquals(alerts[0].fingerprint, "stale_watchers_high");
});

Deno.test("buildAlerts: Sportradar budget low → warning", () => {
  const hc = { ...healthyHC, rate_budget: { sportradar_budget_remaining: 3 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].fingerprint, "sportradar_budget_low");
  assertEquals(alerts[0].severity, "warning");
});

Deno.test("buildAlerts: Sportradar budget exactly at threshold (5) → warning", () => {
  const hc = { ...healthyHC, rate_budget: { sportradar_budget_remaining: 5 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].fingerprint, "sportradar_budget_low");
});

Deno.test("buildAlerts: Sportradar budget 6 → no alert", () => {
  const hc = { ...healthyHC, rate_budget: { sportradar_budget_remaining: 6 } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 0);
});

Deno.test("buildAlerts: alert fail rate 25% with ≥10 deliveries → warning", () => {
  const hc = { ...healthyHC, alert_pipeline: { last_hour: { delivered: 30, failed: 10 } } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].fingerprint, "alert_pipeline_fail_rate_high");
});

Deno.test("buildAlerts: alert fail rate 24% → no alert (just under threshold)", () => {
  // 3 failed / 13 total = 23.1%
  const hc = { ...healthyHC, alert_pipeline: { last_hour: { delivered: 10, failed: 3 } } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 0);
});

Deno.test("buildAlerts: fail rate high but fewer than 10 total → no alert (insufficient sample)", () => {
  const hc = { ...healthyHC, alert_pipeline: { last_hour: { delivered: 3, failed: 5 } } };
  const alerts = buildAlerts(hc, healthyDLHC);
  assertEquals(alerts.length, 0);
});

Deno.test("buildAlerts: deep-link no_fallback events → critical", () => {
  const dlhc: DeepLinkHealthResult = {
    status: "healthy",
    no_fallback_events_1h: 2,
    providers: [],
  };
  const alerts = buildAlerts(healthyHC, dlhc);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].fingerprint, "deep_link_no_fallback");
  assertEquals(alerts[0].severity, "critical");
});

Deno.test("buildAlerts: deep-link status critical → critical alert", () => {
  const dlhc: DeepLinkHealthResult = {
    status: "critical",
    no_fallback_events_1h: 0,
    providers: [],
  };
  const alerts = buildAlerts(healthyHC, dlhc);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].severity, "critical");
});

Deno.test("buildAlerts: degraded provider → warning", () => {
  const dlhc: DeepLinkHealthResult = {
    status: "degraded",
    no_fallback_events_1h: 0,
    providers: [{ provider_key: "espn_plus", alert_level: "degraded", fallback_rate_pct: 85, method: "scheme" }],
  };
  const alerts = buildAlerts(healthyHC, dlhc);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].fingerprint, "degraded_providers_espn_plus");
  assertEquals(alerts[0].severity, "warning");
});

Deno.test("buildAlerts: critical provider → critical alert", () => {
  const dlhc: DeepLinkHealthResult = {
    status: "critical",
    no_fallback_events_1h: 1,
    providers: [{ provider_key: "youtube_tv", alert_level: "critical", fallback_rate_pct: 100, method: "no_fallback" }],
  };
  const alerts = buildAlerts(healthyHC, dlhc);
  // Both no_fallback + degraded_providers fire
  const fingerprints = alerts.map((a) => a.fingerprint);
  assertEquals(fingerprints.includes("deep_link_no_fallback"), true);
  assertEquals(fingerprints.includes("degraded_providers_youtube_tv"), true);
  assertEquals(alerts.every((a) => a.severity === "critical"), true);
});

Deno.test("buildAlerts: multiple simultaneous problems → multiple alerts", () => {
  const hc = {
    ...healthyHC,
    watchers: { stale_count: 3, active_count: 5 },
    rate_budget: { sportradar_budget_remaining: 2 },
  };
  const dlhc: DeepLinkHealthResult = {
    status: "degraded",
    no_fallback_events_1h: 0,
    providers: [{ provider_key: "peacock", alert_level: "degraded", fallback_rate_pct: 90, method: "scheme" }],
  };
  const alerts = buildAlerts(hc, dlhc);
  assertEquals(alerts.length, 3); // stale_watchers + budget + degraded provider
});

Deno.test("buildAlerts: fingerprints are stable for same inputs", () => {
  const alerts1 = buildAlerts(
    { ...healthyHC, watchers: { stale_count: 2, active_count: 8 } },
    healthyDLHC
  );
  const alerts2 = buildAlerts(
    { ...healthyHC, watchers: { stale_count: 2, active_count: 8 } },
    healthyDLHC
  );
  assertEquals(alerts1[0].fingerprint, alerts2[0].fingerprint);
});
