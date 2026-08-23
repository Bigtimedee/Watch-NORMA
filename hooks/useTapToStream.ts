import { useCallback, useEffect, useRef } from "react";
import { AppState, Alert as RNAlert } from "react-native";
import { maybeRequestReview } from "../lib/review-prompt";
import * as Haptics from "expo-haptics";
import {
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import type { StreamingProvider } from "../lib/types";
import { resolveDeepLinkUrl, openStreamingApp } from "../lib/deep-links";

// Phase constants
export const PHASE_IDLE = 0;
export const PHASE_ANTICIPATION = 1;
export const PHASE_COMMITMENT = 2;
export const PHASE_COLLAPSE = 3;
export const PHASE_WAITING = 4;
export const PHASE_DONE = 5;

// NormaLine mode constants
export const LINE_IDLE = 0;
export const LINE_EXPANDING = 1;
export const LINE_GUIDE = 2;
export const LINE_COLLAPSED = 3;

interface TriggerOptions {
  skipAnticipation?: boolean;
}

const COLLAPSE_BEZIER = Easing.bezier(0.2, 0.8, 0.2, 1);

export function useTapToStreamEngine() {
  const phase = useSharedValue(PHASE_IDLE);
  const normaLineMode = useSharedValue(LINE_IDLE);
  const normaLineProgress = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const overlayBlur = useSharedValue(0);
  const contentScale = useSharedValue(1);
  const showPortalText = useSharedValue(0);

  const resolvedUrlRef = useRef<{ url: string; method: string } | null>(null);
  const providerRef = useRef<StreamingProvider | null>(null);
  const providerNameRef = useRef<string>("");
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    };
  }, []);

  // AppState listener: clean up when returning from background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && phase.value >= PHASE_COLLAPSE) {
        // User returned after a successful deep-link stream — delight trigger
        maybeRequestReview("watch_return");
        resetToIdle();
      }
    });
    return () => subscription.remove();
  }, []);

  const resetToIdle = useCallback(() => {
    if (failsafeTimerRef.current) {
      clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }

    phase.value = PHASE_DONE;

    // Animate back
    overlayOpacity.value = withTiming(0, { duration: 300 });
    overlayBlur.value = withTiming(0, { duration: 300 });
    contentScale.value = withTiming(1, { duration: 300 });
    showPortalText.value = withTiming(0, { duration: 200 });
    normaLineProgress.value = withTiming(0, { duration: 300 });
    normaLineMode.value = LINE_IDLE;

    // Set phase back to idle after animation completes
    setTimeout(() => {
      phase.value = PHASE_IDLE;
    }, 350);
  }, []);

  const fireDeepLink = useCallback(async () => {
    const provider = providerRef.current;
    let launchFailed = false;
    if (provider) {
      try {
        const result = await openStreamingApp(provider);
        // openStreamingApp returns { opened: false, method: "none" } when every
        // fallback in the chain failed. Previously that case animated
        // "Connecting..." for 5s and faded out with no error state, leaving the
        // user to guess (audit item D / 2026-08-23 H-7). Show a real message
        // and skip the waiting animation.
        if (!result?.opened) launchFailed = true;
      } catch (err) {
        launchFailed = true;
        // Non-PII log for observability; the alert below is the user-facing signal.
        console.warn("[useTapToStream] openStreamingApp threw:", (err as Error)?.message);
      }
    }

    if (launchFailed && provider) {
      resetToIdle();
      RNAlert.alert(
        `Could not open ${provider.name}`,
        `The app doesn't appear to be installed. Search for "${provider.name}" in the App Store to watch.`,
      );
      return;
    }

    // Set up waiting state in case deep link is slow
    waitingTimerRef.current = setTimeout(() => {
      if (phase.value === PHASE_COLLAPSE || phase.value === PHASE_WAITING) {
        phase.value = PHASE_WAITING;
        normaLineMode.value = LINE_GUIDE;
        showPortalText.value = withTiming(1, { duration: 200 });
      }
    }, 300);

    // Failsafe: reset after 5s if we never went to background
    failsafeTimerRef.current = setTimeout(() => {
      if (phase.value !== PHASE_IDLE) {
        resetToIdle();
      }
    }, 5000);
  }, []);

  const triggerStream = useCallback(
    async (
      provider: StreamingProvider,
      options?: TriggerOptions
    ) => {
      // Re-entrance guard
      if (phase.value !== PHASE_IDLE) return;

      providerNameRef.current = provider.name;
      providerRef.current = provider;
      resolvedUrlRef.current = null;

      if (options?.skipAnticipation) {
        // Jump straight to commitment
        phase.value = PHASE_COMMITMENT;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Resolve URL in parallel
        resolveDeepLinkUrl(provider).then((result) => {
          resolvedUrlRef.current = result;
        });

        // Commitment animations
        contentScale.value = withTiming(0.96, { duration: 180 });
        overlayOpacity.value = withTiming(0.4, { duration: 180 });

        // Move to collapse after commitment
        setTimeout(() => {
          runCollapsePhase();
        }, 180);
        return;
      }

      // === ANTICIPATION (450ms) ===
      phase.value = PHASE_ANTICIPATION;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // NormaLine in pulse/guide mode during anticipation
      normaLineMode.value = LINE_GUIDE;

      // Pre-resolve deep link URL
      resolveDeepLinkUrl(provider).then((result) => {
        resolvedUrlRef.current = result;
      });

      // After 450ms → commitment
      setTimeout(() => {
        runCommitmentPhase();
      }, 450);
    },
    []
  );

  const runCommitmentPhase = useCallback(() => {
    // === COMMITMENT (180ms) ===
    phase.value = PHASE_COMMITMENT;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    contentScale.value = withTiming(0.96, { duration: 180 });
    overlayOpacity.value = withTiming(0.4, { duration: 180 });

    setTimeout(() => {
      runCollapsePhase();
    }, 180);
  }, []);

  const runCollapsePhase = useCallback(() => {
    // === COLLAPSE (420ms) ===
    phase.value = PHASE_COLLAPSE;

    // Blur 0→16
    overlayBlur.value = withTiming(16, {
      duration: 420,
      easing: COLLAPSE_BEZIER,
    });

    // NormaLine expand 2px → full width
    normaLineMode.value = LINE_EXPANDING;
    normaLineProgress.value = withTiming(1, {
      duration: 420,
      easing: COLLAPSE_BEZIER,
    });

    // Fire deep link at end of collapse
    setTimeout(() => {
      fireDeepLink();
    }, 420);
  }, []);

  return {
    phase,
    normaLineMode,
    normaLineProgress,
    overlayOpacity,
    overlayBlur,
    contentScale,
    showPortalText,
    triggerStream,
    providerNameRef,
  };
}
