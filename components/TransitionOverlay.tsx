import { StyleSheet, Platform, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  useDerivedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { NormaLine } from "./NormaLine";
import { useTapToStream } from "../lib/tap-to-stream-context";
import { PHASE_IDLE } from "../hooks/useTapToStream";

const BLUR_STEPS = [0, 5, 10, 16] as const;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function TransitionOverlay() {
  const {
    phase,
    overlayOpacity,
    overlayBlur,
    normaLineMode,
    normaLineProgress,
    showPortalText,
    providerNameRef,
  } = useTapToStream();

  const isActive = useDerivedValue(() => phase.value !== PHASE_IDLE);

  const containerStyle = useAnimatedStyle(() => ({
    pointerEvents: isActive.value ? "box-only" as const : "none" as const,
    opacity: isActive.value ? 1 : 0,
  }));

  // Dark dim layer
  const dimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // On Android, skip blur and use a darker overlay
  const useBlur = Platform.OS === "ios";

  // Cross-faded blur layers for 60fps
  const blurStyles = BLUR_STEPS.map((intensity, i) => {
    const nextIntensity = BLUR_STEPS[i + 1] ?? 20;
    return useAnimatedStyle(() => {
      if (!useBlur) return { opacity: 0 };
      // Each layer fades in as overlayBlur approaches its intensity
      const opacity = interpolate(
        overlayBlur.value,
        [
          Math.max(0, intensity - 2),
          intensity,
          nextIntensity,
          nextIntensity + 2,
        ],
        [0, 1, 1, 0],
        "clamp"
      );
      return { opacity };
    });
  });

  // Android fallback: darker overlay
  const androidDimStyle = useAnimatedStyle(() => {
    if (useBlur) return { opacity: 0 };
    return {
      opacity: interpolate(overlayBlur.value, [0, 16], [0, 0.85], "clamp"),
    };
  });

  // Portal text
  const textStyle = useAnimatedStyle(() => ({
    opacity: showPortalText.value,
  }));

  return (
    <Animated.View style={[s.container, containerStyle]}>
      {/* Dim layer */}
      <Animated.View style={[s.full, s.dim, dimStyle]} />

      {/* Blur layers (iOS) */}
      {useBlur &&
        BLUR_STEPS.map((intensity, i) => (
          <AnimatedBlurView
            key={intensity}
            intensity={intensity}
            tint="dark"
            style={[s.full, blurStyles[i]]}
          />
        ))}

      {/* Android fallback dim */}
      {!useBlur && (
        <Animated.View style={[s.full, s.dim, androidDimStyle]} />
      )}

      {/* Centered content */}
      <Animated.View style={s.center}>
        <NormaLine mode={normaLineMode} progress={normaLineProgress} />
        <Animated.View style={textStyle}>
          <Text style={s.connectingText}>
            Connecting to {providerNameRef.current}...
          </Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  full: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  connectingText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "500",
    marginTop: 16,
    textAlign: "center",
  },
});
