// Data + helpers for programmatic game/team SEO pages (Spec A).
// Server-only: reads via service role. Renders only real rows from `games`
// and `teams`; games with an empty `broadcast` are never exposed.
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL, APP_STORE_URL } from "@/lib/seo";

export const SPORTS = ["nfl", "ncaaf", "nba", "mlb", "ncaam"] as const;
export type Sport = (typeof SPORTS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  nfl: "NFL",
  ncaaf: "College Football",
  nba: "NBA",
  mlb: "MLB",
  ncaam: "College Basketball",
};

export const LEAGUE_NAME: Record<Sport, string> = {
  nfl: "National Football League",
  ncaaf: "NCAA Division I Football",
  nba: "National Basketball Association",
  mlb: "Major League Baseball",
  ncaam: "NCAA Division I Men's Basketball",
};

export const SPORT_SCHEMA: Record<Sport, string> = {
  nfl: "American Football",
  ncaaf: "American Football",
  nba: "Basketball",
  mlb: "Baseball",
  ncaam: "Basketball",
};

export function isSport(s: string): s is Sport {
  return (SPORTS as readonly string[]).includes(s);
}

export type Team = {
  id: string;
  name: string;
  market: string | null;
  abbreviation: string | null;
  logo_url: string | null;
  sport: Sport;
  slug: string;
};

export type Game = {
  id: string;
  status: string;
  title: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  clock: string | null;
  period: number | null;
  scheduled_at: string;
  venue: string | null;
  broadcast: string | null;
  sport: Sport;
  updated_at: string | null;
};

export type GameWithTeams = Game & { home: Team; away: Team };

const GAME_COLS =
  "id,status,title,home_team_id,away_team_id,home_score,away_score,clock,period,scheduled_at,venue,broadcast,sport,updated_at";
const TEAM_COLS = "id,name,market,abbreviation,logo_url,sport,slug";

/** yyyy-mm-dd of an instant in US Eastern time. */
export function etDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function fmtTime(iso: string, tz: "America/New_York" | "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function broadcastTokens(b: string | null | undefined): string[] {
  return (b ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasBroadcast(g: Pick<Game, "broadcast">): boolean {
  return broadcastTokens(g.broadcast).length > 0;
}

export function gamePath(g: GameWithTeams): string {
  return `/games/${g.sport}/${etDate(g.scheduled_at)}/${g.away.slug}-at-${g.home.slug}`;
}

export function teamPath(t: Pick<Team, "sport" | "slug">): string {
  return `/teams/${t.sport}/${t.slug}`;
}

export function appStoreUrl(ct: string): string {
  const u = new URL(APP_STORE_URL);
  u.searchParams.set("pt", "128208851");
  u.searchParams.set("ct", ct.slice(0, 100));
  u.searchParams.set("mt", "8");
  return u.toString();
}

export function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Display name: teams.name already includes the market ("Chicago Bears"). */
export function teamName(t: Team): string {
  return t.name;
}

function db() {
  return createSupabaseAdmin();
}

async function attachTeams(games: Game[]): Promise<GameWithTeams[]> {
  const ids = Array.from(new Set(games.flatMap((g) => [g.home_team_id, g.away_team_id])));
  if (ids.length === 0) return [];
  const map = new Map<string, Team>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db().from("teams").select(TEAM_COLS).in("id", ids.slice(i, i + 300));
    if (error) throw error;
    for (const t of (data ?? []) as Team[]) map.set(t.id, t);
  }
  return games
    .filter((g) => map.get(g.home_team_id)?.slug && map.get(g.away_team_id)?.slug)
    .map((g) => ({ ...g, home: map.get(g.home_team_id)!, away: map.get(g.away_team_id)! }));
}

export async function getTeam(sport: Sport, slug: string): Promise<Team | null> {
  const { data, error } = await db().from("teams").select(TEAM_COLS).eq("sport", sport).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return (data as Team) ?? null;
}

export async function listTeams(sport: Sport): Promise<Team[]> {
  const { data, error } = await db().from("teams").select(TEAM_COLS).eq("sport", sport).order("name");
  if (error) throw error;
  return (data ?? []) as Team[];
}

/** Games with a broadcast in [from, to), ascending. */
export async function listGames(opts: {
  sport?: Sport;
  from: Date;
  to: Date;
  teamId?: string;
  limit?: number;
  ascending?: boolean;
}): Promise<GameWithTeams[]> {
  const out: Game[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 20; page++) {
    let q = db()
      .from("games")
      .select(GAME_COLS)
      .gte("scheduled_at", opts.from.toISOString())
      .lt("scheduled_at", opts.to.toISOString())
      .not("broadcast", "is", null)
      .neq("broadcast", "")
      .order("scheduled_at", { ascending: opts.ascending ?? true });
    if (opts.sport) q = q.eq("sport", opts.sport);
    if (opts.teamId) q = q.or(`home_team_id.eq.${opts.teamId},away_team_id.eq.${opts.teamId}`);
    const lim = opts.limit ?? Infinity;
    const end = Math.min(page * pageSize + pageSize, lim) - 1;
    const { data, error } = await q.range(page * pageSize, end);
    if (error) throw error;
    out.push(...((data ?? []) as Game[]));
    if (!data || data.length < pageSize || out.length >= lim) break;
  }
  return attachTeams(out.filter(hasBroadcast));
}

/** Resolve /games/[sport]/[date]/[away]-at-[home]. Null = 404. */
export async function findGame(sport: Sport, date: string, matchup: string): Promise<GameWithTeams | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const idx = matchup.indexOf("-at-");
  if (idx <= 0) return null;
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  const from = new Date(day.getTime() - 24 * 3600e3);
  const to = new Date(day.getTime() + 36 * 3600e3);
  const games = await listGames({ sport, from, to });
  return games.find((g) => etDate(g.scheduled_at) === date && `${g.away.slug}-at-${g.home.slug}` === matchup) ?? null;
}

