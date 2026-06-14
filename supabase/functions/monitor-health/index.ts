// monitor-health: Scheduled watchdog that calls health-check + deep-link-health-check
// and pages to Slack when thresholds are breached.
// Runs every 5 min via pg_cron (migration 067).
// Dedup: identical alert fingerprints within COOLDOWN_MINUTES are suppressed via ops_alert_state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const COOLDOWN_MINUTES = 30;

// Threshold constants — breach any one → Slack alert
const STALE_WATCHER_THRESHOLD = 2;   // stale watcher count before paging
const RATE_BUDGET_LOW_THRESHOLD = 5; // Sportradar calls remaining before paging
const ALERT_FAIL_RATE_THRESHOLD = 0.25; // 25% delivery failure rate → page

interface HealthCheckResult {
  status: string;
  watchers: {
    stale_count: number;
    active_count: number;
  };
  rate_budget: {
    sportradar_budget_remaining: number;
  };
  alert_pipeline: {
    last_hour: {
      delivered: number;
      failed: number;
    };
  };
}

interface DeepLinkHealthResult {
  status: string;
  no_fallback_events_1h: number;
  providers: Array<{
    provider_key: string;
    alert_level: string;
    fallback_rate_pct: number;
    method: string;
  }>;
}

interface AlertPayload {
  fingerprint: string;
  severity: "warning" | "critical";
  title: string;
  body: string;
}

async function fetchHealthCheck(baseUrl: string, serviceKey: string): Promise<HealthCheckResult> {
  const res = await fetch(`${baseUrl}/functions/v1/health-check`, {
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
  return res.json();
}

async function fetchDeepLinkHealth(baseUrl: string, serviceKey: string): Promise<DeepLinkHealthResult> {
  const res = await fetch(`${baseUrl}/functions/v1/deep-link-health-check`, {
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
  return res.json();
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

async function postSlack(webhookUrl: string, alert: AlertPayload): Promise<void> {
  const emoji = alert.severity === "critical" ? "🚨" : "⚠️";
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${emoji} NORMA Health: ${alert.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *NORMA Health Alert*\n*${alert.title}*\n${alert.body}`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Severity: ${alert.severity} · ${new Date().toISOString()}` }],
        },
      ],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

    const supabase = createClient(supabaseUrl, serviceKey);

    const [hc, dlhc] = await Promise.all([
      fetchHealthCheck(supabaseUrl, serviceKey),
      fetchDeepLinkHealth(supabaseUrl, serviceKey),
    ]);

    const candidates = buildAlerts(hc, dlhc);
    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - COOLDOWN_MINUTES * 60_000).toISOString();

    let paged = 0;
    let suppressed = 0;

    for (const alert of candidates) {
      // Check dedup: is there an existing row for this fingerprint within cooldown?
      const { data: existing } = await supabase
        .from("ops_alert_state")
        .select("id")
        .eq("fingerprint", alert.fingerprint)
        .gte("last_paged_at", cooldownCutoff)
        .maybeSingle();

      if (existing) {
        suppressed++;
        continue;
      }

      // Upsert dedup record before posting (idempotent on network error)
      await supabase.from("ops_alert_state").upsert(
        { fingerprint: alert.fingerprint, severity: alert.severity, title: alert.title, last_paged_at: now.toISOString() },
        { onConflict: "fingerprint" }
      );

      if (webhookUrl) {
        await postSlack(webhookUrl, alert);
        paged++;
      }
    }

    const durationMs = Date.now() - startMs;

    console.log(JSON.stringify({
      function: "monitor-health",
      event: "completed",
      health_status: hc.status,
      deep_link_status: dlhc.status,
      alerts_paged: paged,
      alerts_suppressed: suppressed,
      duration_ms: durationMs,
      timestamp: now.toISOString(),
    }));

    return new Response(
      JSON.stringify({
        health_status: hc.status,
        deep_link_status: dlhc.status,
        alerts_evaluated: candidates.length,
        alerts_paged: paged,
        alerts_suppressed: suppressed,
        duration_ms: durationMs,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error("monitor-health error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, duration_ms: durationMs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
