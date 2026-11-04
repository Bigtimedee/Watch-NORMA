// cmo-metrics: daily 06:00 America/Chicago engagement + follower snapshot.
// Trigger: pg_cron 'cmo-metrics-daily' at 11:00 and 12:00 UTC; the SQL and this
// function both gate on local hour == 6 CT, so exactly one run per day across DST.
// POST {"force":true} bypasses the hour gate (manual run).
//
// Sources (last 30 days of published content_calendar X rows + their cross-posts):
//   X:      GET /2/tweets (public_metrics, + non_public/organic when the tier allows), /2/users/me
//   IG:     GET /{media}/insights + like_count/comments_count, /{ig-user}?fields=followers_count
//   FB:     GET /{video}/video_insights + likes/comments summary, /{page}?fields=followers_count
//   TikTok: POST /v2/video/query, GET /v2/user/info — skipped as not_configured without a token
// Each platform is isolated: a permission/tier error is recorded in
// social_metrics_runs.errors and the run continues.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildOAuth1HeaderForMetrics } from "../_shared/x-oauth.ts";
import { readCrossCreds, META_GRAPH, TIKTOK_API } from "../cmo-publish/crosspost.ts";
import {
  apiError, chicagoDate, chunk, isSixAmCentral, LOOKBACK_DAYS, type MetricRow,
  parseFb, parseIg, parseTikTok, parseXTweet, type Platform,
} from "./logic.ts";

interface CcRow {
  id: string;
  platform_post_id: string | null;
  ig_post_id: string | null;
  fb_post_id: string | null;
  tiktok_post_id: string | null;
}

type Errs = Partial<Record<Platform, string[]>>;
const env = (k: string) => Deno.env.get(k)?.replace(/\s+/g, "") || undefined;

async function getJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, body };
}

async function xGet(base: string, params: Record<string, string>) {
  const creds = {
    apiKey: env("X_CONSUMER_KEY")!, apiSecret: env("X_CONSUMER_SECRET")!,
    accessToken: env("X_ACCESS_TOKEN")!, accessSecret: env("X_ACCESS_TOKEN_SECRET")!,
  };
  const auth = await buildOAuth1HeaderForMetrics("GET", base, params, creds);
  return getJson(`${base}?${new URLSearchParams(params)}`, { headers: { Authorization: auth } });
}

async function runX(rows: CcRow[], out: MetricRow[], followers: Record<string, number>, errs: Errs) {
  if (!env("X_CONSUMER_KEY") || !env("X_ACCESS_TOKEN")) { (errs.x ??= []).push("not_configured"); return; }
  const me = await xGet("https://api.twitter.com/2/users/me", { "user.fields": "public_metrics" });
  // deno-lint-ignore no-explicit-any
  const fc = (me.body as any)?.data?.public_metrics?.followers_count;
  if (me.ok && typeof fc === "number") followers.x = fc;
  else (errs.x ??= []).push(`followers:${apiError(me.status, me.body)}`);

  const byId = new Map(rows.filter((r) => r.platform_post_id).map((r) => [r.platform_post_id!, r.id]));
  for (const ids of chunk([...byId.keys()], 100)) {
    // non_public/organic metrics need owner context and are limited to 30 days on most tiers.
    let res = await xGet("https://api.twitter.com/2/tweets", { ids: ids.join(","), "tweet.fields": "public_metrics,non_public_metrics,organic_metrics" });
    if (!res.ok) {
      (errs.x ??= []).push(`non_public_metrics:${apiError(res.status, res.body)}`);
      res = await xGet("https://api.twitter.com/2/tweets", { ids: ids.join(","), "tweet.fields": "public_metrics" });
    }
    if (!res.ok) { (errs.x ??= []).push(`tweets:${apiError(res.status, res.body)}`); continue; }
    // deno-lint-ignore no-explicit-any
    const b = res.body as any;
    for (const t of b?.data ?? []) out.push(parseXTweet(t, byId.get(String(t.id)) ?? null));
    for (const e of b?.errors ?? []) (errs.x ??= []).push(`tweet:${e.resource_id ?? e.value}:${e.title ?? e.detail}`);
  }
}

async function runIg(rows: CcRow[], out: MetricRow[], followers: Record<string, number>, errs: Errs) {
  const c = readCrossCreds(env).ig;
  if (!c) { (errs.ig ??= []).push("not_configured"); return; }
  const tok = `access_token=${encodeURIComponent(c.token)}`;
  const f = await getJson(`${META_GRAPH}/${c.userId}?fields=followers_count&${tok}`);
  // deno-lint-ignore no-explicit-any
  const fc = (f.body as any)?.followers_count;
  if (f.ok && typeof fc === "number") followers.ig = fc; else (errs.ig ??= []).push(`followers:${apiError(f.status, f.body)}`);
  for (const r of rows.filter((r) => r.ig_post_id)) {
    const id = r.ig_post_id!;
    const fields = await getJson(`${META_GRAPH}/${id}?fields=like_count,comments_count,media_product_type&${tok}`);
    let ins = await getJson(`${META_GRAPH}/${id}/insights?metric=views,reach,likes,comments,shares,saved,total_interactions&${tok}`);
    if (!ins.ok) {
      (errs.ig ??= []).push(`insights:${id}:${apiError(ins.status, ins.body)}`);
      ins = { ok: false, status: ins.status, body: null };
    }
    if (!fields.ok && !ins.ok) { (errs.ig ??= []).push(`media:${id}:${apiError(fields.status, fields.body)}`); continue; }
    out.push(parseIg(id, r.id, ins.ok ? ins.body : null, fields.ok ? fields.body : null));
  }
}

