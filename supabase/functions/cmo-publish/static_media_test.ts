// =============================================================================
// cmo-publish: video-only rule (Dave, 2026-10-18)
// NORMA social posts are interactive video / motion graphics ONLY. Rows whose
// media contains no video file must pause as static_media and never ship —
// e.g. ffb62eb5 (NFL W6 slate PNG due 2026-10-18 11:00 CT) and b57d8303
// (advertiser PNG due 2026-10-20). Empty media still reports empty_media.
// =============================================================================

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type CalendarPublishCandidate,
  classifyPublishCandidate,
  GUARD_REASON_EMPTY_MEDIA,
  GUARD_REASON_STATIC_MEDIA,
  guardHoldNote,
  hasVideoMedia,
  isStaticMediaUrl,
  isVideoMediaUrl,
  mayMutateCalendarStatus,
  mediaUrlExtension,
  selectPublishMediaUrl,
  staticMediaFlag,
} from "./logic.ts";

const SLOT = "2026-10-18T16:00:00.000Z"; // Sun 11:00 CT — ffb62eb5 slot
const NOW = new Date(SLOT);
const STATIC_PNG =
  "https://shijrazlzawjpobrpmnt.supabase.co/storage/v1/object/public/social-images/norma-screenshots/norma-x-20261018-slate-nfl-w6.png?v=d3699871";

function row(overrides: Partial<CalendarPublishCandidate> = {}): CalendarPublishCandidate {
  return {
    id: "ffb62eb5-c8a8-4252-9e33-d14caf5563cd",
    platform: "twitter",
    status: "draft",
    body: "NORMA sees your wagers and predictions. getnorma.app #WatchNORMA #NFL",
    scheduled_for: SLOT,
    media_urls: [STATIC_PNG],
    hashtags: ["WatchNORMA", "NFL"],
    ...overrides,
  };
}

Deno.test("static-only PNG (ffb62eb5 shape) is paused static_media, never published", () => {
  const d = classifyPublishCandidate(row(), NOW);
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") assertEquals(d.reason, GUARD_REASON_STATIC_MEDIA);
  assertEquals(mayMutateCalendarStatus(d), true);
  assert(!("tweetBody" in d), "no tweet body may be produced for a static row");
});

Deno.test("static-only extensions all pause: png/jpg/jpeg/webp/gif (query strings ignored)", () => {
  for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "PNG"]) {
    const d = classifyPublishCandidate(
      row({ media_urls: [`https://cdn.example.com/creative.${ext}?v=1`] }),
      NOW,
    );
    assertEquals(d.kind, "pause", ext);
    if (d.kind === "pause") assertEquals(d.reason, GUARD_REASON_STATIC_MEDIA, ext);
  }
});

Deno.test("video passes: mp4/mov/m4v publish (case + query insensitive)", () => {
  for (const name of ["tour.mp4", "tour.MOV?v=2", "tour.m4v#x", "tour.mp4?v=d369"]) {
    const d = classifyPublishCandidate(
      row({ media_urls: [`https://cdn.example.com/${name}`] }),
      NOW,
    );
    assertEquals(d.kind, "publish", name);
  }
});

Deno.test("mixed video+image passes, and the publisher selects the video", () => {
  const media = [STATIC_PNG, "https://cdn.example.com/norma-vid-tour.mp4"];
  const d = classifyPublishCandidate(row({ media_urls: media }), NOW);
  assertEquals(d.kind, "publish");
  assertEquals(selectPublishMediaUrl(media), media[1]);
  assertEquals(selectPublishMediaUrl([STATIC_PNG]), STATIC_PNG);
  assertEquals(selectPublishMediaUrl([]), null);
  assertEquals(selectPublishMediaUrl(null), null);
});

Deno.test("empty media still reports empty_media, not static_media", () => {
  for (const media of [[], null, undefined, [""], ["   "]]) {
    const d = classifyPublishCandidate(
      row({ media_urls: media as string[] | null }),
      NOW,
    );
    assertEquals(d.kind, "pause", JSON.stringify(media));
    if (d.kind === "pause") assertEquals(d.reason, GUARD_REASON_EMPTY_MEDIA);
  }
});

Deno.test("media helpers classify by extension, not substring", () => {
  assertEquals(mediaUrlExtension("https://x/a.MP4?v=1"), ".mp4");
  assertEquals(mediaUrlExtension("https://x/noext?v=a.png"), null);
  assertEquals(isVideoMediaUrl("https://x/clip.mov"), true);
  assertEquals(isVideoMediaUrl("https://x/mp4-poster.png"), false);
  assertEquals(isStaticMediaUrl("https://x/a.gif"), true);
  assertEquals(hasVideoMedia(["https://x/a.png", "https://x/b.mp4"]), true);
  assertEquals(hasVideoMedia(["https://x/a.png"]), false);
});

Deno.test("static_media hold note carries the exact visible flag", () => {
  assertEquals(staticMediaFlag(), "static_media: video-only rule (2026-10-18)");
  const note = guardHoldNote(GUARD_REASON_STATIC_MEDIA, new Date("2026-10-18T16:05:00Z"));
  assert(note.includes("static_media: video-only rule (2026-10-18)"), note);
  assert(note.includes("reason=static_media"), note);
  assert(note.includes("Replace media with a video (.mp4/.mov/.m4v)"), note);
});

Deno.test("non-twitter static rows are still skipped untouched by cmo-publish", () => {
  const d = classifyPublishCandidate(row({ platform: "linkedin" }), NOW);
  assertEquals(d.kind, "skip");
  assertEquals(mayMutateCalendarStatus(d), false);
});

Deno.test("index.ts surfaces static_media like the other guards (dry-run + live)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("GUARD_REASON_STATIC_MEDIA"));
  assert(src.includes("staticMediaFlag()"));
  assert(src.includes("selectPublishMediaUrl(post.media_urls)"));
  assert(src.includes("uploadMediaToX"), "video must go through the chunked uploader");
});
