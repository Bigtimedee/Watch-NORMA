import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  interpolateTemplate,
  buildPersonalizationContext,
} from "./template-vars.ts";

// ─── interpolateTemplate ───

Deno.test("interpolateTemplate: replaces known variables", () => {
  const result = interpolateTemplate(
    "Hey {user_first_name}, you won {payout_amount} on {platform}!",
    { user_first_name: "Dave", payout_amount: "$47.20", platform: "Kalshi" }
  );
  assertEquals(result, "Hey Dave, you won $47.20 on Kalshi!");
});

Deno.test("interpolateTemplate: leaves unknown variables intact", () => {
  const result = interpolateTemplate(
    "Check out {unknown_var} and {user_first_name}",
    { user_first_name: "Alex" }
  );
  assertEquals(result, "Check out {unknown_var} and Alex");
});

Deno.test("interpolateTemplate: leaves known variable intact when value missing", () => {
  const result = interpolateTemplate(
    "Hey {user_first_name}, your team {team_name} won!",
    { user_first_name: "Dave" } // team_name not provided
  );
  assertEquals(result, "Hey Dave, your team {team_name} won!");
});

Deno.test("interpolateTemplate: returns empty string for null template", () => {
  assertEquals(interpolateTemplate(null, { user_first_name: "Dave" }), "");
  assertEquals(interpolateTemplate(undefined, { user_first_name: "Dave" }), "");
  assertEquals(interpolateTemplate("", { user_first_name: "Dave" }), "");
});

Deno.test("interpolateTemplate: returns template unchanged when ctx is null", () => {
  const tmpl = "Hey {user_first_name}!";
  assertEquals(interpolateTemplate(tmpl, null), tmpl);
  assertEquals(interpolateTemplate(tmpl, undefined), tmpl);
});

Deno.test("interpolateTemplate: no variables — returns template as-is", () => {
  const tmpl = "No placeholders here.";
  assertEquals(interpolateTemplate(tmpl, { user_first_name: "Dave" }), tmpl);
});

// ─── buildPersonalizationContext ───

const baseGame = {
  home_score: 72,
  away_score: 68,
  home_team: { name: "Duke Blue Devils", abbreviation: "duke" },
  away_team: { name: "North Carolina Tar Heels", abbreviation: "unc" },
};

Deno.test("buildPersonalizationContext: extracts first name from full name", () => {
  const ctx = buildPersonalizationContext("Dave Smith", [], baseGame);
  assertEquals(ctx.user_first_name, "Dave");
});

Deno.test("buildPersonalizationContext: skips first name for email address", () => {
  const ctx = buildPersonalizationContext("dave@example.com", [], baseGame);
  assertEquals(ctx.user_first_name, undefined);
});

Deno.test("buildPersonalizationContext: skips first name when null", () => {
  const ctx = buildPersonalizationContext(null, [], baseGame);
  assertEquals(ctx.user_first_name, undefined);
});

Deno.test("buildPersonalizationContext: picks winning team (home wins)", () => {
  const ctx = buildPersonalizationContext(null, [], baseGame);
  assertEquals(ctx.team_name, "Duke Blue Devils");
  assertEquals(ctx.team_abbr, "DUKE");
});

Deno.test("buildPersonalizationContext: picks winning team (away wins)", () => {
  const game = { ...baseGame, home_score: 60, away_score: 75 };
  const ctx = buildPersonalizationContext(null, [], game);
  assertEquals(ctx.team_name, "North Carolina Tar Heels");
  assertEquals(ctx.team_abbr, "UNC");
});

Deno.test("buildPersonalizationContext: no team when tied", () => {
  const game = { ...baseGame, home_score: 68, away_score: 68 };
  const ctx = buildPersonalizationContext(null, [], game);
  assertEquals(ctx.team_name, undefined);
  assertEquals(ctx.team_abbr, undefined);
});

Deno.test("buildPersonalizationContext: extracts payout_amount from settled position", () => {
  const positions = [
    { platform: "kalshi", market_title: "Duke to win", position_side: "yes", payout_amount: 47.2 },
  ];
  const ctx = buildPersonalizationContext("Dave", positions, baseGame);
  assertEquals(ctx.payout_amount, "$47.20");
  assertEquals(ctx.platform, "Kalshi");
  assertEquals(ctx.market_title, "Duke to win");
});

Deno.test("buildPersonalizationContext: formats whole-dollar payout without cents", () => {
  const positions = [
    { platform: "kalshi", market_title: "Duke wins", position_side: "yes", payout_amount: 50 },
  ];
  const ctx = buildPersonalizationContext(null, positions, baseGame);
  assertEquals(ctx.payout_amount, "$50");
});

Deno.test("buildPersonalizationContext: skips payout when payout_amount is null", () => {
  const positions = [
    { platform: "kalshi", market_title: "Duke wins", position_side: "yes", payout_amount: null },
  ];
  const ctx = buildPersonalizationContext(null, positions, baseGame);
  assertEquals(ctx.payout_amount, undefined);
});

Deno.test("buildPersonalizationContext: prefers position with payout over zero-payout position", () => {
  const positions = [
    { platform: "polymarket", market_title: "UNC covers", position_side: "no", payout_amount: null },
    { platform: "kalshi", market_title: "Duke wins", position_side: "yes", payout_amount: 25 },
  ];
  const ctx = buildPersonalizationContext(null, positions, baseGame);
  assertEquals(ctx.platform, "Kalshi");
  assertEquals(ctx.payout_amount, "$25");
});

Deno.test("buildPersonalizationContext: full scenario — sponsored copy interpolation", () => {
  const positions = [
    { platform: "kalshi", market_title: "Duke wins", position_side: "yes", payout_amount: 47.2 },
  ];
  const ctx = buildPersonalizationContext("Dave Smith", positions, baseGame);
  const tmpl =
    "You nailed that {team_name} prediction, {user_first_name}. " +
    "Snag a {team_abbr} hoodie on Fanatics.com with promo code 'NORMA20' for 20% off. " +
    "You won {payout_amount} on {platform}!";
  const result = interpolateTemplate(tmpl, ctx);
  assertEquals(
    result,
    "You nailed that Duke Blue Devils prediction, Dave. " +
    "Snag a DUKE hoodie on Fanatics.com with promo code 'NORMA20' for 20% off. " +
    "You won $47.20 on Kalshi!"
  );
});
