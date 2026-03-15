import { Platform, Linking } from "react-native";
import type { StreamingProvider } from "./types";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Observability: fire-and-forget structured event logging
// ---------------------------------------------------------------------------

interface DeepLinkEventPayload {
  provider_key: string;
  method: "native_scheme" | "universal_link" | "app_store" | "no_fallback";
  success: boolean;
  fallback_triggered: boolean;
  url_scheme: string | null;
  platform: "ios" | "android" | "web";
}

/**
 * Extract scheme+host from a URL so we never log full URLs (which may carry
 * tokens or other PII in path/query segments).
 * Examples:
 *   "youtube-tv://" -> "youtube-tv://"
 *   "https://apps.apple.com/app/youtube-tv/id1193350206" -> "https://apps.apple.com"
 */
function maskUrlToSchemeHost(url: string): string {
  try {
    // Custom schemes like "youtube-tv://" won't parse cleanly via URL() —
    // return the scheme portion only.
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const colonSlash = url.indexOf("://");
      return colonSlash !== -1 ? url.slice(0, colonSlash + 3) : url;
    }
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.slice(0, 64); // best-effort truncation
  }
}

/**
 * Insert a single deep_link_events row. Fire-and-forget: never awaited,
 * never throws, never blocks the deep link opening.
 */
function logDeepLinkEvent(payload: DeepLinkEventPayload): void {
  const { data: sessionData } = supabase.auth.getSession() as any;
  const userId: string | null = sessionData?.session?.user?.id ?? null;

  void (async () => {
    try {
      await supabase
        .from("deep_link_events")
        .insert({
          user_id: userId,
          provider_key: payload.provider_key,
          method: payload.method,
          success: payload.success,
          fallback_triggered: payload.fallback_triggered,
          url_scheme: payload.url_scheme,
          platform: payload.platform,
        });
    } catch {
      // Intentionally a no-op — logging must never surface to the user.
      // Errors here are acceptable (e.g., offline, unauthenticated).
    }
  })();
}

/**
 * Attempt to open a streaming app for a given provider.
 * Fallback chain:
 *   1. Native app (iOS scheme / Android deep link)
 *   2. Universal link (from DB) — only if non-null
 *   3. App Store / Play Store (fallback_store_url or ios_app_store_url)
 *   4. Nothing available
 */
export async function openStreamingApp(
  provider: StreamingProvider,
  _gameTitle?: string
): Promise<{ opened: boolean; fallback: boolean; method: string }> {
  // Step 1: Try native app deep link.
  // Skip canOpenURL — it requires the scheme in LSApplicationQueriesSchemes in
  // the compiled binary, which may lag behind app.json changes. openURL itself
  // has no such restriction and will open the app if installed, throwing if not.
  if (Platform.OS === "ios" && provider.ios_scheme) {
    try {
      await Linking.openURL(provider.ios_scheme);
      return { opened: true, fallback: false, method: "native_app" };
    } catch {
      // App not installed — fall through to universal link
    }
  }

  if (Platform.OS === "android" && provider.android_deep_link) {
    try {
      await Linking.openURL(provider.android_deep_link);
      return { opened: true, fallback: false, method: "native_app" };
    } catch {
      // Fall through to universal link
    }
  }

  // Step 2: Try universal link (DB field) only when explicitly set.
  // Subscriber-only web URLs (tv.youtube.com/live, etc.) are intentionally
  // left NULL in the DB — they redirect unauthenticated mobile browsers to
  // sign-up pages. When universal_link is NULL, skip directly to App Store.
  const universalLink = provider.universal_link ?? null;
  if (universalLink) {
    try {
      await Linking.openURL(universalLink);
      return { opened: true, fallback: true, method: "universal_link" };
    } catch {
      // Fall through to app store
    }
  }

  // Step 3: Fallback to App Store (prefer fallback_store_url, then ios_app_store_url)
  const storeUrl = provider.fallback_store_url ?? provider.ios_app_store_url ?? null;
  if (storeUrl) {
    try {
      await Linking.openURL(storeUrl);
      return { opened: true, fallback: true, method: "app_store" };
    } catch {
      // Nothing else to try
    }
  }

  // Step 4: Nothing available
  return { opened: false, fallback: false, method: "none" };
}

/**
 * Resolve the deep link URL for a provider without actually opening it.
 * Front-loads the ~50-100ms canOpenURL check into the Anticipation phase.
 * Returns { url, method } or null if nothing is available.
 */
export async function resolveDeepLinkUrl(
  provider: StreamingProvider
): Promise<{ url: string; method: string } | null> {
  // Step 1: Try native app scheme.
  // Return the scheme directly — openURL (not canOpenURL) will be used at call
  // time, bypassing the LSApplicationQueriesSchemes binary restriction.
  if (Platform.OS === "ios" && provider.ios_scheme) {
    return { url: provider.ios_scheme, method: "native_app" };
  }

  if (Platform.OS === "android" && provider.android_deep_link) {
    return { url: provider.android_deep_link, method: "native_app" };
  }

  // Step 2: Try universal link (DB field) only when explicitly set.
  // Subscriber-only web URLs are intentionally NULL in the DB — they redirect
  // unauthenticated mobile browsers to sign-up pages. When universal_link is
  // NULL, skip directly to App Store.
  const universalLink = provider.universal_link ?? null;
  if (universalLink) {
    return { url: universalLink, method: "universal_link" };
  }

  // Step 3: Fallback to App Store
  const storeUrl =
    provider.fallback_store_url ?? provider.ios_app_store_url ?? null;
  if (storeUrl) {
    return { url: storeUrl, method: "app_store" };
  }

  return null;
}

/**
 * Map broadcast network names to streaming provider keys.
 * Used to suggest which app to open for watching a game.
 */
export function getBroadcastProviderKeys(
  broadcast: string | null
): string[] {
  if (!broadcast) return [];

  const normalized = broadcast.toUpperCase().trim();
  const providers: string[] = [];

  if (normalized.includes("ESPN") || normalized.includes("ESPN2")) {
    providers.push("espn_plus");
  }
  if (normalized.includes("CBS")) {
    providers.push("paramount_plus", "cbs_sports");
  }
  if (normalized.includes("TNT")) {
    providers.push("tnt_drama", "max");
  }
  if (normalized.includes("TBS")) {
    providers.push("tbs", "max");
  }
  if (normalized.includes("TRUTV")) {
    providers.push("trutv", "max");
  }
  if (normalized.includes("PEACOCK") || normalized.includes("NBC")) {
    providers.push("peacock");
  }

  // Live TV providers can show any broadcast game
  providers.push("youtube_tv", "hulu_live", "fubo", "sling", "directv_stream");

  return providers;
}

/**
 * Get the best provider to watch a game based on user's connections.
 */
export function getBestWatchProvider(
  broadcast: string | null,
  connectedProviderKeys: string[],
  allProviders: StreamingProvider[]
): StreamingProvider | null {
  const broadcastKeys = getBroadcastProviderKeys(broadcast);

  // Find the first connected provider that can show this game
  for (const key of broadcastKeys) {
    if (connectedProviderKeys.includes(key)) {
      const provider = allProviders.find((p) => p.key === key);
      if (provider) return provider;
    }
  }

  return null;
}
