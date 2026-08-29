// _shared/quiet-hours.ts — decides whether the current moment falls inside a
// user's configured quiet hours, honoring the user's timezone.
//
// Motivation: item B in the 2026-08-20 audit + BL-9 in the 2026-08-23 audit.
// Two callers (evaluate-alerts and morning-briefing) both built the "current
// HH:MM" from `new Date().getUTCHours()` and string-compared it to the user's
// local settings. For an Eastern user, quiet_hours 23:00–08:00 actually
// silenced roughly 19:00–04:00 local — exactly the window football airs.

/** Notification settings persisted in user_preferences.notification_settings. */
export interface QuietHoursSettings {
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}

/** True if `value` is a well-formed 24-hour HH:MM string ("00:00".."23:59"). */
export function isValidHHMM(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m !== null;
}

/** Return "HH:MM" in the given IANA timezone for the supplied Date.
 *  Falls back to UTC if the timezone is not recognized by the runtime. */
export function localHHMM(now: Date, timezone: string | null | undefined): string {
  const tz = timezone && typeof timezone === "string" ? timezone : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    // Intl.DateTimeFormat returns "24" for midnight in hour12:false; normalize.
    const hhNorm = hh === "24" ? "00" : hh;
    return `${hhNorm}:${mm}`;
  } catch {
    // Invalid tz string — fall back to UTC.
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  }
}

/** Decide whether push must be suppressed for a user right now.
 *  - Missing or malformed HH:MM → not in quiet hours (never accidentally silence).
 *  - Overnight windows (start > end, e.g. 22:00→08:00) are handled.
 *  - Times are compared in the user's timezone. */
export function isInQuietHours(
  settings: QuietHoursSettings | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = settings?.quiet_hours_start;
  const end = settings?.quiet_hours_end;
  if (!isValidHHMM(start) || !isValidHHMM(end)) return false;
  if (start === end) return false; // ambiguous — treat as no window
  const current = localHHMM(now, timezone);
  if (start < end) {
    // Same-day window (e.g., 13:00 → 17:00)
    return current >= start && current < end;
  }
  // Overnight window (e.g., 23:00 → 08:00)
  return current >= start || current < end;
}
