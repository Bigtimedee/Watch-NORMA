// cmo-metrics pure helpers (no I/O) — parsers from platform API payloads into
// social_metrics rows. Unit-tested in logic_test.ts.

export type Platform = "x" | "ig" | "fb" | "tiktok";

export interface MetricRow {
  platform: Platform;
  post_id: string;
  content_calendar_id: string | null;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
  follows: number | null;
  link_clicks: number | null;
  raw: unknown;
}

export const LOOKBACK_DAYS = 30;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null;

const empty = (platform: Platform, post_id: string, ccid: string | null, raw: unknown): MetricRow => ({
  platform, post_id, content_calendar_id: ccid, impressions: null, likes: null, replies: null,
  reposts: null, views: null, follows: null, link_clicks: null, raw,
});

/** X API v2 tweet object (public_metrics + optional non_public/organic). */
// deno-lint-ignore no-explicit-any
export function parseXTweet(t: any, ccid: string | null): MetricRow {
  const pub = t.public_metrics ?? {};
  const np = t.non_public_metrics ?? {};
  const org = t.organic_metrics ?? {};
  const r = empty("x", String(t.id), ccid, t);
  r.impressions = num(pub.impression_count) ?? num(org.impression_count) ?? num(np.impression_count);
  r.likes = num(pub.like_count);
  r.replies = num(pub.reply_count);
  r.reposts = (num(pub.retweet_count) ?? 0) + (num(pub.quote_count) ?? 0);
  r.views = num(np.video?.view_count) ?? num(org.video?.view_count) ?? r.impressions;
  r.follows = null;
  r.link_clicks = num(np.url_link_clicks) ?? num(org.url_link_clicks);
  return r;
}

/** Graph API insights {data:[{name, values:[{value}]}] | {name,total_value:{value}}} -> name->value */
// deno-lint-ignore no-explicit-any
export function insightsMap(payload: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of payload?.data ?? []) {
    const v = d?.total_value?.value ?? d?.values?.[0]?.value;
    if (typeof v === "number") out[d.name] = v;
    else if (v && typeof v === "object") {
      // e.g. reactions by type -> sum
      out[d.name] = Object.values(v).reduce((a: number, b) => a + (typeof b === "number" ? b : 0), 0);
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
export function parseIg(mediaId: string, ccid: string | null, insights: any, fields: any): MetricRow {
  const m = insightsMap(insights);
  const r = empty("ig", mediaId, ccid, { insights, fields });
  r.views = m.views ?? m.plays ?? m.ig_reels_aggregated_all_plays_count ?? null;
  r.impressions = m.impressions ?? m.reach ?? r.views;
  r.likes = m.likes ?? num(fields?.like_count);
  r.replies = m.comments ?? num(fields?.comments_count);
  r.reposts = m.shares ?? null;
  r.follows = m.follows ?? null;
  r.link_clicks = m.profile_activity ?? null;
  return r;
}

// deno-lint-ignore no-explicit-any
export function parseFb(videoId: string, ccid: string | null, insights: any, fields: any): MetricRow {
  const m = insightsMap(insights);
  const r = empty("fb", videoId, ccid, { insights, fields });
  r.impressions = m.total_video_impressions ?? null;
  r.views = m.total_video_views ?? m.blue_reels_play_count ?? num(fields?.views) ?? null;
  r.likes = m.total_video_reactions_by_type_total ?? num(fields?.likes?.summary?.total_count);
  r.replies = num(fields?.comments?.summary?.total_count);
  r.reposts = num(fields?.shares?.count) ?? null;
  r.follows = m.post_video_followers ?? null;
  r.link_clicks = null;
  return r;
}

// deno-lint-ignore no-explicit-any
export function parseTikTok(v: any, ccid: string | null): MetricRow {
  const r = empty("tiktok", String(v.id), ccid, v);
  r.views = num(v.view_count);
  r.impressions = r.views;
  r.likes = num(v.like_count);
  r.replies = num(v.comment_count);
  r.reposts = num(v.share_count);
  return r;
}

/** Extract a compact error string from a fetch result without leaking tokens. */
export function apiError(status: number, body: unknown): string {
  // deno-lint-ignore no-explicit-any
  const b = body as any;
  const msg = b?.error?.message ?? b?.title ?? b?.detail ?? b?.errors?.[0]?.message ?? b?.error?.code ?? "";
  const code = b?.error?.code ?? b?.status ?? "";
  return `http_${status}${code ? `:${code}` : ""}${msg ? `:${String(msg).slice(0, 200)}` : ""}`.replace(/access_token=[^&\s]+/g, "access_token=***");
}

/** Chicago calendar date (YYYY-MM-DD) for `at`. */
export function chicagoDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(at);
}

/** Cron fires at 11:00 and 12:00 UTC; only the one that is 06:xx CT runs (DST-safe). */
export function isSixAmCentral(at: Date): boolean {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(at);
  return Number(h) === 6;
}

export function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
