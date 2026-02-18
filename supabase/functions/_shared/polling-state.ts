// Cost-aware polling state management
// Tracks per-game polling timestamps to avoid redundant API calls

// In-memory polling timestamps (reset each function invocation)
// For persistent tracking we rely on game_snapshots.created_at
const lastPollTimes: Record<string, Record<string, number>> = {};

function getKey(gameId: string, pollType: string): number {
  return lastPollTimes[gameId]?.[pollType] ?? 0;
}

function setKey(gameId: string, pollType: string): void {
  if (!lastPollTimes[gameId]) {
    lastPollTimes[gameId] = {};
  }
  lastPollTimes[gameId][pollType] = Date.now();
}

// Polling interval constants (ms)
const PBP_INTERVAL = 30 * 1000; // 30s for Sportradar PBP
const SUMMARY_INTERVAL = 2 * 60 * 1000; // 2 min for summary stats

/**
 * Check if we should poll PBP for a game.
 * Only poll Sportradar PBP for full-coverage games.
 */
export function shouldPollPbp(
  gameId: string,
  coverageLevel: string | null,
  lastSnapshotTime: string | null
): boolean {
  // Only poll Sportradar PBP for full-coverage games
  if (coverageLevel !== "full") return false;

  // Check in-memory cache first
  const lastPoll = getKey(gameId, "pbp");
  if (lastPoll > 0 && Date.now() - lastPoll < PBP_INTERVAL) {
    return false;
  }

  // Check last snapshot time from DB
  if (lastSnapshotTime) {
    const elapsed = Date.now() - new Date(lastSnapshotTime).getTime();
    if (elapsed < PBP_INTERVAL) return false;
  }

  return true;
}

/**
 * Check if we should poll summary stats for a game.
 */
export function shouldPollSummary(
  gameId: string,
  lastSnapshotTime: string | null
): boolean {
  // Check in-memory cache
  const lastPoll = getKey(gameId, "summary");
  if (lastPoll > 0 && Date.now() - lastPoll < SUMMARY_INTERVAL) {
    return false;
  }

  // Check last snapshot time from DB
  if (lastSnapshotTime) {
    const elapsed = Date.now() - new Date(lastSnapshotTime).getTime();
    if (elapsed < SUMMARY_INTERVAL) return false;
  }

  return true;
}

/** Record that we just polled PBP for a game */
export function markPbpPolled(gameId: string): void {
  setKey(gameId, "pbp");
}

/** Record that we just polled summary for a game */
export function markSummaryPolled(gameId: string): void {
  setKey(gameId, "summary");
}

/** Check if a game status means we should stop polling */
export function isTerminalStatus(status: string): boolean {
  return ["closed", "cancelled", "postponed", "forfeit"].includes(status);
}

/** Check if a game just transitioned to closed */
export function justClosed(
  previousStatus: string,
  currentStatus: string
): boolean {
  return previousStatus !== "closed" && currentStatus === "closed";
}
