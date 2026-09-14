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
  // Betr .primary-btn on betr.app (Webflow CSS betrsite.shared.39f2d5aa2.css,
  // retrieved 2026-09-14): background-color #a444e4. Brand magenta — not
  // PrizePicks #6C2BD9. Lime #d9f53d exists as a highlight, not the CTA fill.
  betr: { bg: "#A444E4", text: "#FFFFFF" },
};

export function detectSportsbookProvider(
  url: string,
  providerKey?: string | null,
): string | null {
  if (providerKey) return providerKey;
  const lower = url.toLowerCase();
  // Host-specific: `includes("betr")` would steal BetRivers (betrivers.com).
  if (lower.includes("betr.app") || lower.includes("betr.onelink.me")) {
    return "betr";
  }
  for (const key of Object.keys(SPORTSBOOK_BRAND_COLORS)) {
    if (key === "betr") continue;
    if (lower.includes(key)) return key;
  }
  return null;
}

export function sportsbookDisplayName(key: string | null | undefined): string | null {
  if (!key) return null;
  return SPORTSBOOK_NAMES[key] ?? null;
}

/**
 * Default CTA copy. Pick'em apps are not sportsbooks — never "Bet Now on PrizePicks"
 * or "Bet Now on Betr". Product convention is "Open {Name}" for all pick'em
 * (PrizePicks / Underdog / Betr). Advertiser ctaText is kept when it does not
 * say "Bet Now"; "Bet Now on Betr" is dropped so it is not shown to users.
 * Campaign review should still reject that copy (creative-prescreen).
 */
export function defaultCtaLabel(
  key: string | null,
  eligible: boolean,
  opts?: { ctaText?: string; style?: "bet_now" | "open" },
): string {
  if (!eligible) return "Not available in your region";
  const pickEm = !!(key && isPickEmProvider(key));
  const advertiserText = opts?.ctaText?.trim();
  const advertiserSaysBetNow = !!advertiserText && /bet\s*now/i.test(advertiserText);
  if (advertiserText && !(pickEm && advertiserSaysBetNow)) {
    return advertiserText;
  }
  const name = sportsbookDisplayName(key);
  const style =
    opts?.style ?? (pickEm ? "open" : "bet_now");
  if (pickEm || style === "open") {
    return name ? `Open ${name}` : "Open App";
  }
  return name ? `Bet Now on ${name}` : "Bet Now";
}
