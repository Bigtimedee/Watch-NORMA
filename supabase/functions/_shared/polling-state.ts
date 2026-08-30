// KL-3 (2026-08-29): The in-memory coordination role of this module is
// DEPRECATED — per-game polling lifecycle is now managed by the watcher_state
// Postgres table and game-watcher-orchestrator Edge Function.
//
// Only isTerminalStatus remains live (imported by poll-boxscore/index.ts).
// Everything else had zero consumers outside this file; dead code removed.

/** Check if a game status means we should stop polling */
export function isTerminalStatus(status: string): boolean {
  return ["closed", "cancelled", "postponed", "forfeit"].includes(status);
}
