import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Connection, PredictionPosition } from "../lib/types";

export function usePolymarketConnection() {
  return useQuery<Connection | null>({
    queryKey: ["connection", "polymarket"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider_key", "polymarket")
        .maybeSingle();

      if (error) throw error;
      return data as Connection | null;
    },
  });
}

export function usePolymarketPositions() {
  return useQuery<PredictionPosition[]>({
    queryKey: ["positions", "polymarket"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("prediction_positions")
        .select("*")
        .eq("user_id", user.id)
        .eq("platform", "polymarket")
        .order("fetched_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PredictionPosition[];
    },
  });
}

export function useConnectPolymarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (walletAddress: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        throw new Error("Invalid Ethereum/Polygon wallet address");
      }

      const { error } = await supabase.from("connections").upsert(
        {
          user_id: user.id,
          provider_type: "sportsbook",
          provider_key: "polymarket",
          provider_name: "Polymarket",
          connected: true,
          metadata: { wallet_address: walletAddress },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider_type,provider_key" }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection", "polymarket"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({
        queryKey: ["positions", "polymarket"],
      });
    },
  });
}

export function useDisconnectPolymarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("connections")
        .update({
          connected: false,
          metadata: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("provider_key", "polymarket");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection", "polymarket"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}
