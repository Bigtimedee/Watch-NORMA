import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  copyGuardFlag,
  findAdviceTerms,
  findBettingTerms,
  guardCopyForPlatform,
} from "./social-copy-guard.ts";

const UTILITY = ["instagram", "facebook", "tiktok", "ig", "fb"];

Deno.test("betting vocabulary is blocked on TikTok, Instagram and Facebook", () => {
  const samples = [
    "Parlay died on the last leg",
    "Odds just moved on this one",
    "Cover the spread with 2 minutes left",
    "Track every wager in one place",
    "Your sportsbook bets, live",
    "Moneyline flipped in OT",
    "Get alerts for your bets",
  ];
  for (const p of UTILITY) {
    for (const s of samples) {
      const r = guardCopyForPlatform(p, s);
      assertEquals(r.ok, false, `${p}: ${s}`);
      if (!r.ok) assertEquals(r.reason, "betting_terms");
    }
  }
});

Deno.test("sportsbook, DFS and prediction-market brands are blocked on utility platforms", () => {
  for (const s of ["Works with DraftKings", "FanDuel users", "BetMGM", "ESPN BET", "bet365", "PrizePicks", "Kalshi markets", "Polymarket"]) {
    for (const p of ["tiktok", "instagram", "facebook"]) {
      assertEquals(guardCopyForPlatform(p, s).ok, false, `${p}: ${s}`);
    }
  }
});

Deno.test("sports-utility copy passes everywhere (no false positives on better / tip-off / lock screen)", () => {
  const clean = [
    "OVERTIME: Buffalo Bills 27, Kansas City Chiefs 27.\nWatch: CBS | Stream: Paramount+\nWhere to watch + live alerts: https://getnorma.app/games/nfl/2026-11-08/a-at-b?utm_source=instagram&utm_campaign=live_moment",
    "Tip-off is at 7:30p ET. Alerts land on your lock screen when it gets better.",
    "NFL today: what channel + start time",
    "Alphabet soup",
  ];
  for (const s of clean) {
    for (const p of [...UTILITY, "twitter", "x"]) {
      const r = guardCopyForPlatform(p, s);
      assert(r.ok, `${p} should pass: ${s} -> ${JSON.stringify(r)}`);
    }
  }
});

Deno.test("X may address bettors (betting vocabulary allowed)", () => {
  for (const s of ["Parlay alive into OT", "Your spread is live with 1:12 left", "Sweat every leg with NORMA"]) {
    assert(guardCopyForPlatform("twitter", s).ok, s);
    assert(guardCopyForPlatform("x", s).ok, s);
  }
});

Deno.test("X never gives picks, tips or guarantee / lock / risk-free language", () => {
  const advice: Array<[string, string]> = [
    ["Lock of the day: Bills -3", "lock"],
    ["This one is a LOCK", "lock"],
    ["Guaranteed winner tonight", "guaranteed"],
    ["Risk-free bet inside", "risk-free"],
    ["risk free first wager", "risk-free"],
    ["Our picks for Sunday", "pick"],
    ["Free picks in bio", "pick"],
    ["Pick of the night", "pick"],
    ["Betting tips for MNF", "tip"],
    ["Best bet on the slate", "best bet"],
    ["Take the over", "take the over/under"],
    ["Sure thing", "sure thing"],
    ["You can't lose", "can't lose"],
  ];
  for (const [s, term] of advice) {
    const r = guardCopyForPlatform("twitter", s);
    assertEquals(r.ok, false, s);
    if (!r.ok) {
      assertEquals(r.reason, "advice_language", s);
      assert(r.terms.includes(term), `${s} -> ${r.terms}`);
    }
    // Advice is blocked on utility platforms too.
    assertEquals(guardCopyForPlatform("tiktok", s).ok, false, `tiktok ${s}`);
  }
});

Deno.test("'lock screen' / 'lockscreen' is not 'lock'", () => {
  assertEquals(findAdviceTerms("Alerts on your lock screen"), []);
  assertEquals(findAdviceTerms("Alerts on your lock-screen"), []);
  assertEquals(findAdviceTerms("lockscreen alerts"), []);
  assertEquals(findAdviceTerms("Bills lock it up"), ["lock"]);
});

Deno.test("unknown platforms fail closed", () => {
  const r = guardCopyForPlatform("snapchat", "Tune in now");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "unknown_platform");
  assertEquals(guardCopyForPlatform(null, "x").ok, false);
});

Deno.test("copyGuardFlag is short and names the terms", () => {
  const r = guardCopyForPlatform("instagram", "Odds and parlays");
  assert(!r.ok);
  if (!r.ok) assertEquals(copyGuardFlag(r), "betting_terms_blocked: odds, parlay");
  assertEquals(findBettingTerms(""), []);
  assertEquals(findBettingTerms(null), []);
});
