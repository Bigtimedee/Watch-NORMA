/**
 * Client-side backstop for duplicate game rows (P0 2026-11-03).
 *
 * The DB is the source of truth (trg_games_canonicalize + games_canonical_key_unique),
 * but if two ingest sources ever leak the same real-world game again, the Games
 * list should still show it once. Mirrors public.games_same_event():
 * same sport, different id namespace (sdio-* vs espn-*), start within 3h
 * (MLB 30m), and the same team on at least one side.
 */
type TeamLike = { name?: string | null; market?: string | null } | null | undefined;
export type DedupeGame = {
  id: string;
  sport?: string | null;
  scheduled_at: string;
  status?: string | null;
  updated_at?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team?: TeamLike;
  away_team?: TeamLike;
};

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ns = (id: string) => id.split("-")[0];

function sameSide(aId?: string | null, a?: TeamLike, bId?: string | null, b?: TeamLike): boolean {
  if (aId && bId && aId === bId) return true;
  const an = norm(a?.name);
  return an !== "" && an === norm(b?.name);
}

export function isSameGame(a: DedupeGame, b: DedupeGame): boolean {
  if (a.id === b.id) return true;
  if (ns(a.id) === ns(b.id)) return false;
  if ((a.sport ?? null) !== (b.sport ?? null)) return false;
  const dt = Math.abs(Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  if (!Number.isFinite(dt) || dt > (a.sport === "mlb" ? 30 : 180) * 60_000) return false;
  if (sameSide(a.home_team_id, a.home_team, b.home_team_id, b.home_team)) return true;
  if (sameSide(a.away_team_id, a.away_team, b.away_team_id, b.away_team)) return true;
  const am = norm(a.home_team?.market);
  return am !== "" && am === norm(b.home_team?.market) &&
    norm(a.away_team?.name).slice(0, 4) === norm(b.away_team?.name).slice(0, 4);
}

const STATUS_RANK: Record<string, number> = { inprogress: 3, halftime: 3, closed: 2, complete: 2 };

/** Keep one row per real-world game, preserving input order. Prefers live/final, then most recently updated. */
export function dedupeGames<T extends DedupeGame>(rows: readonly T[]): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    const i = kept.findIndex((k) => isSameGame(k, row));
    if (i === -1) { kept.push(row); continue; }
    const cur = kept[i];
    const rank = (g: T) => STATUS_RANK[g.status ?? ""] ?? 0;
    const better = rank(row) > rank(cur) ||
      (rank(row) === rank(cur) && Date.parse(row.updated_at ?? "") > Date.parse(cur.updated_at ?? ""));
    if (better) kept[i] = row;
  }
  return kept;
}
