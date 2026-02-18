import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

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

  useEffect(() => {
    if (!session) return;

    registerPushToken();

    const Notifications = require("expo-notifications");
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const gameId = response.notification.request.content.data?.gameId;
        if (gameId) {
          router.push(`/games/${gameId}`);
        }
      }
    );

    return () => subscription.remove();
  }, [session]);

  return <Slot />;
}

async function registerPushToken() {
  try {
    const Notifications = require("expo-notifications");
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
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
        <StatusBar style="light" />
        <AuthGate />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
