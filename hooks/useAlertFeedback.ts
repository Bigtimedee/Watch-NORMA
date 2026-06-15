import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export function useSubmitAlertFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      alertId,
      rating,
    }: {
      alertId: number;
      rating: "up" | "down";
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("alert_feedback").upsert(
        { alert_id: alertId, user_id: user.id, rating },
        { onConflict: "alert_id,user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-feedback"] });
    },
  });
}
