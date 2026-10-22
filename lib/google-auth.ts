// Spec C fix 4: Sign in with Google via Supabase OAuth. No native module:
// opens the provider in the browser and returns on norma://auth-callback,
// where app/_layout.tsx applies the tokens (same path as magic links).
// The button only renders when Google is enabled in Supabase Auth.
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { getAuthCallbackUrl } from "./auth-callback";

let cached: boolean | null = null;

export async function isGoogleSignInEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`;
    const res = await fetch(url, { headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "" } });
    const json = await res.json();
    cached = !!json?.external?.google;
  } catch {
    cached = false;
  }
  return cached;
}

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getAuthCallbackUrl(), skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Google sign-in is not available right now.");
  await Linking.openURL(data.url);
}
