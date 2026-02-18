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

/** Map SportsDataIO game status string to NORMA's normalized status */
export function mapStatus(sdioStatus: string, isClosed: boolean): string {
  if (isClosed) return "closed";
  const s = sdioStatus?.toLowerCase() ?? "";
  if (s === "scheduled" || s === "created") return "scheduled";
  if (s === "inprogress" || s === "in progress") return "inprogress";
  if (s === "halftime" || s === "half") return "halftime";
  if (s === "final" || s === "f" || s === "f/ot") return "closed";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "postponed") return "postponed";
  return s || "scheduled";
}
