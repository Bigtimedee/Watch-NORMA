import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Android notification channel for NORMA alerts.
 *
 * Android has no "Time Sensitive" interruption level (that is iOS-only, set by
 * send-push via interruptionLevel). The Android equivalent is a HIGH-importance
 * channel (heads-up banner + sound) plus FCM priority "high", which send-push
 * already sends with channelId "game-alerts". app.json also names this channel
 * as the expo-notifications defaultChannel, so a push that arrives without a
 * channelId still lands here.
 *
 * The channel must exist before the first notification arrives, and on
 * Android 13+ before the POST_NOTIFICATIONS prompt, so both the push primer
 * and registerPushToken call this first. Channel importance cannot be raised
 * after creation on a device, so do not lower these values casually.
 */
export const GAME_ALERTS_CHANNEL_ID = "game-alerts";

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(GAME_ALERTS_CHANNEL_ID, {
      name: "Game Alerts",
      description: "Close games, your bets going live, and other moments worth tuning in for.",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      lightColor: "#f97316",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    console.warn("notification channel:", e);
  }
}
