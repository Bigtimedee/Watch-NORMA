// =============================================================================
// cmo-publish: late / empty-media guards, claim idempotency, dry run
// Incident 2026-09-26..10-02: daily 09:00 UTC sweep posted 11:00 CT rows at
// 04:00 CT next day; 3347826d posted text-only (empty media_urls).
// =============================================================================

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  EMPTY_MEDIA_GRACE_MS,
  HOLD_EMPTY_MEDIA_WAITING,
  SKIP_REASON_EMPTY_MEDIA,
  SKIP_REASON_STALE,
  STALE_AFTER_MS,
  appendNote,
  autoSkipNote,
  classifyPublishCandidate,
  hasMedia,
  interpretClaim,
  isStale,
  mayMutateCalendarStatus,
  parseRunOptions,
  type CalendarPublishCandidate,
} from "./logic.ts";

const SLOT = "2026-10-03T16:00:00.000Z"; // Sat 11:00 CT
const at = (offsetMs: number) => new Date(Date.parse(SLOT) + offsetMs);
const MIN = 60 * 1000;
const PNG = ["https://cdn.example.com/norma-x-20261003-slate-cfb.png"];

function row(overrides: Partial<CalendarPublishCandidate> = {}): CalendarPublishCandidate {
  return {
    id: "99e0423b-0000-0000-0000-000000000000",
    platform: "twitter",
    status: "draft",
    body: "CFB slate is live. Tune in.",
    scheduled_for: SLOT,
    media_urls: PNG,
    ...overrides,
  };
}

Deno.test("on-time twitter row with media publishes (5-min cron tick)", () => {
  for (const off of [0, 1 * MIN, 5 * MIN, 29 * MIN, 2 * 60 * MIN]) {
    assertEquals(classifyPublishCandidate(row(), at(off)).kind, "publish", `+${off / MIN}m`);
  }
});

Deno.test("stale: > 3h past scheduled_for is marked skipped, never published", () => {
  const d = classifyPublishCandidate(row(), at(STALE_AFTER_MS + 1));
  assertEquals(d.kind, "mark_skipped");
  if (d.kind === "mark_skipped") assertEquals(d.reason, SKIP_REASON_STALE);
  assertEquals(mayMutateCalendarStatus(d), true);
});

Deno.test("stale boundary: exactly 3h is still publishable", () => {
  assertEquals(classifyPublishCandidate(row(), at(STALE_AFTER_MS)).kind, "publish");
});

Deno.test("regression: 04:00 CT next-day sweep (~17h late) is skipped as stale", () => {
  // f7c0d4ed: scheduled 2026-09-26 11:00 CT, posted 2026-09-27 04:00 CT
  const d = classifyPublishCandidate(
    row({ scheduled_for: "2026-09-26T16:00:00Z" }),
    new Date("2026-09-27T09:00:03Z"),
  );
  assertEquals(d.kind, "mark_skipped");
  if (d.kind === "mark_skipped") assertEquals(d.reason, "stale");
});

Deno.test("empty media: held (no write) inside the grace window", () => {
  for (const media of [[], null, undefined, [""], ["   "]]) {
    const d = classifyPublishCandidate(row({ media_urls: media as string[] | null }), at(5 * MIN));
    assertEquals(d.kind, "skip", JSON.stringify(media));
    if (d.kind === "skip") assertEquals(d.reason, HOLD_EMPTY_MEDIA_WAITING);
    assertEquals(mayMutateCalendarStatus(d), false);
  }
});

Deno.test("empty media: marked skipped after grace, never tweeted text-only (3347826d)", () => {
  const d = classifyPublishCandidate(row({ media_urls: [] }), at(EMPTY_MEDIA_GRACE_MS + 1));
  assertEquals(d.kind, "mark_skipped");
  if (d.kind === "mark_skipped") assertEquals(d.reason, SKIP_REASON_EMPTY_MEDIA);
});

Deno.test("empty media + stale reports stale", () => {
  const d = classifyPublishCandidate(row({ media_urls: [] }), at(STALE_AFTER_MS + MIN));
  assertEquals(d.kind, "mark_skipped");
  if (d.kind === "mark_skipped") assertEquals(d.reason, SKIP_REASON_STALE);
});

