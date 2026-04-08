// hooks/useMLBStats.ts
// Fetches mlb_game_stats for a specific game.
// Returns null for non-MLB games.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { MLBGameStats } from "../lib/types";

export function useMLBStats(gameId: string | null) {
  return useQuery<MLBGameStats | null>({
    queryKey: ["mlb-stats", gameId],
    queryFn: async () => {
      if (!gameId) return null;

      const { data, error } = await supabase
        .from("mlb_game_stats")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();

      if (error) throw error;
      return (data as MLBGameStats) ?? null;
    },
    enabled: !!gameId,
    // MLB stats update frequently during games — refresh every 60 seconds
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
