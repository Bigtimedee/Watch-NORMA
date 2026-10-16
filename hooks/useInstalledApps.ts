import { useEffect, useSyncExternalStore } from "react";
import { AppState, Linking } from "react-native";
import type { StreamingProvider } from "../lib/types";
import {
  detectInstalledApps,
  isDetectionSupported,
  type InstalledMap,
} from "../lib/installed-apps";

// Module-level cache shared by every consumer; refreshed on foreground.
let cache: InstalledMap = {};
let lastProviders: StreamingProvider[] = [];
let inflight: Promise<void> | null = null;
let appStateSub: { remove: () => void } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export async function refreshInstalledApps(providers: StreamingProvider[] = lastProviders): Promise<void> {
  if (!isDetectionSupported() || providers.length === 0) return;
  lastProviders = providers;
  if (inflight) return inflight;
  inflight = detectInstalledApps(providers, (u) => Linking.canOpenURL(u))
    .then((map) => {
      // Merge: screens may probe a subset (e.g. only streaming or only TV).
      cache = { ...cache, ...map };
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!appStateSub && isDetectionSupported()) {
    appStateSub = AppState.addEventListener("change", (s) => {
      // User may have installed/removed an app while NORMA was backgrounded.
      if (s === "active") refreshInstalledApps();
    });
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  };
}

const getSnapshot = () => cache;

/** Map of provider key -> installed (iOS). Empty (all unknown) on web/Android. */
export function useInstalledApps(providers: StreamingProvider[] | undefined): InstalledMap {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sig = (providers ?? []).map((p) => p.key).join(",");
  useEffect(() => {
    if (providers && providers.length) refreshInstalledApps(providers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return map;
}

/** test-only */
export function __resetInstalledAppsCache() {
  cache = {};
  lastProviders = [];
  inflight = null;
}
