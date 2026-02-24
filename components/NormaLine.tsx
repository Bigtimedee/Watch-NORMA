import { useCallback } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  withRepeat,
  withTiming,
  useSharedValue,
  useAnimatedReaction,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

const ACCENT = "#f97316";
const HEIGHT = 2;

interface NormaLineProps {
  /** 0=idle, 1=expanding, 2=guide (pulse), 3=collapsed */
  mode: SharedValue<number>;
  /** 0→1 progress for expanding mode */
  progress: SharedValue<number>;
}

export function NormaLine({ mode, progress }: NormaLineProps) {
  const containerWidth = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  // Drive the pulse animation when in guide mode
  useAnimatedReaction(
    () => mode.value,
    (currentMode, prevMode) => {
      if (currentMode === 2 && prevMode !== 2) {
        pulseOpacity.value = withRepeat(
          withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
      } else if (currentMode !== 2 && prevMode === 2) {
        pulseOpacity.value = withTiming(1, { duration: 200 });
      }
    }
  );

  const animatedStyle = useAnimatedStyle(() => {
    const m = mode.value;
    // idle: 2px centered
    if (m === 0) {
      return {
        width: 2,
        opacity: 1,
      };
    }
    // expanding: interpolate 2px → container width
    if (m === 1) {
      const w = interpolate(progress.value, [0, 1], [2, containerWidth.value]);
      return {
        width: Math.max(w, 2),
        opacity: 1,
      };
    }
    // guide: full width, pulsing opacity
    if (m === 2) {
      return {
        width: containerWidth.value || 2,
        opacity: pulseOpacity.value,
      };
    }
    // collapsed: full width, static
    return {
      width: containerWidth.value || 2,
      opacity: 1,
    };
  });

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      containerWidth.value = e.nativeEvent.layout.width;
    },
    [containerWidth]
  );

  return (
    <Animated.View style={s.container} onLayout={onLayout}>
      <Animated.View style={[s.line, animatedStyle]} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    width: "100%",
    height: HEIGHT + 16, // glow room
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    height: HEIGHT,
    borderRadius: 1,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
});
