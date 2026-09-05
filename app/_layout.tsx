import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View, Text } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { applyAuthCallback, isAuthCallbackUrl } from "../lib/auth-callback";
import {
  isPasswordRecoveryPending,
  setPasswordRecoveryPending,
  subscribePasswordRecovery,
} from "../lib/auth-recovery-state";
import { recordAppOpen } from "../lib/review-prompt";
import { TapToStreamProvider, useTapToStream } from "../lib/tap-to-stream-context";
import { SportProvider } from "../lib/sport-context";
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
  const [recoveryPending, setRecoveryPending] = useState(
    isPasswordRecoveryPending()
  );
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => subscribePasswordRecovery(setRecoveryPending), []);

  useEffect(() => {
    recordAppOpen();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryPending(true);
        router.replace("/(auth)/reset-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function handleAuthUrl(url: string | null) {
      if (!url || cancelled || !isAuthCallbackUrl(url)) return;
      try {
        const result = await applyAuthCallback(url);
        if (cancelled || !result.applied) return;
        if (result.type === "recovery") {
          setPasswordRecoveryPending(true);
          router.replace("/(auth)/reset-password");
        }
      } catch (error) {
        console.warn("Auth callback deep link failed:", error);
      }
    }

    Linking.getInitialURL().then(handleAuthUrl);
    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const isAuthCallback = segments[0] === "auth-callback";
    const onResetPassword = segments.includes("reset-password");
    const isAuthenticated = !!session;

    if (!isAuthenticated && !inAuthGroup && !isAuthCallback) {
      router.replace("/(auth)/welcome");
    } else if (isAuthenticated && inAuthGroup) {
      if (recoveryPending || onResetPassword) return;
      router.replace("/(tabs)/games");
    }
  }, [session, segments, loading, recoveryPending, router]);

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
    syncDeviceTimezone();

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
          allowCriticalAlerts: true,
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

// FX3 (2026-08-23 audit BL-8): collect the device's IANA timezone and write
// it to profiles.timezone on every launch. The column defaulted to
// "America/New_York" for every account because no code path ever wrote it.
// Combined with the geo-compliance fail-closed policy, having a real
// timezone lets Central / Pacific / Mountain users see legal sportsbooks
// instead of being uniformly treated as NY.
async function syncDeviceTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === "UTC" || tz === "Etc/UTC") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ timezone: tz }).eq("id", user.id);
  } catch (error) {
    console.warn("Failed to sync device timezone:", error);
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
        <SportProvider>
          <TapToStreamProvider>
            <StatusBar style="light" />
            <AuthGate />
            <TransitionOverlay />
          </TapToStreamProvider>
        </SportProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
