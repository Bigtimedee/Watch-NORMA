import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashPayload, mapStatus } from "./utils.ts";

// ─── hashPayload ───

Deno.test("hashPayload: deterministic — same input gives same hash", () => {
  const obj = { score: 68, team: "Duke" };
  assertEquals(hashPayload(obj), hashPayload(obj));
});

Deno.test("hashPayload: different inputs → different hashes", () => {
  const a = { score: 68 };
  const b = { score: 69 };
  assertNotEquals(hashPayload(a), hashPayload(b));
});

Deno.test("hashPayload: handles nested objects", () => {
  const obj = { game: { home: { score: 68 }, away: { score: 65 } } };
  const hash = hashPayload(obj);
  assertEquals(typeof hash, "string");
  assertEquals(hash.length > 0, true);
});

Deno.test("hashPayload: handles arrays", () => {
  const obj = [1, 2, 3];
  const hash = hashPayload(obj);
  assertEquals(typeof hash, "string");
});

// ─── mapStatus ───

Deno.test("mapStatus: isClosed overrides everything", () => {
  assertEquals(mapStatus("InProgress", true), "closed");
  assertEquals(mapStatus("Scheduled", true), "closed");
});

Deno.test("mapStatus: InProgress → inprogress", () => {
  assertEquals(mapStatus("InProgress", false), "inprogress");
});

Deno.test("mapStatus: 'In Progress' (with space) → inprogress", () => {
  assertEquals(mapStatus("In Progress", false), "inprogress");
});

Deno.test("mapStatus: Halftime → halftime", () => {
  assertEquals(mapStatus("Halftime", false), "halftime");
});

Deno.test("mapStatus: Half → halftime", () => {
  assertEquals(mapStatus("Half", false), "halftime");
});

Deno.test("mapStatus: Final → closed", () => {
  assertEquals(mapStatus("Final", false), "closed");
});

Deno.test("mapStatus: F → closed", () => {
  assertEquals(mapStatus("F", false), "closed");
});

Deno.test("mapStatus: F/OT → closed", () => {
  assertEquals(mapStatus("F/OT", false), "closed");
});

Deno.test("mapStatus: Canceled → cancelled", () => {
  assertEquals(mapStatus("Canceled", false), "cancelled");
});

Deno.test("mapStatus: Cancelled → cancelled", () => {
  assertEquals(mapStatus("Cancelled", false), "cancelled");
});

Deno.test("mapStatus: Postponed → postponed", () => {
  assertEquals(mapStatus("Postponed", false), "postponed");
});

Deno.test("mapStatus: Scheduled → scheduled", () => {
  assertEquals(mapStatus("Scheduled", false), "scheduled");
});

Deno.test("mapStatus: Created → scheduled", () => {
  assertEquals(mapStatus("Created", false), "scheduled");
});

Deno.test("mapStatus: empty string → scheduled", () => {
  assertEquals(mapStatus("", false), "scheduled");
});

// ─── Football / "End of {Quarter}" regression suite (2026-08-23 audit BL-1) ───
// The previous inline mappers in poll-schedule treated any status containing
// "end of" as "closed", which finaled live football games at every quarter
// break. mapStatus now maps "end of _" → inprogress uniformly.

Deno.test("mapStatus: End of 1st Quarter → inprogress (NCAAF Q1 break)", () => {
  assertEquals(mapStatus("End of 1st Quarter", false), "inprogress");
});

Deno.test("mapStatus: End of 2nd Quarter → inprogress (avoid double-count with halftime)", () => {
  // NB: ESPN typically emits "Halftime" between Q2 and Q3, but if a source
  // ever sent "End of 2nd Quarter" it must still be inprogress, never closed.
  assertEquals(mapStatus("End of 2nd Quarter", false), "inprogress");
});

Deno.test("mapStatus: End of 3rd Quarter → inprogress (NCAAF Q3 break)", () => {
  assertEquals(mapStatus("End of 3rd Quarter", false), "inprogress");
});

Deno.test("mapStatus: End of 4th Quarter → inprogress (tied game headed to OT)", () => {
  assertEquals(mapStatus("End of 4th Quarter", false), "inprogress");
});

Deno.test("mapStatus: End of Regulation → inprogress (tied game before OT)", () => {
  assertEquals(mapStatus("End of Regulation", false), "inprogress");
});

Deno.test("mapStatus: End of Period → inprogress (generic ESPN period break)", () => {
  assertEquals(mapStatus("End of Period", false), "inprogress");
});

Deno.test("mapStatus: end_of_period (machine code) → inprogress", () => {
  assertEquals(mapStatus("end_of_period", false), "inprogress");
});

Deno.test("mapStatus: Final (post-regulation) still closed", () => {
  // Guard: the new startsWith('end of ') branch must NOT eat "Final".
  assertEquals(mapStatus("Final", false), "closed");
  assertEquals(mapStatus("F/OT", false), "closed");
});
