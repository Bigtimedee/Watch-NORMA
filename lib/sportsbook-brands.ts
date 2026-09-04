/**
 * Client-side sportsbook / pick'em brand colors and CTA labels.
 * Server-side twins live in supabase/functions/_shared/sportsbook-links.ts
 * (SPORTSBOOK_BRAND_COLORS / SPORTSBOOK_DISPLAY_NAMES). Keep hex values
 * in sync — prizepicks-integration.test.ts asserts both sides.
 */

import { SPORTSBOOK_NAMES } from "./constants";
import { isPickEmProvider } from "./fantasy-platforms";

export const SPORTSBOOK_BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  draftkings: { bg: "#53D337", text: "#000000" },
  fanduel: { bg: "#1493FF", text: "#FFFFFF" },
  betmgm: { bg: "#BFA15C", text: "#000000" },
  caesars: { bg: "#1B4D3E", text: "#FFFFFF" },
  espnbet: { bg: "#FF4438", text: "#FFFFFF" },
  prizepicks: { bg: "#6C2BD9", text: "#FFFFFF" },
  underdog: { bg: "#E8F54A", text: "#000000" },
};

export function detectSportsbookProvider(
  url: string,
  providerKey?: string | null,
): string | null {
  if (providerKey) return providerKey;
  const lower = url.toLowerCase();
  for (const key of Object.keys(SPORTSBOOK_BRAND_COLORS)) {
    if (lower.includes(key)) return key;
  }
  return null;
}

export function sportsbookDisplayName(key: string | null | undefined): string | null {
  if (!key) return null;
  return SPORTSBOOK_NAMES[key] ?? null;
}

/**
 * Default CTA copy. Pick'em apps are not sportsbooks — never "Bet Now on PrizePicks".
 * SponsorCTAButton always uses style "open". BetNowButton uses "open" for pick'em
 * and "bet_now" for traditional books.
 */
export function defaultCtaLabel(
  key: string | null,
  eligible: boolean,
  opts?: { ctaText?: string; style?: "bet_now" | "open" },
): string {
  if (!eligible) return "Not available in your region";
  if (opts?.ctaText) return opts.ctaText;
  const name = sportsbookDisplayName(key);
  const style =
    opts?.style ?? (key && isPickEmProvider(key) ? "open" : "bet_now");
  if (style === "open") {
    return name ? `Open ${name}` : "Open App";
  }
  return name ? `Bet Now on ${name}` : "Bet Now";
}
