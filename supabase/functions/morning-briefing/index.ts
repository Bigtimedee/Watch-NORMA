// morning-briefing: Daily push notification with sport-aware editions.
//
// Default cron: 6 AM CT = 11 AM UTC (cron: '0 11 * * *')
//   • Every day:  "Tonight's Games" for games the user follows/wagered (existing behavior)
//   • Saturday:   NCAAF slate edition (if NCAAF games exist today)
//   • Thursday:   NFL Thursday-night edition (if NFL games exist today)
//   • Sunday:     NFL Sunday slate edition (if NFL games exist today)
//
// Edition routing by day-of-week (user's local timezone via profiles.timezone):
//   Saturday  → NCAAF edition injected before the standard tail
//   Thursday  → NFL Thursday edition (replaces standard if user has NFL coverage)
//   Sunday    → NFL Sunday edition (replaces standard if user has NFL coverage)
//   Other     → existing "Tonight's Games" logic unchanged
//
// Personalization order (per edition):
//   1. Games user follows or has wagered on (entity_type=team|game + wagers.mapped_entities)
//   2. Ranked matchups (NCAAF: games where home_rank or away_rank is set)
//   3. Primetime / Thursday-night games (NFL: scheduled_at latest time slot)
//
// Respects: FX1 quiet-hours module (user's local timezone), notifications_enabled,
//   push_token presence. No change to behavior on non-football days.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isInQuietHours as isInQuietHoursShared } from "../_shared/quiet-hours.ts";
import {
  buildEditionMessage,
  localDayOfWeek,
  type Game,
  type DayContext,
} from "./logic.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface UserProfile {
  id: string;
  push_token: string;
  notifications_enabled: boolean;
  timezone: string | null;
  notification_settings: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startedAt = Date.now();
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    // 1. Query today's scheduled games (UTC date window).
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    const { data: todayGames, error: gamesError } = await supabase
      .from("games")
      .select("id, home_team, away_team, scheduled_at, sport, home_rank, away_rank")
      .eq("status", "scheduled")
      .gte("scheduled_at", todayStart.toISOString())
      .lt("scheduled_at", todayEnd.toISOString())
      .order("scheduled_at", { ascending: true });

    if (gamesError) {
      console.error(JSON.stringify({
        function: "morning-briefing",
        event: "games_query_error",
        error: gamesError.message,
      }));
      return new Response(
        JSON.stringify({ error: "Failed to fetch today's games" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!todayGames || todayGames.length === 0) {
      console.log(JSON.stringify({
        function: "morning-briefing",
        event: "no_games_today",
        timestamp: now.toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, message: "No scheduled games today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Compute day context once (sport availability + UTC day-of-week).
    const games = todayGames as Game[];
    const dayCtx: DayContext = {
      hasNcaaf: games.some((g) => g.sport === "ncaaf"),
      hasNfl: games.some((g) => g.sport === "nfl"),
      utcDayOfWeek: now.getUTCDay(),
    };

    // 3. Get all users with push tokens and notifications enabled.
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, push_token, notifications_enabled, timezone, notification_settings")
      .eq("notifications_enabled", true)
      .not("push_token", "is", null);

    if (profilesError || !profiles) {
      console.error(JSON.stringify({
        function: "morning-briefing",
        event: "profiles_query_error",
        error: profilesError?.message ?? "no profiles",
      }));
      return new Response(
        JSON.stringify({ error: "Failed to fetch profiles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. For each user, build and send a briefing.
    for (const profile of profiles as UserProfile[]) {
      try {
        if (!profile.push_token?.startsWith("ExponentPushToken[")) {
          skippedCount++;
          continue;
        }

        // Check quiet hours in the user's own timezone (FX1 fix).
        if (isInQuietHours(profile.notification_settings, profile.timezone ?? null)) {
          skippedCount++;
          continue;
        }

        // Fetch user's follows and open wagers once.
        const { data: followsRows } = await supabase
          .from("follows")
          .select("entity_id, entity_type, game_id, team_id")
          .eq("user_id", profile.id);

        const followedTeamIds = new Set<string>();
        const followedGameIds = new Set<string>();
        for (const f of followsRows ?? []) {
          if (f.entity_type === "team" && f.entity_id) followedTeamIds.add(f.entity_id);
          if (f.entity_type === "game" && f.entity_id) followedGameIds.add(f.entity_id);
          if (f.team_id) followedTeamIds.add(f.team_id);
          if (f.game_id) followedGameIds.add(f.game_id);
        }

        const { data: wagersRows } = await supabase
          .from("wagers")
          .select("mapped_entities")
          .eq("user_id", profile.id)
          .eq("status", "active");

        const wageredGameIds = new Set<string>();
        for (const w of wagersRows ?? []) {
          const entities = w.mapped_entities as { game_ids?: string[] } | null;
          for (const gid of entities?.game_ids ?? []) {
            wageredGameIds.add(gid);
          }
        }

        // Helper: is a game personally relevant to this user?
        const isPersonal = (game: Game): boolean =>
          followedGameIds.has(game.id) ||
          wageredGameIds.has(game.id) ||
          followedTeamIds.has(game.home_team) ||
          followedTeamIds.has(game.away_team);

        // Determine the user's local day-of-week for edition routing.
        const localDay = localDayOfWeek(now, profile.timezone);

        // Build the briefing message based on day + sport context.
        const message = buildEditionMessage(games, dayCtx, localDay, isPersonal);

        if (!message) {
          skippedCount++;
          continue;
        }

        const { title, body, featuredIds } = message;

        // Send push.
        const pushPayload = {
          to: profile.push_token,
          title,
          body,
          data: {
            type: "morning_briefing",
            gameIds: featuredIds,
          },
          sound: "default",
          priority: "normal",
          channelId: "game-alerts",
          ttl: 3600 * 6, // expire after 6 hours if not delivered
        };

        const pushRes = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(pushPayload),
        });

        if (pushRes.ok) {
          sentCount++;
        } else {
          errorCount++;
          const err = await pushRes.text();
          console.warn(JSON.stringify({
            function: "morning-briefing",
            event: "push_failed",
            userId: profile.id,
            error: err.slice(0, 200),
          }));
        }
      } catch (userErr) {
        errorCount++;
        console.error(JSON.stringify({
          function: "morning-briefing",
          event: "user_processing_error",
          userId: profile.id,
          error: (userErr as Error).message,
        }));
      }
    }

    const durationMs = Date.now() - startedAt;

    console.log(JSON.stringify({
      function: "morning-briefing",
      event: "completed",
      total_users: (profiles as UserProfile[]).length,
      games_today: games.length,
      day_context: dayCtx,
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      duration_ms: durationMs,
      timestamp: now.toISOString(),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        skipped: skippedCount,
        errors: errorCount,
        games_today: games.length,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(JSON.stringify({
      function: "morning-briefing",
      event: "fatal_error",
      error: (err as Error).message,
      duration_ms: Date.now() - startedAt,
    }));
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Quiet-hours check delegates to the shared _shared/quiet-hours.ts helper so
// morning-briefing and evaluate-alerts stay in lock step (2026-08-20 audit item B).
function isInQuietHours(
  settings: Record<string, unknown> | null,
  timezone: string | null,
): boolean {
  return isInQuietHoursShared(
    settings as Parameters<typeof isInQuietHoursShared>[0],
    timezone,
  );
}
