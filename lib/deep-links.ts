import { Platform, Linking } from "react-native";
import type { StreamingProvider } from "./types";

/**
 * Attempt to open a streaming app for a given provider.
 * Falls back to web URL if the app isn't installed.
 */
export async function openStreamingApp(
  provider: StreamingProvider,
  gameTitle?: string
): Promise<{ opened: boolean; fallback: boolean }> {
  // Try native app scheme first
  if (Platform.OS === "ios" && provider.ios_scheme) {
    const canOpen = await Linking.canOpenURL(provider.ios_scheme);
    if (canOpen) {
      await Linking.openURL(provider.ios_scheme);
      return { opened: true, fallback: false };
    }
  }

  if (Platform.OS === "android" && provider.android_deep_link) {
    try {
      await Linking.openURL(provider.android_deep_link);
      return { opened: true, fallback: false };
    } catch {
      // Fall through to web
    }
  }

  // Fallback to web URL
  if (provider.web_url) {
    await Linking.openURL(provider.web_url);
    return { opened: true, fallback: true };
  }

  // Fallback to app store
  if (Platform.OS === "ios" && provider.ios_app_store_url) {
    await Linking.openURL(provider.ios_app_store_url);
    return { opened: true, fallback: true };
  }

  return { opened: false, fallback: false };
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
