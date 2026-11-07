import { Platform } from "react-native";
import type { StreamingProvider } from "./types";

/**
 * Platform-aware app-store fallbacks for streaming / sportsbook providers.
 *
 * iOS behaviour is unchanged: fallback_store_url, then ios_app_store_url.
 * On Android an apps.apple.com link is useless (it opens Apple's web page), so
 * Android uses the provider's Play Store listing built from android_package,
 * then a non-Apple fallback_store_url, and otherwise no store link (callers
 * fall back to web_url or a "search the store" message).
 */
type StoreFields = Pick<StreamingProvider, "ios_app_store_url" | "android_package"> &
  Partial<Pick<StreamingProvider, "fallback_store_url">>;

const APPLE_STORE_HOST = /^https?:\/\/(apps|itunes)\.apple\.com\//i;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

export function playStoreUrlFor(androidPackage: string | null | undefined): string | null {
  const pkg = androidPackage?.trim();
  if (!pkg || !ANDROID_PACKAGE.test(pkg)) return null;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
}

export function providerStoreUrl(provider: StoreFields, os: string = Platform.OS): string | null {
  if (os === "android") {
    const play = playStoreUrlFor(provider.android_package);
    if (play) return play;
    const fb = provider.fallback_store_url ?? null;
    return fb && !APPLE_STORE_HOST.test(fb) ? fb : null;
  }
  return provider.fallback_store_url ?? provider.ios_app_store_url ?? null;
}

/** User-facing store name for copy like "Search for X in the App Store". */
export function storeName(os: string = Platform.OS): string {
  return os === "android" ? "Google Play" : "App Store";
}
