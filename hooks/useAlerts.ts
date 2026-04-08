import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Alert, SportKey } from "../lib/types";
import { sortAlerts } from "../lib/alert-helpers";

/** Fetch user's alerts with realtime subscription for new alerts.
 *  Pass sport to filter to a specific sport; omit for all alerts. */
export function useAlerts(sport?: SportKey) {
  const queryClient = useQueryClient();

  const query = useQuery<Alert[]>({
    queryKey: ["alerts", sport ?? "all"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      let q = supabase
        .from("alerts")
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
        .order("created_at", { ascending: false })
        .limit(100);

      if (sport) {
        q = q.eq("sport", sport);
      }

      const { data, error } = await q;
      if (error) throw error;
      return sortAlerts((data ?? []) as Alert[]);
    },
  });

  // Subscribe to new alerts for this user
  useEffect(() => {
    let userId: string | undefined;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      userId = user.id;

      const channel = supabase
        .channel("alerts-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "alerts",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, [queryClient]);

  return query;
}

/** Mark an alert as read */
export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: number) => {
      const { error } = await supabase
        .from("alerts")
        .update({ read: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

/** Get unread alert count */
export function useUnreadAlertCount() {
  return useQuery<number>({
    queryKey: ["alerts", "unread-count"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;

      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
}
