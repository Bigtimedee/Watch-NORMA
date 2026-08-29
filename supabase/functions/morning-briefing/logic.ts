// morning-briefing/logic.ts — pure, testable edition-routing logic.
// No Deno.serve, no fetch, no Supabase client — imported by both index.ts and logic_test.ts.

export const MAX_GAMES_PER_BRIEFING = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Game {
  id: string;
  home_team: string;
  away_team: string;
  scheduled_at: string | null;
  sport: string | null;
  home_rank: number | null;
  away_rank: number | null;
}

/** Which football editions are active today (computed once per invocation). */
export interface DayContext {
  hasNcaaf: boolean;
  hasNfl: boolean;
  utcDayOfWeek: number; // 0=Sun, 1=Mon, …, 6=Sat (UTC)
}

export interface BriefingMessage {
  title: string;
  body: string;
  featuredIds: string[];
}

// ─── Edition routing ──────────────────────────────────────────────────────────

/**
 * Return the right briefing message for today, or null if there is nothing
 * to send to this user (e.g. no relevant games and no fallback slate).
 *
 * Routing priority:
 *   Saturday + NCAAF games exist  → NCAAF Saturday edition
 *   Thursday + NFL games exist    → NFL Thursday edition
 *   Sunday   + NFL games exist    → NFL Sunday edition
 *   All other days                → existing "Tonight's Games" logic
 *
 * `isPersonal` returns true for games the user follows or has wagered on.
 * `localDay`   is the user's local day-of-week (0=Sun … 6=Sat).
 */
export function buildEditionMessage(
  games: Game[],
  dayCtx: DayContext,
  localDay: number,
  isPersonal: (g: Game) => boolean,
): BriefingMessage | null {
  // Saturday NCAAF edition.
  if (localDay === 6 && dayCtx.hasNcaaf) {
    return buildNcaafEdition(games, isPersonal);
  }
  // Thursday NFL edition.
  if (localDay === 4 && dayCtx.hasNfl) {
    return buildNflThursdayEdition(games, isPersonal);
  }
  // Sunday NFL edition.
  if (localDay === 0 && dayCtx.hasNfl) {
    return buildNflSundayEdition(games, isPersonal);
  }
  // Default: existing "Tonight's Games" logic — personal games only.
  return buildDefaultEdition(games, isPersonal);
}

// ─── NCAAF Saturday edition ───────────────────────────────────────────────────

/**
 * Saturday NCAAF edition.
 * Lead: personal NCAAF games (followed teams / active wagers).
 * Tail: top-ranked matchups (home_rank or away_rank set), de-duped.
 * Format: "Your NCAAF slate for today: [game1] · [game2] · [game3]…"
 */
function buildNcaafEdition(
  games: Game[],
  isPersonal: (g: Game) => boolean,
): BriefingMessage | null {
  const ncaafGames = games.filter((g) => g.sport === "ncaaf");
  if (ncaafGames.length === 0) return null;

  const personal = ncaafGames.filter(isPersonal);
  const ranked = ncaafGames.filter(
    (g) => !isPersonal(g) && (g.home_rank !== null || g.away_rank !== null),
  );

  // Lead with personal, then ranked, capped to MAX_GAMES_PER_BRIEFING.
  const featured = dedup([...personal, ...ranked]).slice(0, MAX_GAMES_PER_BRIEFING);

  if (featured.length === 0) {
    // No personal or ranked games — still send a count summary so the user
    // knows it is NCAAF Saturday (encourages app open).
    const title = "NCAAF Saturday";
    const body = `${ncaafGames.length} college football game${ncaafGames.length !== 1 ? "s" : ""} today. Open NORMA to follow a team.`;
    return {
      title,
      body,
      featuredIds: ncaafGames.slice(0, MAX_GAMES_PER_BRIEFING).map((g) => g.id),
    };
  }

  const slots = featured.map(formatGameSlot);
  const title = "Your NCAAF slate for today";
  const body = slots.join(" · ");

  return { title, body, featuredIds: featured.map((g) => g.id) };
}

// ─── NFL Thursday edition ─────────────────────────────────────────────────────

/**
 * NFL Thursday edition.
 * Lead: personal NFL games.
 * Tail: primetime game (latest scheduled_at), de-duped.
 */
function buildNflThursdayEdition(
  games: Game[],
  isPersonal: (g: Game) => boolean,
): BriefingMessage | null {
  const nflGames = games.filter((g) => g.sport === "nfl");
  if (nflGames.length === 0) return null;

  const personal = nflGames.filter(isPersonal);
  const primetime = pickPrimetimeGame(nflGames);

  let featured = dedup([
    ...personal,
    ...(primetime ? [primetime] : []),
  ]).slice(0, MAX_GAMES_PER_BRIEFING);

  if (featured.length === 0) {
    // Fallback: any NFL game today.
    featured = nflGames.slice(0, 1);
  }

  const slots = featured.map(formatGameSlot);
  const isPersonalLead = personal.length > 0;
  const title = isPersonalLead ? "NFL Thursday Night — your games" : "NFL Thursday Night";
  const body = slots.join(" · ");

  return { title, body, featuredIds: featured.map((g) => g.id) };
}

