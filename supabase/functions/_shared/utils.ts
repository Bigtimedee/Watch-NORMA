// Shared utility functions — deduplicated from poll-boxscore, poll-pbp, poll-summary, poll-schedule

/** Deterministic hash of a JSON-serializable object, used for snapshot deduplication */
export function hashPayload(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

/** Map game status string (SportsDataIO or ESPN) to NORMA's normalized status.
 *  Handles both exact values ("InProgress") and ESPN machine codes ("STATUS_IN_PROGRESS").
 *  IMPORTANT: This function MUST always return one of the canonical values:
 *  "scheduled" | "inprogress" | "halftime" | "closed" | "cancelled" | "postponed"
 *  Any unrecognized value defaults to "scheduled" to prevent orphaned games.
 */
export function mapStatus(rawStatus: string, isClosed: boolean): string {
  if (isClosed) return "closed";
  const s = rawStatus?.toLowerCase()?.trim() ?? "";

  // Strip ESPN machine-code prefix "status_" if present (e.g., "status_in_progress" → "in_progress")
  const stripped = s.startsWith("status_") ? s.slice(7) : s;

  // Scheduled
  if (stripped === "scheduled" || stripped === "created" || stripped === "pre_game" || stripped === "pre") return "scheduled";
  // In Progress
  if (stripped === "inprogress" || stripped === "in_progress" || stripped === "in progress") return "inprogress";
  // Halftime
  if (stripped === "halftime" || stripped === "half") return "halftime";
  // End of period / quarter / half / regulation — the game is transitioning, not over.
  // ESPN emits strings like "End of 1st Quarter", "End of Regulation", "End of Period".
  // Football hits this every quarter break; treating it as closed prematurely finals
  // the game (see 2026-08-23 season-readiness audit BL-1 for the failure that motivated
  // the startsWith guard).
  if (stripped === "end_of_period" || stripped.startsWith("end of ")) return "inprogress";
  // Final / Closed
  if (stripped === "final" || stripped === "f" || stripped === "f/ot" || stripped === "complete") return "closed";
  // Cancelled
  if (stripped === "canceled" || stripped === "cancelled") return "cancelled";
  // Postponed
  if (stripped === "postponed") return "postponed";
  // Delayed (treat as still scheduled)
  if (stripped === "delayed" || stripped === "rain_delay" || stripped === "rain delay") return "scheduled";

  // Fallback: use .includes() for any remaining ESPN status descriptions
  if (s.includes("progress") || s.includes("live")) return "inprogress";
  if (s.includes("final") || s.includes("complete")) return "closed";
  if (s.includes("halftime") || s.includes("half")) return "halftime";
  if (s.includes("scheduled") || s.includes("pre")) return "scheduled";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("postpone")) return "postponed";

  // SAFETY NET: log unexpected status for debugging but never store raw values
  if (s && s !== "scheduled") {
    console.warn(`[mapStatus] Unrecognized status "${rawStatus}" — defaulting to "scheduled"`);
  }
  return "scheduled";
}
