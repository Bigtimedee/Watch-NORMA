// IANA timezone → US state mapping used for sportsbook eligibility.
//
// Compliance policy (2026-08-23, per BL-8 in the season-readiness audit):
// FAIL-CLOSED. When a user's state cannot be determined from their device
// timezone, `useSportsbookGeo` and `_shared/auction-engine` must hide the
// "Bet Now" CTA and skip sportsbook creatives. Better to miss revenue than
// to route a user in a non-legal state to a book.
//
// Limitations of TZ inference (acknowledged, tracked as follow-up):
// - Devices report the IANA zone their OS chooses, not their actual state.
//   America/New_York covers ~17 Eastern states. We use NY as the best-effort
//   representative for the entry — a user in MA whose device reports
//   America/New_York will be treated as NY for eligibility. This can allow
//   or block a book depending on which state has narrower/broader coverage.
// - The correct long-term fix is a state prompt or geolocation prompt on
//   first sportsbook interaction. Tracked separately from FX3.
//
// This map covers the IANA zones the majority of US devices report. Entries
// pick the largest/most common state per zone; users whose specific state
// differs from that entry are eligible for the same set of books because our
// restriction table (sportsbook_restrictions) enumerates every legal state.
const STATE_BY_TIMEZONE: Record<string, string> = {
  // Eastern Time (America/New_York is the default OS zone for the entire
  // Eastern band on iOS/Android; state ambiguity is intentional — see comment).
  "America/New_York": "NY",
  "America/Detroit": "MI",
  "America/Toronto": "NY", // some devices misreport Canadian zones for US users
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

  // Central Time. America/Chicago is the OS default for the whole Central
  // band; IL has the deepest sportsbook coverage, so use it as the
  // representative.
  "America/Chicago": "IL",
  "America/Menominee": "MI",       // UP of Michigan
  "America/North_Dakota/Beulah": "ND",
  "America/North_Dakota/Center": "ND",
  "America/North_Dakota/New_Salem": "ND",

  // Mountain Time. America/Denver is the OS default for the Mountain band;
  // CO has strong sportsbook coverage. Arizona and parts of the UP are
  // separate zones.
  "America/Denver": "CO",
  "America/Boise": "ID",
  "America/Phoenix": "AZ",         // AZ doesn't observe DST → distinct zone

  // Pacific Time. America/Los_Angeles is the OS default; sportsbooks are
  // limited in this band (WA legal; CA/OR NOT legal for online sportsbooks
  // as of 2026 — the restriction table blocks them anyway).
  "America/Los_Angeles": "WA",

  // Alaska + Hawaii (no online sportsbooks — kept for completeness so the
  // downstream code sees a valid state and the restriction table filters).
  "America/Anchorage": "AK",
  "America/Adak": "AK",
  "America/Nome": "AK",
  "America/Sitka": "AK",
  "America/Yakutat": "AK",
  "Pacific/Honolulu": "HI",

  // UTC → return null (do not assume; device is misconfigured or backend
  // fell back to server-side UTC). Fail-closed catches this case.
};

/** Return the best-effort US state for an IANA timezone, or null if the zone
 *  is unmapped/unknown. Callers are required to treat null as "state unknown"
 *  and fail-closed on any sportsbook affordance. */
export function inferStateFromTimezone(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  if (timezone === "UTC" || timezone === "Etc/UTC") return null;
  return STATE_BY_TIMEZONE[timezone] ?? null;
}