export async function getStreamingMap(tokens: string[]): Promise<Record<string, string[]>> {
  if (tokens.length === 0) return {};
  const { data } = await db().from("broadcast_streaming_map").select("broadcast_token,services").in("broadcast_token", tokens);
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { broadcast_token: string; services: string[] }[]) out[r.broadcast_token] = r.services;
  return out;
}

export function eventStatus(status: string): string {
  if (status === "postponed") return "https://schema.org/EventPostponed";
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  return "https://schema.org/EventScheduled";
}

export function isLive(status: string): boolean {
  return status === "inprogress" || status === "halftime";
}

export function isFinal(status: string): boolean {
  return status === "closed";
}

export function gameJsonLd(g: GameWithTeams) {
  const url = absolute(gamePath(g));
  const name = `${g.away.name} at ${g.home.name}`;
  const team = (t: Team) => ({ "@type": "SportsTeam", name: t.name, url: absolute(teamPath(t)), sport: SPORT_SCHEMA[g.sport] });
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${url}#event`,
    name,
    url,
    sport: SPORT_SCHEMA[g.sport],
    startDate: g.scheduled_at,
    eventStatus: eventStatus(g.status),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: g.venue ?? g.home.name, address: g.venue ?? undefined },
    homeTeam: team(g.home),
    awayTeam: team(g.away),
    competitor: [team(g.away), team(g.home)],
    organizer: { "@type": "SportsOrganization", name: LEAGUE_NAME[g.sport] },
    image: [`${SITE_URL}/og-image.jpg`],
    description: `${name} on ${broadcastTokens(g.broadcast).join(", ")}. Kickoff, channel and where to stream.`,
    subEvent: broadcastTokens(g.broadcast).map((b) => ({
      "@type": "BroadcastEvent",
      name: `${name} on ${b}`,
      isLiveBroadcast: true,
      startDate: g.scheduled_at,
      publishedOn: { "@type": "BroadcastService", name: b },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path) })),
  };
}

/** ISO-8601 week number and its Monday (UTC) for hub pages. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400e3 + 1) / 7);
  return { year: y, week };
}

export function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (day - 1) * 86400e3);
  return new Date(monday.getTime() + (week - 1) * 7 * 86400e3 + 5 * 3600e3); // ~00:00 ET
}
