import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDemoAlert, isDemoGameId } from "./demo-guard.ts";

Deno.test("isDemoGameId matches screenshot seed ids and not ESPN ids", () => {
  assertEquals(isDemoGameId("demo-ncaaf-clem-lsu-20260905"), true);
  assertEquals(isDemoGameId("DEMO-nfl-sf-lar-20260910"), true);
  assertEquals(isDemoGameId("espn-ncaaf-401856660"), false);
  assertEquals(isDemoGameId("game-1"), false);
  assertEquals(isDemoGameId(null), false);
});

Deno.test("isDemoAlert matches title marker or demo game_id", () => {
  assertEquals(
    isDemoAlert({
      game_id: "espn-ncaaf-401856660",
      title: "DEMO SCREENSHOT — live look",
    }),
    true
  );
  assertEquals(
    isDemoAlert({
      game_id: "demo-ncaaf-slate-20260905",
      title: "Close game",
    }),
    true
  );
  assertEquals(
    isDemoAlert({
      game_id: "espn-ncaaf-401856660",
      title: "Your spread is live",
    }),
    false
  );
});
