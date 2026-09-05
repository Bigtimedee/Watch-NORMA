/**
 * Server-side demo-row predicates. Keep in lockstep with `lib/demo-guard.ts`.
 * Real ESPN ids (`espn-ncaaf-401856660`) must never match.
 */

export const DEMO_GAME_ID_PREFIX = "demo-";
export const DEMO_ALERT_TITLE_MARKER = "DEMO SCREENSHOT";

export function isDemoGameId(id: string | null | undefined): boolean {
  if (typeof id !== "string" || id.length === 0) return false;
  return id.toLowerCase().startsWith(DEMO_GAME_ID_PREFIX);
}

export function isDemoAlertTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  return title.toUpperCase().includes(DEMO_ALERT_TITLE_MARKER);
}

export function isDemoAlert(row: {
  game_id?: string | null;
  title?: string | null;
}): boolean {
  return isDemoGameId(row.game_id) || isDemoAlertTitle(row.title);
}
