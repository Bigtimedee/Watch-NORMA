// =============================================================================
// cmo-publish-linkedin: platform filter — twitter (and any non-LI) must never
// be posted to LinkedIn; LinkedIn rows must never go to X.
// =============================================================================

import {
  assertEquals,
  assert,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  CONTENT_CALENDAR_LINKEDIN_PLATFORM,
  DUE_POSTS_QUERY,
  LINKEDIN_STATUS_MUTATION_FILTER,
  LINKEDIN_COMMENTARY_MAX,
  NORMA_LINKEDIN_COMPANY_URL,
  NORMA_LINKEDIN_ORGANIZATION_ID,
  NORMA_LINKEDIN_ORGANIZATION_URN,
  classifyPublishCandidate,
  composeCommentary,
  firstImageUrl,
  isLinkedInPlatform,
  mayMutateCalendarStatus,
  resolveLinkedInOrganizationId,
  runLinkedInPublishLoop,
  toOrganizationUrn,
  type CalendarPublishCandidate,
} from "./logic.ts";

function candidate(
  overrides: Partial<CalendarPublishCandidate> & Pick<CalendarPublishCandidate, "platform">,
): CalendarPublishCandidate {
  return {
    id: overrides.id ?? "li-draft-0001",
    status: overrides.status ?? "draft",
    body: overrides.body ?? "Watch NORMA tells you when to tune in.",
    media_urls: overrides.media_urls,
    hashtags: overrides.hashtags,
    platform_post_id: overrides.platform_post_id,
    platform: overrides.platform,
  };
}

Deno.test("content_calendar schema uses 'linkedin' for company-page posts", () => {
  assertEquals(CONTENT_CALENDAR_LINKEDIN_PLATFORM, "linkedin");
  assertEquals(DUE_POSTS_QUERY.platform, "linkedin");
});

Deno.test("due-posts query is linkedin-only", () => {
  assertEquals(DUE_POSTS_QUERY.table, "content_calendar");
  assertEquals(DUE_POSTS_QUERY.platform, "linkedin");
  assertEquals([...DUE_POSTS_QUERY.statuses], ["draft", "scheduled"]);
});

Deno.test("status mutations are constrained to linkedin draft/scheduled rows", () => {
  assertEquals(LINKEDIN_STATUS_MUTATION_FILTER.platform, "linkedin");
  assertEquals([...LINKEDIN_STATUS_MUTATION_FILTER.statuses], ["draft", "scheduled"]);
});

Deno.test("isLinkedInPlatform: linkedin only (not twitter/x)", () => {
  assertEquals(isLinkedInPlatform("linkedin"), true);
  assertEquals(isLinkedInPlatform("LINKEDIN"), true);
  assertEquals(isLinkedInPlatform("twitter"), false);
  assertEquals(isLinkedInPlatform("x"), false);
  assertEquals(isLinkedInPlatform("instagram"), false);
  assertEquals(isLinkedInPlatform("tiktok"), false);
  assertEquals(isLinkedInPlatform("facebook"), false);
  assertEquals(isLinkedInPlatform(""), false);
  assertEquals(isLinkedInPlatform(null), false);
});

Deno.test("twitter draft is not posted to LinkedIn (PR #32 inverse)", () => {
  const disposition = classifyPublishCandidate(
    candidate({
      platform: "twitter",
      status: "draft",
      body: "A tweet that must never become a LinkedIn org post.",
    }),
  );
  assertEquals(disposition.kind, "skip");
  if (disposition.kind !== "skip") return;
  assertEquals(disposition.reason, "non_linkedin_platform:twitter");
  assertEquals(disposition.mutateStatus, false);
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("x alias is skipped, not posted to LinkedIn", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "x", status: "scheduled" }),
  );
  assertEquals(disposition.kind, "skip");
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("non-LinkedIn platforms never publish and never mutate status", () => {
  for (const platform of ["twitter", "x", "instagram", "tiktok", "facebook"]) {
    const disposition = classifyPublishCandidate(
      candidate({ platform, status: "draft" }),
    );
    assertEquals(disposition.kind, "skip", `${platform} must skip`);
    assertEquals(mayMutateCalendarStatus(disposition), false, `${platform} must not mutate`);
  }
});

Deno.test("empty twitter body is skipped, not auto-failed by the LinkedIn publisher", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "twitter", body: "   " }),
  );
  assertEquals(disposition.kind, "skip");
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("linkedin draft is eligible to publish", () => {
  const body = "NORMA tells fans when to tune in.";
  const disposition = classifyPublishCandidate(
    candidate({ platform: "linkedin", status: "draft", body }),
  );
  assertEquals(disposition.kind, "publish");
  if (disposition.kind !== "publish") return;
  assertEquals(disposition.commentary, body);
});

