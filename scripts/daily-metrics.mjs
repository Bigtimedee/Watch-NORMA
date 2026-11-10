#!/usr/bin/env node
/**
 * Daily NORMA usage scorecard: READ-ONLY aggregate queries against the hosted
 * Supabase project, written as JSON for the `metrics` branch.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=shijrazlzawjpobrpmnt \
 *     node scripts/daily-metrics.mjs <out-dir>
 *
 * Writes <out-dir>/daily/<report_date>.json and <out-dir>/latest.json.
 * report_date is "yesterday" on the America/Chicago calendar; every *_yesterday
 * metric covers [00:00, 24:00) CT of that day.
 *
 * Safety:
 *   - Uses the Management API read-only query endpoint
 *     (POST /v1/projects/{ref}/database/query/read-only). If that endpoint is
 *     unavailable it falls back to /database/query, but only for statements
 *     that pass the SELECT-only guard. Reads are paced and retried on 429.
 *     Nothing here writes to the database.
 *   - Output is aggregates only: counts and sums. No emails, names, user ids.
 *   - A metric whose table/column is missing (or whose query errors) is
 *     recorded as null, with the reason under `nulls`.
 *
 * Docs: docs/operations/daily-metrics.md
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createManagementQuery, ManagementQueryError } from "./lib/management-query.mjs";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || "shijrazlzawjpobrpmnt";
const OUT = process.argv[2] || "metrics-out";
if (!TOKEN) {
  console.error("::error::SUPABASE_ACCESS_TOKEN is not set.");
  process.exit(1);
}

// CT-day window boundaries, evaluated by Postgres.
const CT = "'America/Chicago'";
const TODAY_CT = `(now() at time zone ${CT})::date`;
const D0 = `((${TODAY_CT} - 1)::timestamp at time zone ${CT})`; // start of yesterday CT
const D1 = `((${TODAY_CT})::timestamp at time zone ${CT})`; // start of today CT
const W7 = `((${TODAY_CT} - 7)::timestamp at time zone ${CT})`; // 7 CT days ending yesterday
const W30 = `((${TODAY_CT} - 30)::timestamp at time zone ${CT})`; // 30 CT days ending yesterday
const inDay = (col) => `${col} >= ${D0} and ${col} < ${D1}`;

// Activity = any signed-in user who logged an app_events row or a deep-link
// tap. (app_events only records tracked actions, so this is a floor.)
const activeSince = (start) => `
  select count(distinct user_id)::bigint as v from (
    select user_id from public.app_events where created_at >= ${start} and created_at < ${D1}
    union all
    select user_id from public.deep_link_events where user_id is not null and created_at >= ${start} and created_at < ${D1}
  ) a`;

/** Each metric: key -> SQL returning one row with column `v`. */
const METRICS = {
  users_total: `select count(*)::bigint as v from auth.users`,
  profiles_total: `select count(*)::bigint as v from public.profiles`,
  new_signups_yesterday: `select count(*)::bigint as v from public.profiles where ${inDay("created_at")}`,
  auth_sign_ins_yesterday: `select count(*)::bigint as v from auth.users where ${inDay("last_sign_in_at")}`,
  dau: activeSince(D0),
  wau: activeSince(W7),
  mau: activeSince(W30),
  push_sent_yesterday: `select count(*)::bigint as v from public.delivery_log where channel = 'push' and status = 'sent' and ${inDay("created_at")}`,
  push_failed_yesterday: `select count(*)::bigint as v from public.delivery_log where channel = 'push' and status = 'failed' and ${inDay("created_at")}`,
  push_alerts_read_yesterday: `select count(*)::bigint as v from public.alerts where push_sent and read and ${inDay("created_at")}`,
  referral_codes_total: `select count(*)::bigint as v from public.referral_codes`,
  referral_codes_created_yesterday: `select count(*)::bigint as v from public.referral_codes where ${inDay("created_at")}`,
  referral_link_clicks_yesterday: `select count(*)::bigint as v from public.referral_clicks where ${inDay("created_at")}`,
  referrals_redeemed_yesterday: `select count(*)::bigint as v from public.referrals where ${inDay("created_at")}`,
  referrals_redeemed_total: `select count(*)::bigint as v from public.referrals`,
  referrals_qualified_yesterday: `select count(*)::bigint as v from public.referrals where ${inDay("qualified_at")}`,
  guest_mode_sessions_yesterday: `select count(*)::bigint as v from public.web_events where event_name = 'guest_mode_started' and ${inDay("created_at")}`,
  social_posts_published_yesterday: `select count(*)::bigint as v from public.social_posts where status = 'published' and ${inDay("published_at")}`,
  social_posts_published_yesterday_by_platform: `select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) as v from (select platform, count(*)::bigint as n from public.social_posts where status = 'published' and ${inDay("published_at")} group by platform) s`,
  social_metrics_daily_summary_latest: `select coalesce(jsonb_agg(to_jsonb(s) order by s.platform), '[]'::jsonb) as v from public.social_metrics_daily_summary s where s.date = (select max(date) from public.social_metrics_daily_summary)`,
  ad_campaigns_active: `select count(*)::bigint as v from public.campaigns where status = 'active'`,
  ad_impressions_yesterday: `select count(*)::bigint as v from public.impressions where ${inDay("delivered_at")}`,
  ad_clicks_yesterday: `select count(*)::bigint as v from public.ad_clicks where ${inDay("clicked_at")}`,
  ad_spend_cents_yesterday: `select coalesce(sum(clearing_price_cents), 0)::bigint as v from public.impressions where ${inDay("delivered_at")}`,
  advertiser_accounts_total: `select count(*)::bigint as v from public.advertisers`,
};

