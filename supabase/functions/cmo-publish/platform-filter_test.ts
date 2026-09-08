// =============================================================================
// cmo-publish: platform filter — LinkedIn (and any non-X) must never tweet
// =============================================================================

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  CONTENT_CALENDAR_TWITTER_PLATFORM,
  DUE_POSTS_QUERY,
  TWITTER_STATUS_MUTATION_FILTER,
  classifyPublishCandidate,
  isTwitterPlatform,
  mayMutateCalendarStatus,
  type CalendarPublishCandidate,
} from "./logic.ts";

function candidate(
  overrides: Partial<CalendarPublishCandidate> & Pick<CalendarPublishCandidate, "platform">,
): CalendarPublishCandidate {
  return {
    id: overrides.id ?? "8c66955e-0000-0000-0000-000000000000",
    status: overrides.status ?? "draft",
    body: overrides.body ?? "Watch NORMA tells you when to tune in.",
    platform: overrides.platform,
  };
}

Deno.test("content_calendar schema uses 'twitter', not 'x', for X posts", () => {
  assertEquals(CONTENT_CALENDAR_TWITTER_PLATFORM, "twitter");
  assertEquals(DUE_POSTS_QUERY.platform, "twitter");
});

Deno.test("due-posts query is twitter-only (regression: ignored platform)", () => {
  assertEquals(DUE_POSTS_QUERY.table, "content_calendar");
  assertEquals(DUE_POSTS_QUERY.platform, "twitter");
  assertEquals([...DUE_POSTS_QUERY.statuses], ["draft", "scheduled"]);
});

Deno.test("status mutations are constrained to twitter draft/scheduled rows", () => {
  assertEquals(TWITTER_STATUS_MUTATION_FILTER.platform, "twitter");
  assertEquals([...TWITTER_STATUS_MUTATION_FILTER.statuses], ["draft", "scheduled"]);
});

Deno.test("isTwitterPlatform: twitter and x only", () => {
  assertEquals(isTwitterPlatform("twitter"), true);
  assertEquals(isTwitterPlatform("TWITTER"), true);
  assertEquals(isTwitterPlatform("x"), true);
  assertEquals(isTwitterPlatform("X"), true);
  assertEquals(isTwitterPlatform("linkedin"), false);
  assertEquals(isTwitterPlatform("instagram"), false);
  assertEquals(isTwitterPlatform("tiktok"), false);
  assertEquals(isTwitterPlatform("facebook"), false);
  assertEquals(isTwitterPlatform(""), false);
  assertEquals(isTwitterPlatform(null), false);
});

Deno.test("LinkedIn draft is not posted to X (incident 8c66955e)", () => {
  const disposition = classifyPublishCandidate(
    candidate({
      id: "8c66955e-0000-0000-0000-000000000000",
      platform: "linkedin",
      status: "draft",
      body: "A LinkedIn-only draft that must never become a tweet.",
    }),
  );

  assertEquals(disposition.kind, "skip");
  if (disposition.kind !== "skip") return;
  assertEquals(disposition.reason, "non_twitter_platform:linkedin");
  assertEquals(disposition.mutateStatus, false);
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("LinkedIn scheduled row is skipped and not marked published/failed", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "linkedin", status: "scheduled" }),
  );
  assertEquals(disposition.kind, "skip");
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("non-X platforms never publish and never mutate status", () => {
  for (const platform of ["linkedin", "instagram", "tiktok", "facebook"]) {
    const disposition = classifyPublishCandidate(
      candidate({ platform, status: "draft" }),
    );
    assertEquals(disposition.kind, "skip", `${platform} must skip`);
    assertEquals(mayMutateCalendarStatus(disposition), false, `${platform} must not mutate`);
  }
});

Deno.test("empty LinkedIn body is skipped, not auto-failed", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "linkedin", body: "   " }),
  );
  assertEquals(disposition.kind, "skip");
  assertEquals(mayMutateCalendarStatus(disposition), false);
});

Deno.test("twitter draft is eligible to publish", () => {
  const body = "Your spread is live. Tune in.";
  const disposition = classifyPublishCandidate(
    candidate({ platform: "twitter", status: "draft", body }),
  );
  assertEquals(disposition.kind, "publish");
  if (disposition.kind !== "publish") return;
  assertEquals(disposition.tweetBody, body);
});

Deno.test("twitter scheduled row is eligible to publish", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "twitter", status: "scheduled" }),
  );
  assertEquals(disposition.kind, "publish");
});

Deno.test("x alias is treated as Twitter if it ever appears", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "x", status: "draft" }),
  );
  assertEquals(disposition.kind, "publish");
});

Deno.test("twitter empty body fails (status mutation allowed) so it cannot retry forever", () => {
  const disposition = classifyPublishCandidate(
    candidate({ platform: "twitter", body: "" }),
  );
  assertEquals(disposition.kind, "fail");
  if (disposition.kind !== "fail") return;
  assertEquals(disposition.reason, "Empty tweet body");
  assertEquals(mayMutateCalendarStatus(disposition), true);
});

Deno.test("paused/published twitter rows are skipped without mutation", () => {
  for (const status of ["paused", "published", "failed", "deleted"]) {
    const disposition = classifyPublishCandidate(
      candidate({ platform: "twitter", status }),
    );
    assertEquals(disposition.kind, "skip", status);
    assertEquals(mayMutateCalendarStatus(disposition), false, status);
  }
});

Deno.test("tweet body over 280 is truncated only for publishable twitter rows", () => {
  const longBody = "a".repeat(300);
  const twitter = classifyPublishCandidate(
    candidate({ platform: "twitter", body: longBody }),
  );
  assertEquals(twitter.kind, "publish");
  if (twitter.kind === "publish") {
    assertEquals(twitter.tweetBody.length, 280);
  }

  const linkedin = classifyPublishCandidate(
    candidate({ platform: "linkedin", body: longBody }),
  );
  assertEquals(linkedin.kind, "skip");
  assert(!("tweetBody" in linkedin));
});

Deno.test("cmo-publish/index.ts filters platform in the due-posts query", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes('.eq("platform", DUE_POSTS_QUERY.platform)'));
  assert(src.includes("classifyPublishCandidate(post)"));
  assert(
    src.includes('.eq("platform", TWITTER_STATUS_MUTATION_FILTER.platform)'),
    "markPublished/markFailed must constrain platform",
  );
  // postTweet must not run before the platform gate
  const classifyAt = src.indexOf("classifyPublishCandidate(post)");
  const tweetAt = src.indexOf("await postTweet(");
  assert(classifyAt >= 0 && tweetAt >= 0 && classifyAt < tweetAt);
});

Deno.test("no other cron publisher reads content_calendar into X", async () => {
  const publishSocial = await Deno.readTextFile(
    new URL("../publish-social-posts/index.ts", import.meta.url),
  );
  assert(
    !publishSocial.includes("content_calendar"),
    "publish-social-posts must not read content_calendar",
  );
  assert(publishSocial.includes("switch (post.platform)"));
  assert(publishSocial.includes('case "x":'));
});
