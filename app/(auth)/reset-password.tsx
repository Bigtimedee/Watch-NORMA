import { useState } from "react";
import {
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { setPasswordRecoveryPending } from "../../lib/auth-recovery-state";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleSave = async () => {
    if (password.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Re-enter the same password.");
      return;
    }
    try {
      await updatePassword(password);
      setPasswordRecoveryPending(false);
      Alert.alert("Password updated", "You are signed in.", [
        {
          text: "Continue",
          onPress: () => router.replace("/(tabs)/games"),
        },
      ]);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not update password.";
      Alert.alert("Update Error", message);
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
          <Text style={s.title}>Set a new password</Text>
          <Text style={s.subtitle}>
            This creates a usable email/password path for this account. You can
            still use Sign in with Apple next time.
          </Text>

          <Text style={s.label}>New password</Text>
          <TextInput
            style={s.input}
            placeholder="At least 6 characters"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          <Text style={s.label}>Confirm password</Text>
          <TextInput
            style={[s.input, { marginBottom: 32 }]}
            placeholder="Re-enter password"
            placeholderTextColor="#64748b"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
          />

          <Pressable
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityLabel="Save password"
          >
            <Text style={s.buttonText}>
              {loading ? "Saving..." : "Save password"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 32, paddingTop: 48, paddingBottom: 48 },
  title: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: "#94a3b8", fontSize: 16, marginBottom: 32 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "500", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b",
    color: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#c2410c" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
