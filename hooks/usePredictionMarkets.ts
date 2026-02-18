import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { PredictionPosition } from "../lib/types";

export function usePredictionMarkets(gameId: string) {
  return useQuery<PredictionPosition[]>({
    queryKey: ["prediction-markets", gameId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("prediction_positions")
        .select("*")
        .eq("user_id", user.id)
        .eq("game_id", gameId)
        .order("platform");

      if (error) throw error;
      return (data ?? []) as PredictionPosition[];
    },
    enabled: !!gameId,
  });
}
