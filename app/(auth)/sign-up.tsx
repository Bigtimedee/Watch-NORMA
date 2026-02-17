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
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../hooks/useAuth";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInWithApple, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    try {
      await signUp(email, password, displayName || undefined);
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
    } catch (error: any) {
      Alert.alert("Apple Sign-In Error", error.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-court-dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-8 pt-8 pb-12"
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <Pressable onPress={() => router.back()} className="mb-8">
            <Text className="text-brand-400 text-base">&larr; Back</Text>
          </Pressable>

          <Text className="text-white text-3xl font-black mb-2">
            Create Account
          </Text>
          <Text className="text-slate-400 text-base mb-8">
            Sign up to follow games and get alerts.
          </Text>

          {/* Apple Sign-In */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={12}
              style={{ width: "100%", height: 50 }}
              onPress={handleApple}
            />
          )}

          {Platform.OS === "ios" && (
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-court-border" />
              <Text className="text-slate-500 mx-4 text-sm">or</Text>
              <View className="flex-1 h-px bg-court-border" />
            </View>
          )}

          {/* Name */}
          <Text className="text-slate-300 text-sm font-medium mb-2">Name</Text>
          <TextInput
            className="bg-court-card text-white rounded-xl px-4 py-3.5 mb-4 text-base"
            placeholder="Your name"
            placeholderTextColor="#64748b"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />

          {/* Email */}
          <Text className="text-slate-300 text-sm font-medium mb-2">Email</Text>
          <TextInput
            className="bg-court-card text-white rounded-xl px-4 py-3.5 mb-4 text-base"
            placeholder="you@example.com"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          {/* Password */}
          <Text className="text-slate-300 text-sm font-medium mb-2">
            Password
          </Text>
          <TextInput
            className="bg-court-card text-white rounded-xl px-4 py-3.5 mb-8 text-base"
            placeholder="At least 6 characters"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          {/* Sign Up button */}
          <Pressable
            className={`rounded-xl py-4 items-center ${
              loading ? "bg-brand-700" : "bg-brand-500"
            }`}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text className="text-white text-base font-bold">
              {loading ? "Creating Account..." : "Create Account"}
            </Text>
          </Pressable>

          {/* Sign In link */}
          <Pressable
            className="py-4 items-center"
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            <Text className="text-slate-400 text-sm">
              Already have an account?{" "}
              <Text className="text-brand-400 font-semibold">Sign In</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