/** Push open tracking does not exist (no open event / column); recorded as null. */
const NOT_TRACKED = {
  push_opened_yesterday:
    "not tracked: no notification-open event or column exists; see push_alerts_read_yesterday (pushed alerts marked read in-app) as a proxy",
};

const api = createManagementQuery({
  token: TOKEN,
  projectRef: REF,
  // One read per metric, plus bounded 429 retries. Not a per-row scan.
  readBudget: 160,
  onWarning: (msg) => console.log(`::warning::${msg}`),
});

function clean(msg) {
  // Keep Postgres' message only; never echo tokens or headers.
  try {
    const j = JSON.parse(msg);
    msg = j.message || j.error || msg;
  } catch {
    /* plain text */
  }
  return String(msg).replace(/\s+/g, " ").slice(0, 240);
}

function toValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return v;
}

const ctDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
const now = new Date();
const reportDate = ctDate(new Date(now.getTime() - 24 * 3600 * 1000));

const metrics = {};
const nulls = {};
let failures = 0;

for (const [key, sql] of Object.entries(METRICS)) {
  try {
    const rows = await api.read(sql);
    metrics[key] = toValue(Array.isArray(rows) && rows[0] ? rows[0].v : null);
  } catch (e) {
    if (e instanceof ManagementQueryError && e.code === "auth") {
      console.error(`::error::${e.message}. Check the SUPABASE_ACCESS_TOKEN repo secret.`);
      process.exit(1);
    }
    metrics[key] = null;
    nulls[key] = clean(e.message);
    failures++;
  }
}
for (const [key, reason] of Object.entries(NOT_TRACKED)) {
  metrics[key] = null;
  nulls[key] = reason;
}

const total = Object.keys(METRICS).length;
if (failures === total) {
  console.error("::error::Every metric query failed:");
  for (const [k, v] of Object.entries(nulls)) console.error(`  ${k}: ${v}`);
  process.exit(1);
}

const out = {
  schema_version: 1,
  report_date: reportDate,
  timezone: "America/Chicago",
  generated_at: now.toISOString(),
  project_ref: REF,
  query_endpoint: api.route,
  definitions: {
    window: "*_yesterday = report_date 00:00-24:00 America/Chicago; wau = 7 CT days ending report_date; mau = 30 CT days ending report_date",
    users_total: "auth.users rows",
    new_signups_yesterday: "profiles created on report_date",
    auth_sign_ins_yesterday: "auth.users whose last_sign_in_at falls on report_date",
    dau_wau_mau: "distinct signed-in users with an app_events or deep_link_events row in the window (tracked actions only, so a floor)",
    push_sent_yesterday: "delivery_log channel=push status=sent",
    push_alerts_read_yesterday: "alerts created on report_date with push_sent and read=true (open proxy)",
    referrals_redeemed: "referrals rows (a referred user claimed a code)",
    guest_mode_sessions_yesterday: "web_events guest_mode_started",
    social_metrics_daily_summary_latest: "all platform rows of public.social_metrics_daily_summary for its latest date",
    ad_spend_cents_yesterday: "sum of impressions.clearing_price_cents delivered on report_date",
  },
  metrics,
  nulls,
};

mkdirSync(join(OUT, "daily"), { recursive: true });
const body = JSON.stringify(out, null, 2) + "\n";
writeFileSync(join(OUT, "daily", `${reportDate}.json`), body);
writeFileSync(join(OUT, "latest.json"), body);
console.log(`Wrote metrics for ${reportDate}: ${total - failures}/${total} queries ok.`);
for (const [k, v] of Object.entries(nulls)) console.log(`  null ${k}: ${v}`);
