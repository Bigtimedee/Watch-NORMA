// advertiser-weekly-report
// Called by pg_cron every Monday at 13:00 UTC (9 AM ET, summer/DST).
// For each advertiser with an active or recently-completed campaign:
//   1. Compute current-week and prior-week metrics
//   2. Generate one rule-based insight
//   3. Build HTML email via buildHtmlEmail()
//   4. Send via Resend API (env: RESEND_API_KEY)
//   5. Log outcome to report_log
//
// Env vars required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase
//   RESEND_API_KEY                           — add in Supabase project secrets
//   PUBLIC_APP_URL (optional)               — defaults to https://getnorma.app

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildHtmlEmail,
  computeDeltas,
  computeWeeklyMetrics,
  generateInsight,
  type ImpressionRow,
  type ConversionRow,
} from "./logic.ts";

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://getnorma.app";
const BILLING_URL = `${APP_URL}/billing`;
const RESEND_FROM = "NORMA <reports@getnorma.app>";

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
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Returns [periodStart, periodEnd] as Date objects for a given week offset.
// offset=0 → the last completed Mon–Sun; offset=-1 → the week before that.
function weekBounds(referenceMonday: Date, offsetWeeks: number): [Date, Date] {
  const start = new Date(referenceMonday);
  start.setUTCDate(start.getUTCDate() + offsetWeeks * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return [start, end];
}

// Most recent completed Monday (the start of the just-finished week).
function lastMonday(now: Date): Date {
  const d = new Date(now);
  // getUTCDay(): 0=Sun, 1=Mon, … 6=Sat
  const dayOfWeek = d.getUTCDay();
  // Days since last Monday: if today is Mon (1) → 7 days ago; if Sun (0) → 6 days ago
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek;
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error(JSON.stringify({ function: "advertiser-weekly-report", event: "missing_resend_key" }));
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const monday = lastMonday(now);
  const [curStart, curEnd] = weekBounds(monday, 0);
  const [priorStart, priorEnd] = weekBounds(monday, -1);

  const curStartStr = isoDate(curStart);
  const curEndStr = isoDate(curEnd);
  const priorStartStr = isoDate(priorStart);
  const priorEndStr = isoDate(priorEnd);

  // Fetch advertisers that have at least one non-draft campaign
  const { data: advertisers, error: advErr } = await supabase
    .from("advertisers")
    .select("id, name, auth_user_id")
    .not("auth_user_id", "is", null);

  if (advErr || !advertisers) {
    console.error(JSON.stringify({ function: "advertiser-weekly-report", event: "fetch_advertisers_error", error: advErr?.message }));
    return new Response(JSON.stringify({ error: advErr?.message ?? "No advertisers" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const adv of advertisers) {
    // Does this advertiser have any campaigns that are active or completed in the last 30 days?
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);

    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("advertiser_id", adv.id)
      .in("status", ["active", "completed", "paused"])
      .or(`flight_end.is.null,flight_end.gte.${cutoff.toISOString()}`)
      .limit(1);

    if (!campaigns || campaigns.length === 0) {
      skipped++;
      continue;
    }

    const campaignIds = campaigns.map((c: { id: number }) => c.id);

    // Fetch all campaign IDs for this advertiser (for metric queries)
    const { data: allCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("advertiser_id", adv.id)
      .in("status", ["active", "completed", "paused"]);

    const allCampaignIds: number[] = (allCampaigns ?? []).map((c: { id: number }) => c.id);

    // Helper: fetch impression rows for a date range
    async function fetchImpressions(start: string, end: string): Promise<ImpressionRow[]> {
      const { data } = await supabase
        .from("impressions")
        .select(`
          id,
          clearing_price_cents,
          tapped_at,
          moment_type,
          bids!inner(creative_id, creatives!inner(variant_label))
        `)
        .in("campaign_id", allCampaignIds)
        .gte("delivered_at", `${start}T00:00:00Z`)
        .lte("delivered_at", `${end}T23:59:59Z`);

      return (data ?? []).map((row: any) => ({
        id: row.id,
        clearing_price_cents: row.clearing_price_cents,
        tapped_at: row.tapped_at ?? null,
        moment_type: row.moment_type ?? null,
        creative_id: row.bids?.creative_id ?? null,
        variant_label: row.bids?.creatives?.variant_label ?? null,
      }));
    }

    // Helper: fetch conversions for a set of impression IDs
    async function fetchConversions(impressionIds: number[]): Promise<ConversionRow[]> {
      if (impressionIds.length === 0) return [];
      const { data } = await supabase
        .from("conversions")
        .select("impression_id, conversion_type")
        .in("impression_id", impressionIds);
      return data ?? [];
    }

    const [curImps, priorImps] = await Promise.all([
      fetchImpressions(curStartStr, curEndStr),
      fetchImpressions(priorStartStr, priorEndStr),
    ]);

    const [curConvs, priorConvs] = await Promise.all([
      fetchConversions(curImps.map((i) => i.id)),
      fetchConversions(priorImps.map((i) => i.id)),
    ]);

    const currentMetrics = computeWeeklyMetrics(curImps, curConvs);
    const priorMetrics = computeWeeklyMetrics(priorImps, priorConvs);
    const deltas = computeDeltas(currentMetrics, priorMetrics);

    // Max bid across all active bids for this advertiser
    const { data: maxBidRow } = await supabase
      .from("bids")
      .select("bid_cents")
      .in("campaign_id", allCampaignIds)
      .eq("status", "active")
      .order("bid_cents", { ascending: false })
      .limit(1)
      .single();

    const maxBidCents: number = maxBidRow?.bid_cents ?? 0;
    const insight = generateInsight(currentMetrics, maxBidCents);

    // Get advertiser email from auth
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(adv.auth_user_id);
    if (userErr || !user?.email) {
      console.warn(JSON.stringify({ function: "advertiser-weekly-report", event: "no_email", advertiser_id: adv.id }));
      skipped++;
      continue;
    }

    const emailTo = user.email;
    const subject = `NORMA: Your Weekly Report (${curStartStr} – ${curEndStr})`;
    const html = buildHtmlEmail({
      advertiserName: adv.name,
      periodStart: curStartStr,
      periodEnd: curEndStr,
      current: currentMetrics,
      prior: priorMetrics,
      deltas,
      insight,
      billingUrl: BILLING_URL,
    });

    const sendResult = await sendEmail({ to: emailTo, subject, html, resendKey });

    // Log to report_log regardless of send outcome
    await supabase.from("report_log").insert({
      advertiser_id: adv.id,
      report_type: "weekly",
      period_start: curStartStr,
      period_end: curEndStr,
      email_to: emailTo,
      impressions: currentMetrics.impressions,
      spend_cents: currentMetrics.spendCents,
      conversions: currentMetrics.totalConversions,
      status: sendResult.ok ? "sent" : "failed",
      error_detail: sendResult.error ?? null,
    });

    if (sendResult.ok) {
      sent++;
    } else {
      failed++;
      console.error(JSON.stringify({
        function: "advertiser-weekly-report",
        event: "send_failed",
        advertiser_id: adv.id,
        error: sendResult.error,
      }));
    }
  }

  console.log(JSON.stringify({
    function: "advertiser-weekly-report",
    event: "completed",
    period: `${curStartStr}/${curEndStr}`,
    sent,
    skipped,
    failed,
    timestamp: now.toISOString(),
  }));

  return new Response(JSON.stringify({ sent, skipped, failed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
