import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { INSTALL_MARKER_ASYNC_KEY } from "./store";
import type { PlayerRouteMarkerStore, PlayerRouteSecureStorage } from "./store";

/**
 * expo-secure-store 15.0.8: WHEN_UNLOCKED_THIS_DEVICE_ONLY is not migrated to a
 * new device when restoring from a backup. That is not proof about every
 * same-device backup, and this build has not tested backup behavior.
 * The documented value limit is 2048 bytes. Stream addresses are capped at
 * 2000 UTF-8 bytes before they reach this adapter.
 * requireAuthentication is not set: it would prompt on every read.
 */
export const PLAYER_ROUTE_SECURE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

function storageFailure(): Error {
  return new Error("Player route storage is unavailable on this device.");
}

export function createExpoSecureStorage(): PlayerRouteSecureStorage {
  return {
    async get(key) {
      try {
        return await SecureStore.getItemAsync(key, PLAYER_ROUTE_SECURE_OPTIONS);
      } catch {
        throw storageFailure();
      }
    },
    async set(key, value) {
      try {
        await SecureStore.setItemAsync(key, value, PLAYER_ROUTE_SECURE_OPTIONS);
      } catch {
        throw storageFailure();
      }
    },
    async remove(key) {
      try {
        await SecureStore.deleteItemAsync(key, PLAYER_ROUTE_SECURE_OPTIONS);
      } catch {
        throw storageFailure();
      }
    },
  };
}

export function createAsyncInstallMarker(): PlayerRouteMarkerStore {
  return {
    async get() {
      const value = await AsyncStorage.getItem(INSTALL_MARKER_ASYNC_KEY);
      if (value && value.includes("://")) return null;
      return value;
    },
    async set(value) {
      if (value.includes("://") || value.length > 80) throw storageFailure();
      await AsyncStorage.setItem(INSTALL_MARKER_ASYNC_KEY, value);
    },
    async remove() {
      await AsyncStorage.removeItem(INSTALL_MARKER_ASYNC_KEY);
    },
  };
}
