// Spec C fix 6: push permission primer shown before the OS prompt.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { markPushPrimerSeen, completeStep } from "../lib/onboarding";

export default function PushPrimerScreen() {
  const router = useRouter();
  const { game } = useLocalSearchParams<{ game?: string }>();
  const line = game
    ? `We will ping you if ${game} gets close late.`
    : "We will ping you when a game you follow gets close late.";

  const finish = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/games"));

  const allow = async () => {
    await markPushPrimerSeen();
    let granted = false;
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      });
      granted = status === "granted";
      if (granted) {
        const token = await Notifications.getExpoPushTokenAsync({ projectId: "3a418868-5bb5-4852-b565-3282ee4fe91e" });
        const { data } = await supabase.auth.getUser();
        if (data.user) await supabase.from("profiles").update({ push_token: token.data }).eq("id", data.user.id);
      }
    } catch (e) {
      console.warn("push primer:", e);
    }
    trackEvent("push_permission", { granted });
    if (granted) await completeStep("notifications");
    finish();
  };

  const later = async () => {
    await markPushPrimerSeen();
    trackEvent("push_permission", { granted: false, deferred: true });
    finish();
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <Text style={s.title}>Never miss the moment</Text>
        <Text style={s.body}>{line}</Text>
        <Text style={s.small}>Only games you follow or have a position in. You can change this any time.</Text>
      </View>
      <View style={s.ctas}>
        <Pressable style={s.primary} onPress={allow} accessibilityLabel="Turn on alerts">
          <Text style={s.primaryText}>Turn on alerts</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={later} accessibilityLabel="Not now">
          <Text style={s.secondaryText}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900", marginBottom: 16 },
  body: { color: "#e2e8f0", fontSize: 18, marginBottom: 12 },
  small: { color: "#94a3b8", fontSize: 14 },
  ctas: { paddingHorizontal: 32, paddingBottom: 32 },
  primary: { backgroundColor: "#f97316", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 8 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: "#94a3b8", fontSize: 16 },
});
