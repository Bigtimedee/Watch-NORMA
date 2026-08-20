import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Game, SportKey } from "../lib/types";

/** Get the Eastern-timezone calendar date as YYYY-MM-DD (matches DatePicker's Eastern-based today) */
function localDateStr(date?: string): string {
  if (date) return date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * UTC offset for America/New_York at `at`, formatted "+HH:MM" / "-HH:MM".
 *
 * Hermes (React Native's JS engine) does not parse locale-formatted date
 * strings such as "8/20/2026, 9:04:21 PM" — `new Date(thatString)` returns
 * NaN, where V8 (Node, Jest, web) parses it fine. A previous implementation
 * diffed two such strings, so on device the offset became "+NaN:00",
 * `new Date(...).toISOString()` threw RangeError, every games query rejected,
 * and the screen showed "No games scheduled today" for every sport.
 *
 * Only ISO-8601 strings are handed to the Date parser here, which every engine
 * is required to accept. `formatToParts` itself is already proven on device —
 * `localDateStr` above uses it for the header date.
 */
export function easternUtcOffset(at: Date = new Date()): string {
  const isoIn = (timeZone: string): string => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // Some engines emit "24" rather than "00" for midnight under hour12:false.
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`;
  };

  const diffMin = Math.round(
    (Date.parse(isoIn("America/New_York")) - Date.parse(isoIn("UTC"))) / 60000
  );
  // Never propagate NaN into a date string: fall back to EST rather than throw.
  if (!Number.isFinite(diffMin)) return "-05:00";

  const sign = diffMin < 0 ? "-" : "+";
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** Fetch today's games with team data, subscribing to realtime updates */
export function useGames(date?: string, sport?: SportKey) {
  const queryClient = useQueryClient();
  const todayStr = localDateStr();
  const today = localDateStr(date);

  const query = useQuery<Game[]>({
    queryKey: ["games", today, sport ?? "all"],
    queryFn: async () => {
      // Anchor boundaries to Eastern timezone so the query always matches
      // the Eastern calendar day regardless of the user's device timezone.
      // Use Intl to resolve the correct UTC offset (EST = -05:00, EDT = -04:00).
      const nyOffset = easternUtcOffset();
      const startOfDay = new Date(`${today}T00:00:00${nyOffset}`).toISOString();
      const endOfDay = new Date(`${today}T23:59:59${nyOffset}`).toISOString();

      let query = supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey(*),
          away_team:teams!games_away_team_id_fkey(*)
        `
        )
        .gte("scheduled_at", startOfDay)
        .lte("scheduled_at", endOfDay)
        .not("status", "in", "(cancelled,postponed)")
        .order("scheduled_at", { ascending: true });

      // Filter by sport when provided
      if (sport) {
        query = query.eq("sport", sport);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as Game[];
    },
    // Poll frequently for today's live games; future dates only need occasional refreshes
    refetchInterval: date === todayStr ? 30_000 : 5 * 60 * 1000,
  });

  // Subscribe to realtime game updates — only for today's games
  useEffect(() => {
    if (date === todayStr || !date) {
      const channel = supabase
        .channel("games-realtime")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "games" },
          (payload) => {
            queryClient.setQueryData<Game[]>(["games", today, sport ?? "all"], (old) => {
              if (!old) return old;
              // Only update games that match the current sport filter
              if (sport && payload.new.sport && payload.new.sport !== sport) return old;
              return old.map((g) =>
                g.id === payload.new.id ? { ...g, ...payload.new } : g
              );
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [today, todayStr, date, queryClient]);

  return query;
}

/** Fetch only followed games for the current user */
export function useFollowedGames() {
  return useQuery<Game[]>({
    queryKey: ["followed-games"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      // Get followed game IDs
      const { data: follows, error: followsError } = await supabase
        .from("follows")
        .select("game_id")
        .eq("user_id", user.id)
        .eq("follow_type", "game")
        .not("game_id", "is", null);

      if (followsError) throw followsError;
      if (!follows || follows.length === 0) return [];

      const gameIds = follows.map((f) => f.game_id).filter(Boolean);

      // Get followed team IDs
      const { data: teamFollows } = await supabase
        .from("follows")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("follow_type", "team")
        .not("team_id", "is", null);

      const teamIds = (teamFollows ?? []).map((f) => f.team_id).filter(Boolean);

      // Get games for followed games + games involving followed teams
      let query = supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey(*),
          away_team:teams!games_away_team_id_fkey(*)
        `
        )
        .order("scheduled_at", { ascending: true });

      if (teamIds.length > 0) {
        query = query.or(
          `id.in.(${gameIds.join(",")}),home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`
        );
      } else {
        query = query.in("id", gameIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Game[];
    },
    refetchInterval: 30_000,
  });
}
