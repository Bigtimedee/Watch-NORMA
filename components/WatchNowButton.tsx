import { View, Text, Pressable, Alert as RNAlert } from "react-native";
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
      // No connected provider — suggest connecting
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
      className={`rounded-2xl p-4 mx-4 mb-4 flex-row items-center justify-center ${
        bestProvider ? "bg-brand-500" : "bg-court-surface"
      }`}
      onPress={handlePress}
    >
      <Ionicons
        name="play-circle"
        size={24}
        color={bestProvider ? "#fff" : "#94a3b8"}
      />
      <View className="ml-3">
        <Text
          className={`text-base font-bold ${
            bestProvider ? "text-white" : "text-slate-300"
          }`}
        >
          {bestProvider
            ? `Watch on ${bestProvider.name}`
            : game.broadcast
              ? `On ${game.broadcast}`
              : "Watch"}
        </Text>
        {bestProvider && (
          <Text className="text-white/70 text-xs">Tap to open app</Text>
        )}
      </View>
    </Pressable>
  );
}
