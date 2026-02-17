import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useGameDetail, useGameFollow } from "../../../hooks/useGameDetail";
import { ScoreHeader } from "../../../components/ScoreHeader";
import { WatchNowButton } from "../../../components/WatchNowButton";
import { LIVE_STATUSES } from "../../../lib/constants";

export default function GameDetailScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const { data: game, isLoading } = useGameDetail(gameId);
  const { isFollowing, toggleFollow, isToggling } = useGameFollow(gameId);

  if (isLoading || !game) {
    return (
      <SafeAreaView className="flex-1 bg-court-dark items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
      </SafeAreaView>
    );
  }

  const isLive = LIVE_STATUSES.includes(game.status as any);

  const handleFollow = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleFollow();
  };

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text className="text-white text-lg font-bold">Game Detail</Text>
        <Pressable
          onPress={handleFollow}
          disabled={isToggling}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons
            name={isFollowing ? "heart" : "heart-outline"}
            size={24}
            color={isFollowing ? "#f97316" : "#64748b"}
          />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Score */}
        <ScoreHeader game={game} />

        {/* Watch Now */}
        {(isLive || game.broadcast) && <WatchNowButton game={game} />}

        {/* Follow CTA */}
        <Pressable
          className={`mx-4 mb-4 rounded-2xl p-4 flex-row items-center justify-center ${
            isFollowing ? "bg-court-card border border-brand-500/30" : "bg-court-card"
          }`}
          onPress={handleFollow}
          disabled={isToggling}
        >
          <Ionicons
            name={isFollowing ? "heart" : "heart-outline"}
            size={20}
            color={isFollowing ? "#f97316" : "#94a3b8"}
          />
          <Text
            className={`ml-2 text-base font-semibold ${
              isFollowing ? "text-brand-400" : "text-slate-300"
            }`}
          >
            {isFollowing ? "Following This Game" : "Follow This Game"}
          </Text>
        </Pressable>

        {/* Game info cards */}
        <View className="mx-4">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            Game Info
          </Text>

          <View className="bg-court-card rounded-2xl p-4">
            {[
              ["Status", game.status.charAt(0).toUpperCase() + game.status.slice(1)],
              ["Scheduled", new Date(game.scheduled_at).toLocaleString()],
              game.venue ? ["Venue", game.venue] : null,
              game.broadcast ? ["Broadcast", game.broadcast] : null,
              game.tournament_round ? ["Round", game.tournament_round] : null,
              game.period ? ["Period", game.period > 2 ? `OT${game.period - 2}` : `Half ${game.period}`] : null,
            ]
              .filter(Boolean)
              .map(([label, value], i) => (
                <View
                  key={label}
                  className={`flex-row justify-between py-3 ${
                    i > 0 ? "border-t border-court-border" : ""
                  }`}
                >
                  <Text className="text-slate-400 text-sm">{label}</Text>
                  <Text className="text-white text-sm font-medium">
                    {value}
                  </Text>
                </View>
              ))}
          </View>
        </View>

        {/* Following indicator */}
        {isFollowing && (
          <View className="mx-4 mt-4">
            <View className="bg-brand-500/10 rounded-2xl p-4 flex-row items-center">
              <Ionicons name="notifications" size={20} color="#f97316" />
              <Text className="text-brand-400 text-sm ml-3 flex-1">
                You'll receive alerts for key moments in this game.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
