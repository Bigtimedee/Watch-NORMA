import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "../lib/analytics";
import { supabase } from "../lib/supabase";

export type FollowEntityType = "team" | "player" | "game";

export interface FollowEntity {
  id: number;
  user_id: string;
  follow_type: FollowEntityType;
  entity_type: FollowEntityType;
  entity_id: string;
  game_id: string | null;
  team_id: string | null;
  /** Origin of this follow. 'fantasy' = imported from a fantasy roster. */
  source: string | null;
  /** Platform key when source=fantasy (prizepicks, underdog, sleeper, …). */
  fantasy_source: string | null;
  created_at: string;
}

/** Fetch all follows for the current user, optionally filtered by entity type */
export function useFollows(entityType?: FollowEntityType) {
  return useQuery<FollowEntity[]>({
    queryKey: ["follows", entityType ?? "all"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from("follows")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (entityType) {
        query = query.eq("entity_type", entityType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FollowEntity[];
    },
  });
}

/** Check if the current user follows a specific entity */
export function useIsFollowing(entityType: FollowEntityType, entityId: string) {
  return useQuery<FollowEntity | null>({
    queryKey: ["follow", entityType, entityId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("follows")
        .select("*")
        .eq("user_id", user.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();

      if (error) throw error;
      return data as FollowEntity | null;
    },
    enabled: !!entityId,
  });
}

/** Follow an entity (team, player, or game) */
export function useAddFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      source,
    }: {
      entityType: FollowEntityType;
      entityId: string;
      /** Optional origin tag, e.g. 'fantasy' for roster imports */
      source?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const row: Record<string, unknown> = {
        user_id: user.id,
        follow_type: entityType,
        entity_type: entityType,
        entity_id: entityId,
        source: source ?? null,
      };

      // Populate legacy columns for backward compat
      if (entityType === "game") row.game_id = entityId;
      if (entityType === "team") row.team_id = entityId;

      const { error } = await supabase.from("follows").insert(row);
      if (error) throw error;
    },
    onSuccess: (_, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["follow", entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ["followed-games"] });
      trackEvent("first_team_followed", { entity_type: entityType });
    },
  });
}

/** Unfollow an entity */
export function useRemoveFollow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
    }: {
      entityType: FollowEntityType;
      entityId: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("user_id", user.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw error;
    },
    onSuccess: (_, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["follow", entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ["followed-games"] });
    },
  });
}

/** Convenience hook: toggle follow state for an entity */
export function useToggleFollow(entityType: FollowEntityType, entityId: string) {
  const { data: existing, isLoading } = useIsFollowing(entityType, entityId);
  const addFollow = useAddFollow();
  const removeFollow = useRemoveFollow();

  const isFollowing = !!existing;
  const isPending = addFollow.isPending || removeFollow.isPending;

  const toggle = () => {
    if (isFollowing) {
      removeFollow.mutate({ entityType, entityId });
    } else {
      addFollow.mutate({ entityType, entityId });
    }
  };

  return { isFollowing, toggle, isPending, isLoading };
}
