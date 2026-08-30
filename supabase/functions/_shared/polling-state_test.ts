import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTerminalStatus } from "./polling-state.ts";

// KL-3 (2026-08-29): shouldPollPbp, shouldPollSummary, markPbpPolled,
// markSummaryPolled, and justClosed were removed when polling-state.ts was
// shrunk to its one live export. Tests for those functions are removed here to
// match. The watcher_state table + game-watcher-orchestrator now own per-game
// polling lifecycle; this file tests only the surviving utility.

// ─── isTerminalStatus ───

Deno.test("isTerminalStatus: closed → true", () => {
  assertEquals(isTerminalStatus("closed"), true);
});

Deno.test("isTerminalStatus: cancelled → true", () => {
  assertEquals(isTerminalStatus("cancelled"), true);
});

Deno.test("isTerminalStatus: postponed → true", () => {
  assertEquals(isTerminalStatus("postponed"), true);
});

Deno.test("isTerminalStatus: forfeit → true", () => {
  assertEquals(isTerminalStatus("forfeit"), true);
});

Deno.test("isTerminalStatus: inprogress → false", () => {
  assertEquals(isTerminalStatus("inprogress"), false);
});

Deno.test("isTerminalStatus: scheduled → false", () => {
  assertEquals(isTerminalStatus("scheduled"), false);
});

Deno.test("isTerminalStatus: halftime → false", () => {
  assertEquals(isTerminalStatus("halftime"), false);
});
