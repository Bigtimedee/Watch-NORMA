import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View, Text } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { TapToStreamProvider, useTapToStream } from "../lib/tap-to-stream-context";
import { TransitionOverlay } from "../components/TransitionOverlay";
import type { StreamingProvider } from "../lib/types";
import type { Session } from "@supabase/supabase-js";

// Show notifications even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10_000,
    },
  },
});

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const isAuthenticated = !!session;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/welcome");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)/games");
    }
  }, [session, segments, loading]);

  // Clear badge count when app comes to foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    Notifications.setBadgeCountAsync(0);
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        Notifications.setBadgeCountAsync(0);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Access tap-to-stream context for notification-triggered streams
  let tapToStream: ReturnType<typeof useTapToStream> | null = null;
  try {
    tapToStream = useTapToStream();
  } catch {
    // Provider not mounted yet — ignore
  }

  useEffect(() => {
    if (!session) return;

    registerPushToken();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const gameId = data?.gameId;

        // If push includes a streamProviderKey, trigger stream transition
        if (data?.streamProviderKey && tapToStream) {
          // Look up provider from cached query data
          const providers: StreamingProvider[] | undefined =
            queryClient.getQueryData(["streaming-providers", undefined]);
          const provider = providers?.find(
            (p) => p.key === data.streamProviderKey
          );
          if (provider) {
            tapToStream.triggerStream(provider, { skipAnticipation: true });
            return;
          }
        }

        if (gameId) {
          router.push(`/games/${gameId}`);
        }
      }
    );

    return () => subscription.remove();
  }, [session, tapToStream]);

  return <Slot />;
}

async function registerPushToken() {
  try {
    // Create Android notification channel (must exist before notifications arrive)
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("game-alerts", {
        name: "Game Alerts",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        enableVibrate: true,
        enableLights: true,
        lightColor: "#f97316",
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
          allowBadge: true,
          allowProvisional: true,
          allowCriticalAlert: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "3a418868-5bb5-4852-b565-3282ee4fe91e",
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ push_token: tokenData.data })
        .eq("id", user.id);
    }
  } catch (error) {
    console.warn("Failed to register push token:", error);
  }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a", padding: 20 }}>
          <Text style={{ color: "#ef4444", fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
            App Error
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
            {this.state.error?.message ?? "Unknown error"}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TapToStreamProvider>
          <StatusBar style="light" />
          <AuthGate />
          <TransitionOverlay />
        </TapToStreamProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
