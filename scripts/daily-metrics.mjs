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
 *     that pass assertSelectOnly() below. Nothing here writes to the database.
 *   - Output is aggregates only: counts and sums. No emails, names, user ids.
 *   - A metric whose table/column is missing (or whose query errors) is
 *     recorded as null, with the reason under `nulls`.
 *
 * Docs: docs/operations/daily-metrics.md
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || "shijrazlzawjpobrpmnt";
const OUT = process.argv[2] || "metrics-out";
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

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
  // The CMO engine (cmo-generate / cmo-publish / cmo-live-moments) writes
  // public.content_calendar, not public.social_posts, so these are the counts
  // that show whether the day's planned posts went out.
  content_calendar_published_yesterday_by_platform: `select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) as v from (select platform, count(*)::bigint as n from public.content_calendar where status = 'published' and ${inDay("published_at")} group by platform) s`,
  content_calendar_due_yesterday_by_status: `select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) as v from (select status, count(*)::bigint as n from public.content_calendar where ${inDay("scheduled_for")} group by status) s`,
  content_calendar_crosspost_yesterday: `select jsonb_build_object(${["ig", "fb", "tiktok"]
    .map(
      (p) =>
        `'${p}_posted', count(*) filter (where ${p}_post_id is not null and ${inDay(`${p}_attempted_at`)}), '${p}_failed', count(*) filter (where ${p}_post_id is null and ${p}_error is not null and ${p}_error <> 'ig_container_pending' and ${inDay(`${p}_attempted_at`)})`,
    )
    .join(", ")}) as v from public.content_calendar where ig_attempted_at >= ${D0} or fb_attempted_at >= ${D0} or tiktok_attempted_at >= ${D0}`,
  content_calendar_stuck_publishing: `select count(*)::bigint as v from public.content_calendar where status = 'publishing' and updated_at < now() - interval '15 minutes'`,
  live_moments_yesterday_by_outcome: `select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) as v from (select kind || ':' || outcome as k, count(*)::bigint as n from public.social_live_moments where ${inDay("created_at")} group by kind, outcome) s`,
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

function assertSelectOnly(sql) {
  const s = sql.trim().toLowerCase();
  if (!/^(select|with)\b/.test(s)) throw new Error("refusing non-SELECT statement");
  if (s.includes(";")) throw new Error("refusing multi-statement SQL");
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|refresh|lock|set|reset|comment)\b/.test(s.replace(/'[^']*'/g, "''"))) {
    throw new Error("refusing SQL with a write/DDL keyword");
  }
}

let readOnlyEndpoint = true;
let endpointUsed = "read-only";

async function post(url, sql) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function runQuery(sql) {
  assertSelectOnly(sql);
  if (readOnlyEndpoint) {
    const r = await post(`${API}/read-only`, sql);
    if (r.status === 404 || r.status === 405) {
      console.log(`::warning::read-only endpoint returned ${r.status}; falling back to /database/query (SELECT-only enforced client-side).`);
      readOnlyEndpoint = false;
      endpointUsed = "query (select-only guard)";
    } else {
      return r;
    }
  }
  return post(API, sql);
}

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
    const r = await runQuery(sql);
    if (r.status === 401 || r.status === 403) {
      throw Object.assign(new Error(`Management API auth failed (${r.status})`), { fatal: true });
    }
    if (r.status < 200 || r.status >= 300) {
      metrics[key] = null;
      nulls[key] = `query error ${r.status}: ${clean(r.text)}`;
      failures++;
      continue;
    }
    const rows = JSON.parse(r.text);
    metrics[key] = toValue(Array.isArray(rows) && rows[0] ? rows[0].v : null);
  } catch (e) {
    if (e.fatal) {
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
  query_endpoint: endpointUsed,
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
    social_posts_published_yesterday: "legacy public.social_posts pipeline only; the CMO engine posts are in content_calendar_*",
    content_calendar_published_yesterday_by_platform: "content_calendar rows status=published with published_at on report_date, by platform (twitter = X; linkedin)",
    content_calendar_due_yesterday_by_status: "content_calendar rows with scheduled_for on report_date, by current status (failed/paused/publishing = did not go out)",
    content_calendar_crosspost_yesterday: "IG/FB/TikTok cross-posts attempted on report_date: posted (post id saved) vs failed (error saved; IG container still pending is not a failure)",
    content_calendar_stuck_publishing: "rows left in status=publishing more than 15 minutes (a publish run died mid-flight), as of generated_at",
    live_moments_yesterday_by_outcome: "social_live_moments ledger rows created on report_date, by kind:outcome",
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
