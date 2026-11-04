import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { apiError, chicagoDate, chunk, insightsMap, isSixAmCentral, parseFb, parseIg, parseTikTok, parseXTweet } from "./logic.ts";

Deno.test("parseXTweet maps public + non_public metrics", () => {
  const r = parseXTweet({ id: "1", public_metrics: { impression_count: 100, like_count: 5, reply_count: 2, retweet_count: 3, quote_count: 1 }, non_public_metrics: { url_link_clicks: 4, video: { view_count: 50 } } }, "cc");
  assertEquals([r.impressions, r.likes, r.replies, r.reposts, r.views, r.link_clicks, r.content_calendar_id], [100, 5, 2, 4, 50, 4, "cc"]);
});

Deno.test("parseXTweet public-only (tier without non_public) leaves link_clicks null", () => {
  const r = parseXTweet({ id: "2", public_metrics: { impression_count: 10, like_count: 0, reply_count: 0, retweet_count: 0, quote_count: 0 } }, null);
  assertEquals([r.link_clicks, r.views], [null, 10]);
});

Deno.test("insightsMap handles values[] and total_value and object sums", () => {
  assertEquals(insightsMap({ data: [{ name: "views", values: [{ value: 7 }] }, { name: "likes", total_value: { value: 3 } }, { name: "r", values: [{ value: { like: 2, love: 1 } }] }] }), { views: 7, likes: 3, r: 3 });
});

Deno.test("parseIg falls back to fields when insights missing", () => {
  const r = parseIg("m1", "cc", null, { like_count: 9, comments_count: 1 });
  assertEquals([r.likes, r.replies, r.views], [9, 1, null]);
  const r2 = parseIg("m1", "cc", { data: [{ name: "views", values: [{ value: 40 }] }, { name: "reach", values: [{ value: 30 }] }, { name: "shares", values: [{ value: 2 }] }, { name: "follows", values: [{ value: 1 }] }] }, {});
  assertEquals([r2.views, r2.impressions, r2.reposts, r2.follows], [40, 30, 2, 1]);
});

Deno.test("parseFb video insights + summaries", () => {
  const r = parseFb("v1", null, { data: [{ name: "total_video_impressions", values: [{ value: 80 }] }, { name: "total_video_views", values: [{ value: 20 }] }] }, { likes: { summary: { total_count: 4 } }, comments: { summary: { total_count: 1 } } });
  assertEquals([r.impressions, r.views, r.likes, r.replies], [80, 20, 4, 1]);
});

Deno.test("parseTikTok", () => {
  const r = parseTikTok({ id: "t", view_count: 11, like_count: 2, comment_count: 1, share_count: 0 }, "cc");
  assertEquals([r.views, r.likes, r.replies, r.reposts], [11, 2, 1, 0]);
});

Deno.test("apiError redacts tokens", () => {
  assertEquals(apiError(400, { error: { code: 10, message: "bad access_token=abc123" } }), "http_400:10:bad access_token=***");
});

Deno.test("6 AM CT gate is DST-safe across 11:00/12:00 UTC", () => {
  assertEquals(isSixAmCentral(new Date("2026-11-04T12:00:00Z")), true); // CST
  assertEquals(isSixAmCentral(new Date("2026-11-04T11:00:00Z")), false);
  assertEquals(isSixAmCentral(new Date("2026-07-04T11:00:00Z")), true); // CDT
  assertEquals(isSixAmCentral(new Date("2026-07-04T12:00:00Z")), false);
  assertEquals(chicagoDate(new Date("2026-11-05T03:00:00Z")), "2026-11-04");
  assertEquals(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});
