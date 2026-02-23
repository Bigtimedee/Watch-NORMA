import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Wager, WagerType } from "../lib/types";
import { parseWagerTarget } from "../lib/wager-target-parser";
import type { WagerTarget } from "../lib/wager-target-parser";

export function useWagers(gameId?: string) {
  return useQuery<Wager[]>({
    queryKey: ["wagers", gameId ?? "all"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from("wagers")
        .select(
          `
          *,
          game:games(
            *,
            home_team:teams!games_home_team_id_fkey(*),
            away_team:teams!games_away_team_id_fkey(*)
          )
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (gameId) {
        query = query.eq("game_id", gameId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Wager[];
    },
  });
}

export function useAddWager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (wager: {
      game_id: string;
      sportsbook: string;
      wager_type: WagerType;
      description: string;
      team_id?: string;
      line?: number;
      odds?: string;
      // v2 fields
      market_type?: string;
      stake?: number;
      potential_payout?: number;
      legs?: Array<{ game_id: string; team_id?: string; market_type: string; line?: number; odds?: string; description: string }>;
      source?: string;
      // v3: pre-parsed target (from structured fields in AddWagerSheet)
      parsed_target?: WagerTarget | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Compute parsed_target: use provided value, or parse from description
      const parsed_target = wager.parsed_target !== undefined
        ? wager.parsed_target
        : parseWagerTarget(wager.description);

      const { parsed_target: _omit, ...wagerFields } = wager;

      const { error } = await supabase.from("wagers").insert({
        user_id: user.id,
        ...wagerFields,
        parsed_target,
        status: "active",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wagers"] });
    },
  });
}

export function useWagerStats() {
  return useQuery({
    queryKey: ["wager-stats"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { wins: 0, losses: 0, pushes: 0, active: 0, total: 0 };

      const { data, error } = await supabase
        .from("wagers")
        .select("status")
        .eq("user_id", user.id);

      if (error) throw error;

      const wagers = data ?? [];
      return {
        wins: wagers.filter((w) => w.status === "won").length,
        losses: wagers.filter((w) => w.status === "lost").length,
        pushes: wagers.filter((w) => w.status === "push").length,
        active: wagers.filter((w) => w.status === "active").length,
        total: wagers.length,
      };
    },
  });
}
