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
  MARK_PUBLISHED_MISS_DETAIL,
  PAUSED_STATUS,
  SKIP_WITHOUT_MUTATION_STATUSES,
  TWITTER_STATUS_MUTATION_FILTER,
  classifyPublishCandidate,
  describePossibleOrphanTweet,
  isMarkPublishedMiss,
  isPausedStatus,
  isTwitterPlatform,
  markPublishedMissError,
  mayMutateCalendarStatus,
  preflightPublishRow,
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

Deno.test("paused is a skip-without-mutation status, not a publishable one", () => {
  assertEquals(PAUSED_STATUS, "paused");
  assert(([...SKIP_WITHOUT_MUTATION_STATUSES] as string[]).includes("paused"));
  assert(!([...DUE_POSTS_QUERY.statuses] as string[]).includes("paused"));
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

Deno.test("paused twitter row is skipped without mutation (incident 310441ec)", () => {
  const disposition = classifyPublishCandidate(
    candidate({
      id: "310441ec-b198-4f32-a35d-d721c92d4cdd",
      platform: "twitter",
      status: PAUSED_STATUS,
    }),
  );
  assertEquals(disposition.kind, "skip");
  if (disposition.kind !== "skip") return;
  assertEquals(disposition.reason, "status_paused");
  assertEquals(disposition.mutateStatus, false);
  assertEquals(mayMutateCalendarStatus(disposition), false);
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

Deno.test("preflightPublishRow: twitter draft/scheduled still ok", () => {
  for (const status of ["draft", "scheduled"]) {
    const result = preflightPublishRow(
      { id: "4af48adf-0000-0000-0000-000000000000", platform: "twitter", status },
      "4af48adf-0000-0000-0000-000000000000",
    );
    assertEquals(result.ok, true, status);
  }
});

Deno.test("preflightPublishRow: paused skips (TOCTOU after fetchDuePosts)", () => {
  const result = preflightPublishRow(
    {
      id: "310441ec-b198-4f32-a35d-d721c92d4cdd",
      platform: "twitter",
      status: "paused",
    },
    "310441ec-b198-4f32-a35d-d721c92d4cdd",
  );
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.skipped, true);
  assertEquals(result.reason, "status_paused");
});

Deno.test("preflightPublishRow: published/failed/missing are skip, not fail", () => {
  const published = preflightPublishRow(
    { id: "a", platform: "twitter", status: "published" },
    "a",
  );
  assertEquals(published.ok, false);
  if (!published.ok) assertEquals(published.reason, "not_publishable_status:published");

  const failed = preflightPublishRow(
    { id: "a", platform: "twitter", status: "failed" },
    "a",
  );
  assertEquals(failed.ok, false);
  if (!failed.ok) assertEquals(failed.reason, "not_publishable_status:failed");

  const missing = preflightPublishRow(null, "a");
  assertEquals(missing.ok, false);
  if (!missing.ok) {
    assertEquals(missing.skipped, true);
    assertEquals(missing.reason, "row_missing");
  }
});

Deno.test("preflightPublishRow: non-twitter live row skips", () => {
  const result = preflightPublishRow(
    { id: "8c66955e-0000-0000-0000-000000000000", platform: "linkedin", status: "draft" },
    "8c66955e-0000-0000-0000-000000000000",
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "non_twitter_platform:linkedin");
});

Deno.test("preflightPublishRow: id mismatch skips", () => {
  const result = preflightPublishRow(
    { id: "other", platform: "twitter", status: "draft" },
    "expected",
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "id_mismatch");
});

Deno.test("isPausedStatus only matches paused", () => {
  assertEquals(isPausedStatus("paused"), true);
  assertEquals(isPausedStatus("PAUSED"), true);
  assertEquals(isPausedStatus("draft"), false);
  assertEquals(isPausedStatus("scheduled"), false);
  assertEquals(isPausedStatus(null), false);
});

Deno.test("markPublished miss is detected without treating as a tweet failure to fail", () => {
  const postId = "310441ec-b198-4f32-a35d-d721c92d4cdd";
  const err = new Error(markPublishedMissError(postId));
  assert(err.message.includes(MARK_PUBLISHED_MISS_DETAIL));
  assertEquals(isMarkPublishedMiss(err), true);
  assertEquals(isMarkPublishedMiss(new Error("Twitter API error 403")), false);

  const orphan = describePossibleOrphanTweet(postId, "1234567890");
  assert(orphan.includes("possible_orphan_tweet"));
  assert(orphan.includes("1234567890"));
  assert(orphan.includes("Not marking failed"));
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

Deno.test("cmo-publish/index.ts revalidates the live row before postTweet (310441ec)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("revalidateDuePost"));
  assert(src.includes("preflightPublishRow"));
  assert(src.includes("isMarkPublishedMiss"));
  assert(src.includes("describePossibleOrphanTweet"));
  assert(src.includes("310441ec"));

  const preflightAt = src.indexOf("await revalidateDuePost(");
  const tweetAt = src.indexOf("await postTweet(");
  const markFailedAt = src.lastIndexOf("await markFailed(");
  assert(preflightAt >= 0 && tweetAt >= 0 && preflightAt < tweetAt);
  // markPublished miss must skip markFailed
  assert(src.includes("if (isMarkPublishedMiss(markErr))"));
  const missAt = src.indexOf("if (isMarkPublishedMiss(markErr))");
  assert(missAt >= 0 && missAt < markFailedAt);
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
