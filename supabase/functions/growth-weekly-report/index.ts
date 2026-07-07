// growth-weekly-report
// Called by pg_cron every Monday at 12:00 UTC (8 AM ET, summer/DST).
// Compiles a 7-day vs prior-7-day internal growth report, emails the admin,
// and stores the result in growth_reports.
//
// Env vars required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase
//   RESEND_API_KEY                           — add in Supabase project secrets
//   GROWTH_REPORT_EMAIL                      — admin email (defaults to admin@getnorma.app)
//   PUBLIC_APP_URL (optional)               — defaults to https://getnorma.app

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildHtmlEmail, type GrowthMetrics, type MomentBreakdownRow } from "./logic.ts";

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://getnorma.app";
const ADMIN_EMAIL = Deno.env.get("GROWTH_REPORT_EMAIL") ?? "admin@getnorma.app";
const RESEND_FROM = "NORMA <reports@getnorma.app>";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Returns [start, end] inclusive as ISO date strings for a completed 7-day window.
// offset=0 → the trailing 7 days ending yesterday (Mon 8 AM = report for Mon–Sun).
// offset=-1 → the 7 days before that.
function weekBounds(now: Date, offsetWeeks: number): [Date, Date] {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1 + offsetWeeks * 7);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return [start, end];
}

// ---------------------------------------------------------------------------
// Resend sender
// ---------------------------------------------------------------------------

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  resendKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.resendKey}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function countAppEvents(
  supabase: ReturnType<typeof createClient>,
  eventName: string,
  start: Date,
  end: Date,
): Promise<number> {
  const { count } = await supabase
    .from("app_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", eventName)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  return count ?? 0;
}

async function querySignups(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  return count ?? 0;
}

async function queryAvgDau(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  // Count distinct user_id per calendar day, then average over 7 days.
  const { data } = await supabase
    .from("app_events")
    .select("user_id, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (!data || data.length === 0) return 0;

  const byDay = new Map<string, Set<string>>();
  for (const row of data as Array<{ user_id: string; created_at: string }>) {
    const day = row.created_at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day)!.add(row.user_id);
  }
  const total = [...byDay.values()].reduce((acc, s) => acc + s.size, 0);
  return Math.round(total / 7);
}

