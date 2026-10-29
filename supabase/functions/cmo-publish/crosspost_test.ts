import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  crossPostRow,
  type CrossCreds,
  type CrossDeps,
  type CrossRow,
  NOT_CONFIGURED,
  planCrossPost,
  postFacebookVideo,
  postInstagramReel,
  postTikTokVideo,
  readCrossCreds,
} from "./crosspost.ts";

const NOW = new Date("2026-10-29T16:05:00Z");
const VID = "https://x.supabase.co/storage/v1/object/public/m/tnf.mp4";
const ALL: CrossCreds = {
  ig: { userId: "IG", token: "t" },
  fb: { pageId: "PG", token: "t" },
  tiktok: { token: "t", privacyLevel: "SELF_ONLY" },
};
const row = (o: Partial<CrossRow> = {}): CrossRow => ({
  id: "r1",
  platform: "twitter",
  status: "published",
  body: "TNF tonight. NORMA tells you when to tune in.",
  hashtags: ["TNF"],
  media_urls: [VID],
  published_at: "2026-10-29T16:00:00Z",
  ...o,
});

function deps(creds: CrossCreds, fail: Partial<Record<"ig" | "fb" | "tiktok", boolean>> = {}) {
  const claimed = new Set<string>();
  const saves: Array<[string, Record<string, unknown>]> = [];
  const posts: string[] = [];
  const d: CrossDeps = {
    creds,
    claim: (_id, p) => {
      if (claimed.has(p)) return Promise.resolve(false);
      claimed.add(p);
      return Promise.resolve(true);
    },
    save: (_id, p, patch) => {
      saves.push([p, patch]);
      return Promise.resolve();
    },
    post: {
      ig: () => (posts.push("ig"), fail.ig ? Promise.reject(new Error("ig boom")) : Promise.resolve("IG1")),
      fb: () => (posts.push("fb"), fail.fb ? Promise.reject(new Error("fb boom")) : Promise.resolve("FB1")),
      tiktok: () => (posts.push("tiktok"), fail.tiktok ? Promise.reject(new Error("tt boom")) : Promise.resolve("TT1")),
    },
    log: () => {},
  };
  return { d, saves, posts, claimed };
}

Deno.test("plan: caption = body + missing hashtags; would post", () => {
  const p = planCrossPost(row(), "ig", ALL, NOW);
  assertEquals(p.kind, "post");
  if (p.kind === "post") assertEquals(p.caption, "TNF tonight. NORMA tells you when to tune in.\n\n#TNF");
});

Deno.test("plan: guards", () => {
  assertEquals(planCrossPost(row({ media_urls: ["a.png"] }), "ig", ALL, NOW), { kind: "skip", reason: "no_video", claim: false });
  assertEquals(planCrossPost(row({ body: "ask @nfl" }), "fb", ALL, NOW).kind, "skip");
  assertEquals((planCrossPost(row({ body: "ask @nfl" }), "fb", ALL, NOW) as { reason: string }).reason, "mention_blocked");
  assertEquals((planCrossPost(row({ body: "Norma says go" }), "ig", ALL, NOW) as { reason: string }).reason, "brand_case: NORMA must be caps");
  assertEquals(planCrossPost(row({ body: "getnorma.app and @ in mail dtm@getnorma.app" }), "ig", ALL, NOW).kind, "post");
  assert((planCrossPost(row({ body: "x".repeat(2300) }), "tiktok", ALL, NOW) as { reason: string }).reason.startsWith("over_length"));
  assertEquals((planCrossPost(row({ status: "paused" }), "ig", ALL, NOW) as { reason: string }).reason, "not_published_on_x");
  assertEquals((planCrossPost(row({ published_at: "2026-10-28T00:00:00Z" }), "ig", ALL, NOW) as { reason: string }).reason, "outside_window");
  assertEquals(planCrossPost(row({ ig_post_id: "1" }), "ig", ALL, NOW).kind, "done");
  assertEquals(planCrossPost(row({ ig_attempted_at: "x" }), "ig", ALL, NOW).kind, "done");
});

Deno.test("missing creds -> not_configured, no claim, no post", async () => {
  const { d, saves, posts, claimed } = deps({});
  const out = await crossPostRow(row(), d, NOW, false);
  assertEquals(out.map((o) => o.result), ["skipped", "skipped", "skipped"]);
  assertEquals(posts.length, 0);
  assertEquals(claimed.size, 0);
  assertEquals(saves.every(([, p]) => p.error === NOT_CONFIGURED), true);
  // already recorded -> no rewrite
  const again = deps({});
  await crossPostRow(row({ ig_error: NOT_CONFIGURED, fb_error: NOT_CONFIGURED, tiktok_error: NOT_CONFIGURED }), again.d, NOW, false);
  assertEquals(again.saves.length, 0);
});

