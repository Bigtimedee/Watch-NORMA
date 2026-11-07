// Growth plan (2026-11-07): Live Moments + Today's Games on X, platform-split
// creative for IG/FB/TikTok. Locks the cmo-publish side of the contract.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyPublishCandidate,
  dailyCapBucket,
  GUARD_REASON_ADVICE_LANGUAGE,
  GUARD_REASON_EMPTY_MEDIA,
  GUARD_REASON_STALE,
  GUARD_REASON_STATIC_MEDIA,
  guardHoldNote,
  type CalendarPublishCandidate,
} from "./logic.ts";
import {
  captionForPlatform,
  crossPostRow,
  type CrossCreds,
  type CrossDeps,
  type CrossRow,
  planCrossPost,
} from "./crosspost.ts";
import { parseXTextOnlyFormats } from "../_shared/social-formats.ts";

const NOW = new Date("2026-11-08T21:00:00Z");
const DUE = "2026-11-08T20:58:00Z";

const row = (o: Partial<CalendarPublishCandidate> = {}): CalendarPublishCandidate => ({
  id: "lm1",
  platform: "twitter",
  status: "scheduled",
  body: "Two-minute drill. Kansas City Chiefs up 3, 1:45 left in the 4th.\nWatch: CBS\nhttps://getnorma.app/games/nfl/2026-11-08/a-at-b?utm_source=x&utm_campaign=live_moment",
  scheduled_for: DUE,
  media_urls: [],
  hashtags: [],
  content_type: "live_moment",
  ...o,
});

Deno.test("live_moment with no media publishes text-only on X", () => {
  const d = classifyPublishCandidate(row(), NOW);
  assertEquals(d.kind, "publish");
  if (d.kind === "publish") assertEquals(d.textOnly, true);
});

Deno.test("todays_games with no media publishes text-only on X", () => {
  const d = classifyPublishCandidate(row({ content_type: "todays_games" }), NOW);
  assertEquals(d.kind, "publish");
});

Deno.test("existing scheduled posts keep the video-only rule (empty / static media held)", () => {
  const empty = classifyPublishCandidate(row({ content_type: "post" }), NOW);
  assertEquals(empty.kind === "pause" && empty.reason, GUARD_REASON_EMPTY_MEDIA);
  const png = classifyPublishCandidate(row({ content_type: "post", media_urls: ["https://x/s.png"] }), NOW);
  assertEquals(png.kind === "pause" && png.reason, GUARD_REASON_STATIC_MEDIA);
  const vid = classifyPublishCandidate(row({ content_type: "post", media_urls: ["https://x/v.mp4"] }), NOW);
  assertEquals(vid.kind, "publish");
  if (vid.kind === "publish") assertEquals(vid.textOnly, undefined);
});

Deno.test("kill switch SOCIAL_X_TEXT_FORMATS=none restores video-only for the new formats", () => {
  const opts = { textOnlyFormats: parseXTextOnlyFormats("none") };
  const d = classifyPublishCandidate(row(), NOW, opts);
  assertEquals(d.kind === "pause" && d.reason, GUARD_REASON_EMPTY_MEDIA);
  assertEquals([...parseXTextOnlyFormats(undefined)].sort(), ["live_moment", "todays_games"]);
  assertEquals([...parseXTextOnlyFormats("live_moment")], ["live_moment"]);
  assertEquals([...parseXTextOnlyFormats("live_moment,bogus")], ["live_moment"]);
});

Deno.test("Live Moment is stale after 20 minutes (rule 6); other formats keep 3h", () => {
  const late = classifyPublishCandidate(row({ scheduled_for: "2026-11-08T20:35:00Z" }), NOW);
  assertEquals(late.kind === "pause" && late.reason, GUARD_REASON_STALE);
  const okTodays = classifyPublishCandidate(row({ content_type: "todays_games", scheduled_for: "2026-11-08T20:35:00Z" }), NOW);
  assertEquals(okTodays.kind, "publish");
});

Deno.test("X advice guard holds picks / lock / guaranteed / risk-free copy, any format", () => {
  for (const body of ["Lock of the day: KC -3", "Guaranteed winner", "Risk-free bet tonight", "Our picks for SNF"]) {
    for (const content_type of ["live_moment", "post"]) {
      const d = classifyPublishCandidate(
        row({ body, content_type, media_urls: content_type === "post" ? ["https://x/v.mp4"] : [] }),
        NOW,
      );
      assertEquals(d.kind, "pause", `${content_type}: ${body}`);
      if (d.kind === "pause") {
        assertEquals(d.reason, GUARD_REASON_ADVICE_LANGUAGE);
        assert(d.detail?.startsWith("advice_language: "));
      }
    }
  }
  // Bettor-facing but non-advisory copy is fine on X.
  assertEquals(classifyPublishCandidate(row({ body: "Your parlay is alive into OT. Tune in." }), NOW).kind, "publish");
  // Lock screen is product copy, not a "lock".
  assertEquals(classifyPublishCandidate(row({ body: "Alerts on your lock screen" }), NOW).kind, "publish");
  const note = guardHoldNote(GUARD_REASON_ADVICE_LANGUAGE, NOW, undefined, "advice_language: lock");
  assert(note.includes("advice_language: lock") && note.includes("status=draft"));
});

Deno.test("non-X / paused rows are still never published (unchanged contract)", () => {
  assertEquals(classifyPublishCandidate(row({ platform: "instagram" }), NOW).kind, "skip");
  assertEquals(classifyPublishCandidate(row({ status: "paused" }), NOW).kind, "skip");
});

