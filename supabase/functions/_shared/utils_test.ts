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
