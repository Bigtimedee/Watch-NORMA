// deep-link-health-check: Streaming provider deep link failure detection
// Queries deep_link_events from the past hour and flags providers whose native
// scheme success rate has collapsed, indicating a broken scheme or mass uninstall.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Thresholds
const FALLBACK_RATE_ALERT_PCT = 80;   // % of attempts that fell back
const MIN_EVENTS_FOR_ALERT = 10;      // ignore providers with too few events to be meaningful
const NO_FALLBACK_CRITICAL_COUNT = 1; // any no_fallback event is critical — user got nothing

interface ProviderStats {
  provider_key: string;
  method: string;
  platform: string | null;
  total_events: number;
  fallback_count: number;
  fallback_rate_pct: number;
  no_fallback_count: number;
  alert_level: "ok" | "degraded" | "critical";
}

interface HealthReport {
  status: "healthy" | "degraded" | "critical";
  providers: Array<{
    provider_key: string;
    fallback_rate_pct: number;
    method: string;
    alert_level: "ok" | "degraded" | "critical";
  }>;
  no_fallback_events_1h: number;
  checked_at: string;
  duration_ms: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    // Pull all events from the past hour, grouped by provider + method + platform
    const { data: rows, error } = await supabase
      .from("deep_link_events")
      .select("provider_key, method, platform, fallback_triggered, success")
      .gte("created_at", oneHourAgo);

    if (error) {
      throw new Error(`deep_link_events query failed: ${error.message}`);
    }

    const events = rows ?? [];

    // Aggregate into per-(provider, method, platform) buckets
    const buckets = new Map<string, ProviderStats>();

    for (const ev of events) {
      const key = `${ev.provider_key}||${ev.method}||${ev.platform ?? "unknown"}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          provider_key: ev.provider_key,
          method: ev.method,
          platform: ev.platform,
          total_events: 0,
          fallback_count: 0,
          fallback_rate_pct: 0,
          no_fallback_count: 0,
          alert_level: "ok",
        });
      }

      const bucket = buckets.get(key)!;
      bucket.total_events += 1;
      if (ev.fallback_triggered) {
        bucket.fallback_count += 1;
      }
      if (ev.method === "no_fallback") {
        bucket.no_fallback_count += 1;
      }
    }

    // Calculate rates and assign alert levels
    let overallStatus: "healthy" | "degraded" | "critical" = "healthy";
    let totalNoFallbackEvents = 0;

    for (const bucket of buckets.values()) {
      bucket.fallback_rate_pct =
        bucket.total_events > 0
          ? Math.round((bucket.fallback_count / bucket.total_events) * 1000) / 10
          : 0;

      totalNoFallbackEvents += bucket.no_fallback_count;

      // Critical: any event where the user got nothing (no URL opened at all)
      if (bucket.no_fallback_count >= NO_FALLBACK_CRITICAL_COUNT) {
        bucket.alert_level = "critical";
        overallStatus = "critical";
        continue;
      }

      // Degraded: native scheme is collapsing for a statistically meaningful sample
      if (
        bucket.total_events >= MIN_EVENTS_FOR_ALERT &&
        bucket.fallback_rate_pct >= FALLBACK_RATE_ALERT_PCT
      ) {
        bucket.alert_level = "degraded";
        if (overallStatus !== "critical") {
          overallStatus = "degraded";
        }
        continue;
      }

      bucket.alert_level = "ok";
    }

    const providerSummary = Array.from(buckets.values())
      .sort((a, b) => b.fallback_rate_pct - a.fallback_rate_pct)
      .map((b) => ({
        provider_key: b.provider_key,
        fallback_rate_pct: b.fallback_rate_pct,
        method: b.method,
        alert_level: b.alert_level,
      }));

    const report: HealthReport = {
      status: overallStatus,
      providers: providerSummary,
      no_fallback_events_1h: totalNoFallbackEvents,
      checked_at: now.toISOString(),
      duration_ms: Date.now() - startMs,
    };

    console.log(
      JSON.stringify({
        function: "deep-link-health-check",
        event: "completed",
        status: report.status,
        providers_checked: buckets.size,
        no_fallback_events_1h: report.no_fallback_events_1h,
        total_events_1h: events.length,
        duration_ms: report.duration_ms,
        timestamp: now.toISOString(),
      })
    );

    const httpStatus =
      report.status === "critical"
        ? 503
        : report.status === "degraded"
        ? 200
        : 200;

    return new Response(JSON.stringify(report, null, 2), {
      status: httpStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error("deep-link-health-check error:", error);
    return new Response(
      JSON.stringify({
        status: "critical",
        error: (error as Error).message,
        duration_ms: durationMs,
        checked_at: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
