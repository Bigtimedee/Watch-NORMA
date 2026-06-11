// morning-briefing: Daily "Tonight's Games" push notification
// Schedule: 6 PM CT = 11 PM UTC (cron: '0 23 * * *')
//
// For each user with a push token and notifications enabled:
//   1. Find today's upcoming games (status = 'scheduled', game_date = today)
//   2. Filter to games the user follows or has open wagers on (max 5)
//   3. Send a "Tonight's Games" push notification listing those games
//
// Respects: quiet_hours, notifications_enabled flag, push token presence

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_GAMES_PER_BRIEFING = 5;

interface Game {
  id: string;
  home_team: string;
  away_team: string;
  scheduled_at: string | null;
  sport: string | null;
}

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
    // 1. Get today's scheduled games (UTC date window)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    const { data: todayGames, error: gamesError } = await supabase
      .from("games")
      .select("id, home_team, away_team, scheduled_at, sport")
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
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: true, message: "No scheduled games today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gameIds = todayGames.map((g: Game) => g.id);

    // 2. Get all users with push tokens
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

    // 3. For each user, determine which of today's games they care about
    for (const profile of profiles as UserProfile[]) {
      try {
        if (!profile.push_token?.startsWith("ExponentPushToken[")) {
          skippedCount++;
          continue;
        }

        // Check quiet hours
        if (isInQuietHours(profile.notification_settings)) {
          skippedCount++;
          continue;
        }

        // Get games user follows (via follows table)
        const { data: follows } = await supabase
          .from("follows")
          .select("entity_id, entity_type, game_id, team_id")
          .eq("user_id", profile.id);

        const followedTeamIds = new Set<string>();
        const followedGameIds = new Set<string>();
        for (const f of follows ?? []) {
          if (f.entity_type === "team" && f.entity_id) followedTeamIds.add(f.entity_id);
          if (f.entity_type === "game" && f.entity_id) followedGameIds.add(f.entity_id);
          if (f.team_id) followedTeamIds.add(f.team_id);
          if (f.game_id) followedGameIds.add(f.game_id);
        }

        // Get games with open wagers
        const { data: wagers } = await supabase
          .from("wagers")
          .select("mapped_entities")
          .eq("user_id", profile.id)
          .eq("status", "active");

        const wageredGameIds = new Set<string>();
        for (const w of wagers ?? []) {
          const entities = w.mapped_entities as { game_ids?: string[] } | null;
          for (const gid of entities?.game_ids ?? []) {
            wageredGameIds.add(gid);
          }
        }

        // Filter today's games to ones the user cares about
        const relevantGames = (todayGames as Game[]).filter((game) => {
          if (followedGameIds.has(game.id)) return true;
          if (wageredGameIds.has(game.id)) return true;
          if (followedTeamIds.has(game.home_team) || followedTeamIds.has(game.away_team)) return true;
          return false;
        });

        if (relevantGames.length === 0) {
          skippedCount++;
          continue;
        }

        const featured = relevantGames.slice(0, MAX_GAMES_PER_BRIEFING);
        const { title, body } = buildBriefingMessage(featured);

        // Send push
        const pushPayload = {
          to: profile.push_token,
          title,
          body,
          data: {
            type: "morning_briefing",
            gameIds: featured.map((g) => g.id),
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
      games_today: todayGames.length,
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        skipped: skippedCount,
        errors: errorCount,
        games_today: todayGames.length,
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

// --- Helpers ---

/**
 * Build the push notification title and body for a briefing.
 */
function buildBriefingMessage(games: Game[]): { title: string; body: string } {
  const title = games.length === 1
    ? "Tonight: 1 game on your list"
    : `Tonight: ${games.length} games on your list`;

  const lines = games.map((g) => {
    const time = g.scheduled_at
      ? formatGameTime(g.scheduled_at)
      : "TBD";
    return `${g.away_team} @ ${g.home_team} (${time})`;
  });

  const body = lines.join("\n");

  return { title, body };
}

/**
 * Format a UTC ISO timestamp to a human-readable ET game time.
 * e.g. "2026-06-11T23:00:00Z" => "7:00 PM ET"
 */
function formatGameTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    // Convert UTC to ET (UTC-4 in EDT, UTC-5 in EST)
    // Use a fixed offset of -4 for summer (EDT) — close enough for sports scheduling
    const etHour = (date.getUTCHours() - 4 + 24) % 24;
    const etMinute = date.getUTCMinutes();
    const period = etHour >= 12 ? "PM" : "AM";
    const hour12 = etHour % 12 || 12;
    const minute = etMinute.toString().padStart(2, "0");
    return `${hour12}:${minute} ${period} ET`;
  } catch {
    return "TBD";
  }
}

/**
 * Check if the current UTC time falls within the user's quiet hours.
 * notification_settings.quiet_hours_start / quiet_hours_end are stored
 * as "HH:MM" strings in local time. We use UTC as an approximation.
 */
function isInQuietHours(settings: Record<string, unknown> | null): boolean {
  if (!settings) return false;
  const start = settings.quiet_hours_start as string | null;
  const end = settings.quiet_hours_end as string | null;
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight quiet hours (e.g., 22:00 – 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}