Deno.test("one platform failing does not block the others", async () => {
  const { d, saves, posts } = deps(ALL, { ig: true });
  const out = await crossPostRow(row(), d, NOW, false);
  assertEquals(posts, ["ig", "fb", "tiktok"]);
  assertEquals(out.map((o) => o.result), ["failed", "posted", "posted"]);
  assertEquals(saves.find(([p]) => p === "ig")![1].error, "ig boom");
  assertEquals(saves.find(([p]) => p === "fb")![1].post_id, "FB1");
});

Deno.test("idempotent: lost claim -> no post", async () => {
  const { d, posts, claimed } = deps(ALL);
  claimed.add("ig");
  claimed.add("fb");
  claimed.add("tiktok");
  const out = await crossPostRow(row(), d, NOW, false);
  assertEquals(posts.length, 0);
  assertEquals(out.every((o) => o.result === "skipped"), true);
});

Deno.test("dry run: intent only, no claim/save/post", async () => {
  const { d, saves, posts, claimed } = deps({ ig: ALL.ig });
  const out = await crossPostRow(row(), d, NOW, true);
  assertEquals(out.map((o) => o.result), ["would_post", "skipped", "skipped"]);
  assertEquals([saves.length, posts.length, claimed.size], [0, 0, 0]);
});

Deno.test("readCrossCreds: names and SELF_ONLY default", () => {
  const env: Record<string, string> = { META_INSTAGRAM_USER_ID: "1", META_INSTAGRAM_ACCESS_TOKEN: "a", TIKTOK_ACCESS_TOKEN: "b" };
  const c = readCrossCreds((k) => env[k]);
  assert(c.ig && !c.fb);
  assertEquals(c.tiktok?.privacyLevel, "SELF_ONLY");
});

function mockFetch(routes: Array<[RegExp, () => Response]>) {
  const calls: string[] = [];
  const f = ((input: string | URL | Request) => {
    const u = String(input);
    calls.push(u);
    const r = routes.find(([re]) => re.test(u));
    return Promise.resolve(r ? r[1]() : new Response("nf", { status: 404 }));
  }) as typeof fetch;
  return { f, calls };
}
const J = (o: unknown) => () => new Response(JSON.stringify(o), { status: 200 });

Deno.test("IG client: container -> poll -> publish", async () => {
  let n = 0;
  const { f, calls } = mockFetch([
    [/\/IG\/media$/, J({ id: "C1" })],
    [/\/C1\?fields/, () => new Response(JSON.stringify({ status_code: n++ ? "FINISHED" : "IN_PROGRESS" }))],
    [/media_publish/, J({ id: "M1" })],
  ]);
  const id = await postInstagramReel(ALL.ig!, VID, "cap", { fetch: f, sleep: () => Promise.resolve() });
  assertEquals(id, "M1");
  assertEquals(calls.length, 4);
});

Deno.test("IG client: ERROR status throws", async () => {
  const { f } = mockFetch([[/\/IG\/media$/, J({ id: "C1" })], [/\/C1\?/, J({ status_code: "ERROR" })]]);
  let threw = false;
  try {
    await postInstagramReel(ALL.ig!, VID, "c", { fetch: f, sleep: () => Promise.resolve() });
  } catch { threw = true; }
  assert(threw);
});

Deno.test("FB client: /videos file_url", async () => {
  const { f } = mockFetch([[/\/PG\/videos$/, J({ id: "V1" })]]);
  assertEquals(await postFacebookVideo(ALL.fb!, VID, "c", { fetch: f }), "V1");
});

Deno.test("TikTok client: creator_info -> download -> init -> PUT", async () => {
  const { f, calls } = mockFetch([
    [/creator_info/, J({ data: { privacy_level_options: ["SELF_ONLY"] } })],
    [/tnf\.mp4$/, () => new Response(new Uint8Array(10))],
    [/video\/init/, J({ data: { publish_id: "P1", upload_url: "https://up.tiktok/u" } })],
    [/up\.tiktok/, () => new Response("", { status: 201 })],
  ]);
  assertEquals(await postTikTokVideo(ALL.tiktok!, VID, "c", { fetch: f }), "P1");
  assertEquals(calls.length, 4);
});

Deno.test("TikTok client: disallowed privacy throws before upload", async () => {
  const { f, calls } = mockFetch([[/creator_info/, J({ data: { privacy_level_options: ["SELF_ONLY"] } })]]);
  let threw = false;
  try {
    await postTikTokVideo({ token: "t", privacyLevel: "PUBLIC_TO_EVERYONE" }, VID, "c", { fetch: f });
  } catch { threw = true; }
  assert(threw);
  assertEquals(calls.length, 1);
});
