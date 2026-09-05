import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Alert, SportKey } from "../lib/types";
import { sortAlerts } from "../lib/alert-helpers";
import {
  ALERTS_QUERY_ROOT,
  alertsQueryKey,
  applyConsumerAlertFilter,
  excludeDemoAlerts,
} from "../lib/demo-guard";

/** Fetch user's alerts with realtime subscription for new alerts.
 *  Pass sport to filter to a specific sport; omit for all alerts. */
export function useAlerts(sport?: SportKey) {
  const queryClient = useQueryClient();

  const query = useQuery<Alert[]>({
    queryKey: alertsQueryKey(sport ?? "all"),
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

      q = applyConsumerAlertFilter(q);

      const { data, error } = await q;
      if (error) throw error;
      return sortAlerts(excludeDemoAlerts((data ?? []) as Alert[]));
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
            queryClient.invalidateQueries({ queryKey: [ALERTS_QUERY_ROOT] });
          }
        )
        .on("system", {}, (payload) => {
          if (payload.status === "CLOSED") {
            console.warn("[useAlerts] Realtime connection closed");
            queryClient.invalidateQueries({ queryKey: [ALERTS_QUERY_ROOT] });
          }
        })
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
      queryClient.invalidateQueries({ queryKey: [ALERTS_QUERY_ROOT] });
    },
  });
}

/** Get unread alert count */
export function useUnreadAlertCount() {
  return useQuery<number>({
    queryKey: alertsQueryKey("unread-count"),
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;

      const { count, error } = await applyConsumerAlertFilter(
        supabase
          .from("alerts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false)
      );

      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
}
