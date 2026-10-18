// =============================================================================
// cmo-publish-linkedin: video-only rule (Dave, 2026-10-18)
// Mirror of cmo-publish/static_media_test.ts (PR #64) for the LinkedIn
// publisher. NORMA social posts are interactive video / motion graphics
// ONLY. A LinkedIn row whose media contains no video file must pause as
// static_media and never ship as a static image post. Empty media keeps
// the existing behaviour (text-only LinkedIn post).
// Native LinkedIn video upload is a follow-up (Videos API
// initializeUpload/finalizeUpload register-upload flow), so a video row
// must never degrade to text-only either — see linkedin-client.ts.
// =============================================================================

import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type CalendarPublishCandidate,
  classifyPublishCandidate,
  GUARD_REASON_STATIC_MEDIA,
  guardHoldNote,
  hasVideoMedia,
  isStaticMediaUrl,
  isVideoMediaUrl,
  mayMutateCalendarStatus,
  mediaUrlExtension,
  runLinkedInPublishLoop,
  selectPublishMediaUrl,
  staticMediaFlag,
} from "./logic.ts";
import {
  LINKEDIN_VIDEO_UPLOAD_UNSUPPORTED,
  type LinkedInConfig,
  publishOrganizationPost,
} from "./linkedin-client.ts";

const STATIC_PNG =
  "https://shijrazlzawjpobrpmnt.supabase.co/storage/v1/object/public/social-images/norma-screenshots/norma-x-20261018-slate-nfl-w6.png?v=d3699871";

function row(
  overrides: Partial<CalendarPublishCandidate> = {},
): CalendarPublishCandidate {
  return {
    id: "li-static-0001",
    platform: "linkedin",
    status: "draft",
    body: "NORMA sees your wagers and predictions. getnorma.app #WatchNORMA",
    media_urls: [STATIC_PNG],
    hashtags: ["WatchNORMA"],
    ...overrides,
  };
}

Deno.test("static-only PNG is paused static_media, never published", () => {
  const d = classifyPublishCandidate(row());
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") assertEquals(d.reason, GUARD_REASON_STATIC_MEDIA);
  assertEquals(mayMutateCalendarStatus(d), true);
  assert(
    !("commentary" in d),
    "no commentary may be produced for a static row",
  );
});

Deno.test("static-only extensions all pause: png/jpg/jpeg/webp/gif (query strings ignored)", () => {
  for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "PNG"]) {
    const d = classifyPublishCandidate(
      row({ media_urls: [`https://cdn.example.com/creative.${ext}?v=1`] }),
    );
    assertEquals(d.kind, "pause", ext);
    if (d.kind === "pause") {
      assertEquals(d.reason, GUARD_REASON_STATIC_MEDIA, ext);
    }
  }
});

Deno.test("any media without a video pauses, even unknown/no extension", () => {
  for (
    const url of [
      "https://cdn.example.com/creative.txt",
      "https://cdn.example.com/creative",
    ]
  ) {
    const d = classifyPublishCandidate(row({ media_urls: [url] }));
    assertEquals(d.kind, "pause", url);
    if (d.kind === "pause") {
      assertEquals(d.reason, GUARD_REASON_STATIC_MEDIA, url);
    }
  }
});

Deno.test("video passes classification: mp4/mov/m4v (case + query insensitive), routed as videoUrl never imageUrl", () => {
  for (
    const name of ["tour.mp4", "tour.MOV?v=2", "tour.m4v#x", "tour.mp4?v=d369"]
  ) {
    const url = `https://cdn.example.com/${name}`;
    const d = classifyPublishCandidate(row({ media_urls: [url] }));
    assertEquals(d.kind, "publish", name);
    if (d.kind === "publish") {
      assertEquals(d.videoUrl, url);
      assertEquals(d.imageUrl, undefined, name);
    }
  }
});

Deno.test("mixed video+image passes, and the publisher selects the video", () => {
  const media = [STATIC_PNG, "https://cdn.example.com/norma-vid-tour.mp4"];
  const d = classifyPublishCandidate(row({ media_urls: media }));
  assertEquals(d.kind, "publish");
  if (d.kind === "publish") assertEquals(d.videoUrl, media[1]);
  assertEquals(selectPublishMediaUrl(media), media[1]);
  assertEquals(selectPublishMediaUrl([STATIC_PNG]), STATIC_PNG);
  assertEquals(selectPublishMediaUrl([]), null);
  assertEquals(selectPublishMediaUrl(null), null);
});

