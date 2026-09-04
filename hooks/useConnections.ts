import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "../lib/analytics";
import { supabase } from "../lib/supabase";
import type { Connection, StreamingProvider, ProviderType } from "../lib/types";

/** Fetch all available streaming providers from the catalog */
export function useStreamingProviders(
  type?: ProviderType,
  opts?: { category?: string },
) {
  return useQuery<StreamingProvider[]>({
    queryKey: ["streaming-providers", type, opts?.category],
    queryFn: async () => {
      let query = supabase
        .from("streaming_providers")
        .select("*")
        .eq("active", true)
        .order("name");

      if (type) {
        query = query.eq("provider_type", type);
      }
      if (opts?.category) {
        query = query.eq("category", opts.category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StreamingProvider[];
    },
    staleTime: 60 * 60 * 1000, // providers rarely change
  });
}

/** Fetch all of the user's connections regardless of provider type.
 * Both connection screens filter by catalog (streaming vs tv), so they only
 * need to match by provider_key — filtering by type here caused phantom
 * disconnects when a connection row's provider_type differed from the
 * catalog-defined type (e.g. youtube_tv typed 'streaming' vs catalog 'tv').
 */
export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: ["connections"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;
      return (data ?? []) as Connection[];
    },
  });
}

/** Toggle a connection on/off */
export function useToggleConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      provider,
      currentConnection,
    }: {
      provider: StreamingProvider;
      currentConnection?: Connection;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (currentConnection) {
        // Toggle existing connection
        const { error } = await supabase
          .from("connections")
          .update({
            connected: !currentConnection.connected,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentConnection.id);
        if (error) throw error;
      } else {
        // Create new connection
        const { error } = await supabase.from("connections").insert({
          user_id: user.id,
          provider_type: provider.provider_type,
          provider_key: provider.key,
          provider_name: provider.name,
          connected: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { provider, currentConnection }) => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      // Only track when toggling ON (adding a connection, not removing)
      if (!currentConnection || !currentConnection.connected) {
        trackEvent("first_connection_added", { provider_key: provider.key, provider_type: provider.provider_type });
      }
    },
  });
}

/** Get connected provider keys (for watch button logic) */
export function useConnectedProviderKeys() {
  const { data: connections } = useConnections();

  return (connections ?? [])
    .filter((c) => c.connected)
    .map((c) => c.provider_key);
}
