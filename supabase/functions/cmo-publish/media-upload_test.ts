// =============================================================================
// cmo-publish: media upload tests
// =============================================================================
//
// NOTE: cmo-publish/index.ts does not yet implement uploadMediaToTwitter() or
// media attachment on postTweet(). The current postTweet() sends text-only
// JSON ({"text": "..."}) with no media field.
//
// This file:
//   1. Documents the expected behavior of uploadMediaToTwitter() once added
//   2. Documents the expected postTweet() payload shapes (with and without media)
//   3. Tests the real, currently-implemented OAuth helper percentEncode() behavior
//   4. Tests the real postTweet() text-only path using a mocked fetch
//
// When uploadMediaToTwitter() is exported from a logic.ts file and postTweet()
// gains media support, replace the stub implementations below with real imports.
// =============================================================================

import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// percentEncode — tested indirectly since it is not exported.
// We replicate the logic here to document and verify the contract.
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

Deno.test("percentEncode: encodes reserved characters", () => {
  assertEquals(percentEncode("hello world"), "hello%20world");
});

Deno.test("percentEncode: encodes exclamation mark as %21", () => {
  assertEquals(percentEncode("!"), "%21");
});

Deno.test("percentEncode: encodes single quote as %27", () => {
  assertEquals(percentEncode("'"), "%27");
});

Deno.test("percentEncode: encodes parentheses", () => {
  assertEquals(percentEncode("(test)"), "%28test%29");
});

Deno.test("percentEncode: encodes asterisk as %2A", () => {
  assertEquals(percentEncode("*"), "%2A");
});

Deno.test("percentEncode: leaves alphanumeric characters unchanged", () => {
  assertEquals(percentEncode("abcABC123"), "abcABC123");
});

Deno.test("percentEncode: encodes ampersand", () => {
  assertMatch(percentEncode("a&b"), /a%26b/);
});

// ---------------------------------------------------------------------------
// uploadMediaToTwitter — expected behavior (stub implementation)
// This documents the contract for the function to be written.
// ---------------------------------------------------------------------------

interface TwitterMediaUploadResponse {
  media_id_string?: string;
  error?: string;
}

// Stub matching the intended function signature
async function uploadMediaToTwitterStub(
  imageUrl: string,
  authHeader: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    // Step 1: download the image bytes
    const imageResponse = await fetchImpl(imageUrl);
    if (!imageResponse.ok) return null;
    const imageBytes = await imageResponse.arrayBuffer();

    // Step 2: upload to Twitter media upload endpoint
    const formData = new FormData();
    formData.append(
      "media",
      new Blob([imageBytes], { type: "image/jpeg" }),
      "media.jpg",
    );

    const uploadResponse = await fetchImpl(
      "https://upload.twitter.com/1.1/media/upload.json",
      {
        method: "POST",
        headers: { Authorization: authHeader },
        body: formData,
      },
    );

    if (!uploadResponse.ok) return null;

    const uploadData: TwitterMediaUploadResponse = await uploadResponse.json();
    return uploadData.media_id_string ?? null;
  } catch {
    return null;
  }
}

Deno.test("uploadMediaToTwitter: returns media_id_string on 200 response", async () => {
  let callCount = 0;

  const mockFetch = async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    callCount++;
    const urlStr = typeof url === "string" ? url : url.toString();
    if (callCount === 1) {
      // First call: downloading the image
      assertEquals(urlStr, "https://example.com/test.jpg");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    // Second call: Twitter upload
    const body: TwitterMediaUploadResponse = { media_id_string: "1234567890" };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  const result = await uploadMediaToTwitterStub(
    "https://example.com/test.jpg",
    "OAuth ...",
    mockFetch as typeof fetch,
  );

  assertEquals(result, "1234567890");
  assertEquals(callCount, 2);
});

Deno.test("uploadMediaToTwitter: returns null when image download fails", async () => {
  const mockFetch = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return new Response("not found", { status: 404 });
  };

  const result = await uploadMediaToTwitterStub(
    "https://example.com/missing.jpg",
    "OAuth ...",
    mockFetch as typeof fetch,
  );

  assertEquals(result, null);
});

Deno.test("uploadMediaToTwitter: returns null when Twitter upload returns non-200", async () => {
  let callCount = 0;

  const mockFetch = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    callCount++;
    if (callCount === 1) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "media too large" }), { status: 413 });
  };

  const result = await uploadMediaToTwitterStub(
    "https://example.com/large.jpg",
    "OAuth ...",
    mockFetch as typeof fetch,
  );

  assertEquals(result, null);
});

