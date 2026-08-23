// Priority-tier helpers for game-watcher-orchestrator (FX8, 2026-08-23 audit H-2/H-3).
// Kept in a separate module so unit tests can import them without triggering
// the top-level Deno.serve in index.ts.

/** Stable partition: high-priority games first (in the candidate query's
 *  original order — typically next_poll_at ASC), then everyone else. Callers
 *  slice this result to their per-cycle budget. */
export function prioritize<T extends { game_id: string }>(
  candidates: T[],
  priority: Set<string>,
): T[] {
  if (priority.size === 0) return candidates;
  const high: T[] = [];
  const low: T[] = [];
  for (const c of candidates) {
    if (priority.has(c.game_id)) high.push(c);
    else low.push(c);
  }
  return [...high, ...low];
}