Deno.test("empty media keeps existing behaviour: text-only publish, not static_media", () => {
  for (const media of [[], null, undefined, [""], ["   "]]) {
    const d = classifyPublishCandidate(
      row({ media_urls: media as string[] | null }),
    );
    assertEquals(d.kind, "publish", JSON.stringify(media));
    if (d.kind === "publish") {
      assertEquals(d.imageUrl, undefined);
      assertEquals(d.videoUrl, undefined);
    }
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
  const note = guardHoldNote(
    GUARD_REASON_STATIC_MEDIA,
    new Date("2026-10-18T16:05:00Z"),
  );
  assert(note.includes("static_media: video-only rule (2026-10-18)"), note);
  assert(note.includes("reason=static_media"), note);
  assert(note.includes("Held by cmo-publish-linkedin"), note);
  assert(note.includes("Replace media with a video (.mp4/.mov/.m4v)"), note);
});

Deno.test("non-linkedin static rows are still skipped untouched by cmo-publish-linkedin", () => {
  const d = classifyPublishCandidate(row({ platform: "twitter" }));
  assertEquals(d.kind, "skip");
  assertEquals(mayMutateCalendarStatus(d), false);
});

Deno.test("paused linkedin static rows are skipped without mutation (already held)", () => {
  const d = classifyPublishCandidate(row({ status: "paused" }));
  assertEquals(d.kind, "skip");
  assertEquals(mayMutateCalendarStatus(d), false);
});

Deno.test("runLinkedInPublishLoop pauses static rows via markPaused and never calls publish", async () => {
  const paused: Array<{ id: string; reason: string }> = [];
  let publishCalls = 0;
  const cycle = await runLinkedInPublishLoop({
    posts: [row()],
    publish: async () => {
      publishCalls++;
      return { postId: "should-not-fire" };
    },
    markPublished: async () => {
      throw new Error("must not mark published");
    },
    markFailed: async () => {
      throw new Error("must not mark failed");
    },
    markPaused: async (post, reason) => {
      paused.push({ id: post.id, reason });
      return true;
    },
  });
  assertEquals(publishCalls, 0);
  assertEquals(paused, [{
    id: "li-static-0001",
    reason: GUARD_REASON_STATIC_MEDIA,
  }]);
  assertEquals(cycle.published, 0);
  assertEquals(cycle.failed, 0);
  assertEquals(cycle.skipped, 1);
  assertEquals(cycle.results[0].held_paused, true);
  assertEquals(cycle.results[0].error, GUARD_REASON_STATIC_MEDIA);
  assertEquals(
    cycle.results[0].detail,
    "static_media: video-only rule (2026-10-18)",
  );
});

Deno.test("runLinkedInPublishLoop passes videoUrl (not imageUrl) to publish for video rows", async () => {
  const inputs: Array<
    { commentary: string; imageUrl?: string; videoUrl?: string }
  > = [];
  const cycle = await runLinkedInPublishLoop({
    posts: [row({ media_urls: ["https://cdn.example.com/tour.mp4"] })],
    publish: async (input) => {
      inputs.push(input);
      return { postId: "urn:li:share:video" };
    },
    markPublished: async () => {},
    markFailed: async () => {
      throw new Error("must not mark failed");
    },
    markPaused: async () => {
      throw new Error("must not pause a video row");
    },
  });
  assertEquals(cycle.published, 1);
  assertEquals(inputs.length, 1);
  assertEquals(inputs[0].videoUrl, "https://cdn.example.com/tour.mp4");
  assertEquals(inputs[0].imageUrl, undefined);
});

Deno.test("publishOrganizationPost refuses videoUrl before any LinkedIn call (no text-only degrade)", async () => {
  const config: LinkedInConfig = {
    accessToken: "test-access-token",
    organizationUrn: "urn:li:organization:146336141",
    organizationIdSource: "env",
    apiVersion: "202506",
  };
  let calls = 0;
  await assertRejects(
    () =>
      publishOrganizationPost(
        config,
        {
          commentary: "video post",
          videoUrl: "https://cdn.example.com/tour.mp4",
        },
        async () => {
          calls++;
          throw new Error("must not be called");
        },
      ),
    Error,
    LINKEDIN_VIDEO_UPLOAD_UNSUPPORTED,
  );
  assertEquals(calls, 0);
});

Deno.test("index.ts surfaces static_media like the cmo-publish guards (dry-run + live)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("GUARD_REASON_STATIC_MEDIA"));
  assert(src.includes("staticMediaFlag()"));
  assert(
    src.includes("markGuardHold"),
    "live guard hold must write paused + human_notes",
  );
  assert(src.includes("guardHoldNote(reason, now)"));
  assert(
    src.includes("parseRunOptions(requestPayload, now)"),
    "dry-run support",
  );
  assert(src.includes("publishOrganizationPost(linkedInConfig, input)"));
});

Deno.test("linkedin-client.ts documents video as the Videos API register-upload follow-up", async () => {
  const src = await Deno.readTextFile(
    new URL("./linkedin-client.ts", import.meta.url),
  );
  assert(src.includes("/rest/videos?action=initializeUpload"));
  assert(src.includes("finalizeUpload"));
  assert(src.includes("LINKEDIN_VIDEO_UPLOAD_UNSUPPORTED"));
});
