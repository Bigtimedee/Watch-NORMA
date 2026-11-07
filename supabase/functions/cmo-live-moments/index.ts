// =============================================================================
// NORMA growth plan — cmo-live-moments Edge Function (2026-11-07)
//
// Producer for two ADDITIVE social formats. It only ever INSERTS
// content_calendar rows; cmo-publish (unchanged contract: guards, atomic claim,
// at-most-once) does all posting. Existing 3/day scheduled posts are untouched.
//
//   POST {"mode":"live"}          Live Moments. pg_cron every minute, only while
//                                 an NFL/NCAAF/NBA/NCAAM game is in progress.
//   POST {"mode":"todays_games"}  Today's Games. pg_cron once each morning.
//   + "dry_run": true             classify + compose only; no writes, no publish
//                                 kick. "as_of" (ISO) honoured only in dry runs.
//
// Idempotency: social_live_moments.moment_key is UNIQUE
//   live_moment:<game_id>:<overtime|two_minute|close_finish>
//   todays_games:<ET date>
// The ledger row is inserted first; a duplicate key means another run already
// owns that moment, so nothing is written twice.
//
// Rate caps (LIVE_MOMENT_HOURLY_CAP): 3/h on X, 1/h on IG, FB, TikTok. A
// moment that misses the cap is recorded as rate_capped and never posted
// later (it would be stale).
//
// After inserting a row, the function kicks cmo-publish by forwarding the
// caller's Authorization header (the pg_cron vault Bearer) so the post goes
// out within seconds instead of on the next 5-minute cron. Tokens are never
// logged.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  buildLiveMomentText,
  buildPlatformCaptions,
  buildTodaysGames,
  etDayBounds,
  isDemoGame,
  isNationallyRelevant,
  LIVE_MOMENT_SPORTS,
  type LmGame,
  type LmTeam,
  type MomentCandidate,
  parseLmRunOptions,
  planLiveMoments,
  todaysGamesKey,
} from "./logic.ts";
import { copyGuardFlag, guardCopyForPlatform } from "../_shared/social-copy-guard.ts";
import {
  CONTENT_TYPE_LIVE_MOMENT,
  CONTENT_TYPE_TODAYS_GAMES,
  LIVE_MOMENT_HOURLY_CAP,
  TEXT_FORMAT_PLATFORMS,
} from "../_shared/social-formats.ts";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, "public", any>;

const JSON_HEADERS = { "Content-Type": "application/json" };
const GAME_COLS =
  "id,sport,status,clock,period,home_score,away_score,broadcast,scheduled_at,home_rank,away_rank,espn_id,home_team_id,away_team_id";

interface GameRow {
  id: string;
  sport: string | null;
  status: string;
  clock: string | null;
  period: number | null;
  home_score: number | null;
  away_score: number | null;
  broadcast: string | null;
  scheduled_at: string;
  home_rank: number | null;
  away_rank: number | null;
  espn_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ function: "cmo-live-moments", event, ...data, timestamp: new Date().toISOString() }));
}

async function attachTeams(db: Db, rows: GameRow[]): Promise<LmGame[]> {
  const ids = [...new Set(rows.flatMap((g) => [g.home_team_id, g.away_team_id]).filter(Boolean) as string[])];
  const map = new Map<string, LmTeam>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from("teams").select("id,name,abbreviation,slug").in("id", ids.slice(i, i + 300));
    if (error) throw new Error(`teams: ${error.message}`);
    for (const t of (data ?? []) as Array<LmTeam & { id: string }>) {
      map.set(t.id, { name: t.name, abbreviation: t.abbreviation, slug: t.slug });
    }
  }
  return rows.map((g) => ({
    id: g.id,
    sport: g.sport,
    status: g.status,
    clock: g.clock,
    period: g.period,
    home_score: g.home_score,
    away_score: g.away_score,
    broadcast: g.broadcast,
    scheduled_at: g.scheduled_at,
    home_rank: g.home_rank,
    away_rank: g.away_rank,
    espn_id: g.espn_id ?? (g.id.match(/^espn-(?:[a-z]+-)?(\d+)$/)?.[1] ?? null),
    home: g.home_team_id ? map.get(g.home_team_id) ?? null : null,
    away: g.away_team_id ? map.get(g.away_team_id) ?? null : null,
  }));
}

