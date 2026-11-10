// =============================================================================
// cmo-live-moments/logic.ts — pure logic for the growth-plan social formats.
//
//   1. Live Moments: a GAME-level detector (not user-level). It reuses the
//      evaluate-alerts must-notify rules (checkMustNotify with no user wagers)
//      and the same clock parsing, then keeps only nationally relevant games:
//        NFL: every game.  NBA: every game.
//        NCAAF / NCAAM: a ranked team (AP top 25, games.home_rank/away_rank)
//                       or a national TV network in games.broadcast.
//      Moments: overtime, football two-minute drill in a one-score game (Q4),
//      basketball one-possession finish in the final period.
//   2. Today's Games: one morning post listing the day's top games with ET + CT
//      start and channel, linking getnorma.app/schedule/<sport>/today.
//
// Every link carries utm_source=<platform>&utm_campaign=<format>. All copy is
// guarded by _shared/social-copy-guard.ts before a row is written.
// =============================================================================

import type { GameState } from "../evaluate-alerts/logic.ts";
import { parseClockMinutes } from "../evaluate-alerts/logic.ts";
import { checkMustNotify } from "../_shared/alert-scoring.ts";
import { guardCopyForPlatform } from "../_shared/social-copy-guard.ts";
import {
  LIVE_MOMENT_HOURLY_CAP,
  TEXT_FORMAT_PLATFORMS,
} from "../_shared/social-formats.ts";
import { tweetTextLength, X_TARGET_TWEET_LENGTH } from "../cmo-publish/logic.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Public site the links point at (the brief's getnorma.app; apex redirects to www keeping the query). */
export const SITE_BASE = "https://getnorma.app";

/** Sports Live Moments watch, in tie-break priority order (first = most national). */
export const LIVE_MOMENT_SPORTS = ["nfl", "ncaaf", "nba", "ncaam"] as const;
export type LmSport = (typeof LIVE_MOMENT_SPORTS)[number];

/** Sports where every game counts as nationally relevant. */
export const ALWAYS_NATIONAL_SPORTS: ReadonlySet<string> = new Set(["nfl", "nba"]);

/** College games need a ranked team (rank <= this) or national TV. */
export const RANKED_MAX = 25;

/**
 * National TV / national streaming networks (games.broadcast tokens, matched
 * case-insensitively and exactly, so "ESPN+" is NOT "ESPN"). Conference and
 * regional networks are deliberately excluded.
 */
export const NATIONAL_TV_NETWORKS: ReadonlySet<string> = new Set([
  "abc",
  "cbs",
  "nbc",
  "fox",
  "espn",
  "espn2",
  "fs1",
  "tnt",
  "tbs",
  "trutv",
  "peacock",
  "prime video",
  "amazon prime video",
  "netflix",
  "nfl network",
]);

/** Regulation periods: football and NBA 4 quarters, NCAAM 2 halves. */
export const REGULATION_PERIODS: Readonly<Record<LmSport, number>> = {
  nfl: 4,
  ncaaf: 4,
  nba: 4,
  ncaam: 2,
};

export const SPORT_LABEL: Readonly<Record<LmSport, string>> = {
  nfl: "NFL",
  ncaaf: "College Football",
  nba: "NBA",
  ncaam: "College Basketball",
};

export type MomentType = "overtime" | "two_minute" | "close_finish";

