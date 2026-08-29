import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isValidHHMM, localHHMM, isInQuietHours } from "./quiet-hours.ts";

// ─── isValidHHMM ───

Deno.test("isValidHHMM: accepts 00:00 and 23:59", () => {
  assertEquals(isValidHHMM("00:00"), true);
  assertEquals(isValidHHMM("23:59"), true);
});

Deno.test("isValidHHMM: rejects wall-clock English ('11pm')", () => {
  assertEquals(isValidHHMM("11pm"), false);
  assertEquals(isValidHHMM("11 PM"), false);
});

Deno.test("isValidHHMM: rejects invalid hour/minute", () => {
  assertEquals(isValidHHMM("24:00"), false);
  assertEquals(isValidHHMM("12:60"), false);
  assertEquals(isValidHHMM("9:00"), false); // must be zero-padded
});

Deno.test("isValidHHMM: rejects non-strings", () => {
  assertEquals(isValidHHMM(null), false);
  assertEquals(isValidHHMM(undefined), false);
  assertEquals(isValidHHMM(2200 as unknown), false);
});

// ─── localHHMM ───

Deno.test("localHHMM: America/New_York on 2026-09-14T02:00Z → 22:00 (previous evening EDT)", () => {
  const t = new Date("2026-09-14T02:00:00Z"); // EDT offset -04:00 in early Sept
  assertEquals(localHHMM(t, "America/New_York"), "22:00");
});

Deno.test("localHHMM: America/Los_Angeles on same instant → 19:00 (PDT)", () => {
  const t = new Date("2026-09-14T02:00:00Z");
  assertEquals(localHHMM(t, "America/Los_Angeles"), "19:00");
});

Deno.test("localHHMM: invalid timezone falls back to UTC (no throw)", () => {
  const t = new Date("2026-09-14T02:00:00Z");
  assertEquals(localHHMM(t, "Not/A_Zone"), "02:00");
});

Deno.test("localHHMM: null timezone falls back to UTC", () => {
  const t = new Date("2026-09-14T02:00:00Z");
  assertEquals(localHHMM(t, null), "02:00");
});

// ─── isInQuietHours ───
// The 2026-08-20 audit scenario: Eastern user, 23:00–08:00 quiet.
// A football game at 21:00 ET must alert (not in quiet). 02:00 ET must be suppressed.

Deno.test("Eastern user 23:00–08:00 quiet: 21:00 ET (=01:00Z next day) → ALERT (not quiet)", () => {
  // 2026-09-14 21:00 America/New_York = 2026-09-15 01:00 UTC (EDT -04)
  const t = new Date("2026-09-15T01:00:00Z");
  const suppress = isInQuietHours(
    { quiet_hours_start: "23:00", quiet_hours_end: "08:00" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, false);
});

Deno.test("Eastern user 23:00–08:00 quiet: 02:00 ET (=06:00Z) → QUIET (suppress push)", () => {
  const t = new Date("2026-09-15T06:00:00Z"); // 02:00 ET
  const suppress = isInQuietHours(
    { quiet_hours_start: "23:00", quiet_hours_end: "08:00" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, true);
});

Deno.test("same-day window 13:00–17:00: 15:30 ET → QUIET", () => {
  const t = new Date("2026-09-14T19:30:00Z"); // 15:30 ET (EDT -04)
  const suppress = isInQuietHours(
    { quiet_hours_start: "13:00", quiet_hours_end: "17:00" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, true);
});

Deno.test("same-day window 13:00–17:00: 17:00 ET (edge) → NOT quiet (exclusive end)", () => {
  const t = new Date("2026-09-14T21:00:00Z"); // 17:00 ET
  const suppress = isInQuietHours(
    { quiet_hours_start: "13:00", quiet_hours_end: "17:00" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, false);
});

Deno.test("malformed HH:MM never accidentally silences (fails open)", () => {
  const t = new Date("2026-09-15T06:00:00Z");
  const suppress = isInQuietHours(
    { quiet_hours_start: "11pm", quiet_hours_end: "8am" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, false);
});

Deno.test("start === end never silences (ambiguous window)", () => {
  const t = new Date("2026-09-15T06:00:00Z");
  const suppress = isInQuietHours(
    { quiet_hours_start: "22:00", quiet_hours_end: "22:00" },
    "America/New_York",
    t,
  );
  assertEquals(suppress, false);
});

Deno.test("null settings never silences", () => {
  const suppress = isInQuietHours(null, "America/New_York", new Date());
  assertEquals(suppress, false);
});