/** Stream names for a game from game_watch_links -> streaming_providers.name. Empty when unknown (never guessed). */
async function streamNames(db: Db, espnId: string | null | undefined): Promise<string[]> {
  if (!espnId) return [];
  const { data, error } = await db.from("game_watch_links").select("provider_key").eq("espn_event_id", espnId);
  if (error || !data?.length) return [];
  const keys = [...new Set((data as Array<{ provider_key: string }>).map((r) => r.provider_key))];
  const { data: provs } = await db.from("streaming_providers").select("key,name").in("key", keys);
  const names = new Map(((provs ?? []) as Array<{ key: string; name: string }>).map((p) => [p.key, p.name]));
  return keys.map((k) => names.get(k)).filter((n): n is string => !!n);
}

async function existingKeys(db: Db, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { data, error } = await db.from("social_live_moments").select("moment_key").in("moment_key", keys);
  if (error) throw new Error(`social_live_moments: ${error.message}`);
  return new Set(((data ?? []) as Array<{ moment_key: string }>).map((r) => r.moment_key));
}

/** Live Moment rows per text platform created in the last rolling hour (held/failed rows excluded). */
async function recentLiveCounts(db: Db, now: Date): Promise<Record<string, number>> {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const out: Record<string, number> = {};
  for (const p of TEXT_FORMAT_PLATFORMS) {
    const { count, error } = await db
      .from("content_calendar")
      .select("id", { count: "exact", head: true })
      .eq("platform", p)
      .eq("content_type", CONTENT_TYPE_LIVE_MOMENT)
      .in("status", ["draft", "scheduled", "publishing", "published"])
      .gte("created_at", since);
    if (error) throw new Error(`content_calendar count: ${error.message}`);
    out[p] = count ?? 0;
  }
  return out;
}

/**
 * Claim a moment key. Returns the ledger id, or null when another run already
 * holds it (unique violation 23505).
 */
async function claimMoment(
  db: Db,
  row: { moment_key: string; kind: string; game_id?: string | null; sport?: string | null; moment_type?: string | null; outcome: string; detail?: unknown },
): Promise<number | null> {
  const { data, error } = await db.from("social_live_moments").insert(row).select("id").maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw new Error(`social_live_moments insert: ${error.message}`);
  }
  return (data as { id: number } | null)?.id ?? null;
}

async function insertCalendarRows(
  db: Db,
  ledgerId: number,
  rows: Array<Record<string, unknown>>,
): Promise<string[]> {
  const { data, error } = await db.from("content_calendar").insert(rows).select("id");
  if (error) {
    await db.from("social_live_moments").update({ outcome: "insert_failed", detail: { error: error.message } }).eq("id", ledgerId);
    throw new Error(`content_calendar insert: ${error.message}`);
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  await db.from("social_live_moments").update({ content_calendar_id: ids[0] ?? null }).eq("id", ledgerId);
  return ids;
}

/** Kick cmo-publish now, forwarding the inbound Authorization (pg_cron vault Bearer). Never throws. */
async function kickPublish(supabaseUrl: string, auth: string | null): Promise<string> {
  if (!auth) return "no_auth_header";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45_000);
    const r = await fetch(`${supabaseUrl}/functions/v1/cmo-publish`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "cmo-live-moments" }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    await r.body?.cancel();
    return `status_${r.status}`;
  } catch (e) {
    return `error: ${e instanceof Error ? e.name : "unknown"}`;
  }
}

function calendarRow(
  contentType: string,
  platform: string,
  body: string,
  captions: Record<string, string>,
  key: string,
  gameId: string | null,
  now: Date,
  note: string,
): Record<string, unknown> {
  return {
    platform,
    content_type: contentType,
    body,
    media_urls: [],
    hashtags: [],
    status: "scheduled",
    scheduled_for: now.toISOString(),
    generation_prompt: `${contentType}:${key}`,
    human_notes: note,
    platform_captions: Object.keys(captions).length ? captions : null,
    game_id: gameId,
    moment_key: key,
  };
}

