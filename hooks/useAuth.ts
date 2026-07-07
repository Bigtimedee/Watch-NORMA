import { useEffect, useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import type { Profile } from "../lib/types";
import type { Session } from "@supabase/supabase-js";

const SIGNUP_TRACK_KEY = "norma.pendingSignupTrack";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        if (event === "SIGNED_IN") {
          AsyncStorage.getItem(SIGNUP_TRACK_KEY).then((method) => {
            if (method) {
              trackEvent("signup_completed", { method });
              AsyncStorage.removeItem(SIGNUP_TRACK_KEY);
            }
          });
        }
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) setProfile(data as Profile);
    if (error) console.warn("Error fetching profile:", error.message);
  };

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string, referralCode?: string | null) => {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName,
            referral_code: referralCode || undefined,
          },
        },
      });
      setLoading(false);
      if (error) throw error;
      return data;
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) throw error;
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "ios") {
      Alert.alert("Apple Sign-In is only available on iOS");
      return;
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("No identity token received from Apple");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });

      if (error) throw error;
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return; // User cancelled
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const deleteAccount = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) throw new Error("Not authenticated");

    const { data, error } = await supabase.functions.invoke("delete-account", {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    // Sign out locally after account deletion
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!session) return;
      const { error } = await supabase
        .from("profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);

      if (error) throw error;
      await fetchProfile(session.user.id);
    },
    [session]
  );

  return {
    session,
    profile,
    loading,
    signUp,
    signIn,
    signInWithApple,
    signOut,
    deleteAccount,
    updateProfile,
  };
}
