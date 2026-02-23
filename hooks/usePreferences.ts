import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { UserPreferences } from "../lib/types";

const DEFAULT_NOTIFICATION_SETTINGS = {
  quiet_hours_start: null,
  quiet_hours_end: null,
  max_alerts_per_game: 5,
  max_alerts_per_hour: 10,
  channels: { push: true, in_app: true },
};

/** Fetch the current user's preferences (auto-creates row if missing) */
export function usePreferences() {
  return useQuery<UserPreferences>({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // Auto-create if missing (e.g., existing user before migration)
      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from("user_preferences")
          .insert({ user_id: user.id })
          .select()
          .single();

        if (insertErr) throw insertErr;
        return created as UserPreferences;
      }

      return data as UserPreferences;
    },
  });
}

/** Update user preferences */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          UserPreferences,
          "favorite_teams" | "favorite_players" | "notification_settings"
        >
      >
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_preferences")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
    },
  });
}

/** Fetch all teams for the favorite teams picker */
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, market, abbreviation, conference, logo_url")
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000, // Teams rarely change
  });
}
