import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEmailWagerAlertPayload } from "./logic.ts";

// FX4 (2026-08-23 audit H-9 / 2026-08-20 audit item E). The prior implementation
// wrote `message` and `status` columns; the alerts table schema has `body`
// (NOT NULL) and `read` — so every insert failed and the error was swallowed.
// These tests pin the payload shape against the schema.

Deno.test("email-wager alert payload uses body/read columns, not message/status", () => {
  const p = buildEmailWagerAlertPayload("user-1", 2, "draftkings");

  // Must include the columns that exist on `alerts`.
  assertEquals(Object.prototype.hasOwnProperty.call(p, "body"), true);
  assertEquals(Object.prototype.hasOwnProperty.call(p, "read"), true);
  // Must NOT include the columns that don't.
  assertEquals(Object.prototype.hasOwnProperty.call(p, "message"), false);
  assertEquals(Object.prototype.hasOwnProperty.call(p, "status"), false);
});

Deno.test("email-wager alert payload: user_id, alert_type, read defaults", () => {
  const p = buildEmailWagerAlertPayload("user-1", 1, "fanduel");
  assertObjectMatch(p, {
    user_id: "user-1",
    alert_type: "email_wager_import",
    read: false,
  });
});

Deno.test("email-wager alert payload: singular vs plural copy", () => {
  const one = buildEmailWagerAlertPayload("user-1", 1, "draftkings") as { title: string };
  const many = buildEmailWagerAlertPayload("user-1", 3, "draftkings") as { title: string };
  assertEquals(one.title, "1 bet imported from Draftkings");
  assertEquals(many.title, "3 bets imported from Draftkings");
});

Deno.test("email-wager alert payload: explanation.bullets present for AlertCard renderer", () => {
  const p = buildEmailWagerAlertPayload("user-1", 1, "betmgm") as {
    explanation: { headline: string; bullets: string[] };
  };
  assertEquals(Array.isArray(p.explanation.bullets), true);
  assertEquals(p.explanation.bullets.length > 0, true);
  assertEquals(typeof p.explanation.headline, "string");
});
