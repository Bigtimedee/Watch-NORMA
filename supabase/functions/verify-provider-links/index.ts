// verify-provider-links: Proactive universal-link health verification.
// Runs every 6 hours via pg_cron (migration 069).
//
// For each streaming/TV provider in provider_registry that has a universal_link:
//   1. Fetch the URL (GET with 10s timeout), following redirects.
//   2. Classify the final destination via logic.ts (ok / suspect / broken).
//   3. Record the result in provider_link_checks.
//   4. Post to SLACK_WEBHOOK_URL if status changed from the previous check.
//
// Does NOT modify provider_registry or lib/deep-links.ts — detection only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { classifyUrl, type LinkStatus } from "./logic.ts";

// ---------------------------------------------------------------------------
// Fetch helper with timeout and redirect tracking
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  timeoutMs = 10_000,
): Promise<{ finalUrl: string; httpStatus: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "NORMA-Link-Verifier/1.0 (health check; not a browser)",
      },
    });
    return { finalUrl: res.url || url, httpStatus: res.status };
  } catch (err) {
    return { finalUrl: url, httpStatus: null, error: (err as Error).message ?? "fetch error" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Slack notification
// ---------------------------------------------------------------------------

async function postSlack(
  webhookUrl: string,
  provider: string,
  prev: string,
  curr: string,
  detail: string,
): Promise<void> {
  const emoji = curr === "broken" ? "🚨" : "⚠️";
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${emoji} NORMA: provider link status changed`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *Provider link status changed*\n*Provider:* ${provider}\n*Was:* ${prev} → *Now:* ${curr}\n*Detail:* ${detail}`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: new Date().toISOString() }],
        },
      ],
    }),
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

    // Load streaming/TV providers that have a universal_link configured
    const { data: providers, error: provErr } = await supabase
      .from("streaming_providers") // RLS-safe view over provider_registry
      .select("key, name, universal_link")
      .in("category", ["streaming", "tv"])
      .not("universal_link", "is", null);

    if (provErr) throw new Error(`provider_registry query failed: ${provErr.message}`);

    const rows = providers ?? [];
    const results: Array<{
      provider_key: string;
      status: LinkStatus;
      finalUrl: string;
      httpStatus: number | null;
      reason: string;
      changed: boolean;
    }> = [];

    for (const provider of rows) {
      const { finalUrl, httpStatus, error } = await fetchWithTimeout(provider.universal_link);
      const classification = classifyUrl(finalUrl, httpStatus, error);

      // Get previous check status for change detection
      const { data: prev } = await supabase
        .from("provider_link_checks")
        .select("status")
        .eq("provider_key", provider.key)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevStatus = prev?.status ?? null;
      const changed = prevStatus !== null && prevStatus !== classification.status;

      // Record the check
      await supabase.from("provider_link_checks").insert({
        provider_key: provider.key,
        universal_link_tested: provider.universal_link,
        final_url: finalUrl,
        http_status: httpStatus,
        status: classification.status,
        reason: classification.reason,
        checked_at: new Date().toISOString(),
      });

      // Page on status worsening
      if (changed && classification.status !== "ok" && webhookUrl) {
        await postSlack(webhookUrl, provider.key, prevStatus!, classification.status, classification.reason);
      }

      results.push({
        provider_key: provider.key,
        status: classification.status,
        finalUrl,
        httpStatus,
        reason: classification.reason,
        changed,
      });
    }

    const durationMs = Date.now() - startMs;
    const broken = results.filter((r) => r.status === "broken").length;
    const suspect = results.filter((r) => r.status === "suspect").length;

    console.log(JSON.stringify({
      function: "verify-provider-links",
      event: "completed",
      providers_checked: results.length,
      broken,
      suspect,
      ok: results.length - broken - suspect,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ providers_checked: results.length, broken, suspect, results, duration_ms: durationMs }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const durationMs = Date.now() - startMs;
    console.error("verify-provider-links error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message, duration_ms: durationMs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