Deno.test("daily cap buckets: live moments separate from scheduled posts", () => {
  assertEquals(dailyCapBucket("live_moment"), "live");
  assertEquals(dailyCapBucket("todays_games"), "scheduled");
  assertEquals(dailyCapBucket("post"), "scheduled");
  assertEquals(dailyCapBucket(null), "scheduled");
});

// ---------------------------------------------------------------------------
// Cross-post: platform-split creative + Live Moment caps
// ---------------------------------------------------------------------------

const VID = "https://x.supabase.co/storage/v1/object/public/m/clip.mp4";
const ALL: CrossCreds = {
  ig: { userId: "IG", token: "t" },
  fb: { pageId: "PG", token: "t" },
  tiktok: { token: "t", privacyLevel: "SELF_ONLY" },
};
const xrow = (o: Partial<CrossRow> = {}): CrossRow => ({
  id: "r1",
  platform: "twitter",
  status: "published",
  body: "TNF tonight. NORMA tells you when to tune in.",
  hashtags: [],
  media_urls: [VID],
  published_at: "2026-11-08T20:55:00Z",
  ...o,
});

Deno.test("cross-post blocks an X body with betting terms on IG, FB and TikTok (claimed, recorded)", () => {
  const r = xrow({ body: "Your parlay is alive. NORMA pings you when it matters." });
  for (const p of ["ig", "fb", "tiktok"] as const) {
    const plan = planCrossPost(r, p, ALL, NOW);
    assertEquals(plan.kind, "skip");
    if (plan.kind === "skip") {
      assertEquals(plan.reason, "betting_terms_blocked: parlay");
      assertEquals(plan.claim, true);
    }
  }
});

Deno.test("cross-post uses the per-platform utility caption instead of the X body", () => {
  const r = xrow({
    body: "Your parlay is alive into OT.",
    platform_captions: { ig: "Overtime. Tune in now.", tiktok: "Overtime! Where to watch in bio." },
  });
  const ig = planCrossPost(r, "ig", ALL, NOW);
  assertEquals(ig.kind === "post" && ig.caption, "Overtime. Tune in now.");
  const tt = planCrossPost(r, "tiktok", ALL, NOW);
  assertEquals(tt.kind === "post" && tt.caption, "Overtime! Where to watch in bio.");
  // fb has no utility caption -> falls back to the X body -> blocked.
  const fb = planCrossPost(r, "fb", ALL, NOW);
  assertEquals(fb.kind === "skip" && fb.reason, "betting_terms_blocked: parlay");
  assertEquals(captionForPlatform(r, "fb"), "Your parlay is alive into OT.");
});

Deno.test("a betting-term utility caption is blocked too", () => {
  const r = xrow({ platform_captions: { tiktok: "Odds just flipped" } });
  const tt = planCrossPost(r, "tiktok", ALL, NOW);
  assertEquals(tt.kind === "skip" && tt.reason, "betting_terms_blocked: odds");
});

Deno.test("Live Moment cross-post: 1/h per platform cap and 20-min window", () => {
  const lm = xrow({ content_type: "live_moment", body: "OVERTIME. Tune in." });
  assertEquals(planCrossPost(lm, "ig", ALL, NOW, { ig: 0 }).kind, "post");
  const capped = planCrossPost(lm, "ig", ALL, NOW, { ig: 1 });
  assertEquals(capped.kind === "skip" && capped.reason, "live_moment_rate_cap");
  assertEquals(capped.kind === "skip" && capped.claim, false);
  const old = planCrossPost({ ...lm, published_at: "2026-11-08T20:30:00Z" }, "ig", ALL, NOW, {});
  assertEquals(old.kind === "skip" && old.reason, "outside_window");
  // A regular row from 30 min ago is still inside the 6h window.
  assertEquals(planCrossPost(xrow({ published_at: "2026-11-08T20:30:00Z" }), "ig", ALL, NOW).kind, "post");
});

Deno.test("Live Moments without video never cross-post (X text-only for now)", () => {
  const lm = xrow({ content_type: "live_moment", media_urls: [] });
  for (const p of ["ig", "fb", "tiktok"] as const) {
    const plan = planCrossPost(lm, p, ALL, NOW, {});
    assertEquals(plan.kind === "skip" && plan.reason, "no_video");
  }
});

Deno.test("crossPostRow increments the live counter so a second Live Moment in the same sweep is capped", async () => {
  const counts = { ig: 0, fb: 0, tiktok: 0 };
  const posted: string[] = [];
  const d: CrossDeps = {
    creds: ALL,
    liveMomentCounts: counts,
    claim: () => Promise.resolve(true),
    save: () => Promise.resolve(),
    post: {
      ig: () => (posted.push("ig"), Promise.resolve("IG1")),
      fb: () => (posted.push("fb"), Promise.resolve("FB1")),
      tiktok: () => (posted.push("tiktok"), Promise.resolve("TT1")),
    },
    log: () => {},
  };
  const lm = (id: string) => xrow({ id, content_type: "live_moment", body: "OVERTIME. Tune in." });
  await crossPostRow(lm("a"), d, NOW, false);
  const second = await crossPostRow(lm("b"), d, NOW, false);
  assertEquals(posted, ["ig", "fb", "tiktok"]);
  assertEquals(counts, { ig: 1, fb: 1, tiktok: 1 });
  assert(second.every((o) => o.result === "skipped" && o.reason === "live_moment_rate_cap"));
});
