// social-generate-gate.ts
// Harden cmo-generate / generate-social-content so thin-slate days cannot
// invent auto-publishable drafts attached to stock game-detail screenshots.
//
// Incident (2026-09-16 ~4am CT): cmo-generate created content_calendar
// draft+due rows with game-detail-watch.png; cmo-publish shipped them
// (https://x.com/watchNORMA/status/2100147692882034709,
//  https://x.com/watchNORMA/status/2100147702713446507).
// PR #40 only skips paused rows at publish time — generate must refuse
// the stock fallback rather than pause after the fact.
//
// TNF Why Now (Design/Expo captures, distinct filenames) is not gated here.
// cmo-publish pause-skip is unchanged.

import { isDemoGameId } from "./demo-guard.ts";
import { isStockConsumerFilename } from "./social-media-select.ts";

export const LIVE_GAME_STATUSES = ["inprogress", "halftime"] as const;
export const FOOTBALL_SPORTS = ["nfl", "ncaaf"] as const;

/** Upcoming NFL/NCAAF window used to treat TNF / Sat-Sun slates as strong. */
export const FOOTBALL_SLATE_HORIZON_HOURS = 36;

/** Alerts newer than this count as a real Why Now moment. */
export const RECENT_ALERT_HORIZON_HOURS = 6;

export interface SlateGame {
  id?: string | null;
  status?: string | null;
  sport?: string | null;
  scheduled_at?: string | null;
}

export interface SlateAssessment {
  liveCount: number;
  footballUpcomingCount: number;
  recentAlertCount: number;
  hasStrongMoment: boolean;
}

export type CalendarSkipReason =
  | "thin_slate"
  | "stock_media"
  | "missing_media";

export interface CalendarInsertCandidate {
  body: string;
  hashtags: string[];
  content_type: string;
  theme: string;
  partner_mention: string | null;
  mediaUrl: string | null;
}

export interface CalendarInsertDecision {
  candidate: CalendarInsertCandidate;
  action: "insert_draft" | "skip";
  reason?: CalendarSkipReason;
}

function isLiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (LIVE_GAME_STATUSES as readonly string[]).includes(status);
}

function isFootballSport(sport: string | null | undefined): boolean {
  if (!sport) return false;
  return (FOOTBALL_SPORTS as readonly string[]).includes(sport);
}

/**
 * A "strong moment" is something worth auto-posting: a live game, a real
 * Why Now alert, or football (NFL/NCAAF) actually on the near slate.
 * Wednesday MLB/NBA scheduled games with empty Alerts do not qualify.
 */
export function assessSlate(input: {
  games: SlateGame[];
  recentAlertCount: number;
  now: Date;
}): SlateAssessment {
  const games = input.games.filter((g) => !isDemoGameId(g.id ?? null));
  const liveCount = games.filter((g) => isLiveStatus(g.status)).length;

  const horizonMs = FOOTBALL_SLATE_HORIZON_HOURS * 60 * 60 * 1000;
  const nowMs = input.now.getTime();
  const footballUpcomingCount = games.filter((g) => {
    if (g.status !== "scheduled") return false;
    if (!isFootballSport(g.sport)) return false;
    if (!g.scheduled_at) return false;
    const t = Date.parse(g.scheduled_at);
    if (Number.isNaN(t)) return false;
    return t >= nowMs && t <= nowMs + horizonMs;
  }).length;

  const recentAlertCount = Math.max(0, input.recentAlertCount);
  return {
    liveCount,
    footballUpcomingCount,
    recentAlertCount,
    hasStrongMoment:
      liveCount > 0 || footballUpcomingCount > 0 || recentAlertCount > 0,
  };
}

export function shouldGenerateBrandPosts(slate: SlateAssessment): boolean {
  return slate.hasStrongMoment;
}

/** generate-social-content: no scheduled/live games → do not invent app_promo + stock. */
export function shouldSkipEmptySlateConsumerPosts(gameCount: number): boolean {
  return gameCount <= 0;
}

function hasFreshAutoPublishMedia(mediaUrl: string | null): boolean {
  if (!mediaUrl) return false;
  return !isStockConsumerFilename(mediaUrl);
}

/**
 * Only insert auto-publishable (draft + due) calendar rows when the post
 * has a real sports moment AND non-stock media. Prefer skip over paused.
 *
 * alert_called_it may still insert on an otherwise thin calendar day if it
 * carries fresh media (the game just resolved — that is the moment).
 * Claude brand posts and norma_in_numbers do not.
 */
export function decideCalendarInsert(
  candidate: CalendarInsertCandidate,
  slate: SlateAssessment,
): CalendarInsertDecision {
  const isAlertCalledIt = candidate.content_type === "alert_called_it" ||
    candidate.theme === "alert_called_it";

  if (!slate.hasStrongMoment && !isAlertCalledIt) {
    return { candidate, action: "skip", reason: "thin_slate" };
  }

  if (!candidate.mediaUrl) {
    return { candidate, action: "skip", reason: "missing_media" };
  }

  if (!hasFreshAutoPublishMedia(candidate.mediaUrl)) {
    return { candidate, action: "skip", reason: "stock_media" };
  }

  return { candidate, action: "insert_draft" };
}

export function decideCalendarInserts(
  candidates: CalendarInsertCandidate[],
  slate: SlateAssessment,
): { inserts: CalendarInsertCandidate[]; skipped: CalendarInsertDecision[] } {
  const inserts: CalendarInsertCandidate[] = [];
  const skipped: CalendarInsertDecision[] = [];
  for (const candidate of candidates) {
    const decision = decideCalendarInsert(candidate, slate);
    if (decision.action === "insert_draft") {
      inserts.push(candidate);
    } else {
      skipped.push(decision);
    }
  }
  return { inserts, skipped };
}
