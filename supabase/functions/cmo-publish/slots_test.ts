import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chicagoStartOfDay, dailySlotsUtc, STALE_AFTER_MS } from "./logic.ts";

Deno.test("3 daily slots in CST (Nov) map to 15/19/01 UTC", () => {
  const s = dailySlotsUtc(new Date("2026-11-04T16:00:00Z")).map((d) => d.toISOString());
  assertEquals(s, ["2026-11-04T15:00:00.000Z", "2026-11-04T19:00:00.000Z", "2026-11-05T01:00:00.000Z"]);
});

Deno.test("3 daily slots in CDT (Jul) map to 14/18/00 UTC", () => {
  const s = dailySlotsUtc(new Date("2026-07-10T16:00:00Z")).map((d) => d.toISOString());
  assertEquals(s, ["2026-07-10T14:00:00.000Z", "2026-07-10T18:00:00.000Z", "2026-07-11T00:00:00.000Z"]);
});

Deno.test("chicagoStartOfDay is DST-correct and handles late-evening UTC rollover", () => {
  assertEquals(chicagoStartOfDay(new Date("2026-11-05T01:30:00Z")).toISOString(), "2026-11-04T06:00:00.000Z");
  assertEquals(chicagoStartOfDay(new Date("2026-07-10T12:00:00Z")).toISOString(), "2026-07-10T05:00:00.000Z");
  // DST end day 2026-11-01: midnight is still CDT
  assertEquals(chicagoStartOfDay(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T05:00:00.000Z");
});

Deno.test("slot gaps exceed the 3h stale window so no on-time slot is held stale", () => {
  const s = dailySlotsUtc(new Date("2026-11-04T16:00:00Z"));
  for (let i = 1; i < s.length; i++) {
    if (s[i].getTime() - s[i - 1].getTime() <= STALE_AFTER_MS) throw new Error("slot gap <= stale window");
  }
});
