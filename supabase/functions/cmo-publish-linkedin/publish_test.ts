// =============================================================================
// cmo-publish-linkedin: mock LinkedIn Posts / Images API
// =============================================================================

import {
  assertEquals,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  DEFAULT_LINKEDIN_API_VERSION,
  LINKEDIN_API_BASE,
  LINKEDIN_TOKEN_URL,
  buildOrganizationPostPayload,
  loadLinkedInConfig,
  publishOrganizationPost,
  restHeaders,
  type FetchLike,
  type LinkedInConfig,
} from "./linkedin-client.ts";

const CONFIG: LinkedInConfig = {
  accessToken: "test-access-token",
  organizationUrn: "urn:li:organization:424242",
  apiVersion: DEFAULT_LINKEDIN_API_VERSION,
};

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

Deno.test("loadLinkedInConfig requires token + org id and does not invent tokens", () => {
  const missing = loadLinkedInConfig({});
  assertEquals(missing.ok, false);
  if (!missing.ok) {
    assertEquals(missing.missing, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_ID"]);
  }

  const ok = loadLinkedInConfig({
    LINKEDIN_ACCESS_TOKEN: "real-token-from-secrets",
    LINKEDIN_ORGANIZATION_ID: "424242",
  });
  assertEquals(ok.ok, true);
  if (ok.ok) {
    assertEquals(ok.config.accessToken, "real-token-from-secrets");
    assertEquals(ok.config.organizationUrn, "urn:li:organization:424242");
    assertEquals(ok.config.apiVersion, DEFAULT_LINKEDIN_API_VERSION);
  }
});

Deno.test("loadLinkedInConfig rejects a person URN", () => {
  const result = loadLinkedInConfig({
    LINKEDIN_ACCESS_TOKEN: "tok",
    LINKEDIN_ORGANIZATION_ID: "urn:li:person:abc",
  });
  assertEquals(result.ok, false);
});

Deno.test("buildOrganizationPostPayload always authors as the organization", () => {
  const textOnly = buildOrganizationPostPayload({
    organizationUrn: "urn:li:organization:424242",
    commentary: "Hello company page",
  });
  assertEquals(textOnly.author, "urn:li:organization:424242");
  assertEquals(textOnly.commentary, "Hello company page");
  assertEquals(textOnly.visibility, "PUBLIC");
  assertEquals(textOnly.lifecycleState, "PUBLISHED");
  assertEquals("content" in textOnly, false);

  const withImage = buildOrganizationPostPayload({
    organizationUrn: "urn:li:organization:424242",
    commentary: "Hello with image",
    imageUrn: "urn:li:image:C4E10AQFtest",
  });
  assertEquals(
    (withImage.content as { media: { id: string } }).media.id,
    "urn:li:image:C4E10AQFtest",
  );
});

Deno.test("buildOrganizationPostPayload refuses a person author", () => {
  try {
    buildOrganizationPostPayload({
      organizationUrn: "urn:li:person:abc",
      commentary: "nope",
    });
    throw new Error("should have thrown");
  } catch (err) {
    assert((err as Error).message.includes("organization URN"));
  }
});

Deno.test("restHeaders include versioned Posts API headers and never log tokens here", () => {
  const headers = restHeaders(CONFIG);
  assertEquals(headers.Authorization, "Bearer test-access-token");
  assertEquals(headers["Linkedin-Version"], DEFAULT_LINKEDIN_API_VERSION);
  assertEquals(headers["X-Restli-Protocol-Version"], "2.0.0");
});

Deno.test("publishOrganizationPost: text-only mock Posts API", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body });

    if (url === `${LINKEDIN_API_BASE}/posts` && method === "POST") {
      const payload = JSON.parse(body ?? "{}");
      assertEquals(payload.author, CONFIG.organizationUrn);
      assertEquals(payload.commentary, "Tune in with NORMA");
      assertEquals(payload.content, undefined);
      return jsonResponse(201, {}, { "x-restli-id": "urn:li:share:111" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await publishOrganizationPost(
    CONFIG,
    { commentary: "Tune in with NORMA" },
    fetchImpl,
  );
  assertEquals(result.postId, "urn:li:share:111");
  assertEquals(calls.length, 1);
  assert(!calls.some((c) => c.url.includes("twitter.com")));
});

Deno.test("publishOrganizationPost: image initialize + PUT + post", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);

    if (url === "https://cdn.example/norma.png" && method === "GET") {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }
    if (url === `${LINKEDIN_API_BASE}/images?action=initializeUpload`) {
      return jsonResponse(200, {
        value: {
          uploadUrl: "https://www.linkedin.com/dms-uploads/abc",
          image: "urn:li:image:C4E10AQFmock",
        },
      });
    }
    if (url === "https://www.linkedin.com/dms-uploads/abc" && method === "PUT") {
      return new Response(null, { status: 201 });
    }
    if (url === `${LINKEDIN_API_BASE}/posts` && method === "POST") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      assertEquals(payload.author, CONFIG.organizationUrn);
      assertEquals(payload.content.media.id, "urn:li:image:C4E10AQFmock");
      return jsonResponse(201, { id: "urn:li:ugcPost:222" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await publishOrganizationPost(
    CONFIG,
    { commentary: "Image post", imageUrl: "https://cdn.example/norma.png" },
    fetchImpl,
  );
  assertEquals(result.postId, "urn:li:ugcPost:222");
  assertEquals(calls[0], "GET https://cdn.example/norma.png");
  assert(calls.includes("POST https://api.linkedin.com/rest/images?action=initializeUpload"));
  assert(calls.includes("PUT https://www.linkedin.com/dms-uploads/abc"));
  assert(calls.includes("POST https://api.linkedin.com/rest/posts"));
});

Deno.test("publishOrganizationPost: image failure degrades to text-only", async () => {
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "https://cdn.example/missing.png") {
      return new Response("nope", { status: 404 });
    }
    if (url === `${LINKEDIN_API_BASE}/posts` && method === "POST") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      assertEquals(payload.content, undefined);
      return jsonResponse(201, {}, { "x-restli-id": "urn:li:share:text-only" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await publishOrganizationPost(
    CONFIG,
    { commentary: "Fallback text", imageUrl: "https://cdn.example/missing.png" },
    fetchImpl,
  );
  assertEquals(result.postId, "urn:li:share:text-only");
});

Deno.test("publishOrganizationPost: 401 refreshes token then retries", async () => {
  let posts = 0;
  const config: LinkedInConfig = {
    ...CONFIG,
    clientId: "client",
    clientSecret: "secret",
    refreshToken: "refresh-me",
  };

  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === `${LINKEDIN_API_BASE}/posts` && method === "POST") {
      posts++;
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (posts === 1) {
        assertEquals(auth, "Bearer test-access-token");
        return jsonResponse(401, { message: "Expired token" });
      }
      assertEquals(auth, "Bearer rotated-token");
      return jsonResponse(201, {}, { "x-restli-id": "urn:li:share:after-refresh" });
    }
    if (url === LINKEDIN_TOKEN_URL && method === "POST") {
      return jsonResponse(200, { access_token: "rotated-token" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await publishOrganizationPost(
    config,
    { commentary: "retry after refresh" },
    fetchImpl,
  );
  assertEquals(result.postId, "urn:li:share:after-refresh");
  assertEquals(posts, 2);
});

Deno.test("publishOrganizationPost: API error is thrown with status (no token in message)", async () => {
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url === `${LINKEDIN_API_BASE}/posts`) {
      return jsonResponse(403, { message: "Not enough permissions to access: w_organization_social" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  await assertRejects(
    () => publishOrganizationPost(CONFIG, { commentary: "nope" }, fetchImpl),
    Error,
    "w_organization_social",
  );
});