async function runFb(rows: CcRow[], out: MetricRow[], followers: Record<string, number>, errs: Errs) {
  const c = readCrossCreds(env).fb;
  if (!c) { (errs.fb ??= []).push("not_configured"); return; }
  const tok = `access_token=${encodeURIComponent(c.token)}`;
  const f = await getJson(`${META_GRAPH}/${c.pageId}?fields=followers_count,fan_count&${tok}`);
  // deno-lint-ignore no-explicit-any
  const fb = f.body as any;
  const fc = fb?.followers_count ?? fb?.fan_count;
  if (f.ok && typeof fc === "number") followers.fb = fc; else (errs.fb ??= []).push(`followers:${apiError(f.status, f.body)}`);
  for (const r of rows.filter((r) => r.fb_post_id)) {
    const id = r.fb_post_id!;
    const fields = await getJson(`${META_GRAPH}/${id}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0)&${tok}`);
    // One metric per call: Graph rejects the whole request if any metric is invalid
    // for this video type (#100), so keep whichever ones are supported.
    const data: unknown[] = [];
    let lastErr = "";
    for (const m of ["total_video_impressions", "total_video_views", "total_video_reactions_by_type_total", "blue_reels_play_count", "post_video_followers"]) {
      const r1 = await getJson(`${META_GRAPH}/${id}/video_insights?metric=${m}&${tok}`);
      // deno-lint-ignore no-explicit-any
      if (r1.ok) data.push(...((r1.body as any)?.data ?? [])); else lastErr = `${m}:${apiError(r1.status, r1.body)}`;
    }
    const ins = { ok: data.length > 0, status: 200, body: { data } };
    if (!ins.ok) (errs.fb ??= []).push(`video_insights:${id}:${lastErr}`);
    if (!fields.ok && !ins.ok) { (errs.fb ??= []).push(`video:${id}:${apiError(fields.status, fields.body)}`); continue; }
    out.push(parseFb(id, r.id, ins.ok ? ins.body : null, fields.ok ? fields.body : null));
  }
}

async function runTikTok(rows: CcRow[], out: MetricRow[], followers: Record<string, number>, errs: Errs) {
  const c = readCrossCreds(env).tiktok;
  if (!c) { (errs.tiktok ??= []).push("not_configured"); return; }
  const h = { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" };
  const u = await getJson(`${TIKTOK_API}/user/info/?fields=follower_count`, { headers: h });
  // deno-lint-ignore no-explicit-any
  const fc = (u.body as any)?.data?.user?.follower_count;
  if (u.ok && typeof fc === "number") followers.tiktok = fc; else (errs.tiktok ??= []).push(`followers:${apiError(u.status, u.body)}`);
  const byId = new Map(rows.filter((r) => r.tiktok_post_id).map((r) => [r.tiktok_post_id!, r.id]));
  for (const ids of chunk([...byId.keys()], 20)) {
    const res = await getJson(`${TIKTOK_API}/video/query/?fields=id,view_count,like_count,comment_count,share_count`, {
      method: "POST", headers: h, body: JSON.stringify({ filters: { video_ids: ids } }),
    });
    if (!res.ok) { (errs.tiktok ??= []).push(`video_query:${apiError(res.status, res.body)}`); continue; }
    // deno-lint-ignore no-explicit-any
    for (const v of (res.body as any)?.data?.videos ?? []) out.push(parseTikTok(v, byId.get(String(v.id)) ?? null));
  }
}

Deno.serve(async (req) => {
  let payload: { force?: boolean; source?: string } = {};
  try { payload = await req.json(); } catch { /* empty */ }
  const now = new Date();
  if (!payload.force && !isSixAmCentral(now)) {
    return Response.json({ success: true, skipped: true, reason: "not_6am_ct", at: now.toISOString() });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 864e5).toISOString();
  const { data, error } = await db.from("content_calendar")
    .select("id, platform_post_id, ig_post_id, fb_post_id, tiktok_post_id")
    .eq("platform", "twitter").eq("status", "published").gte("published_at", since)
    .order("published_at", { ascending: false }).limit(300);
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as CcRow[];

  const out: MetricRow[] = [];
  const followers: Record<string, number> = {};
  const errs: Errs = {};
  const runners: [Platform, typeof runX][] = [["x", runX], ["ig", runIg], ["fb", runFb], ["tiktok", runTikTok]];
  for (const [p, fn] of runners) {
    try { await fn(rows, out, followers, errs); } catch (e) { (errs[p] ??= []).push(`exception:${String((e as Error)?.message ?? e).slice(0, 200)}`); }
  }

  const captured_at = now.toISOString();
  let written = 0;
  if (out.length) {
    const { error: ie } = await db.from("social_metrics").insert(out.map((r) => ({ ...r, captured_at })));
    if (ie) (errs as Record<string, string[]>).db = [`social_metrics:${ie.message}`]; else written = out.length;
  }
  const day = chicagoDate(now);
  const fRows = Object.entries(followers).map(([platform, follower_count]) => ({ platform, date: day, follower_count, captured_at }));
  if (fRows.length) {
    const { error: fe } = await db.from("social_follower_daily").upsert(fRows, { onConflict: "platform,date" });
    if (fe) ((errs as Record<string, string[]>).db ??= []).push(`social_follower_daily:${fe.message}`);
  }
  const perPlatform = Object.fromEntries(["x", "ig", "fb", "tiktok"].map((p) => [p, out.filter((r) => r.platform === p).length]));
  await db.from("social_metrics_runs").insert({ ran_at: captured_at, source: payload.source ?? "direct", posts_considered: rows.length, metrics_written: written, per_platform: perPlatform, followers, errors: errs });

  return Response.json({ success: true, date_ct: day, posts_considered: rows.length, metrics_written: written, per_platform: perPlatform, followers, errors: errs });
});
