import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { getAuthCallbackUrl } from "../../lib/auth-callback";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset, requestMagicLink, loading } = useAuth();
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : ""
  );
  const [sentKind, setSentKind] = useState<"reset" | "magic" | null>(null);

  const requireEmail = () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Enter the email on your NORMA account.");
      return false;
    }
    return true;
  };

  const handleReset = async () => {
    if (!requireEmail()) return;
    try {
      await requestPasswordReset(email);
      setSentKind("reset");
      Alert.alert(
        "Check your email",
        "If an account exists for that address, we sent a reset link. It opens this app via norma://auth-callback."
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not send reset email.";
      Alert.alert("Reset Error", message);
    }
  };

  const handleMagicLink = async () => {
    if (!requireEmail()) return;
    try {
      await requestMagicLink(email);
      setSentKind("magic");
      Alert.alert(
        "Check your email",
        "If an account exists for that address, we sent a login link. It opens this app via norma://auth-callback."
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not send a login link.";
      Alert.alert("Login Link Error", message);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.flex}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>{"\u2190"} Back</Text>
          </Pressable>

          <Text style={s.title}>Get back in</Text>
          <Text style={s.subtitle}>
            {Platform.OS === "ios"
              ? "If you used Sign in with Apple, go back and use that button. Otherwise email yourself a login link or a password reset."
              : "Email yourself a login link or a password reset."}
          </Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Pressable
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleMagicLink}
            disabled={loading}
            accessibilityLabel="Email me a login link"
          >
            <Text style={s.buttonText}>
              {loading && sentKind !== "reset" ? "Sending..." : "Email me a login link"}
            </Text>
          </Pressable>

          <Pressable
            style={[s.secondaryBtn, loading && s.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
            accessibilityLabel="Send password reset"
          >
            <Text style={s.secondaryText}>Send password reset</Text>
          </Pressable>

          {Platform.OS === "ios" && (
            <Pressable
              style={s.linkBtn}
              onPress={() => router.replace("/(auth)/sign-in")}
            >
              <Text style={s.linkText}>
                Prefer Apple?{" "}
                <Text style={s.linkHighlight}>Back to Sign in with Apple</Text>
              </Text>
            </Pressable>
          )}

          <Text style={s.hint}>
            Recovery links use the existing app scheme {getAuthCallbackUrl()} —
            not an App Store Connect universal link.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 48 },
  backBtn: { marginBottom: 16 },
  backText: { color: "#fb923c", fontSize: 16 },
  title: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: "#94a3b8", fontSize: 16, marginBottom: 32 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "500", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b",
    color: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    borderColor: "#fb923c",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  secondaryText: { color: "#fb923c", fontSize: 16, fontWeight: "700" },
  linkBtn: { paddingVertical: 16, alignItems: "center" },
  linkText: { color: "#94a3b8", fontSize: 14 },
  linkHighlight: { color: "#fb923c", fontWeight: "600" },
  hint: { color: "#64748b", fontSize: 12, marginTop: 24, lineHeight: 18 },
});
