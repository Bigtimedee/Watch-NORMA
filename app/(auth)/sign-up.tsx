import { useEffect, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
const SIGNUP_TRACK_KEY = "norma.pendingSignupTrack";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

const normaLogo = require("../../assets/norma-logo.png");
const REFERRAL_CODE_KEY = "norma.referralCode";

function getReferralCode(url: string): string | null {
  const parsed = Linking.parse(url);
  const ref = parsed.queryParams?.ref;
  if (Array.isArray(ref)) return ref[0] ?? null;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInWithApple, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    async function storeReferralCode(url: string | null) {
      if (!url) return;
      const referralCode = getReferralCode(url);
      if (referralCode) {
        await AsyncStorage.setItem(REFERRAL_CODE_KEY, referralCode);
      }
    }

    Linking.getInitialURL().then(storeReferralCode);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      storeReferralCode(url);
    });

    return () => subscription.remove();
  }, []);

  const loadReferralCode = async () => {
    return AsyncStorage.getItem(REFERRAL_CODE_KEY);
  };

  const loadOwnReferralCode = async (accessToken?: string) => {
    if (!accessToken) return;
    await supabase.functions.invoke("get-referral-code", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    try {
      const referralCode = await loadReferralCode();
      const data = await signUp(email, password, displayName || undefined, referralCode);
      await loadOwnReferralCode(data.session?.access_token);
      await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
      await AsyncStorage.setItem(SIGNUP_TRACK_KEY, "email");
      Alert.alert(
        "Check Your Email",
        "We sent you a confirmation link. Please check your email to continue."
      );
    } catch (error: any) {
      Alert.alert("Sign Up Error", error.message);
    }
  };

  const handleApple = async () => {
    try {
      await signInWithApple();
      await AsyncStorage.setItem(SIGNUP_TRACK_KEY, "apple");
    } catch (error: any) {
      Alert.alert("Apple Sign-In Error", error.message);
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
          {/* Back button */}
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>{"\u2190"} Back</Text>
          </Pressable>

          <Image source={normaLogo} style={s.logo} resizeMode="contain" />

          <Text style={s.title}>Create Account</Text>
          <Text style={s.subtitle}>
            Sign up to follow games and get alerts.
          </Text>

          {/* Apple Sign-In */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={{ width: "100%", height: 50 }}
              onPress={handleApple}
            />
          )}

          {Platform.OS === "ios" && (
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>
          )}

          {/* Name */}
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor="#64748b"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />

          {/* Email */}
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

          {/* Password */}
          <Text style={s.label}>Password</Text>
          <TextInput
            style={[s.input, { marginBottom: 32 }]}
            placeholder="At least 6 characters"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          {/* Sign Up button */}
          <Pressable
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            accessibilityLabel={loading ? "Creating Account" : "Create Account"}
          >
            <Text style={s.buttonText}>
              {loading ? "Creating Account..." : "Create Account"}
            </Text>
          </Pressable>

          {/* Sign In link */}
          <Pressable
            style={s.linkBtn}
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            <Text style={s.linkText}>
              Already have an account?{" "}
              <Text style={s.linkHighlight}>Sign In</Text>
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
  subtitle: { color: "#94a3b8", fontSize: 16, marginBottom: 32 },
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