// ---------------------------------------------------------------------------
// Live Moments
// ---------------------------------------------------------------------------

async function runLive(db: Db, now: Date, dryRun: boolean) {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLS)
    .eq("status", "inprogress")
    .in("sport", [...LIVE_MOMENT_SPORTS])
    .not("id", "like", "demo-%");
  if (error) throw new Error(`games: ${error.message}`);
  const games = (await attachTeams(db, (data ?? []) as GameRow[])).filter((g) => !isDemoGame(g.id));
  const relevant = games.filter(isNationallyRelevant);

  const allKeys = relevant.flatMap((g) =>
    ["overtime", "two_minute", "close_finish"].map((t) => `live_moment:${g.id}:${t}`)
  );
  const already = await existingKeys(db, allKeys);
  const recent = await recentLiveCounts(db, now);
  const plan = planLiveMoments(games, already, recent, LIVE_MOMENT_HOURLY_CAP, TEXT_FORMAT_PLATFORMS);

  const queued: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const c of plan.capped) {
    skipped.push({ key: c.key, reason: "rate_capped" });
    if (!dryRun) {
      await claimMoment(db, {
        moment_key: c.key, kind: CONTENT_TYPE_LIVE_MOMENT, game_id: c.game.id, sport: c.game.sport,
        moment_type: c.moment.type, outcome: "rate_capped", detail: { recent, budget: plan.budget },
      });
    }
  }

  for (const c of plan.queue) {
    const r = await composeAndQueue(db, c, now, dryRun);
    (r.queued ? queued : skipped).push(r.info);
  }

  return {
    live_games: games.length,
    nationally_relevant: relevant.length,
    budget: plan.budget,
    recent_last_hour: recent,
    queued,
    skipped,
  };
}

async function composeAndQueue(db: Db, c: MomentCandidate, now: Date, dryRun: boolean) {
  const streams = await streamNames(db, c.game.espn_id);
  const xText = buildLiveMomentText(c.game, c.moment.type, "twitter", { streams });
  const base = { key: c.key, game_id: c.game.id, sport: c.game.sport, moment: c.moment.type, source: c.moment.source };
  if (!xText) {
    if (!dryRun) {
      await claimMoment(db, { moment_key: c.key, kind: CONTENT_TYPE_LIVE_MOMENT, game_id: c.game.id, sport: c.game.sport, moment_type: c.moment.type, outcome: "skipped", detail: { reason: "no_game_page" } });
    }
    return { queued: false, info: { ...base, reason: "no_game_page (missing team slug or broadcast)" } };
  }
  const xGuard = guardCopyForPlatform("twitter", xText);
  if (!xGuard.ok) {
    if (!dryRun) {
      await claimMoment(db, { moment_key: c.key, kind: CONTENT_TYPE_LIVE_MOMENT, game_id: c.game.id, sport: c.game.sport, moment_type: c.moment.type, outcome: "guard_blocked", detail: { flag: copyGuardFlag(xGuard) } });
    }
    return { queued: false, info: { ...base, reason: copyGuardFlag(xGuard) } };
  }
  const { captions, blocked } = buildPlatformCaptions((p) => buildLiveMomentText(c.game, c.moment.type, p, { streams }));
  if (dryRun) return { queued: true, info: { ...base, would: "queue", text: xText, captions, blocked } };

  const ledgerId = await claimMoment(db, {
    moment_key: c.key, kind: CONTENT_TYPE_LIVE_MOMENT, game_id: c.game.id, sport: c.game.sport,
    moment_type: c.moment.type, outcome: "queued", detail: { source: c.moment.source },
  });
  if (ledgerId == null) return { queued: false, info: { ...base, reason: "claimed_elsewhere" } };
  const rows = TEXT_FORMAT_PLATFORMS.map((p) =>
    calendarRow(CONTENT_TYPE_LIVE_MOMENT, p, xText, captions, c.key, c.game.id, now,
      `[cmo-live-moments] ${c.moment.type} (${c.moment.source}); X text-only growth-plan format.`)
  );
  const ids = await insertCalendarRows(db, ledgerId, rows);
  return { queued: true, info: { ...base, content_calendar_ids: ids } };
}

