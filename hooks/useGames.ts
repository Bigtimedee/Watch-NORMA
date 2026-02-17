import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Game } from "../lib/types";

/** Fetch today's games with team data, subscribing to realtime updates */
export function useGames(date?: string) {
  const queryClient = useQueryClient();
  const today = date ?? new Date().toISOString().split("T")[0];

  const query = useQuery<Game[]>({
    queryKey: ["games", today],
    queryFn: async () => {
      const startOfDay = `${today}T00:00:00Z`;
      const endOfDay = `${today}T23:59:59Z`;

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
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Game[];
    },
    refetchInterval: 30_000, // fallback poll every 30s
  });

  // Subscribe to realtime game updates
  useEffect(() => {
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
  }, [today, queryClient]);

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
