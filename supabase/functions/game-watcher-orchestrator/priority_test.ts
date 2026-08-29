import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prioritize } from "./priority.ts";

// FX8 (H-2/H-3 in the 2026-08-23 audit): the orchestrator dispatches poll
// budget in FIFO next_poll_at order. On a 60-game NCAAF Saturday MAX_PBP=5
// means the tail games can wait 12+ minutes for a PBP poll. prioritize()
// reorders each dispatch cycle's candidate pool so games with an active
// user follow or open wager get first pick of the per-cycle budget.

Deno.test("prioritize: empty priority set returns input unchanged", () => {
  const candidates = [{ game_id: "a" }, { game_id: "b" }, { game_id: "c" }];
  assertEquals(prioritize(candidates, new Set()), candidates);
});

Deno.test("prioritize: high-priority games surface to the top, preserving relative order", () => {
  const candidates = [
    { game_id: "a" }, // low
    { game_id: "b" }, // high
    { game_id: "c" }, // low
    { game_id: "d" }, // high
    { game_id: "e" }, // low
  ];
  const result = prioritize(candidates, new Set(["b", "d"]));
  assertEquals(result.map((c) => c.game_id), ["b", "d", "a", "c", "e"]);
});

Deno.test("prioritize: single tail game with a wager reaches the front of the queue", () => {
  // Simulates the audit scenario: 60 candidates FIFO by next_poll_at, one
  // low-index low-priority game and one high-index game with a user wager.
  const candidates = Array.from({ length: 60 }, (_, i) => ({
    game_id: `g${String(i).padStart(2, "0")}`,
  }));
  const priority = new Set(["g45"]);
  const result = prioritize(candidates, priority);
  assertEquals(result[0].game_id, "g45");
  assertEquals(result[1].game_id, "g00");
  assertEquals(result.length, 60);
});

Deno.test("prioritize: keeps the FIFO within the high-priority group", () => {
  const candidates = [
    { game_id: "x" }, // high
    { game_id: "y" }, // low
    { game_id: "z" }, // high (later in queue)
  ];
  const result = prioritize(candidates, new Set(["x", "z"]));
  assertEquals(result.map((c) => c.game_id), ["x", "z", "y"]);
});

Deno.test("prioritize: slice(0, budget) after prioritize picks user games first (H-3 acceptance)", () => {
  // Reproduces the acceptance criterion pattern from the plan/audit: with a
  // candidate pool 4x the per-cycle budget, the top MAX_PBP=5 slice must
  // contain every prioritized game before any tail game.
  const budget = 5;
  const pool = Array.from({ length: budget * 4 }, (_, i) => ({
    game_id: `g${String(i).padStart(2, "0")}`,
  }));
  // Three games with follows/wagers, scattered through the pool
  const priority = new Set(["g07", "g12", "g18"]);
  const top = prioritize(pool, priority).slice(0, budget);
  const topIds = top.map((c) => c.game_id);
  for (const p of priority) assertEquals(topIds.includes(p), true);
});
