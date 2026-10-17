// =============================================================================
// cmo-publish: over-length guard
// Incident 2026-10-17: X post 2111487416116592822 shipped with a 299-char
// caption (body already contained "#WatchNORMA #CFB" inline); the old code
// slice(0,280) silently truncated it, dropping the hashtags and cutting the
// URL to getnorma.a. Now >280 composed pauses, never truncates.
// =============================================================================

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type CalendarPublishCandidate,
  classifyPublishCandidate,
  composedTweetLength,
  composeTweetText,
  GUARD_REASON_OVER_LENGTH,
  guardHoldNote,
  mayMutateCalendarStatus,
  overLengthFlag,
  tweetTextLength,
  X_MAX_TWEET_LENGTH,
  X_TARGET_TWEET_LENGTH,
} from "./logic.ts";

const SLOT = "2026-10-17T16:00:00.000Z"; // Sat 11:00 CT
const NOW = new Date(SLOT);
const PNG = ["https://cdn.example.com/norma-x-20261017-slate-cfb.png"];

function row(
  overrides: Partial<CalendarPublishCandidate> = {},
): CalendarPublishCandidate {
  return {
    id: "567599c8-0000-0000-0000-000000000000",
    platform: "twitter",
    status: "draft",
    body: "CFB slate is live.",
    scheduled_for: SLOT,
    media_urls: PNG,
    hashtags: [],
    ...overrides,
  };
}

Deno.test("299-char body+hashtags (incident shape) is paused over_length, not truncated", () => {
  // 282-char body + hashtags appended from the hashtags column = 299.
  const body = "a".repeat(282);
  const d = classifyPublishCandidate(
    row({ body, hashtags: ["WatchNORMA", "CFB"] }),
    NOW,
  );
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") {
    assertEquals(d.reason, GUARD_REASON_OVER_LENGTH);
    assertEquals(d.tweetLength, 299);
    assertEquals(mayMutateCalendarStatus(d), true);
  }
  assert(!("tweetBody" in d), "no truncated tweetBody may be produced");
});

Deno.test("incident row verbatim: hashtags already inline count once, composed = 299", () => {
  const body =
    "NORMA sees your wagers and predictions, so it knows which of today's games matter to you. Early window, 11:00 CT:\n\nGeorgia State at James Madison (ESPNU)\nOhio State at Indiana (Fox)\nFlorida at Texas (ABC)\n\nIt pings you when yours is on the line. Open Norma before kick: getnorma.app\n#WatchNORMA #CFB";
  assertEquals(body.length, 299);
  assertEquals(composeTweetText(body, ["WatchNORMA", "CFB"]), body);
  assertEquals(
    composedTweetLength(row({ body, hashtags: ["WatchNORMA", "CFB"] })),
    299,
  );
  const d = classifyPublishCandidate(
    row({ body, hashtags: ["WatchNORMA", "CFB"] }),
    NOW,
  );
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") assertEquals(d.tweetLength, 299);
});

Deno.test("exactly 280 posts; 270 posts without over-target warning", () => {
  const d280 = classifyPublishCandidate(row({ body: "a".repeat(280) }), NOW);
  assertEquals(d280.kind, "publish");
  if (d280.kind === "publish") {
    assertEquals(d280.tweetLength, X_MAX_TWEET_LENGTH);
    assertEquals(d280.tweetBody.length, 280);
    assertEquals(
      d280.overTarget,
      true,
      "271-280 publishes but is flagged over target",
    );
  }
  const d270 = classifyPublishCandidate(row({ body: "a".repeat(270) }), NOW);
  assertEquals(d270.kind, "publish");
  if (d270.kind === "publish") {
    assertEquals(d270.tweetLength, X_TARGET_TWEET_LENGTH);
    assertEquals(d270.overTarget, undefined);
  }
  const d275 = classifyPublishCandidate(row({ body: "a".repeat(275) }), NOW);
  assertEquals(d275.kind, "publish");
  if (d275.kind === "publish") assertEquals(d275.overTarget, true);
});

Deno.test("non-X platforms unaffected by over-length", () => {
  for (const platform of ["linkedin", "instagram", "tiktok", "facebook"]) {
    const d = classifyPublishCandidate(
      row({ platform, body: "a".repeat(299), hashtags: ["CFB"] }),
      NOW,
    );
    assertEquals(d.kind, "skip", platform);
    assertEquals(mayMutateCalendarStatus(d), false, platform);
  }
});

Deno.test("body alone fits but body+hashtags exceeds 280 -> paused", () => {
  const body = "a".repeat(270); // fits alone, even at target
  assertEquals(
    classifyPublishCandidate(row({ body, hashtags: [] }), NOW).kind,
    "publish",
  );
  const d = classifyPublishCandidate(
    row({ body, hashtags: ["WatchNORMA", "CFB"] }),
    NOW,
  );
  // 270 + " #WatchNORMA" (12) + " #CFB" (5) = 287
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") {
    assertEquals(d.reason, GUARD_REASON_OVER_LENGTH);
    assertEquals(d.tweetLength, 287);
  }
});

Deno.test("composeTweetText: dedupes inline hashtags, normalises '#' in column", () => {
  assertEquals(
    composeTweetText("Game day #CFB", ["CFB", "#WatchNORMA"]),
    "Game day #CFB #WatchNORMA",
  );
  assertEquals(composeTweetText("Game day", []), "Game day");
  assertEquals(composeTweetText("Game day", null), "Game day");
  assertEquals(composeTweetText("Game day ", ["NFL"]), "Game day #NFL");
});

Deno.test("tweetTextLength: http(s) URLs count as t.co 23, bare domains count raw", () => {
  assertEquals(
    tweetTextLength("see https://getnorma.app/advertise now"),
    4 + 23 + 4,
  );
  assertEquals(
    tweetTextLength("see getnorma.app now"),
    "see getnorma.app now".length,
  );
  assertEquals(tweetTextLength("a".repeat(280)), 280);
});

Deno.test("over_length hold note carries the visible flag with the actual count", () => {
  assertEquals(
    overLengthFlag(299),
    "over_length: 299 chars (max 280, target 270)",
  );
  const note = guardHoldNote(
    GUARD_REASON_OVER_LENGTH,
    new Date("2026-10-17T16:05:00Z"),
    299,
  );
  assert(note.includes("over_length: 299 chars (max 280, target 270)"), note);
  assert(note.includes("reason=over_length"), note);
});

Deno.test("over_length is checked after empty_media (SQL CASE order preserved)", () => {
  const d = classifyPublishCandidate(
    row({ body: "a".repeat(299), media_urls: [] }),
    NOW,
  );
  assertEquals(d.kind, "pause");
  if (d.kind === "pause") assertEquals(d.reason, "empty_media");
});
