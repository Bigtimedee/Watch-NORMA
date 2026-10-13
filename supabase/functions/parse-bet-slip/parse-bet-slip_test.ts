import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("parse-bet-slip is disabled and calls no external AI provider", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("enter your wager manually"));
  assert(!/fetch\(/.test(src), "must not call any external API");
});