// ---------------------------------------------------------------------------
// Today's Games
// ---------------------------------------------------------------------------

async function runTodaysGames(db: Db, now: Date, dryRun: boolean) {
  const { from, to, day } = etDayBounds(now);
  const key = todaysGamesKey(day);
  if ((await existingKeys(db, [key])).has(key)) return { key, skipped: "already_posted_today" };

  const { data, error } = await db
    .from("games")
    .select(GAME_COLS)
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", to.toISOString())
    .in("sport", [...LIVE_MOMENT_SPORTS])
    .not("broadcast", "is", null)
    .neq("broadcast", "")
    .not("id", "like", "demo-%");
  if (error) throw new Error(`games: ${error.message}`);
  const games = await attachTeams(db, (data ?? []) as GameRow[]);
  const plan = buildTodaysGames(games, now, "twitter");
  if (!plan) {
    if (!dryRun) await claimMoment(db, { moment_key: key, kind: CONTENT_TYPE_TODAYS_GAMES, outcome: "no_games" });
    return { key, skipped: "no_games", candidates: games.length };
  }
  const xGuard = guardCopyForPlatform("twitter", plan.text);
  if (!xGuard.ok) {
    if (!dryRun) await claimMoment(db, { moment_key: key, kind: CONTENT_TYPE_TODAYS_GAMES, sport: plan.sport, outcome: "guard_blocked", detail: { flag: copyGuardFlag(xGuard) } });
    return { key, skipped: copyGuardFlag(xGuard) };
  }
  const { captions, blocked } = buildPlatformCaptions((p) => buildTodaysGames(games, now, p)?.text ?? null);
  const summary = { key, sport: plan.sport, games: plan.games.map((g) => g.id), text: plan.text, captions, blocked };
  if (dryRun) return { ...summary, would: "queue" };

  const ledgerId = await claimMoment(db, { moment_key: key, kind: CONTENT_TYPE_TODAYS_GAMES, sport: plan.sport, outcome: "queued", detail: { games: plan.games.map((g) => g.id) } });
  if (ledgerId == null) return { key, skipped: "claimed_elsewhere" };
  const rows = TEXT_FORMAT_PLATFORMS.map((p) =>
    calendarRow(CONTENT_TYPE_TODAYS_GAMES, p, plan.text, captions, key, null, now,
      `[cmo-live-moments] Today's Games (${plan.sport}); X text-only growth-plan format.`)
  );
  const ids = await insertCalendarRows(db, ledgerId, rows);
  return { ...summary, content_calendar_ids: ids };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", function: "cmo-live-moments" }), { status: 200, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers: JSON_HEADERS });
  }

  let payload: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.trim()) payload = JSON.parse(t);
  } catch { /* ignore malformed body */ }

  const now = new Date();
  const opts = parseLmRunOptions(payload, now);
  const db = createClient(supabaseUrl, serviceKey) as Db;
  const started = Date.now();

  try {
    const result = opts.mode === "todays_games"
      ? await runTodaysGames(db, opts.asOf, opts.dryRun)
      : await runLive(db, opts.asOf, opts.dryRun);

    const queuedSomething = opts.mode === "todays_games"
      ? Array.isArray((result as { content_calendar_ids?: string[] }).content_calendar_ids)
      : ((result as { queued: unknown[] }).queued?.length ?? 0) > 0;
    const publish = !opts.dryRun && queuedSomething
      ? await kickPublish(supabaseUrl, req.headers.get("Authorization"))
      : "not_needed";

    log("completed", {
      mode: opts.mode,
      dry_run: opts.dryRun,
      publish_kick: publish,
      duration_ms: Date.now() - started,
    });
    return new Response(
      JSON.stringify({ success: true, mode: opts.mode, dry_run: opts.dryRun, as_of: opts.asOf.toISOString(), publish_kick: publish, ...result }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", { mode: opts.mode, error: msg });
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: JSON_HEADERS });
  }
});