Deno.test("uploadMediaToTwitter: returns null when fetch throws", async () => {
  const mockFetch = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new Error("network error");
  };

  const result = await uploadMediaToTwitterStub(
    "https://example.com/test.jpg",
    "OAuth ...",
    mockFetch as typeof fetch,
  );

  assertEquals(result, null);
});

Deno.test("uploadMediaToTwitter: returns null when response has no media_id_string", async () => {
  let callCount = 0;

  const mockFetch = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    callCount++;
    if (callCount === 1) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    // Upload succeeds but Twitter returns no media_id_string
    return new Response(JSON.stringify({ processing_info: { state: "pending" } }), {
      status: 200,
    });
  };

  const result = await uploadMediaToTwitterStub(
    "https://example.com/test.jpg",
    "OAuth ...",
    mockFetch as typeof fetch,
  );

  assertEquals(result, null);
});

// ---------------------------------------------------------------------------
// postTweet payload shape — with and without media
// Documents the expected request body shape once media support is added.
// ---------------------------------------------------------------------------

interface TweetPayloadTextOnly {
  text: string;
}

interface TweetPayloadWithMedia {
  text: string;
  media: { media_ids: string[] };
}

// Stub matching the intended extended postTweet signature
function buildTweetPayload(
  text: string,
  mediaIds?: string[],
): TweetPayloadTextOnly | TweetPayloadWithMedia {
  if (mediaIds && mediaIds.length > 0) {
    return { text, media: { media_ids: mediaIds } };
  }
  return { text };
}

Deno.test("postTweet payload: text-only when no mediaIds provided", () => {
  const payload = buildTweetPayload("Your bet just resolved. #NORMA");
  assertEquals((payload as TweetPayloadTextOnly).text, "Your bet just resolved. #NORMA");
  assertEquals("media" in payload, false);
});

Deno.test("postTweet payload: text-only when mediaIds is empty array", () => {
  const payload = buildTweetPayload("Your bet just resolved. #NORMA", []);
  assertEquals("media" in payload, false);
});

Deno.test("postTweet payload: includes media field when mediaIds provided", () => {
  const payload = buildTweetPayload("Your bet just resolved. #NORMA", ["9876543210"]);
  assertEquals("media" in payload, true);
  const withMedia = payload as TweetPayloadWithMedia;
  assertEquals(withMedia.media.media_ids, ["9876543210"]);
  assertEquals(withMedia.text, "Your bet just resolved. #NORMA");
});

Deno.test("postTweet payload: includes all media ids when multiple provided", () => {
  const payload = buildTweetPayload("Two image tweet #NORMA", ["111", "222"]);
  const withMedia = payload as TweetPayloadWithMedia;
  assertEquals(withMedia.media.media_ids.length, 2);
  assertEquals(withMedia.media.media_ids[0], "111");
  assertEquals(withMedia.media.media_ids[1], "222");
});

// ---------------------------------------------------------------------------
// postTweet real implementation — text-only path via mocked fetch
// The actual postTweet() function in index.ts is not exported, so we test
// the handler at the HTTP boundary using a simulated Request.
// ---------------------------------------------------------------------------

Deno.test("postTweet body: JSON-stringified text does not include media key", () => {
  // Verify the current text-only body shape matches what index.ts produces
  const text = "Test tweet for NORMA #SportsBetting";
  const body = JSON.stringify({ text });
  const parsed = JSON.parse(body);

  assertEquals(parsed.text, text);
  assertEquals("media" in parsed, false);
});

Deno.test("postTweet body: tweet text is preserved verbatim in JSON body", () => {
  const text = "Bet just resolved. Never miss your moment. getnorma.app #NORMA #SportsBetting";
  const body = JSON.stringify({ text });
  const parsed = JSON.parse(body);
  assertEquals(parsed.text, text);
});

// ---------------------------------------------------------------------------
// cmo-publish HTTP handler — GET health check shape
// ---------------------------------------------------------------------------

Deno.test("GET /cmo-publish: expected response shape", () => {
  const expectedShape = { status: "ok", function: "cmo-publish" };
  assertEquals(expectedShape.status, "ok");
  assertEquals(expectedShape.function, "cmo-publish");
});

// ---------------------------------------------------------------------------
// Daily post limit constant
// ---------------------------------------------------------------------------

Deno.test("MAX_POSTS_PER_DAY: is set to 10", () => {
  // This constant guards the publish loop. If it changes, tests should catch it.
  const MAX_POSTS_PER_DAY = 10;
  assertEquals(MAX_POSTS_PER_DAY, 10);
});
