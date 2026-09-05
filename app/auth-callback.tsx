import { useEffect, useState } from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { applyAuthCallback } from "../lib/auth-callback";
import { setPasswordRecoveryPending } from "../lib/auth-recovery-state";

/**
 * Handles `norma://auth-callback` from password-reset and magic-link emails.
 * Tokens live in the hash or `?code=`; `detectSessionInUrl` is off on native.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState("Opening your sign-in link…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function finish(url: string | null) {
      if (!url) {
        if (!cancelled) {
          setFailed(true);
          setStatus("No sign-in link was found. Request a new one from Sign In.");
        }
        return;
      }
      try {
        const result = await applyAuthCallback(url);
        if (cancelled) return;
        if (!result.applied) {
          setFailed(true);
          setStatus("This link is missing sign-in tokens. Request a new one.");
          return;
        }
        if (result.type === "recovery") {
          setPasswordRecoveryPending(true);
          router.replace("/(auth)/reset-password");
          return;
        }
        router.replace("/(tabs)/games");
      } catch (error: unknown) {
        if (cancelled) return;
        setFailed(true);
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not finish signing in from this link."
        );
      }
    }

    Linking.getInitialURL().then(finish);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void finish(url);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.status}>{status}</Text>
      {failed && (
        <Pressable
          style={s.button}
          onPress={() => router.replace("/(auth)/sign-in")}
        >
          <Text style={s.buttonText}>Back to Sign In</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  status: { color: "#cbd5e1", fontSize: 16, textAlign: "center", marginBottom: 24 },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
