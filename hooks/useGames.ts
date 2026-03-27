import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Game } from "../lib/types";

/** Get the local calendar date as YYYY-MM-DD (avoids UTC midnight rollover bug) */
function localDateStr(date?: string): string {
  if (date) return date;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fetch today's games with team data, subscribing to realtime updates */
export function useGames(date?: string) {
  const queryClient = useQueryClient();
  const todayStr = localDateStr();
  const today = localDateStr(date);

  const query = useQuery<Game[]>({
    queryKey: ["games", today],
    queryFn: async () => {
      // Use local midnight boundaries converted to UTC for the query range.
      // This ensures "today" means the user's local calendar day.
      const startOfDay = new Date(`${today}T00:00:00`).toISOString();
      const endOfDay = new Date(`${today}T23:59:59`).toISOString();

      const { data, error } = await supabase
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
            queryClient.setQueryData<Game[]>(["games", today], (old) => {
              if (!old) return old;
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