Deno.test("media attached late (within grace) publishes", () => {
  assertEquals(classifyPublishCandidate(row(), at(EMPTY_MEDIA_GRACE_MS - MIN)).kind, "publish");
});

Deno.test("paused rows still skip untouched, even if stale or media-less", () => {
  for (const r of [
    row({ status: "paused" }),
    row({ status: "paused", media_urls: [] }),
  ]) {
    const d = classifyPublishCandidate(r, at(STALE_AFTER_MS + MIN));
    assertEquals(d.kind, "skip");
    if (d.kind === "skip") assertEquals(d.reason, "status_paused");
    assertEquals(mayMutateCalendarStatus(d), false);
  }
});

Deno.test("non-twitter stale/empty rows are never mutated by cmo-publish", () => {
  const d = classifyPublishCandidate(
    row({ platform: "linkedin", media_urls: [] }),
    at(STALE_AFTER_MS + MIN),
  );
  assertEquals(d.kind, "skip");
  assertEquals(mayMutateCalendarStatus(d), false);
});

Deno.test("hasMedia / isStale helpers", () => {
  assertEquals(hasMedia(PNG), true);
  assertEquals(hasMedia([]), false);
  assertEquals(hasMedia(null), false);
  assertEquals(hasMedia(["", " "]), false);
  assertEquals(isStale(null, at(0)), false);
  assertEquals(isStale("not-a-date", at(0)), false);
  assertEquals(isStale(SLOT, at(-60 * MIN)), false);
});

Deno.test("auto-skip note is appended, not overwriting Content notes", () => {
  const note = autoSkipNote("stale", SLOT, at(4 * 60 * MIN));
  assert(note.startsWith("[AUTO-SKIP "));
  assert(note.includes("reason=stale"));
  assert(note.includes("240 min"));
  const merged = appendNote("[campaign W2] Creative: norma-x-20261003-slate-cfb.png", note);
  assert(merged.startsWith("[campaign W2]"));
  assert(merged.endsWith(note));
  assertEquals(appendNote(null, note), note);
});

Deno.test("claim: only the winner may tweet; others skip", () => {
  assertEquals(interpretClaim({ id: "a" }, null, "a").ok, true);
  const lost = interpretClaim(null, null, "a");
  assertEquals(lost.ok, false);
  if (!lost.ok) assertEquals(lost.reason, "claim_lost");
  const err = interpretClaim(null, { message: "violates check" }, "a");
  assertEquals(err.ok, false);
  if (!err.ok) assert(err.reason.startsWith("claim_error:"));
  assertEquals(interpretClaim({ id: "b" }, null, "a").ok, false);
});

Deno.test("dry run: as_of honoured only when dry_run is true", () => {
  const now = new Date("2026-10-02T17:00:00Z");
  const dry = parseRunOptions({ dry_run: true, as_of: SLOT }, now);
  assertEquals(dry.dryRun, true);
  assertEquals(dry.asOf.toISOString(), SLOT);

  const live = parseRunOptions({ as_of: SLOT }, now);
  assertEquals(live.dryRun, false);
  assertEquals(live.asOf.toISOString(), now.toISOString());

  assertEquals(parseRunOptions({ source: "pg_cron" }, now).dryRun, false);
  assertEquals(parseRunOptions({ dry_run: true, as_of: "junk" }, now).asOf, now);
});

Deno.test("index.ts: dry run returns before upload/claim/tweet; guards wired", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const loopStart = src.indexOf("classifyPublishCandidate(post, asOf)");
  const dryAt = src.indexOf("if (dryRun) {", loopStart);
  const uploadAt = src.indexOf("await uploadMediaToTwitter(", loopStart);
  const claimAt = src.indexOf("await claimForPublish(", loopStart);
  const tweetAt = src.indexOf("await postTweet(", loopStart);
  const skipAt = src.indexOf("await markSkipped(", loopStart);
  assert(loopStart > 0 && dryAt > loopStart);
  assert(dryAt < skipAt && dryAt < uploadAt && dryAt < claimAt && dryAt < tweetAt);
  // no text-only fallback: upload failure holds the row
  assert(src.includes("HOLD_MEDIA_UPLOAD_FAILED"));
  assert(!src.includes("mediaIds.length > 0 ? mediaIds : undefined"));
  // markPublished only from the claimed state
  assert(src.includes('.in("status", [...POST_CLAIM_STATUSES])'));
});
