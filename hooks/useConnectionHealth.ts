import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform, Linking } from "react-native";
import { supabase } from "../lib/supabase";
import type { Connection, StreamingProvider } from "../lib/types";

interface ConnectionHealthStatus {
  healthy: Connection[];
  stale: Connection[];
  issues: Array<{ connection: Connection; reason: string }>;
  checking: boolean;
}

/**
 * Verify connection health on app launch / connections screen open.
 * Checks:
 *   - Kalshi credentials still work (via balance endpoint)
 *   - Polymarket wallet address is valid format
 *   - Streaming app still installed (iOS only, via canOpenURL)
 */
export function useConnectionHealth(connections: Connection[], providers: StreamingProvider[]) {
  const queryClient = useQueryClient();

  return useQuery<ConnectionHealthStatus>({
    queryKey: ["connection-health", connections.map((c) => c.id).join(",")],
    queryFn: async () => {
      const healthy: Connection[] = [];
      const stale: Connection[] = [];
      const issues: Array<{ connection: Connection; reason: string }> = [];

      const activeConnections = connections.filter((c) => c.connected);

      for (const conn of activeConnections) {
        try {
          if (conn.provider_key === "kalshi") {
            // Verify Kalshi credentials via proxy
            const isValid = await checkKalshiHealth();
            if (isValid) {
              healthy.push(conn);
            } else {
              issues.push({
                connection: conn,
                reason: "Kalshi credentials expired or invalid",
              });
            }
          } else if (conn.provider_key === "polymarket") {
            // Verify wallet address format
            const wallet = (conn.metadata as any)?.wallet_address;
            if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
              healthy.push(conn);
            } else {
              issues.push({
                connection: conn,
                reason: "Invalid wallet address",
              });
            }
          } else if (
            conn.provider_type === "streaming" ||
            conn.provider_type === "tv"
          ) {
            // Check if streaming app is still installed (iOS only)
            const provider = providers.find((p) => p.key === conn.provider_key);
            if (provider && Platform.OS === "ios" && provider.ios_scheme) {
              try {
                const canOpen = await Linking.canOpenURL(provider.ios_scheme);
                if (canOpen) {
                  healthy.push(conn);
                } else {
                  stale.push(conn);
                  issues.push({
                    connection: conn,
                    reason: `${conn.provider_name} app may not be installed`,
                  });
                }
              } catch {
                // Can't determine — assume healthy
                healthy.push(conn);
              }
            } else {
              // Android or no scheme — assume healthy
              healthy.push(conn);
            }
          } else {
            healthy.push(conn);
          }
        } catch {
          // Error checking — assume healthy to avoid false negatives
          healthy.push(conn);
        }
      }

      return { healthy, stale, issues, checking: false };
    },
    enabled: connections.length > 0,
    staleTime: 5 * 60 * 1000, // Re-check every 5 minutes at most
    refetchOnWindowFocus: true,
  });
}

async function checkKalshiHealth(): Promise<boolean> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) return false;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;

    const res = await fetch(`${supabaseUrl}/functions/v1/kalshi-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({
        endpoint: "/trade-api/v2/portfolio/balance",
        method: "GET",
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/** Count of issues for badge display */
export function useConnectionIssueCount(
  connections: Connection[],
  providers: StreamingProvider[]
) {
  const { data } = useConnectionHealth(connections, providers);
  return data?.issues.length ?? 0;
}
