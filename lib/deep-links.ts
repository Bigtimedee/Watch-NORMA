import { Platform, Linking } from "react-native";
import type { StreamingProvider } from "./types";

/**
 * Attempt to open a streaming app for a given provider.
 * Fallback chain:
 *   1. Native app (iOS scheme / Android deep link)
 *   2. Universal link (from DB) or legacy watch URL
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

  // Step 2: Try universal link (DB field), then legacy watch URL fallback.
  // TV providers (YouTube TV, Fubo, Sling, etc.) are skipped here — their web
  // experience requires authentication and silently redirects unauthenticated
  // users to a welcome/sign-up page (e.g. tv.youtube.com/welcome?rd_rsn=lo).
  // Linking.openURL never throws for HTTPS, so we would never reach the App
  // Store fallback below. For TV providers, send straight to App Store instead.
  const isLiveTvProvider =
    provider.provider_type === "tv" || provider.category === "tv";
  if (!isLiveTvProvider) {
    const universalLink = provider.universal_link ?? null;
    const watchUrl = universalLink ?? getWatchUrl(provider.key, provider.web_url ?? "");
    if (watchUrl) {
      try {
        await Linking.openURL(watchUrl);
        return { opened: true, fallback: true, method: universalLink ? "universal_link" : "web_url" };
      } catch {
        // Fall through to app store
      }
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
 * Get the direct watch/live URL for a provider (not marketing homepage).
 */
function getWatchUrl(providerKey: string, defaultWebUrl: string): string {
  // Only streaming providers (not live TV) — TV providers skip Step 2 entirely.
  const watchUrls: Record<string, string> = {
    espn_plus: "https://plus.espn.com/watch",
    paramount_plus: "https://www.paramountplus.com/live-tv/",
    peacock: "https://www.peacocktv.com/watch/live-tv",
    max: "https://play.max.com",
  };
  return watchUrls[providerKey] ?? defaultWebUrl;
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

  // Step 2: Try universal link, then legacy watch URL.
  // Skip for TV providers — see comment in openStreamingApp above.
  const isLiveTvProvider =
    provider.provider_type === "tv" || provider.category === "tv";
  if (!isLiveTvProvider) {
    const universalLink = provider.universal_link ?? null;
    const watchUrl =
      universalLink ?? getWatchUrl(provider.key, provider.web_url ?? "");
    if (watchUrl) {
      return {
        url: watchUrl,
        method: universalLink ? "universal_link" : "web_url",
      };
    }
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