Deno.test("linkedin scheduled row is eligible to publish", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "linkedin", status: "scheduled" }),
  );
  assertEquals(disposition.kind, "publish");
});

Deno.test("linkedin empty body fails so it cannot retry forever", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "linkedin", body: "" }),
  );
  assertEquals(disposition.kind, "fail");
  if (disposition.kind !== "fail") return;
  assertEquals(disposition.reason, "Empty LinkedIn post body");
  assertEquals(mayMutateCalendarStatus(disposition), true);
});

Deno.test("already-published LinkedIn row with platform_post_id is skipped (idempotent)", () => {
  const disposition = classifyPublishCandidate(
    candidate({
      platform: "linkedin",
      status: "draft",
      platform_post_id: "urn:li:share:123",
    }),
  );
  assertEquals(disposition.kind, "skip");
  if (disposition.kind !== "skip") return;
  assertEquals(disposition.reason, "already_has_platform_post_id");
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("paused/published linkedin rows are skipped without mutation", () => {
  for (const status of ["paused", "published", "failed", "deleted"]) {
    const disposition = classifyPublishCandidate(
      candidate({ platform: "linkedin", status }),
    );
    assertEquals(disposition.kind, "skip", status);
    assertEquals(mayMutateCalendarStatus(disposition), false, status);
  }
});

Deno.test("commentary over 3000 is truncated only for publishable linkedin rows", () => {
  const longBody = "a".repeat(LINKEDIN_COMMENTARY_MAX + 50);
  const linkedin = classifyPublishCandidate(
    candidate({ platform: "linkedin", body: longBody }),
  );
  assertEquals(linkedin.kind, "publish");
  if (linkedin.kind === "publish") {
    assertEquals(linkedin.commentary.length, LINKEDIN_COMMENTARY_MAX);
  }

  const twitter = classifyPublishCandidate(
    candidate({ platform: "twitter", body: longBody }),
  );
  assertEquals(twitter.kind, "skip");
  assert(!("commentary" in twitter));
});

Deno.test("composeCommentary appends hashtags not already in the body", () => {
  assertEquals(
    composeCommentary("Tune in.", ["NORMA", "#Sports"]),
    "Tune in. #NORMA #Sports",
  );
  assertEquals(
    composeCommentary("Tune in. #NORMA", ["NORMA"]),
    "Tune in. #NORMA",
  );
});

Deno.test("firstImageUrl picks the first http(s) media url", () => {
  assertEquals(firstImageUrl(["https://cdn.example/a.png", "https://cdn.example/b.png"]), "https://cdn.example/a.png");
  assertEquals(firstImageUrl(["not-a-url", "https://cdn.example/a.png"]), "https://cdn.example/a.png");
  assertEquals(firstImageUrl([]), undefined);
  assertEquals(firstImageUrl(null), undefined);
});

Deno.test("toOrganizationUrn accepts numeric id or org URN; rejects person URN", () => {
  assertEquals(toOrganizationUrn("12345"), "urn:li:organization:12345");
  assertEquals(
    toOrganizationUrn("urn:li:organization:12345"),
    "urn:li:organization:12345",
  );
  assertEquals(
    toOrganizationUrn(NORMA_LINKEDIN_ORGANIZATION_ID),
    NORMA_LINKEDIN_ORGANIZATION_URN,
  );
  assertEquals(
    toOrganizationUrn(NORMA_LINKEDIN_ORGANIZATION_URN),
    NORMA_LINKEDIN_ORGANIZATION_URN,
  );
  assertThrows(
    () => toOrganizationUrn("urn:li:person:abc"),
    Error,
    "not a personal profile",
  );
  assertThrows(() => toOrganizationUrn(""), Error, "empty");
});

Deno.test("resolveLinkedInOrganizationId: env → social_accounts → NORMA default 146336141", () => {
  assertEquals(NORMA_LINKEDIN_ORGANIZATION_ID, "146336141");
  assertEquals(
    NORMA_LINKEDIN_ORGANIZATION_URN,
    "urn:li:organization:146336141",
  );
  assertEquals(
    NORMA_LINKEDIN_COMPANY_URL,
    "https://www.linkedin.com/company/watch-norma/",
  );

  assertEquals(resolveLinkedInOrganizationId({}), {
    idOrUrn: "146336141",
    source: "norma_default",
  });
  assertEquals(resolveLinkedInOrganizationId({ envValue: "" }), {
    idOrUrn: "146336141",
    source: "norma_default",
  });
  assertEquals(resolveLinkedInOrganizationId({ envValue: "   " }), {
    idOrUrn: "146336141",
    source: "norma_default",
  });
  assertEquals(
    resolveLinkedInOrganizationId({ socialAccountId: "146336141" }),
    { idOrUrn: "146336141", source: "social_accounts" },
  );
  assertEquals(
    resolveLinkedInOrganizationId({
      envValue: "999",
      socialAccountId: "146336141",
    }),
    { idOrUrn: "999", source: "env" },
  );
  assertEquals(
    resolveLinkedInOrganizationId({
      envValue: "urn:li:organization:146336141",
    }),
    { idOrUrn: "urn:li:organization:146336141", source: "env" },
  );
});

Deno.test("runLinkedInPublishLoop posts LinkedIn drafts and skips twitter", async () => {
  const published: Array<{ id: string; postId: string }> = [];
  const failed: Array<{ id: string; reason: string }> = [];
  const publishedInputs: Array<{ commentary: string; imageUrl?: string }> = [];

  const cycle = await runLinkedInPublishLoop({
    posts: [
      candidate({
        id: "li-1",
        platform: "linkedin",
        status: "draft",
        body: "Company page post",
        media_urls: ["https://cdn.example/shot.png"],
      }),
      candidate({
        id: "tw-1",
        platform: "twitter",
        status: "draft",
        body: "Must not go to LinkedIn",
      }),
    ],
    publish: async (input) => {
      publishedInputs.push(input);
      return { postId: "urn:li:share:999" };
    },
    markPublished: async (id, postId) => {
      published.push({ id, postId });
    },
    markFailed: async (id, reason) => {
      failed.push({ id, reason });
    },
  });

  assertEquals(cycle.published, 1);
  assertEquals(cycle.skipped, 1);
  assertEquals(cycle.failed, 0);
  assertEquals(published, [{ id: "li-1", postId: "urn:li:share:999" }]);
  assertEquals(failed, []);
  assertEquals(publishedInputs.length, 1);
  assertEquals(publishedInputs[0].commentary, "Company page post");
  assertEquals(publishedInputs[0].imageUrl, "https://cdn.example/shot.png");
});

Deno.test("runLinkedInPublishLoop is idempotent when platform_post_id is already set", async () => {
  let publishCalls = 0;
  const cycle = await runLinkedInPublishLoop({
    posts: [
      candidate({
        id: "li-dup",
        platform: "linkedin",
        status: "scheduled",
        platform_post_id: "urn:li:ugcPost:1",
      }),
    ],
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
  });
  assertEquals(publishCalls, 0);
  assertEquals(cycle.skipped, 1);
  assertEquals(cycle.published, 0);
});

Deno.test("cmo-publish-linkedin/index.ts filters platform in the due-posts query", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes('.eq("platform", DUE_POSTS_QUERY.platform)'));
  assert(src.includes("runLinkedInPublishLoop("));
  assert(
    src.includes('.eq("platform", LINKEDIN_STATUS_MUTATION_FILTER.platform)'),
    "markPublished/markFailed must constrain platform",
  );
  assert(!src.includes("api.twitter.com"));
  assert(!src.includes("postTweet"));
  assert(!src.includes("X_CONSUMER_KEY"));
  assert(src.includes("146336141"));
  assert(src.includes("https://www.linkedin.com/company/watch-norma/"));
  assert(src.includes('Deno.env.get("LINKEDIN_ACCESS_TOKEN")'));
});

