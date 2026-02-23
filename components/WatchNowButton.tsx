import { View, Text, Pressable, Alert as RNAlert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Game } from "../lib/types";
import {
  openStreamingApp,
  getBestWatchProvider,
  getBroadcastProviderKeys,
} from "../lib/deep-links";
import {
  useConnectedProviderKeys,
  useStreamingProviders,
} from "../hooks/useConnections";
import { LIVE_STATUSES } from "../lib/constants";

interface WatchNowButtonProps {
  game: Game;
}

export function WatchNowButton({ game }: WatchNowButtonProps) {
  const connectedKeys = useConnectedProviderKeys();
  const { data: allProviders } = useStreamingProviders();
  const isLive = LIVE_STATUSES.includes(game.status as any);

  if (!game.broadcast && !isLive) return null;

  const bestProvider = getBestWatchProvider(
    game.broadcast,
    connectedKeys,
    allProviders ?? []
  );

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (bestProvider) {
      const result = await openStreamingApp(bestProvider);
      if (!result.opened) {
        RNAlert.alert(
          "Unable to Open",
          `Could not open ${bestProvider.name}. Make sure the app is installed.`
        );
      }
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

  return (
    <Pressable
      style={[s.button, bestProvider ? s.buttonBrand : s.buttonDefault]}
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
    </Pressable>
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
