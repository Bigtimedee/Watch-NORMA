import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPrescreenPrompt, parsePrescreenResponse } from "./rubric.ts";
import type { CreativeForReview } from "./rubric.ts";

function makeCreative(overrides: Partial<CreativeForReview> = {}): CreativeForReview {
  return {
    sponsor_text: "Bet on every game with DraftKings",
    cta_text: "Bet Now",
    cta_url: "https://draftkings.com",
    demand_type: "sportsbook",
    ...overrides,
  };
}

// ─── buildPrescreenPrompt ────────────────────────────────────────────

Deno.test("rubric: prompt includes sponsor_text", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ sponsor_text: "Join FanDuel today" }));
  assertStringIncludes(prompt, "Join FanDuel today");
});

Deno.test("rubric: prompt includes cta_text", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ cta_text: "Get Started" }));
  assertStringIncludes(prompt, "Get Started");
});

Deno.test("rubric: prompt includes cta_url", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ cta_url: "https://example.com" }));
  assertStringIncludes(prompt, "https://example.com");
});

Deno.test("rubric: prompt includes demand_type", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ demand_type: "streaming" }));
  assertStringIncludes(prompt, "streaming");
});

Deno.test("rubric: sportsbook prompt includes responsible gambling language rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ demand_type: "sportsbook" }));
  assertStringIncludes(prompt, "risk-free");
  assertStringIncludes(prompt, "responsible gambling");
});

Deno.test("rubric: streaming prompt includes streaming-specific rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ demand_type: "streaming" }));
  assertStringIncludes(prompt, "streaming service");
});

Deno.test("rubric: commerce prompt includes commerce-specific rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ demand_type: "commerce" }));
  assertStringIncludes(prompt, "commerce brand");
});

Deno.test("rubric: prompt includes guaranteed-win rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative());
  assertStringIncludes(prompt, "Guaranteed-win language");
});

Deno.test("rubric: prompt includes betting-advice rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative());
  assertStringIncludes(prompt, "Betting advice");
});

Deno.test("rubric: null cta_text renders as (none)", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ cta_text: null }));
  assertStringIncludes(prompt, "(none)");
});

Deno.test("rubric: unknown demand_type uses fallback rule", () => {
  const prompt = buildPrescreenPrompt(makeCreative({ demand_type: "unknown_type" }));
  assertStringIncludes(prompt, "Flag if the ad content does not match the stated category");
});

Deno.test("rubric: prompt requires JSON output format", () => {
  const prompt = buildPrescreenPrompt(makeCreative());
  assertStringIncludes(prompt, '"verdict"');
  assertStringIncludes(prompt, '"reasons"');
});

// ─── parsePrescreenResponse ──────────────────────────────────────────

Deno.test("parse: pass verdict with empty reasons", () => {
  const result = parsePrescreenResponse('{"verdict":"pass","reasons":[]}');
  assertEquals(result.verdict, "pass");
  assertEquals(result.reasons, []);
});

Deno.test("parse: flag verdict with reasons", () => {
  const result = parsePrescreenResponse(
    '{"verdict":"flag","reasons":["Guaranteed-win language","Misleading claims"]}',
  );
  assertEquals(result.verdict, "flag");
  assertEquals(result.reasons.length, 2);
  assertStringIncludes(result.reasons[0], "Guaranteed");
});

Deno.test("parse: strips surrounding text before JSON", () => {
  const result = parsePrescreenResponse('Here is the result: {"verdict":"pass","reasons":[]}');
  assertEquals(result.verdict, "pass");
});

Deno.test("parse: returns flag on malformed JSON", () => {
  const result = parsePrescreenResponse("not valid json at all");
  assertEquals(result.verdict, "flag");
  assertEquals(result.reasons.length > 0, true);
});

Deno.test("parse: unknown verdict treated as flag", () => {
  const result = parsePrescreenResponse('{"verdict":"maybe","reasons":[]}');
  assertEquals(result.verdict, "flag");
});

Deno.test("parse: non-string reasons are filtered out", () => {
  const result = parsePrescreenResponse('{"verdict":"flag","reasons":[1, "valid reason", null]}');
  assertEquals(result.verdict, "flag");
  assertEquals(result.reasons, ["valid reason"]);
});
