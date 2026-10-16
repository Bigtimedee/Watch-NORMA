/**
 * Installed-app detection for streaming providers (iOS only).
 *
 * iOS answers Linking.canOpenURL only for schemes listed in
 * ios.infoPlist.LSApplicationQueriesSchemes (app.json); iOS caps that list at
 * ~50 queried schemes. Android/web: detection is not attempted and every
 * provider is treated as "unknown", which callers must treat as installed so
 * behaviour there is unchanged.
 */
import { Platform } from "react-native";
import type { StreamingProvider } from "./types";
import { getBroadcastProviderKeys } from "./deep-links";

/** true = installed, false = definitely not installed, missing key = unknown */
export type InstalledMap = Record<string, boolean>;

export function schemeUrlFor(provider: Pick<StreamingProvider, "ios_scheme">): string | null {
  const s = provider.ios_scheme?.trim();
  if (!s) return null;
  return s.includes("://") ? s : `${s.replace(/:$/, "")}://`;
}

export function isDetectionSupported(os: string = Platform.OS): boolean {
  return os === "ios";
}

/** Probe each provider's scheme once (shared schemes are probed once). */
export async function detectInstalledApps(
  providers: StreamingProvider[],
  canOpenURL: (url: string) => Promise<boolean>,
  os: string = Platform.OS
): Promise<InstalledMap> {
  if (!isDetectionSupported(os)) return {};
  const byScheme = new Map<string, Promise<boolean | null>>();
  const out: InstalledMap = {};
  await Promise.all(
    providers.map(async (p) => {
      const url = schemeUrlFor(p);
      if (!url) return;
      if (!byScheme.has(url)) {
        byScheme.set(
          url,
          canOpenURL(url).then(
            (v) => !!v,
            () => null // scheme not whitelisted or probe failed: unknown
          )
        );
      }
      const v = await byScheme.get(url)!;
      if (v !== null) out[p.key] = v;
    })
  );
  return out;
}

export function isInstalledOrUnknown(map: InstalledMap, key: string): boolean {
  return map[key] !== false;
}

export type WatchChoice =
  | { mode: "watch"; provider: StreamingProvider }
  | { mode: "get"; provider: StreamingProvider }
  | null;

/**
 * Pick the watch CTA for a game:
 *  1. first connected provider for the broadcast whose app is installed (or unknown)
 *  2. else first connected provider for the broadcast -> "Get <Provider>" (App Store)
 *  3. else null
 */
export function resolveWatchChoice(
  broadcast: string | null,
  connectedKeys: string[],
  providers: StreamingProvider[],
  installed: InstalledMap
): WatchChoice {
  const keys = getBroadcastProviderKeys(broadcast).filter((k) => connectedKeys.includes(k));
  const candidates = keys
    .map((k) => providers.find((p) => p.key === k))
    .filter((p): p is StreamingProvider => !!p);
  const ready = candidates.find((p) => isInstalledOrUnknown(installed, p.key));
  if (ready) return { mode: "watch", provider: ready };
  if (candidates.length > 0) return { mode: "get", provider: candidates[0] };
  return null;
}

export function appStoreUrlFor(provider: StreamingProvider): string | null {
  return provider.ios_app_store_url || provider.fallback_store_url || provider.web_url || null;
}

/** Installed providers the user hasn't toggled on (auto-suggest). */
export function suggestInstalledProviders(
  providers: StreamingProvider[],
  connectedKeys: string[],
  installed: InstalledMap
): StreamingProvider[] {
  return providers.filter((p) => installed[p.key] === true && !connectedKeys.includes(p.key));
}
