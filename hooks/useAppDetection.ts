import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useStreamingProviders, useConnections } from "./useConnections";

export function useAppDetection() {
  const [detecting, setDetecting] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const queryClient = useQueryClient();
  const { data: providers } = useStreamingProviders();
  const { data: connections } = useConnections();

  const detectApps = useCallback(async () => {
    if (Platform.OS !== "ios" || !providers) return;

    setDetecting(true);
    setDetectedCount(0);
    let count = 0;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setDetecting(false);
      return;
    }

    for (const provider of providers) {
      if (!provider.ios_scheme) continue;

      // Skip if already connected
      const existing = (connections ?? []).find(
        (c) => c.provider_key === provider.key && c.connected
      );
      if (existing) continue;

      try {
        const canOpen = await Linking.canOpenURL(provider.ios_scheme);
        if (canOpen) {
          // Auto-connect this provider
          const existingConn = (connections ?? []).find(
            (c) => c.provider_key === provider.key
          );

          if (existingConn) {
            await supabase
              .from("connections")
              .update({
                connected: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingConn.id);
          } else {
            await supabase.from("connections").insert({
              user_id: user.id,
              provider_type: provider.provider_type,
              provider_key: provider.key,
              provider_name: provider.name,
              connected: true,
            });
          }
          count++;
        }
      } catch {
        // canOpenURL can throw if scheme not in LSApplicationQueriesSchemes
      }
    }

    setDetectedCount(count);
    setDetecting(false);
    queryClient.invalidateQueries({ queryKey: ["connections"] });
  }, [providers, connections, queryClient]);

  return { detectApps, detecting, detectedCount };
}