async function queryAlertsDelivered(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { count } = await supabase
    .from("delivery_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  return count ?? 0;
}

async function queryShareEvents(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { count } = await supabase
    .from("share_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  return count ?? 0;
}

async function queryReferralSignups(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { count } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  return count ?? 0;
}

interface IntentMomentStats {
  total: number;
  filled: number;
  avg_clearing_cents: number | null;
  breakdown: MomentBreakdownRow[];
}

async function queryIntentMoments(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<IntentMomentStats> {
  const { data } = await supabase
    .from("intent_moments")
    .select("moment_type, auction_outcome, clearing_price_cents")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (!data || data.length === 0) {
    return { total: 0, filled: 0, avg_clearing_cents: null, breakdown: [] };
  }

  const rows = data as Array<{
    moment_type: string;
    auction_outcome: string;
    clearing_price_cents: number | null;
  }>;

  let filled = 0;
  let clearingSum = 0;
  let clearingCount = 0;
  const byType = new Map<string, { count: number; filled: number; clearingSum: number; clearingCount: number }>();

  for (const row of rows) {
    const isFilled = row.auction_outcome === "filled";
    if (isFilled) {
      filled++;
      if (row.clearing_price_cents != null) {
        clearingSum += row.clearing_price_cents;
        clearingCount++;
      }
    }
    if (!byType.has(row.moment_type)) {
      byType.set(row.moment_type, { count: 0, filled: 0, clearingSum: 0, clearingCount: 0 });
    }
    const entry = byType.get(row.moment_type)!;
    entry.count++;
    if (isFilled) {
      entry.filled++;
      if (row.clearing_price_cents != null) {
        entry.clearingSum += row.clearing_price_cents;
        entry.clearingCount++;
      }
    }
  }

  const breakdown: MomentBreakdownRow[] = [...byType.entries()]
    .map(([moment_type, e]) => ({
      moment_type,
      count: e.count,
      filled: e.filled,
      avg_clearing_cents: e.clearingCount > 0 ? Math.round(e.clearingSum / e.clearingCount) : null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    filled,
    avg_clearing_cents: clearingCount > 0 ? Math.round(clearingSum / clearingCount) : null,
    breakdown,
  };
}

async function queryRevenue(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { data } = await supabase
    .from("impressions")
    .select("clearing_price_cents")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (!data) return 0;
  return (data as Array<{ clearing_price_cents: number }>).reduce(
    (acc, row) => acc + (row.clearing_price_cents ?? 0),
    0,
  );
}

async function queryActiveAdvertisers(
  supabase: ReturnType<typeof createClient>,
  start: Date,
  end: Date,
): Promise<number> {
  const { data } = await supabase
    .from("impressions")
    .select("campaign_id, campaigns!inner(advertiser_id)")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (!data) return 0;
  const ids = new Set(
    (data as Array<{ campaigns: { advertiser_id: number } }>).map(
      (r) => r.campaigns.advertiser_id,
    ),
  );
  return ids.size;
}

async function queryRetentionLatest(supabase: ReturnType<typeof createClient>): Promise<{
  cohort_week: string | null;
  d1_pct: number | null;
  d7_pct: number | null;
}> {
  const { data } = await supabase
    .from("retention_cohorts")
    .select("cohort_week, d1_pct, d7_pct")
    .order("cohort_week", { ascending: false })
    .limit(1)
    .single();

  if (!data) return { cohort_week: null, d1_pct: null, d7_pct: null };
  return {
    cohort_week: (data as any).cohort_week,
    d1_pct: (data as any).d1_pct,
    d7_pct: (data as any).d7_pct,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const [thisStart, thisEnd] = weekBounds(now, 0);
    const [priorStart, priorEnd] = weekBounds(now, -1);
    const periodStart = isoDate(thisStart);
    const periodEnd = isoDate(thisEnd);

    // Check if we already sent this period's report (idempotent)
    const { data: existing } = await supabase
      .from("growth_reports")
      .select("id")
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Report already sent for this period", period_start: periodStart }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gather metrics in parallel where possible
    const [
      new_signups,
      new_signups_prior,
      avg_dau,
      avg_dau_prior,
      alerts_delivered,
      alerts_delivered_prior,
      watch_taps,
      watch_taps_prior,
      share_events_count,
      share_events_prior,
      referral_signups,
      referral_signups_prior,
      rating_prompt_fires,
      rating_prompt_prior,
      thisAuction,
      priorAuction,
      revenue_cents,
      revenue_prior_cents,
      active_advertiser_count,
      retention,
    ] = await Promise.all([
      querySignups(supabase, thisStart, thisEnd),
      querySignups(supabase, priorStart, priorEnd),
      queryAvgDau(supabase, thisStart, thisEnd),
      queryAvgDau(supabase, priorStart, priorEnd),
      queryAlertsDelivered(supabase, thisStart, thisEnd),
      queryAlertsDelivered(supabase, priorStart, priorEnd),
      countAppEvents(supabase, "watch_tap", thisStart, thisEnd),
      countAppEvents(supabase, "watch_tap", priorStart, priorEnd),
      queryShareEvents(supabase, thisStart, thisEnd),
      queryShareEvents(supabase, priorStart, priorEnd),
      queryReferralSignups(supabase, thisStart, thisEnd),
      queryReferralSignups(supabase, priorStart, priorEnd),
      countAppEvents(supabase, "review_prompt_shown", thisStart, thisEnd),
      countAppEvents(supabase, "review_prompt_shown", priorStart, priorEnd),
      queryIntentMoments(supabase, thisStart, thisEnd),
      queryIntentMoments(supabase, priorStart, priorEnd),
      queryRevenue(supabase, thisStart, thisEnd),
      queryRevenue(supabase, priorStart, priorEnd),
      queryActiveAdvertisers(supabase, thisStart, thisEnd),
      queryRetentionLatest(supabase),
    ]);

    const fillRatePct = thisAuction.total > 0
      ? Math.round((thisAuction.filled / thisAuction.total) * 1000) / 10
      : null;
    const fillRatePriorPct = priorAuction.total > 0
      ? Math.round((priorAuction.filled / priorAuction.total) * 1000) / 10
      : null;

    const metrics: GrowthMetrics = {
      period_start: periodStart,
      period_end: periodEnd,
      new_signups,
      new_signups_prior,
      avg_dau,
      avg_dau_prior,
      retention_cohort_week: retention.cohort_week,
      retention_d1_pct: retention.d1_pct,
      retention_d7_pct: retention.d7_pct,
      alerts_delivered,
      alerts_delivered_prior,
      watch_taps,
      watch_taps_prior,
      share_events_count,
      share_events_prior,
      referral_signups,
      referral_signups_prior,
      rating_prompt_fires,
      rating_prompt_prior,
      intent_moments_total: thisAuction.total,
      intent_moments_prior: priorAuction.total,
      fill_rate_pct: fillRatePct,
      fill_rate_prior_pct: fillRatePriorPct,
      avg_clearing_cents: thisAuction.avg_clearing_cents,
      revenue_cents,
      revenue_prior_cents,
      active_advertiser_count,
      moment_breakdown: thisAuction.breakdown,
    };

    // Store report
    const { error: insertError } = await supabase
      .from("growth_reports")
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        report_json: metrics,
        email_status: "pending",
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to insert growth_reports row", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build and send email
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let emailStatus = "skipped";
    let emailError: string | undefined;

    if (resendKey) {
      const html = buildHtmlEmail(metrics, APP_URL);
      const emailResult = await sendEmail({
        to: ADMIN_EMAIL,
        subject: `NORMA Growth Report: ${periodStart} to ${periodEnd}`,
        html,
        resendKey,
      });
      emailStatus = emailResult.ok ? "sent" : "failed";
      emailError = emailResult.error;
    } else {
      emailStatus = "skipped";
      emailError = "RESEND_API_KEY not configured";
    }

    await supabase
      .from("growth_reports")
      .update({ email_status: emailStatus, email_error: emailError ?? null })
      .eq("period_start", periodStart);

    const duration = Date.now() - t0;
    console.log(JSON.stringify({
      function: "growth-weekly-report",
      period_start: periodStart,
      period_end: periodEnd,
      new_signups,
      avg_dau,
      alerts_delivered,
      intent_moments: thisAuction.total,
      revenue_cents,
      email_status: emailStatus,
      duration_ms: duration,
    }));

    return new Response(
      JSON.stringify({ ok: true, period_start: periodStart, period_end: periodEnd, email_status: emailStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
