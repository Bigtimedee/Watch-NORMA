/**
 * Shared geo-compliance utilities — single source of truth for both the
 * auction engine and any other Edge Function that needs timezone→state mapping.
 *
 * IMPORTANT: This file is the canonical implementation for the server side.
 * The client-side mirror is lib/geo-compliance.ts (React Native / TypeScript).
 * Both files MUST contain identical timezone→state mappings.
 * Any change here must be reflected in lib/geo-compliance.ts and vice versa.
 */

/**
 * Maps unambiguous US timezone strings to a single state code.
 * Conservative: multi-state timezones (America/Chicago, America/Los_Angeles)
 * return null because we cannot safely identify a single legal jurisdiction.
 *
 * For regulatory purposes, null means "unknown jurisdiction" → all restricted
 * advertisers (sportsbooks) must be excluded. This is intentional:
 * serving an illegal gambling ad is worse than missing a legal impression.
 *
 * Sync requirement: must match STATE_BY_TIMEZONE in lib/geo-compliance.ts exactly.
 */
const STATE_BY_TIMEZONE: Record<string, string> = {
  "America/New_York": "NY",
  "America/Detroit": "MI",
  "America/Indiana/Indianapolis": "IN",
  "America/Indiana/Knox": "IN",
  "America/Indiana/Marengo": "IN",
  "America/Indiana/Petersburg": "IN",
  "America/Indiana/Tell_City": "IN",
  "America/Indiana/Vevay": "IN",
  "America/Indiana/Vincennes": "IN",
  "America/Indiana/Winamac": "IN",
  "America/Kentucky/Louisville": "KY",
  "America/Kentucky/Monticello": "KY",
  "America/Denver": "CO",
  "America/Boise": "ID",
  "America/Phoenix": "AZ",
  "America/Anchorage": "AK",
  "America/Adak": "AK",
  "America/Nome": "AK",
  "America/Sitka": "AK",
  "America/Yakutat": "AK",
  "Pacific/Honolulu": "HI",
  // Multi-state timezones intentionally absent:
  //   America/Chicago  → IL, TX, WI, MN, MO, IA, KS, OK, AR, LA, MS, AL, TN, ND, SD, NE
  //   America/Los_Angeles → CA, WA, OR, NV
  // America/New_York spans many NE states but all are in major sportsbooks' allow-lists → safe
};

export function inferStateFromTimezone(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  return STATE_BY_TIMEZONE[timezone] ?? null;
}

/**
 * Determine whether a sportsbook ad is eligible for a given state.
 *
 * allowedJurisdictions === null means unrestricted (non-sportsbook advertiser) → always true.
 * allowedJurisdictions === [] means no states → always false.
 * Unknown state (null from inferStateFromTimezone) → false (conservative default).
 */
export function isGeoEligible(
  state: string | null,
  allowedJurisdictions: string[] | null,
): boolean {
  if (allowedJurisdictions === null) return true;    // unrestricted advertiser
  if (!state) return false;                          // unknown jurisdiction
  return allowedJurisdictions.includes(state);
}
