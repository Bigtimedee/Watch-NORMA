// =============================================================================
// social-copy-guard.ts — platform-split creative guard for NORMA social copy.
//
// Growth plan (Dave, 2026-11-07, "Implement NORMA's growth plan starting now"):
//   * TikTok, Instagram and Facebook copy is sports-utility only. It must never
//     mention betting, odds, spreads, parlays, wagers or sportsbooks (TikTok
//     bans gambling promotion; Meta restricts it without written approval).
//   * X copy may speak to bettors, but never gives picks or tips and never uses
//     "guaranteed" / "lock" / "risk-free" language (hard rule 8: no betting
//     advice, no guaranteed outcomes).
//
// This is a BLOCKING guard, not a rewriter: a caption that fails is never
// posted. Rewriting betting copy into utility copy produces awkward text, so
// callers supply a separate utility caption (content_calendar.platform_captions)
// and this guard decides whether it may ship.
// =============================================================================

/** Platforms whose copy must be sports-utility only (no betting terms at all). */
export const UTILITY_ONLY_PLATFORMS = new Set([
  "instagram",
  "ig",
  "facebook",
  "fb",
  "tiktok",
]);

/** Platforms that may address bettors (advice language is still blocked). */
export const BETTOR_OK_PLATFORMS = new Set(["twitter", "x"]);

interface TermRule {
  term: string;
  re: RegExp;
}

const rule = (term: string, re: RegExp): TermRule => ({ term, re });

/**
 * Betting / gambling vocabulary and sportsbook / DFS / prediction-market brands.
 * Blocked on TikTok, Instagram and Facebook. Matching is case-insensitive and
 * word-bounded so "better", "alphabet" and "tip-off" do not trip it.
 */
