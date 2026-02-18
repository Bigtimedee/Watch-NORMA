import { Platform, Linking } from "react-native";
import type { StreamingProvider } from "./types";

/**
 * Attempt to open a streaming app for a given provider.
 * Fallback chain: native app → web watch URL → App Store → info only.
 */
export async function openStreamingApp(
  provider: StreamingProvider,
  _gameTitle?: string
): Promise<{ opened: boolean; fallback: boolean; method: string }> {
  // Step 1: Try native app deep link
  if (Platform.OS === "ios" && provider.ios_scheme) {
    try {
      const canOpen = await Linking.canOpenURL(provider.ios_scheme);
      if (canOpen) {
        await Linking.openURL(provider.ios_scheme);
        return { opened: true, fallback: false, method: "native_app" };
      }
    } catch {
      // canOpenURL can fail silently on first call after install — retry once
      try {
        await new Promise((r) => setTimeout(r, 100));
        const canOpenRetry = await Linking.canOpenURL(provider.ios_scheme);
        if (canOpenRetry) {
          await Linking.openURL(provider.ios_scheme);
          return { opened: true, fallback: false, method: "native_app_retry" };
        }
      } catch {
        // Fall through to web
      }
    }
  }

  if (Platform.OS === "android" && provider.android_deep_link) {
    try {
      await Linking.openURL(provider.android_deep_link);
      return { opened: true, fallback: false, method: "native_app" };
    } catch {
      // Fall through to web
    }
  }

  // Step 2: Fallback to web watch URL (direct watch pages, not marketing pages)
  if (provider.web_url) {
    const watchUrl = getWatchUrl(provider.key, provider.web_url);
    try {
      await Linking.openURL(watchUrl);
      return { opened: true, fallback: true, method: "web_url" };
    } catch {
      // Fall through to app store
    }
  }

  // Step 3: Fallback to App Store
  if (Platform.OS === "ios" && provider.ios_app_store_url) {
    try {
      await Linking.openURL(provider.ios_app_store_url);
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
  const watchUrls: Record<string, string> = {
    espn_plus: "https://plus.espn.com/watch",
    paramount_plus: "https://www.paramountplus.com/live-tv/",
    peacock: "https://www.peacocktv.com/watch/live-tv",
    max: "https://play.max.com",
    youtube_tv: "https://tv.youtube.com/live",
    hulu_live: "https://www.hulu.com/live-tv",
    fubo: "https://www.fubo.tv/welcome",
    sling: "https://watch.sling.com",
    directv_stream: "https://stream.directv.com/watchnow",
    xfinity: "https://www.xfinity.com/stream/live-tv",
    spectrum: "https://watch.spectrum.net/livetv",
  };
  return watchUrls[providerKey] ?? defaultWebUrl;
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
