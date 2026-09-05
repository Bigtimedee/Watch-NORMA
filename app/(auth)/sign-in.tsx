import { useState } from "react";
import {
  View,
  Text,
  Image,
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
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../hooks/useAuth";
import {
  mapSignInError,
  type SignInErrorGuidance,
} from "../../lib/auth-signin-errors";

const normaLogo = require("../../assets/norma-logo.png");
const appleAvailable = Platform.OS === "ios";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, signInWithApple, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credentialError, setCredentialError] =
    useState<SignInErrorGuidance | null>(null);

  const openForgotPassword = () => {
    router.push({
      pathname: "/(auth)/forgot-password",
      params: email.trim() ? { email: email.trim() } : {},
    });
  };

  const handleApple = async () => {
    try {
      await signInWithApple();
    } catch (error: unknown) {
      const guidance = mapSignInError(error, { appleAvailable });
      Alert.alert(guidance.title, guidance.message);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    try {
      setCredentialError(null);
      await signIn(email, password);
    } catch (error: unknown) {
      // Linked Apple users may have an empty encrypted_password historically.
      // Never leave this as a dead-end toast — offer Apple + recovery.
      const guidance = mapSignInError(error, { appleAvailable });
      setCredentialError(guidance);

      if (guidance.kind === "invalid_credentials" || guidance.kind === "email_not_confirmed") {
        const buttons = appleAvailable
          ? [
              {
                text: guidance.forgotPasswordCtaLabel,
                onPress: openForgotPassword,
              },
              {
                text: guidance.appleCtaLabel,
                onPress: () => {
                  void handleApple();
                },
              },
            ]
          : [
              { text: "OK", style: "cancel" as const },
              {
                text: guidance.forgotPasswordCtaLabel,
                onPress: openForgotPassword,
              },
            ];
        Alert.alert(guidance.title, guidance.message, buttons);
        return;
      }

      Alert.alert(guidance.title, guidance.message);
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

          <Image source={normaLogo} style={s.logo} resizeMode="contain" />

          <Text style={s.title}>Welcome Back</Text>
          <Text style={s.subtitle}>
            {appleAvailable
              ? "Sign in with Apple if that is how you created your account. Email and password is also available."
              : "Sign in to your NORMA account."}
          </Text>

          {credentialError && (
            <View style={s.recoveryCard} accessibilityRole="alert">
              <Text style={s.recoveryTitle}>{credentialError.title}</Text>
              <Text style={s.recoveryBody}>{credentialError.message}</Text>
              {appleAvailable && (
                <Pressable
                  style={s.appleFallbackBtn}
                  onPress={handleApple}
                  disabled={loading}
                  accessibilityLabel={credentialError.appleCtaLabel}
                >
                  <Text style={s.appleFallbackText}>
                    {credentialError.appleCtaLabel}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={openForgotPassword}
                accessibilityLabel={credentialError.magicLinkCtaLabel}
              >
                <Text style={s.recoveryLink}>
                  {credentialError.forgotPasswordCtaLabel} /{" "}
                  {credentialError.magicLinkCtaLabel}
                </Text>
              </Pressable>
            </View>
          )}

          {appleAvailable && (
            <>
              <Text style={s.appleHint}>Recommended on iPhone</Text>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={12}
                style={{ width: "100%", height: 56 }}
                onPress={handleApple}
              />
            </>
          )}

          {appleAvailable && (
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or email</Text>
              <View style={s.dividerLine} />
            </View>
          )}

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

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="Your password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />

          <Pressable
            style={s.forgotBtn}
            onPress={openForgotPassword}
            accessibilityLabel="Forgot password"
          >
            <Text style={s.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            accessibilityLabel={loading ? "Signing In" : "Sign In"}
          >
            <Text style={s.buttonText}>
              {loading ? "Signing In..." : "Sign In"}
            </Text>
          </Pressable>

          <Pressable
            style={s.linkBtn}
            onPress={() => router.replace("/(auth)/sign-up")}
          >
            <Text style={s.linkText}>
              Don't have an account?{" "}
              <Text style={s.linkHighlight}>Sign Up</Text>
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
  scrollContent: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 48 },
  logo: { width: 200, height: 133, alignSelf: "center", marginBottom: 24 },
  backBtn: { marginBottom: 16 },
  backText: { color: "#fb923c", fontSize: 16 },
  title: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: "#94a3b8", fontSize: 16, marginBottom: 24 },
  appleHint: {
    color: "#fb923c",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  recoveryCard: {
    backgroundColor: "#1e293b",
    borderColor: "#f97316",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  recoveryTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  recoveryBody: { color: "#cbd5e1", fontSize: 14, lineHeight: 20, marginBottom: 16 },
  appleFallbackBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  appleFallbackText: { color: "#0f172a", fontSize: 16, fontWeight: "700" },
  recoveryLink: { color: "#fb923c", fontSize: 14, fontWeight: "600", textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#475569" },
  dividerText: { color: "#64748b", marginHorizontal: 16, fontSize: 14 },
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
  forgotBtn: { alignSelf: "flex-end", marginTop: -8, marginBottom: 24 },
  forgotText: { color: "#fb923c", fontSize: 14, fontWeight: "600" },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#c2410c" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  linkBtn: { paddingVertical: 16, alignItems: "center" },
  linkText: { color: "#94a3b8", fontSize: 14 },
  linkHighlight: { color: "#fb923c", fontWeight: "600" },
});
