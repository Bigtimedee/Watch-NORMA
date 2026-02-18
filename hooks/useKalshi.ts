import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Connection, PredictionPosition } from "../lib/types";

export function useKalshiConnection() {
  return useQuery<Connection | null>({
    queryKey: ["connection", "kalshi"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider_key", "kalshi")
        .maybeSingle();

      if (error) throw error;
      return data as Connection | null;
    },
  });
}

export function useKalshiPositions() {
  return useQuery<PredictionPosition[]>({
    queryKey: ["positions", "kalshi"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("prediction_positions")
        .select("*")
        .eq("user_id", user.id)
        .eq("platform", "kalshi")
        .order("fetched_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PredictionPosition[];
    },
  });
}

export function useConnectKalshi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      apiKeyId,
      privateKey,
    }: {
      apiKeyId: string;
      privateKey: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: session } = await supabase.auth.getSession();

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/kalshi-proxy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ action: "connect", apiKeyId, privateKey }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to connect to Kalshi");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection", "kalshi"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["positions", "kalshi"] });
    },
  });
}

export function useDisconnectKalshi() {
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
        .eq("provider_key", "kalshi");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection", "kalshi"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}