export const BETTING_TERM_RULES: readonly TermRule[] = [
  rule("bet", /\bbet(?:s|ting|tor|tors)?\b/i),
  rule("wager", /\bwager(?:s|ed|ing)?\b/i),
  rule("odds", /\bodds\b/i),
  rule("spread", /\bspreads?\b/i),
  rule("parlay", /\bparlays?\b/i),
  rule("sportsbook", /\bsports\s?books?\b/i),
  rule("moneyline", /\bmoney\s?lines?\b/i),
  rule("over/under", /\bover\s*\/\s*under\b|\bo\/u\b/i),
  rule("ATS", /\bATS\b/),
  rule("prop", /\bprops?\b/i),
  rule("gamble", /\bgambl(?:e|es|ed|ing|er|ers)\b/i),
  rule("cover", /\bcover(?:s|ed|ing)?\s+(?:the\s+)?(?:spread|number|line)\b/i),
  rule("backdoor cover", /\bbackdoor\b/i),
  rule("juice", /\bjuice\b|\bvig\b/i),
  rule("payout", /\bpay\s?outs?\b/i),
  rule("cash out", /\bcash(?:ed|ing)?\s?out\b/i),
  rule("daily fantasy", /\bDFS\b|\bdaily\s+fantasy\b|\bpick[\u2019']?em\b/i),
  rule("prediction market", /\bprediction\s+markets?\b/i),
  // Brands (sportsbook / DFS / prediction market). Logos are not text, but the
  // media pipeline is real app screenshots only; these catch the names.
  rule("DraftKings", /\bdraft\s?kings\b/i),
  rule("FanDuel", /\bfan\s?duel\b/i),
  rule("BetMGM", /\bbetmgm\b/i),
  rule("Caesars", /\bcaesars\b/i),
  rule("bet365", /\bbet\s?365\b/i),
  rule("BetRivers", /\bbetrivers\b/i),
  rule("Fanatics Sportsbook", /\bfanatics\s+(?:sportsbook|bet)\b/i),
  rule("Hard Rock Bet", /\bhard\s?rock\s+bet\b/i),
  rule("ESPN BET", /\bespn\s?bet\b/i),
  rule("PrizePicks", /\bprize\s?picks\b/i),
  rule("Underdog Fantasy", /\bunderdog\s+fantasy\b/i),
  rule("Betr", /\bbetr\b/i),
  rule("Kalshi", /\bkalshi\b/i),
  rule("Polymarket", /\bpolymarket\b/i),
];

/**
 * Advice / guarantee language. Blocked on EVERY platform, X included.
 * "lock" is matched only as a word and never as "lock screen" / "lockscreen",
 * because NORMA alerts genuinely land on the lock screen.
 */
export const ADVICE_TERM_RULES: readonly TermRule[] = [
  rule("guaranteed", /\bguarantee(?:d|s)?\b/i),
  rule("lock", /\blocks?\b(?!\s*-?\s*screens?\b)/i),
  rule("risk-free", /\brisk[\s-]?free\b/i),
  rule("sure thing", /\bsure\s+thing\b/i),
  rule("can't lose", /\bcan[\u2019']?t\s+lose\b|\bcannot\s+lose\b/i),
  rule("free money", /\bfree\s+money\b/i),
  rule("best bet", /\bbest\s+bets?\b/i),
  rule("pick", /\b(?:free|our|my|top|expert|today[\u2019']?s|tonight[\u2019']?s)\s+picks?\b|\bpicks?\s+of\s+the\s+(?:day|week|night)\b/i),
  rule("tip", /\b(?:betting|free|hot|insider|expert)\s+tips?\b/i),
  rule("take the over/under", /\b(?:take|hammer|smash|bet)\s+the\s+(?:over|under)\b/i),
  rule("hammer it", /\bhammer\s+(?:it|this|that)\b/i),
  rule("max bet", /\bmax\s+bet\b/i),
];

function matchTerms(text: string, rules: readonly TermRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    if (r.re.test(text) && !out.includes(r.term)) out.push(r.term);
  }
  return out;
}

/** Betting vocabulary / brands found in `text` (empty = clean). */
export function findBettingTerms(text: string | null | undefined): string[] {
  return text ? matchTerms(text, BETTING_TERM_RULES) : [];
}

/** Picks / tips / guarantee language found in `text` (empty = clean). */
export function findAdviceTerms(text: string | null | undefined): string[] {
  return text ? matchTerms(text, ADVICE_TERM_RULES) : [];
}

export type CopyGuardResult =
  | { ok: true }
  | { ok: false; reason: "betting_terms" | "advice_language" | "unknown_platform"; terms: string[] };

/**
 * Decide whether `text` may be posted on `platform`.
 *   twitter/x                 -> advice language blocked; betting vocabulary allowed.
 *   instagram/facebook/tiktok -> betting vocabulary AND advice language blocked.
 *   anything else             -> blocked (fail closed; add the platform deliberately).
 */
export function guardCopyForPlatform(
  platform: string | null | undefined,
  text: string | null | undefined,
): CopyGuardResult {
  const p = (platform ?? "").trim().toLowerCase();
  const advice = findAdviceTerms(text);
  if (BETTOR_OK_PLATFORMS.has(p)) {
    return advice.length ? { ok: false, reason: "advice_language", terms: advice } : { ok: true };
  }
  if (UTILITY_ONLY_PLATFORMS.has(p)) {
    const betting = findBettingTerms(text);
    if (betting.length) return { ok: false, reason: "betting_terms", terms: betting };
    return advice.length ? { ok: false, reason: "advice_language", terms: advice } : { ok: true };
  }
  return { ok: false, reason: "unknown_platform", terms: [] };
}

/** Short human/DB flag, e.g. 'betting_terms_blocked: odds, parlay'. */
export function copyGuardFlag(r: Exclude<CopyGuardResult, { ok: true }>): string {
  const prefix = r.reason === "betting_terms"
    ? "betting_terms_blocked"
    : r.reason === "advice_language"
    ? "advice_language_blocked"
    : "unknown_platform_blocked";
  return r.terms.length ? `${prefix}: ${r.terms.join(", ")}` : prefix;
}
