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
};

export function inferStateFromTimezone(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  return STATE_BY_TIMEZONE[timezone] ?? null;
}