Deno.test("PR #32 twitter-only guard in cmo-publish is intact", async () => {
  const logic = await Deno.readTextFile(
    new URL("../cmo-publish/logic.ts", import.meta.url),
  );
  assert(logic.includes("CONTENT_CALENDAR_TWITTER_PLATFORM"));
  assert(logic.includes('platform: CONTENT_CALENDAR_TWITTER_PLATFORM'));
  assert(logic.includes("non_twitter_platform"));

  const src = await Deno.readTextFile(
    new URL("../cmo-publish/index.ts", import.meta.url),
  );
  assert(src.includes('.eq("platform", DUE_POSTS_QUERY.platform)'));
  assert(src.includes("classifyPublishCandidate(post)"));
  assert(src.includes('.eq("platform", TWITTER_STATUS_MUTATION_FILTER.platform)'));
  const classifyAt = src.indexOf("classifyPublishCandidate(post)");
  const tweetAt = src.indexOf("await postTweet(");
  assert(classifyAt >= 0 && tweetAt >= 0 && classifyAt < tweetAt);
});

Deno.test("publish-social-posts still does not read content_calendar or route linkedin", async () => {
  const publishSocial = await Deno.readTextFile(
    new URL("../publish-social-posts/index.ts", import.meta.url),
  );
  assert(
    !publishSocial.includes("content_calendar"),
    "publish-social-posts must not read content_calendar",
  );
  assert(!publishSocial.includes('case "linkedin"'));
});
