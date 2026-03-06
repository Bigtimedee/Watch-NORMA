// Issues fixed:
// #5  — useToggleAgent.toggle now uses onError callback so errors are not silently swallowed
// #12 — useToggleAgent resets status: "idle" when deactivating, so status dot shows gray immediately
//       Also exposes `config` so callers don't need to call useAgentConfig separately (fixes #6)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { AgentConfig, AgentAlert, PredictionPosition } from "../lib/types";

// --- Agent Config ---

export function useAgentConfig() {
  return useQuery<AgentConfig | null>({
    queryKey: ["agent-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("agent_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as AgentConfig | null;
    },
    staleTime: 10_000,
  });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AgentConfig>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("agent_config")
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-config"] });
    },
  });
}

// Convenience: toggle agent on/off — creates row if it doesn't exist.
// Fixed: exposes `config` so callers don't need a second useAgentConfig call.
// Fixed: resets status to "idle" when deactivating.
// Fixed: logs errors rather than swallowing them silently.
export function useToggleAgent() {
  const { data: config } = useAgentConfig();
  const update = useUpdateAgentConfig();
  const currentlyActive = config?.is_active ?? false;

  return {
    isActive: currentlyActive,
    config,
    toggle: () => {
      const turningOff = currentlyActive;
      update.mutate(
        {
          is_active: !currentlyActive,
          // Reset status to "idle" when deactivating so status dots show gray immediately
          ...(turningOff ? { status: "idle" as const } : {}),
        },
        {
          onError: (err) => {
            console.warn("Agent toggle failed:", (err as Error).message);
          },
        }
      );
    },
    isPending: update.isPending,
  };
}

// --- Agent Alerts ---

export function useAgentAlerts(limit = 20) {
  return useQuery<AgentAlert[]>({
    queryKey: ["agent-alerts", limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("agent_alerts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as AgentAlert[];
    },
    staleTime: 15_000,
  });
}

// --- Open Positions (merged Kalshi + Polymarket) ---

export function useAgentPositions() {
  return useQuery<PredictionPosition[]>({
    queryKey: ["agent-positions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("prediction_positions")
        .select("*")
        .eq("user_id", user.id)
        .eq("settled", false)
        .order("fetched_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PredictionPosition[];
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