// ─── NFL Sunday edition ───────────────────────────────────────────────────────

/**
 * NFL Sunday edition.
 * Lead: personal NFL games.
 * Tail: summary line ("X NFL games today, including [highlighted matchups]").
 */
function buildNflSundayEdition(
  games: Game[],
  isPersonal: (g: Game) => boolean,
): BriefingMessage | null {
  const nflGames = games.filter((g) => g.sport === "nfl");
  if (nflGames.length === 0) return null;

  const personal = nflGames.filter(isPersonal);
  const nonPersonal = nflGames.filter((g) => !isPersonal(g));

  // Highlighted games: personal first, then up to 2 non-personal for the summary.
  let featured = dedup([...personal, ...nonPersonal.slice(0, 2)]).slice(
    0,
    MAX_GAMES_PER_BRIEFING,
  );

  if (featured.length === 0) {
    featured = nflGames.slice(0, Math.min(2, nflGames.length));
  }

  let title: string;
  let body: string;

  if (personal.length > 0) {
    title = "Your NFL Sunday";
    const personalPart = personal.slice(0, 3).map(formatGameSlot).join(" · ");
    const remaining = nflGames.length - personal.length;
    body = remaining > 0
      ? `${personalPart} + ${remaining} more NFL game${remaining !== 1 ? "s" : ""} today`
      : personalPart;
  } else {
    title = "NFL Sunday";
    const slots = featured.map(formatGameSlot);
    body = `${nflGames.length} NFL game${nflGames.length !== 1 ? "s" : ""} today, including ${slots.join(" · ")}`;
  }

  return { title, body, featuredIds: featured.map((g) => g.id) };
}

// ─── Default edition (existing behavior) ──────────────────────────────────────

/**
 * Default edition: "Tonight's Games" — original behavior unchanged.
 * Only sends if user has personal (followed/wagered) games.
 */
function buildDefaultEdition(
  games: Game[],
  isPersonal: (g: Game) => boolean,
): BriefingMessage | null {
  const relevantGames = games.filter(isPersonal);
  if (relevantGames.length === 0) return null;

  const featured = relevantGames.slice(0, MAX_GAMES_PER_BRIEFING);
  const { title, body } = buildLegacyBriefingMessage(featured);
  return { title, body, featuredIds: featured.map((g) => g.id) };
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

/** Remove duplicate game entries (preserve insertion order). */
function dedup(games: Game[]): Game[] {
  const seen = new Set<string>();
  return games.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

/** Return the latest-kickoff game from a list (primetime proxy). */
function pickPrimetimeGame(games: Game[]): Game | null {
  if (games.length === 0) return null;
  return games.reduce((latest, g) => {
    if (!g.scheduled_at) return latest;
    if (!latest.scheduled_at) return g;
    return g.scheduled_at > latest.scheduled_at ? g : latest;
  });
}

/** One-line game slot: "[#rank] Away @ [#rank] Home (7:00 PM ET)" */
function formatGameSlot(game: Game): string {
  const time = game.scheduled_at ? formatGameTime(game.scheduled_at) : "TBD";
  const awayLabel = game.away_rank ? `#${game.away_rank} ${game.away_team}` : game.away_team;
  const homeLabel = game.home_rank ? `#${game.home_rank} ${game.home_team}` : game.home_team;
  return `${awayLabel} @ ${homeLabel} (${time})`;
}

/**
 * Return the day-of-week (0=Sun … 6=Sat) for `now` in the user's timezone.
 * Falls back to UTC if timezone is null or unrecognized.
 */
export function localDayOfWeek(now: Date, timezone: string | null | undefined): number {
  const tz = timezone && typeof timezone === "string" ? timezone : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[weekday] ?? now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

/**
 * Format a UTC ISO timestamp to a human-readable ET game time.
 * Uses Intl.DateTimeFormat for correct EDT/EST handling.
 */
export function formatGameTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "?";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const dayperiod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
    return `${hour}:${minute} ${dayperiod} ET`.trim();
  } catch {
    return "TBD";
  }
}

/**
 * Build the push notification title/body for the default edition.
 * Preserved from the original morning-briefing for non-football days.
 */
function buildLegacyBriefingMessage(games: Game[]): { title: string; body: string } {
  const title = games.length === 1
    ? "Tonight: 1 game on your list"
    : `Tonight: ${games.length} games on your list`;

  const lines = games.map((g) => {
    const time = g.scheduled_at ? formatGameTime(g.scheduled_at) : "TBD";
    return `${g.away_team} @ ${g.home_team} (${time})`;
  });

  return { title, body: lines.join("\n") };
}
