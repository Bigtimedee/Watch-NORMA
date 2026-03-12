import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Game, Follow } from "../lib/types";

/** Fetch a single game with team data, with realtime subscription */
export function useGameDetail(gameId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Game | null>({
    queryKey: ["game", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey(*),
          away_team:teams!games_away_team_id_fkey(*)
        `
        )
        .eq("id", gameId)
        .single();

      if (error) throw error;
      return data as Game;
    },
    enabled: !!gameId,
  });

  // Realtime subscription for this specific game
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          queryClient.setQueryData<Game | null>(["game", gameId], (old) =>
            old ? { ...old, ...payload.new } : old
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  return query;
}

/** Check if the current user follows a game */
export function useGameFollow(gameId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Follow | null>({
    queryKey: ["follow", "game", gameId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("follows")
        .select("*")
        .eq("user_id", user.id)
        .eq("game_id", gameId)
        .eq("follow_type", "game")
        .maybeSingle();

      if (error) throw error;
      return data as Follow | null;
    },
    enabled: !!gameId,
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (query.data) {
        // Unfollow
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("id", query.data.id);
        if (error) throw error;
      } else {
        // Follow — populate both legacy and v2 entity columns
        const { error } = await supabase.from("follows").insert({
          user_id: user.id,
          game_id: gameId,
          follow_type: "game",
          entity_type: "game",
          entity_id: gameId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow", "game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["followed-games"] });
    },
  });

  return {
    isFollowing: !!query.data,
    follow: query.data,
    toggleFollow: toggleFollow.mutate,
    isToggling: toggleFollow.isPending,
  };
}