/** Higher = posted first when the hourly cap forces a choice. */
export const MOMENT_PRIORITY: Readonly<Record<MomentType, number>> = {
  overtime: 3,
  two_minute: 2,
  close_finish: 2,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LmTeam {
  name: string;
  abbreviation: string | null;
  slug: string | null;
}

export interface LmGame {
  id: string;
  sport: string | null;
  status: string;
  clock: string | null;
  period: number | null;
  home_score: number | null;
  away_score: number | null;
  broadcast: string | null;
  scheduled_at: string;
  home_rank?: number | null;
  away_rank?: number | null;
  espn_id?: string | null;
  home: LmTeam | null;
  away: LmTeam | null;
}

export interface DetectedMoment {
  type: MomentType;
  /** must-notify alertType it came from, or "period_check" for the OT fallback. */
  source: string;
}

// ---------------------------------------------------------------------------
// Relevance + detection
// ---------------------------------------------------------------------------

export function isLmSport(s: string | null | undefined): s is LmSport {
  return !!s && (LIVE_MOMENT_SPORTS as readonly string[]).includes(s);
}

export function broadcastTokens(b: string | null | undefined): string[] {
  return (b ?? "").split(/\s*[,/]\s*/).map((s) => s.trim()).filter(Boolean);
}

export function hasNationalTv(b: string | null | undefined): boolean {
  return broadcastTokens(b).some((t) => NATIONAL_TV_NETWORKS.has(t.toLowerCase()));
}

export function isRanked(rank: number | null | undefined): boolean {
  return typeof rank === "number" && rank >= 1 && rank <= RANKED_MAX;
}

export function isNationallyRelevant(g: LmGame): boolean {
  if (!isLmSport(g.sport)) return false;
  if (ALWAYS_NATIONAL_SPORTS.has(g.sport)) return true;
  return isRanked(g.home_rank) || isRanked(g.away_rank) || hasNationalTv(g.broadcast);
}

/** Demo / screenshot rows must never reach social (hard rule 22). */
export function isDemoGame(id: string | null | undefined): boolean {
  return !!id && id.toLowerCase().startsWith("demo-");
}

function toGameState(g: LmGame): GameState {
  return {
    id: g.id,
    status: g.status,
    home_score: g.home_score ?? 0,
    away_score: g.away_score ?? 0,
    clock: g.clock,
    period: g.period,
    home_team_id: null,
    away_team_id: null,
    sportradar_id: null,
    coverage_level: null,
    broadcast: g.broadcast,
    home_team: g.home ? { name: g.home.name, abbreviation: g.home.abbreviation ?? g.home.name } : null,
    away_team: g.away ? { name: g.away.name, abbreviation: g.away.abbreviation ?? g.away.name } : null,
    sport: g.sport,
  };
}

/**
 * All game-level moments currently true for `g`, highest priority first.
 * Reuses checkMustNotify (the evaluate-alerts must-notify rules) with no user
 * wagers, so the definitions stay identical to what users get pushed:
 *   football_overtime / overtime              -> overtime
 *   football_two_minute in Q4 (<=2:00, <=8)   -> two_minute (the Q2 variant is ignored)
 *   close_game (basketball <2:00, <=3) in the final regulation period or OT -> close_finish
 * Plus a period check so overtime is still caught when OT has no clock
 * (college football) or the first OT poll was missed.
 * Only status 'inprogress' games qualify; nothing fires once a game is closed.
 */
export function detectLiveMoments(g: LmGame): DetectedMoment[] {
  if (g.status !== "inprogress") return [];
  if (!isLmSport(g.sport)) return [];
  if (g.period == null || g.home_score == null || g.away_score == null) return [];
  const reg = REGULATION_PERIODS[g.sport];
  const football = g.sport === "nfl" || g.sport === "ncaaf";
  const out: DetectedMoment[] = [];
  const push = (m: DetectedMoment) => {
    if (!out.some((x) => x.type === m.type)) out.push(m);
  };

  const must = checkMustNotify(toGameState(g), null, [], g.sport);
  if (must) {
    if (must.alertType === "football_overtime" || must.alertType === "overtime") {
      push({ type: "overtime", source: must.alertType });
    } else if (must.alertType === "football_two_minute" && football && g.period === 4) {
      push({ type: "two_minute", source: must.alertType });
    } else if (must.alertType === "close_game" && !football && g.period >= reg) {
      push({ type: "close_finish", source: must.alertType });
    }
  }
  if (g.period > reg) push({ type: "overtime", source: "period_check" });

  // Basketball: a one-possession finish inside OT is also a close finish.
  if (!football && g.period > reg) {
    const mins = parseClockMinutes(g.clock);
    if (mins != null && mins < 2 && Math.abs(g.home_score - g.away_score) <= 3) {
      push({ type: "close_finish", source: "ot_close_check" });
    }
  }
  return out.sort((a, b) => MOMENT_PRIORITY[b.type] - MOMENT_PRIORITY[a.type]);
}

/** Idempotency key: one post per game per moment type, ever. */
export function momentKey(gameId: string, type: MomentType): string {
  return `live_moment:${gameId}:${type}`;
}

export function todaysGamesKey(etDay: string): string {
  return `todays_games:${etDay}`;
}

// ---------------------------------------------------------------------------
// Rate caps
// ---------------------------------------------------------------------------

export interface MomentCandidate {
  game: LmGame;
  moment: DetectedMoment;
  key: string;
}

function sportRank(s: string | null): number {
  const i = (LIVE_MOMENT_SPORTS as readonly string[]).indexOf(s ?? "");
  return i < 0 ? 99 : i;
}

export function compareCandidates(a: MomentCandidate, b: MomentCandidate): number {
  const p = MOMENT_PRIORITY[b.moment.type] - MOMENT_PRIORITY[a.moment.type];
  if (p !== 0) return p;
  const s = sportRank(a.game.sport) - sportRank(b.game.sport);
  if (s !== 0) return s;
  const ma = Math.abs((a.game.home_score ?? 0) - (a.game.away_score ?? 0));
  const mb = Math.abs((b.game.home_score ?? 0) - (b.game.away_score ?? 0));
  if (ma !== mb) return ma - mb;
  return a.key.localeCompare(b.key);
}

/**
 * Pick at most one new moment per game (highest priority not already posted),
 * then fill each platform's remaining hourly budget in priority order.
 *
 * `recentByPlatform` = Live Moment rows created for that platform in the last
 * rolling hour. Rows are created for TEXT_FORMAT_PLATFORMS only (X today), so
 * the X cap (3/h) is the binding one; IG/FB/TikTok caps (1/h) are enforced in
 * the cross-post sweep.
 */
export function planLiveMoments(
  games: LmGame[],
  alreadyKeys: ReadonlySet<string>,
  recentByPlatform: Readonly<Record<string, number>>,
  caps: Readonly<Record<string, number>> = LIVE_MOMENT_HOURLY_CAP,
  platforms: readonly string[] = TEXT_FORMAT_PLATFORMS,
): { queue: MomentCandidate[]; capped: MomentCandidate[]; budget: number } {
  const perGame: MomentCandidate[] = [];
  for (const g of games) {
    if (isDemoGame(g.id) || !isNationallyRelevant(g)) continue;
    const next = detectLiveMoments(g).find((m) => !alreadyKeys.has(momentKey(g.id, m.type)));
    if (next) perGame.push({ game: g, moment: next, key: momentKey(g.id, next.type) });
  }
  perGame.sort(compareCandidates);
  // Every row goes to every text platform, so the tightest platform budget wins.
  const budget = Math.max(
    0,
    Math.min(...platforms.map((p) => (caps[p] ?? 0) - (recentByPlatform[p] ?? 0))),
  );
  return { queue: perGame.slice(0, budget), capped: perGame.slice(budget), budget };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

const UTM_SOURCE: Readonly<Record<string, string>> = {
  twitter: "x",
  x: "x",
  instagram: "instagram",
  ig: "instagram",
  facebook: "facebook",
  fb: "facebook",
  tiktok: "tiktok",
};

export function utmSource(platform: string): string {
  return UTM_SOURCE[platform.trim().toLowerCase()] ?? platform.trim().toLowerCase();
}

/** yyyy-mm-dd of an instant in US Eastern (same as web/src/lib/sports.ts etDate). */
export function etDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Path of the programmatic SEO game page (PR #68):
 * /games/<sport>/<ET date>/<away.slug>-at-<home.slug>. Null when a slug is
 * missing or the game has no broadcast (the page 404s for those).
 */
export function gamePagePath(g: LmGame): string | null {
  if (!isLmSport(g.sport) || !g.home?.slug || !g.away?.slug) return null;
  if (broadcastTokens(g.broadcast).length === 0) return null;
  if (Number.isNaN(Date.parse(g.scheduled_at))) return null;
  return `/games/${g.sport}/${etDate(g.scheduled_at)}/${g.away.slug}-at-${g.home.slug}`;
}

export function withUtm(
  path: string,
  platform: string,
  campaign: string,
  content?: string,
): string {
  const u = new URL(path, SITE_BASE);
  u.searchParams.set("utm_source", utmSource(platform));
  u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

export function liveMomentUrl(g: LmGame, platform: string, type: MomentType): string | null {
  const path = gamePagePath(g);
  return path ? withUtm(path, platform, "live_moment", type) : null;
}

export function todaysGamesUrl(sport: LmSport, platform: string): string {
  return withUtm(`/schedule/${sport}/today`, platform, "todays_games");
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function teamLabel(t: LmTeam | null, rank: number | null | undefined, short: boolean): string {
  const base = t ? (short ? (t.abbreviation || t.name) : t.name) : "TBD";
  return isRanked(rank) ? `#${rank} ${base}` : base;
}

export function periodLabel(sport: LmSport, period: number): string {
  const reg = REGULATION_PERIODS[sport];
  if (period > reg) {
    const n = period - reg;
    return n === 1 ? "OT" : `${n}OT`;
  }
  if (sport === "ncaam") return period === 1 ? "1st half" : "2nd half";
  return ["1st", "2nd", "3rd", "4th"][period - 1] ?? `Q${period}`;
}

function scoreLine(g: LmGame, short: boolean): string {
  return `${teamLabel(g.away, g.away_rank, short)} ${g.away_score}, ${teamLabel(g.home, g.home_rank, short)} ${g.home_score}`;
}

function leaderPhrase(g: LmGame, short: boolean): string {
  const margin = Math.abs((g.home_score ?? 0) - (g.away_score ?? 0));
  if (margin === 0) return "Tied";
  const homeLeads = (g.home_score ?? 0) > (g.away_score ?? 0);
  const t = homeLeads ? teamLabel(g.home, g.home_rank, short) : teamLabel(g.away, g.away_rank, short);
  return `${t} up ${margin}`;
}

function headline(g: LmGame, type: MomentType, short: boolean): string {
  const sport = g.sport as LmSport;
  const per = g.period != null ? periodLabel(sport, g.period) : "";
  const clock = g.clock && g.clock.trim() ? g.clock.trim() : null;
  if (type === "overtime") {
    const ot = g.period != null && g.period > REGULATION_PERIODS[sport] + 1 ? per : "overtime";
    return `${ot === "overtime" ? "OVERTIME" : ot}: ${scoreLine(g, short)}.`;
  }
  if (type === "two_minute") {
    return `Two-minute drill. ${leaderPhrase(g, short)}${clock ? `, ${clock} left in the 4th` : " in the 4th"}. ${scoreLine(g, short)}.`;
  }
  return `One-possession game. ${scoreLine(g, short)}${clock ? `, ${clock} left` : ""}${per ? ` (${per})` : ""}.`;
}

export interface LiveMomentCopyOptions {
  /** Stream names from game_watch_links (provider display names). */
  streams?: string[];
}

/**
 * Compose a Live Moment post for `platform`. Tries full team names first and
 * falls back to abbreviations / fewer extras until it fits X's 270-char
 * target (URLs count 23). Returns null when no game page URL exists.
 */
export function buildLiveMomentText(
  g: LmGame,
  type: MomentType,
  platform: string,
  opts: LiveMomentCopyOptions = {},
): string | null {
  const url = liveMomentUrl(g, platform, type);
  if (!url) return null;
  const channels = broadcastTokens(g.broadcast).slice(0, 2).join(", ");
  const streams = (opts.streams ?? []).filter(Boolean).slice(0, 2);
  const attempts: Array<{ short: boolean; withStreams: boolean; cta: boolean }> = [
    { short: false, withStreams: true, cta: true },
    { short: true, withStreams: true, cta: true },
    { short: true, withStreams: false, cta: true },
    { short: true, withStreams: false, cta: false },
  ];
  let last = "";
  for (const a of attempts) {
    const watch = `Watch: ${channels}${a.withStreams && streams.length ? ` | Stream: ${streams.join(", ")}` : ""}`;
    const tail = a.cta ? `Where to watch + live alerts: ${url}` : url;
    last = `${headline(g, type, a.short)}\n${watch}\n${tail}`;
    if (tweetTextLength(last) <= X_TARGET_TWEET_LENGTH) return last;
  }
  return last;
}

// ---------------------------------------------------------------------------
// Today's Games
// ---------------------------------------------------------------------------

/** Sport order per ET weekday (0 = Sunday): NFL Sun/Mon/Thu, NCAAF Sat, NBA/NCAAM nights. */
export const TODAYS_SPORT_PRIORITY: Readonly<Record<number, readonly LmSport[]>> = {
  0: ["nfl", "nba", "ncaam"],
  1: ["nfl", "nba", "ncaam"],
  2: ["nba", "ncaam", "ncaaf"],
  3: ["nba", "ncaam", "ncaaf"],
  4: ["nfl", "nba", "ncaam", "ncaaf"],
  5: ["nba", "ncaam", "ncaaf"],
  6: ["ncaaf", "ncaam", "nba"],
};

/**
 * Holiday / rivalry slates (ET dates). They change which sport leads Today's
 * Games that day and give it a slate headline. The override only reorders
 * the sports; a sport with no listable game in `games` is still skipped, and
 * the headline is used only when the picked sport is one it names.
 */
export interface SpecialSlate {
  order: readonly LmSport[];
  heads: Partial<Record<LmSport, string>>;
}
export const SPECIAL_SLATES: Readonly<Record<string, SpecialSlate>> = {
  // Thanksgiving Day 2026 (Thu Nov 26)
  "2026-11-26": {
    order: ["nfl", "ncaaf", "nba", "ncaam"],
    heads: { nfl: "Thanksgiving NFL: what channel + start time", ncaaf: "Thanksgiving college football: what channel + start time" },
  },
  // Black Friday 2026 (Fri Nov 27): football leads instead of the usual Friday NBA
  "2026-11-27": {
    order: ["nfl", "ncaaf", "nba", "ncaam"],
    heads: { nfl: "Black Friday football: what channel + start time", ncaaf: "Black Friday college football: what channel + start time" },
  },
  // Rivalry Saturday 2026 (Sat Nov 28)
  "2026-11-28": {
    order: ["ncaaf", "ncaam", "nba"],
    heads: { ncaaf: "Rivalry Saturday: what channel + start time" },
  },
};

export function specialSlate(at: Date): SpecialSlate | null {
  return SPECIAL_SLATES[etDate(at)] ?? null;
}

export function todaysGamesHead(sport: LmSport, at: Date): string {
  return specialSlate(at)?.heads[sport] ?? `${SPORT_LABEL[sport]} today: what channel + start time`;
}

export function etWeekday(at: Date): number {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
}

/** UTC instant of 00:00 ET on the ET calendar day `day` (yyyy-mm-dd). DST-correct. */
export function etMidnightUtc(day: string): Date {
  const [y, mo, da] = day.split("-").map(Number);
  // Midnight ET is 04:00Z (EDT) or 05:00Z (EST); pick the one that is 00:00 on `day` in ET.
  for (const h of [4, 5]) {
    const cand = new Date(Date.UTC(y, mo - 1, da, h));
    const hourEt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(cand);
    if (etDate(cand) === day && Number(hourEt) === 0) return cand;
  }
  return new Date(Date.UTC(y, mo - 1, da, 5));
}

/** [00:00 ET, 24:00 ET) of the ET calendar day containing `at` (DST-correct). */
export function etDayBounds(at: Date): { from: Date; to: Date; day: string } {
  const day = etDate(at);
  const from = etMidnightUtc(day);
  const nextDay = etDate(new Date(from.getTime() + 30 * 3600e3));
  return { from, to: etMidnightUtc(nextDay), day };
}

export function isUpcomingOrLive(status: string): boolean {
  return !["closed", "cancelled", "canceled", "postponed", "final"].includes(status.toLowerCase());
}

/** Pick the day's headline sport: first in the weekday priority list with a listable game. */
export function pickTodaysSport(games: LmGame[], at: Date): LmSport | null {
  const order = specialSlate(at)?.order ?? TODAYS_SPORT_PRIORITY[etWeekday(at)] ?? LIVE_MOMENT_SPORTS;
  for (const s of order) {
    if (games.some((g) => g.sport === s && isListable(g))) return s;
  }
  return null;
}

function isListable(g: LmGame): boolean {
  return !isDemoGame(g.id) && isUpcomingOrLive(g.status) && broadcastTokens(g.broadcast).length > 0 &&
    !Number.isNaN(Date.parse(g.scheduled_at));
}

/** National TV, ranked teams and prime time lift a game into the list. */
export function todaysGameScore(g: LmGame): number {
  let s = 0;
  if (hasNationalTv(g.broadcast)) s += 3;
  if (isRanked(g.home_rank)) s += 1 + ((g.home_rank ?? 99) <= 10 ? 1 : 0);
  if (isRanked(g.away_rank)) s += 1 + ((g.away_rank ?? 99) <= 10 ? 1 : 0);
  const hourEt = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(new Date(g.scheduled_at)),
  );
  if (hourEt >= 19) s += 1;
  return s;
}

export function shortTime(iso: string, tz: "America/New_York" | "America/Chicago"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ap = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase().startsWith("p") ? "p" : "a";
  return m === "00" ? `${h}${ap}` : `${h}:${m}${ap}`;
}

export function todaysGameLine(g: LmGame): string {
  const channel = broadcastTokens(g.broadcast).slice(0, 1).join("");
  return `${teamLabel(g.away, g.away_rank, true)} @ ${teamLabel(g.home, g.home_rank, true)} ` +
    `${shortTime(g.scheduled_at, "America/New_York")} ET/${shortTime(g.scheduled_at, "America/Chicago")} CT, ${channel}`;
}

export interface TodaysGamesPlan {
  sport: LmSport;
  games: LmGame[];
  text: string;
}

/**
 * Build the Today's Games post for `platform`: top games (score, then start
 * time) for the day's headline sport, as many as fit X's 270 target,
 * displayed in start-time order.
 */
export function buildTodaysGames(
  all: LmGame[],
  at: Date,
  platform: string,
  maxGames = 6,
): TodaysGamesPlan | null {
  const sport = pickTodaysSport(all, at);
  if (!sport) return null;
  const pool = all
    .filter((g) => g.sport === sport && isListable(g))
    .sort((a, b) => todaysGameScore(b) - todaysGameScore(a) || Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  const url = todaysGamesUrl(sport, platform);
  const head = todaysGamesHead(sport, at);
  const compose = (gs: LmGame[]) => {
    const lines = [...gs].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)).map(todaysGameLine);
    return `${head}\n${lines.join("\n")}\nAll games: ${url}`;
  };
  let chosen: LmGame[] = pool.slice(0, 1);
  for (let n = 2; n <= Math.min(maxGames, pool.length); n++) {
    const next = pool.slice(0, n);
    if (tweetTextLength(compose(next)) > X_TARGET_TWEET_LENGTH) break;
    chosen = next;
  }
  if (chosen.length === 0) return null;
  const ordered = [...chosen].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  return { sport, games: ordered, text: compose(ordered) };
}

// ---------------------------------------------------------------------------
// Platform-split captions
// ---------------------------------------------------------------------------

export const CROSS_CAPTION_PLATFORMS = ["ig", "fb", "tiktok"] as const;

/**
 * Per-platform captions for content_calendar.platform_captions. Each one is
 * built with its own utm_source and must pass the utility-only guard; a
 * caption that fails is left out (that platform then has no caption and the
 * cross-post sweep falls back to the X body, which the guard re-checks).
 */
export function buildPlatformCaptions(
  build: (platform: string) => string | null,
): { captions: Record<string, string>; blocked: Record<string, string[]> } {
  const captions: Record<string, string> = {};
  const blocked: Record<string, string[]> = {};
  for (const p of CROSS_CAPTION_PLATFORMS) {
    const text = build(p);
    if (!text) continue;
    const g = guardCopyForPlatform(p, text);
    if (g.ok) captions[p] = text;
    else blocked[p] = g.terms;
  }
  return { captions, blocked };
}

// ---------------------------------------------------------------------------
// Run options
// ---------------------------------------------------------------------------

export type RunMode = "live" | "todays_games";

export interface LmRunOptions {
  mode: RunMode;
  dryRun: boolean;
  asOf: Date;
}

/** `as_of` is honoured only in dry runs (same contract as cmo-publish). */
export function parseLmRunOptions(payload: Record<string, unknown>, now: Date): LmRunOptions {
  const mode: RunMode = payload.mode === "todays_games" ? "todays_games" : "live";
  const dryRun = payload.dry_run === true || payload.dry_run === "true";
  let asOf = now;
  if (dryRun && typeof payload.as_of === "string") {
    const t = Date.parse(payload.as_of);
    if (!Number.isNaN(t)) asOf = new Date(t);
  }
  return { mode, dryRun, asOf };
}
