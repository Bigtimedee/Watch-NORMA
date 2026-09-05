import { supabase } from "./supabase";
import { APP_SCHEME } from "./constants";

/**
 * Existing production auth callback. `supabase/config.toml` sets
 * `site_url = "norma://auth-callback"`. Using this scheme (not a
 * Universal Link / associated domain) means recovery emails open the
 * installed app without an App Store Connect associated-domains change.
 *
 * Limitation: production Redirect URLs in the Supabase dashboard must
 * continue to allow `norma://auth-callback`. That is dashboard config,
 * not an App Store click. Do not switch this to a new path without
 * adding it to the allowlist.
 */
export const AUTH_CALLBACK_PATH = "auth-callback";

export function getAuthCallbackUrl(): string {
  return `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;
}

export function isAuthCallbackUrl(url: string): boolean {
  return /(?:norma:\/\/|\/\/|\/)auth-callback(?:[?#]|$)/i.test(url);
}

export type AuthCallbackParse = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  type: string | null;
};

/**
 * Parse implicit-hash tokens, query tokens, or PKCE `code` from a
 * `norma://auth-callback` (or Expo-style) recovery / magic-link URL.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParse {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryPart =
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";

  const merged = new URLSearchParams(queryPart);
  const hashParams = new URLSearchParams(hashPart);
  hashParams.forEach((value, key) => {
    merged.set(key, value);
  });

  return {
    accessToken: merged.get("access_token"),
    refreshToken: merged.get("refresh_token"),
    code: merged.get("code"),
    type: merged.get("type"),
  };
}

export type AuthCallbackApplyResult = {
  applied: boolean;
  type: string | null;
};

export async function applyAuthCallback(
  url: string
): Promise<AuthCallbackApplyResult> {
  const parsed = parseAuthCallbackUrl(url);

  if (parsed.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) throw error;
    return { applied: true, type: parsed.type };
  }

  if (parsed.accessToken && parsed.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (error) throw error;
    return { applied: true, type: parsed.type };
  }

  return { applied: false, type: parsed.type };
}
