// Unit tests for verify-provider-links classifyUrl logic.
// Pure functions — no network, no DB.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyUrl, SUSPECT_PATH_FRAGMENTS, OK_PATH_FRAGMENTS } from "./logic.ts";

// ---------------------------------------------------------------------------
// ok — watch/player/login destinations
// ---------------------------------------------------------------------------

Deno.test("classifyUrl: /watch path → ok", () => {
  const r = classifyUrl("https://espnplus.com/watch/game123", 200);
  assertEquals(r.status, "ok");
});

Deno.test("classifyUrl: /live path → ok", () => {
  const r = classifyUrl("https://peacocktv.com/live/sports", 200);
  assertEquals(r.status, "ok");
});

Deno.test("classifyUrl: /login path → ok", () => {
  const r = classifyUrl("https://example.com/login", 200);
  assertEquals(r.status, "ok");
});

Deno.test("classifyUrl: /signin path → ok", () => {
  const r = classifyUrl("https://example.com/signin?next=/watch", 200);
  assertEquals(r.status, "ok");
});

Deno.test("classifyUrl: root path with HTTP 200 → ok", () => {
  const r = classifyUrl("https://disneyplus.com/", 200);
  assertEquals(r.status, "ok");
});

Deno.test("classifyUrl: /browse path → ok", () => {
  const r = classifyUrl("https://netflix.com/browse", 200);
  assertEquals(r.status, "ok");
});

// ---------------------------------------------------------------------------
// suspect — marketing/sign-up destinations
// ---------------------------------------------------------------------------

Deno.test("classifyUrl: /welcome path → suspect", () => {
  const r = classifyUrl("https://tv.youtube.com/welcome", 200);
  assertEquals(r.status, "suspect");
});

Deno.test("classifyUrl: /signup path → suspect", () => {
  const r = classifyUrl("https://peacocktv.com/signup", 200);
  assertEquals(r.status, "suspect");
});

Deno.test("classifyUrl: /get-started path → suspect", () => {
  const r = classifyUrl("https://example.com/get-started", 200);
  assertEquals(r.status, "suspect");
});

Deno.test("classifyUrl: /subscribe path → suspect", () => {
  const r = classifyUrl("https://example.com/subscribe/monthly", 200);
  assertEquals(r.status, "suspect");
});

Deno.test("classifyUrl: /free-trial path → suspect", () => {
  const r = classifyUrl("https://example.com/free-trial", 200);
  assertEquals(r.status, "suspect");
});

Deno.test("classifyUrl: /plans path → suspect", () => {
  const r = classifyUrl("https://example.com/plans", 200);
  assertEquals(r.status, "suspect");
});

// ---------------------------------------------------------------------------
// broken — errors, timeouts, 4xx/5xx
// ---------------------------------------------------------------------------

Deno.test("classifyUrl: 404 → broken", () => {
  const r = classifyUrl("https://example.com/watch", 404);
  assertEquals(r.status, "broken");
});

Deno.test("classifyUrl: 500 → broken", () => {
  const r = classifyUrl("https://example.com/", 500);
  assertEquals(r.status, "broken");
});

Deno.test("classifyUrl: fetch error (timeout) → broken", () => {
  const r = classifyUrl("https://example.com/", null, "The operation was aborted.");
  assertEquals(r.status, "broken");
});

Deno.test("classifyUrl: null httpStatus → broken", () => {
  const r = classifyUrl("https://example.com/", null);
  assertEquals(r.status, "broken");
});

// ---------------------------------------------------------------------------
// Edge cases: YouTube TV regression
// ---------------------------------------------------------------------------

Deno.test("classifyUrl: YouTube TV /welcome regression — must be suspect not ok", () => {
  // This is the exact failure mode from migrations 052-054:
  // universal_link = 'https://tv.youtube.com' redirected to /welcome (signup page).
  const r = classifyUrl("https://tv.youtube.com/welcome", 200);
  assertEquals(r.status, "suspect", "YouTube TV /welcome must be classified as suspect");
});

Deno.test("classifyUrl: YouTube TV /sports path → ok (after fix)", () => {
  const r = classifyUrl("https://tv.youtube.com/sports", 200);
  assertEquals(r.status, "ok");
});

// ---------------------------------------------------------------------------
// Structural: fragment lists are non-empty and contain no duplicates
// ---------------------------------------------------------------------------

Deno.test("SUSPECT_PATH_FRAGMENTS: non-empty and no duplicates", () => {
  assertEquals(SUSPECT_PATH_FRAGMENTS.length > 0, true);
  const unique = new Set(SUSPECT_PATH_FRAGMENTS);
  assertEquals(unique.size, SUSPECT_PATH_FRAGMENTS.length, "SUSPECT_PATH_FRAGMENTS must not contain duplicates");
});

Deno.test("OK_PATH_FRAGMENTS: non-empty and no duplicates", () => {
  assertEquals(OK_PATH_FRAGMENTS.length > 0, true);
  const unique = new Set(OK_PATH_FRAGMENTS);
  assertEquals(unique.size, OK_PATH_FRAGMENTS.length, "OK_PATH_FRAGMENTS must not contain duplicates");
});

Deno.test("classifyUrl: ok fragments take precedence over suspect if both match", () => {
  // e.g., /watch/signup — should be ok because /watch matches ok fragment first
  const r = classifyUrl("https://example.com/watch/signup", 200);
  assertEquals(r.status, "ok", "ok fragments should take precedence over suspect");
});
