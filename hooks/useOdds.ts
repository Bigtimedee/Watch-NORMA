import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { GameOdds } from "../lib/types";

export function useOdds(gameId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<GameOdds[]>({
    queryKey: ["odds", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_odds")
        .select("*")
        .eq("game_id", gameId)
        .order("sportsbook");

      if (error) throw error;
      return (data ?? []) as GameOdds[];
    },
    enabled: !!gameId,
  });

  // Subscribe to realtime odds updates
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`odds-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_odds",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["odds", gameId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  // Group odds by sportsbook
  const oddsBySportsbook = (query.data ?? []).reduce(
    (acc, odd) => {
      if (!acc[odd.sportsbook]) acc[odd.sportsbook] = [];
      acc[odd.sportsbook].push(odd);
      return acc;
    },
    {} as Record<string, GameOdds[]>
  );

  return { ...query, oddsBySportsbook };
}
