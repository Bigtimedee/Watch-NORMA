import { View, Text, Pressable, Alert as RNAlert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { Game } from "../lib/types";
import {
  getBestWatchProvider,
  getBroadcastProviderKeys,
  resolveDeepLinkUrl,
} from "../lib/deep-links";
import {
  useConnectedProviderKeys,
  useStreamingProviders,
} from "../hooks/useConnections";
import { LIVE_STATUSES } from "../lib/constants";
import { useTapToStream } from "../lib/tap-to-stream-context";
import {
  PHASE_ANTICIPATION,
  PHASE_COMMITMENT,
} from "../hooks/useTapToStream";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface WatchNowButtonProps {
  game: Game;
}

export function WatchNowButton({ game }: WatchNowButtonProps) {
  const connectedKeys = useConnectedProviderKeys();
  const { data: allProviders } = useStreamingProviders();
  const { triggerStream, phase } = useTapToStream();
  const isLive = LIVE_STATUSES.includes(game.status as any);

  if (!game.broadcast && !isLive) return null;

  const bestProvider = getBestWatchProvider(
    game.broadcast,
    connectedKeys,
    allProviders ?? []
  );

  const handlePress = async () => {
    if (bestProvider) {
      // Pre-flight check: if no URL can be resolved for this provider, show an
      // actionable message instead of silently doing nothing. This surfaces the
      // no_fallback failure class to the user before the animation fires.
      const resolved = await resolveDeepLinkUrl(bestProvider);
      if (!resolved) {
        RNAlert.alert(
          `${bestProvider.name} app not found`,
          `Search for "${bestProvider.name}" in the App Store to watch.`
        );
        return;
      }
      triggerStream(bestProvider);
    } else if (game.broadcast) {
      const broadcastKeys = getBroadcastProviderKeys(game.broadcast);
      const availableProviders = (allProviders ?? []).filter((p) =>
        broadcastKeys.includes(p.key)
      );

      if (availableProviders.length > 0) {
        RNAlert.alert(
          "Connect a Service",
          `This game is on ${game.broadcast}. Connect a streaming service in the Connections tab to watch.`
        );
      } else {
        RNAlert.alert(
          "Broadcast Info",
          `This game is airing on ${game.broadcast}.`
        );
      }
    }
  };

  // Animated style: opacity pulse during Anticipation, scale during Commitment
  const animatedButtonStyle = useAnimatedStyle(() => {
    const p = phase.value;
    if (p === PHASE_ANTICIPATION) {
      return { opacity: 0.92, transform: [{ scale: 1 }] };
    }
    if (p === PHASE_COMMITMENT) {
      return { opacity: 1, transform: [{ scale: 0.96 }] };
    }
    return { opacity: 1, transform: [{ scale: 1 }] };
  });

  return (
    <AnimatedPressable
      style={[
        s.button,
        bestProvider ? s.buttonBrand : s.buttonDefault,
        bestProvider ? animatedButtonStyle : undefined,
      ]}
      onPress={handlePress}
      accessibilityLabel={bestProvider ? `Watch on ${bestProvider.name}` : game.broadcast ? `On ${game.broadcast}` : "Watch"}
    >
      <Ionicons
        name="play-circle"
        size={24}
        color={bestProvider ? "#fff" : "#94a3b8"}
      />
      <View style={s.textContainer}>
        <Text style={[s.label, bestProvider ? s.labelBrand : s.labelDefault]}>
          {bestProvider
            ? `Watch on ${bestProvider.name}`
            : game.broadcast
              ? `On ${game.broadcast}`
              : "Watch"}
        </Text>
        {bestProvider && <Text style={s.sub}>Tap to open app</Text>}
      </View>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  button: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonBrand: { backgroundColor: "#f97316" },
  buttonDefault: { backgroundColor: "#334155" },
  textContainer: { marginLeft: 12 },
  label: { fontSize: 16, fontWeight: "700" },
  labelBrand: { color: "#ffffff" },
  labelDefault: { color: "#cbd5e1" },
  sub: { color: "rgba(255, 255, 255, 0.7)", fontSize: 12 },
});
