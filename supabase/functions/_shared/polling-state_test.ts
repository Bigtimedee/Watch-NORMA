import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  shouldPollPbp,
  shouldPollSummary,
  isTerminalStatus,
  justClosed,
} from "./polling-state.ts";

// ─── shouldPollPbp ───

Deno.test("shouldPollPbp: false for non-full coverage", () => {
  assertEquals(shouldPollPbp("game-1", "basic", null), false);
  assertEquals(shouldPollPbp("game-1", "extended_boxscore", null), false);
  assertEquals(shouldPollPbp("game-1", null, null), false);
});

Deno.test("shouldPollPbp: true when no previous snapshot (full coverage)", () => {
  assertEquals(shouldPollPbp("game-fresh", "full", null), true);
});

Deno.test("shouldPollPbp: true when last snapshot is stale (>30s ago)", () => {
  const staleTime = new Date(Date.now() - 60_000).toISOString(); // 60s ago
  assertEquals(shouldPollPbp("game-stale-pbp", "full", staleTime), true);
});

Deno.test("shouldPollPbp: false when last snapshot is fresh (<30s ago)", () => {
  const freshTime = new Date(Date.now() - 10_000).toISOString(); // 10s ago
  assertEquals(shouldPollPbp("game-fresh-pbp", "full", freshTime), false);
});

// ─── shouldPollSummary ───

Deno.test("shouldPollSummary: true when no previous snapshot", () => {
  assertEquals(shouldPollSummary("game-summary-fresh", null), true);
});

Deno.test("shouldPollSummary: true when last snapshot is stale (>2 min)", () => {
  const staleTime = new Date(Date.now() - 3 * 60_000).toISOString(); // 3 min ago
  assertEquals(shouldPollSummary("game-summary-stale", staleTime), true);
});

Deno.test("shouldPollSummary: false within 2-min window", () => {
  const freshTime = new Date(Date.now() - 30_000).toISOString(); // 30s ago
  assertEquals(shouldPollSummary("game-summary-recent", freshTime), false);
});

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

// ─── justClosed ───

Deno.test("justClosed: inprogress → closed = true", () => {
  assertEquals(justClosed("inprogress", "closed"), true);
});

Deno.test("justClosed: halftime → closed = true", () => {
  assertEquals(justClosed("halftime", "closed"), true);
});

Deno.test("justClosed: closed → closed = false", () => {
  assertEquals(justClosed("closed", "closed"), false);
});

Deno.test("justClosed: scheduled → inprogress = false", () => {
  assertEquals(justClosed("scheduled", "inprogress"), false);
});
