// =============================================================================
// cmo-publish: X video upload — chunked INIT/APPEND/FINALIZE + STATUS poll
// Drives the real x-media.ts with a mocked fetch. No network, never posts.
// Proves an .mp4 from media_urls can be uploaded as media_category=tweet_video
// (the old simple image upload could not), so video rows are publishable.
// =============================================================================

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  bytesToBase64,
  planVideoSegments,
  uploadMediaToX,
  X_UPLOAD_URL,
} from "./x-media.ts";

const CREDS = {
  consumerKey: "ck",
  consumerSecret: "cs",
  accessToken: "at",
  accessTokenSecret: "ats",
};
const auth = () => Promise.resolve("OAuth test");

function formOf(init?: RequestInit): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ""));
}

Deno.test("planVideoSegments covers every byte exactly once", () => {
  assertEquals(planVideoSegments(5, 2), [
    { index: 0, start: 0, end: 2 },
    { index: 1, start: 2, end: 4 },
    { index: 2, start: 4, end: 5 },
  ]);
  assertEquals(planVideoSegments(0, 2), []);
  assertEquals(bytesToBase64(new Uint8Array([104, 105])), "aGk=");
});

Deno.test("mp4 upload: INIT(tweet_video) -> APPEND xN -> FINALIZE -> STATUS succeeded", async () => {
  const calls: Array<{ url: string; method: string; form: URLSearchParams }> = [];
  const sourceBytes = new Uint8Array([0, 1, 2, 3, 4]); // 5 bytes, 2-byte segments

  const mockFetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr === "https://cdn.example.com/norma-vid-tour.mp4") {
      return new Response(sourceBytes, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    }
    assertEquals(urlStr.split("?")[0], X_UPLOAD_URL);
    const method = init?.method ?? "GET";
    const form = method === "GET"
      ? new URLSearchParams(urlStr.split("?")[1] ?? "")
      : formOf(init);
    calls.push({ url: urlStr, method, form });
    const command = form.get("command");
    if (command === "INIT") {
      assertEquals(form.get("media_category"), "tweet_video");
      assertEquals(form.get("media_type"), "video/mp4");
      assertEquals(form.get("total_bytes"), "5");
      return new Response(JSON.stringify({ media_id_string: "999" }), { status: 200 });
    }
    if (command === "APPEND") return new Response(null, { status: 204 });
    if (command === "FINALIZE") {
      return new Response(
        JSON.stringify({
          media_id_string: "999",
          processing_info: { state: "pending", check_after_secs: 0 },
        }),
        { status: 200 },
      );
    }
    if (command === "STATUS") {
      return new Response(
        JSON.stringify({
          media_id_string: "999",
          processing_info: { state: "succeeded", progress_percent: 100 },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected command ${command}`);
  }) as typeof fetch;

  const mediaId = await uploadMediaToX(
    "https://cdn.example.com/norma-vid-tour.mp4",
    CREDS,
    {
      fetchImpl: mockFetch,
      buildAuthHeader: auth,
      segmentBytes: 2,
      sleep: () => Promise.resolve(),
      log: () => {},
    },
  );

  assertEquals(mediaId, "999");
  assertEquals(
    calls.map((c) => c.form.get("command")),
    ["INIT", "APPEND", "APPEND", "APPEND", "FINALIZE", "STATUS"],
  );
  assertEquals(
    calls.filter((c) => c.form.get("command") === "APPEND").map((c) =>
      c.form.get("segment_index")
    ),
    ["0", "1", "2"],
  );
  // Reassembled APPEND payloads equal the source bytes.
  const joined = calls
    .filter((c) => c.form.get("command") === "APPEND")
    .flatMap((c) => [...atob(c.form.get("media_data")!)].map((ch) => ch.charCodeAt(0)));
  assertEquals(joined, [0, 1, 2, 3, 4]);
});

Deno.test("mp4 upload: processing failed returns null (caller holds, never text-only)", async () => {
  const mockFetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr.includes("cdn.example.com")) {
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    }
    const form = (init?.method === "GET")
      ? new URLSearchParams(urlStr.split("?")[1] ?? "")
      : formOf(init);
    const command = form.get("command");
    if (command === "INIT") {
      return new Response(JSON.stringify({ media_id_string: "7" }), { status: 200 });
    }
    if (command === "APPEND") return new Response(null, { status: 204 });
    if (command === "FINALIZE") {
      return new Response(
        JSON.stringify({ processing_info: { state: "pending", check_after_secs: 0 } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ processing_info: { state: "failed", error: { message: "bad codec" } } }),
      { status: 200 },
    );
  }) as typeof fetch;

  const mediaId = await uploadMediaToX("https://cdn.example.com/x.mp4", CREDS, {
    fetchImpl: mockFetch,
    buildAuthHeader: auth,
    sleep: () => Promise.resolve(),
    log: () => {},
  });
  assertEquals(mediaId, null);
});

Deno.test("image upload still uses the simple path and returns media_id", async () => {
  let sawChunked = false;
  const mockFetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr.includes("cdn.example.com")) {
      return new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (String(init?.body ?? "").includes("INIT")) sawChunked = true;
    return new Response(JSON.stringify({ media_id_string: "42" }), { status: 200 });
  }) as typeof fetch;

  const mediaId = await uploadMediaToX("https://cdn.example.com/x.png", CREDS, {
    fetchImpl: mockFetch,
    buildAuthHeader: auth,
    log: () => {},
  });
  assertEquals(mediaId, "42");
  assertEquals(sawChunked, false);
});

Deno.test("dry-run classification of a real small mp4 row: publish (not posted)", async () => {
  // Classification only — mirrors index.ts dry_run; no upload/tweet occurs.
  const { classifyPublishCandidate } = await import("./logic.ts");
  const d = classifyPublishCandidate(
    {
      id: "bf0ed7bb-d018-4d44-b2a2-d1975de0f44a",
      platform: "twitter",
      status: "draft",
      body: "NORMA tour. getnorma.app #WatchNORMA",
      scheduled_for: "2026-10-19T15:00:00.000Z",
      media_urls: ["https://cdn.example.com/norma-vid-20261019-a-tour-9x16.mp4"],
      hashtags: ["WatchNORMA"],
    },
    new Date("2026-10-19T15:00:00.000Z"),
  );
  assertEquals(d.kind, "publish");
});
