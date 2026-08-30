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

      // Auto-create if missing (e.g., existing user before migration).
      // Use upsert with onConflict to avoid race conditions when two sessions
      // attempt to create the same row simultaneously.
      if (!data) {
        const { data: created, error: upsertErr } = await supabase
          .from("user_preferences")
          .upsert({ user_id: user.id }, { onConflict: "user_id" })
          .select()
          .single();

        if (upsertErr) throw upsertErr;
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

      // KL-2: Convert favorite_teams into follows rows so the UI promise
      // ("drives your alerts") becomes real behavior. Each team in favorite_teams
      // gets an upserted follows row with entity_type='team' and entity_id=team_id.
      // Existing follows are preserved (ON CONFLICT DO NOTHING via upsert ignore).
      if (updates.favorite_teams && Array.isArray(updates.favorite_teams)) {
        const followRows = (updates.favorite_teams as Array<{ team_id: string }>)
          .filter((t) => t?.team_id)
          .map((t) => ({
            user_id: user.id,
            entity_type: "team",
            entity_id: t.team_id,
            // follow_type kept for backward-compat with 1.4.0 client
            follow_type: "team",
            team_id: t.team_id,
          }));

        if (followRows.length > 0) {
          const { error: followsError } = await supabase
            .from("follows")
            .upsert(followRows, { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: true });

          if (followsError) {
            // Non-fatal: log and continue — preferences are saved, follows sync failed
            console.warn("[useUpdatePreferences] follows upsert failed:", followsError.message);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
      queryClient.invalidateQueries({ queryKey: ["follows"] });
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
