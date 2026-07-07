import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

const LAST_PROMPT_KEY = "norma.reviewLastPrompted";
const ACTIVE_DAYS_KEY  = "norma.reviewActiveDays";
const MIN_ACTIVE_DAYS  = 3;
const MIN_DAYS_BETWEEN = 120;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Call once per app session (e.g., from the root layout). */
export async function recordAppOpen(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) : [];
    const today = todayUTC();
    if (!days.includes(today)) {
      days.push(today);
      await AsyncStorage.setItem(ACTIVE_DAYS_KEY, JSON.stringify(days));
    }
  } catch {
    // Non-critical
  }
}

/**
 * Request an App Store review if all gating conditions are met.
 * Never throws — safe to call at any delight moment.
 *
 * Gating rules (all must pass):
 *  1. StoreReview.isAvailableAsync() and hasAction()
 *  2. User has opened the app on ≥ MIN_ACTIVE_DAYS distinct days
 *  3. We have not prompted in the last MIN_DAYS_BETWEEN days
 *
 * @param trigger  Descriptive string for debugging (e.g., "watch_success")
 */
export async function maybeRequestReview(trigger: string): Promise<void> {
  try {
    const [available, hasAction] = await Promise.all([
      StoreReview.isAvailableAsync(),
      StoreReview.hasAction(),
    ]);
    if (!available || !hasAction) return;

    const [rawDays, rawLast] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_DAYS_KEY),
      AsyncStorage.getItem(LAST_PROMPT_KEY),
    ]);

    const activeDays: string[] = rawDays ? JSON.parse(rawDays) : [];
    if (activeDays.length < MIN_ACTIVE_DAYS) return;

    if (rawLast) {
      const daysSinceLast =
        (Date.now() - new Date(rawLast).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast < MIN_DAYS_BETWEEN) return;
    }

    await AsyncStorage.setItem(LAST_PROMPT_KEY, new Date().toISOString());
    await StoreReview.requestReview();

    console.log(
      JSON.stringify({ event: "review_prompt_shown", trigger })
    );
  } catch {
    // Non-critical — never surface to user
  }
}
